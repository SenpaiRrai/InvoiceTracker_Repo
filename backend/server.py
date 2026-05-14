from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import csv
import uuid
import asyncio
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
import resend
import requests
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Form, Depends, Header, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
APP_NAME = os.environ.get("APP_NAME", "invoiceflow")
STUCK_DAYS = int(os.environ.get("STUCK_THRESHOLD_DAYS", "3"))
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

STAGES = [
    "RECEIVED",
    "USER_DEPT_VERIFICATION",
    "GRN_RAISED",
    "DEPT_HEAD_CERTIFICATION",
    "MAY_BE_PAID_STAMP",
    "DEAN_CERTIFICATION",
    "SCANNED_SENT_TO_FINANCE",
    "PAID",
]

STAGE_LABELS = {
    "RECEIVED": "Bill Received",
    "USER_DEPT_VERIFICATION": "User Dept Verification",
    "GRN_RAISED": "GRN Raised",
    "DEPT_HEAD_CERTIFICATION": "Dept Head Certification",
    "MAY_BE_PAID_STAMP": "May Be Paid / To Be Paid Stamp",
    "DEAN_CERTIFICATION": "Dean Certification",
    "SCANNED_SENT_TO_FINANCE": "Scanned & Sent to Finance",
    "PAID": "Payment Processed",
    "RETURNED_TO_VENDOR": "Returned to Vendor",
}

ROLES = {"admin", "stores_staff", "user_dept", "dept_head", "dean", "finance"}

# ---------------------------------------------------------------------------
# App + Router
# ---------------------------------------------------------------------------
app = FastAPI(title="InvoiceFlow API")
api_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def _extract_token(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    return token


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "stores_staff"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class InvoiceCreate(BaseModel):
    vendor_name: str
    invoice_number: str
    invoice_date: str  # ISO date
    amount: float
    po_reference: Optional[str] = ""
    description: Optional[str] = ""


class StageAdvanceRequest(BaseModel):
    notes: Optional[str] = ""
    grn_number: Optional[str] = None  # Required when moving into GRN_RAISED


class ReturnRequest(BaseModel):
    reason: str


# ---------------------------------------------------------------------------
# Object storage helpers (Emergent)
# ---------------------------------------------------------------------------
storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY missing — storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Email helper
# ---------------------------------------------------------------------------
async def send_email(recipient: str, subject: str, html: str) -> Optional[str]:
    if not RESEND_API_KEY:
        logger.info(f"[EMAIL SKIPPED — no RESEND_API_KEY] to={recipient} subject={subject}")
        return None
    try:
        params = {"from": SENDER_EMAIL, "to": [recipient], "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        return result.get("id") if isinstance(result, dict) else None
    except Exception as e:
        logger.error(f"Resend send failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------
def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _build_history_entry(stage: str, user: dict, notes: str = "", extra: Optional[dict] = None) -> dict:
    entry = {
        "stage": stage,
        "stage_label": STAGE_LABELS.get(stage, stage),
        "entered_at": _iso_now(),
        "by_user_id": user["id"],
        "by_user_name": user["name"],
        "by_user_role": user["role"],
        "notes": notes or "",
    }
    if extra:
        entry.update(extra)
    return entry


def _serialize_invoice(inv: dict) -> dict:
    inv.pop("_id", None)
    return inv


def _hours_in_stage(history: List[dict], current_stage: str) -> float:
    if not history:
        return 0.0
    last = history[-1]
    delta = datetime.now(timezone.utc) - _parse_iso(last["entered_at"])
    return delta.total_seconds() / 3600.0


def _is_stuck(inv: dict) -> bool:
    if inv.get("status") in {"PAID", "RETURNED_TO_VENDOR"}:
        return False
    return _hours_in_stage(inv.get("history", []), inv.get("status", "")) >= STUCK_DAYS * 24


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
pass
    # # Indexes
    # await db.users.create_index("email", unique=True)
    # await db.users.create_index("id", unique=True)
    # await db.invoices.create_index("id", unique=True)
    # await db.invoices.create_index("invoice_number")
    # await db.invoices.create_index("status")
    # await db.invoices.create_index("vendor_name")

    # # Seed admin
    # admin_email = os.environ.get("ADMIN_EMAIL", "admin@stores.com").lower()
    # admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    # existing = await db.users.find_one({"email": admin_email})
    # if not existing:
    #     await db.users.insert_one({
    #         "id": str(uuid.uuid4()),
    #         "email": admin_email,
    #         "name": "Stores Admin",
    #         "role": "admin",
    #         "password_hash": hash_password(admin_password),
    #         "created_at": _iso_now(),
    #     })
    #     logger.info(f"Admin seeded: {admin_email}")
    # elif not verify_password(admin_password, existing["password_hash"]):
    #     await db.users.update_one(
    #         {"email": admin_email},
    #         {"$set": {"password_hash": hash_password(admin_password)}},
    #     )

    # # Seed demo role users for quick testing
    # demo_users = [
    #     ("stores@stores.com", "Stores Staff", "stores_staff"),
    #     ("userdept@stores.com", "User Dept", "user_dept"),
    #     ("depthead@stores.com", "Dept Head", "dept_head"),
    #     ("dean@stores.com", "Dean", "dean"),
    #     ("finance@stores.com", "Finance", "finance"),
    # ]
    # for email, name, role in demo_users:
    #     if not await db.users.find_one({"email": email}):
    #         await db.users.insert_one({
    #             "id": str(uuid.uuid4()),
    #             "email": email,
    #             "name": name,
    #             "role": role,
    #             "password_hash": hash_password("password123"),
    #             "created_at": _iso_now(),
    #         })

    # init_storage()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
def _set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie(key="access_token", value=access, httponly=True, secure=False, samesite="lax", max_age=43200, path="/")
    response.set_cookie(key="refresh_token", value=refresh, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")


@api_router.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower()
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "created_at": _iso_now(),
    }
    await db.users.insert_one(doc)
    access = create_access_token(user_id, email, payload.role)
    refresh = create_refresh_token(user_id)
    _set_auth_cookies(response, access, refresh)
    return {"id": user_id, "email": email, "name": payload.name, "role": payload.role, "access_token": access}


@api_router.post("/auth/login")
async def login(payload: LoginRequest, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "access_token": access,
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"status": "logged_out"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


# ---------------------------------------------------------------------------
# Meta endpoints
# ---------------------------------------------------------------------------
@api_router.get("/meta/stages")
async def get_stages():
    return {
        "stages": STAGES,
        "labels": STAGE_LABELS,
        "roles_allowed_to_advance": {
            "RECEIVED": ["stores_staff", "admin"],
            "USER_DEPT_VERIFICATION": ["user_dept", "stores_staff", "admin"],
            "GRN_RAISED": ["stores_staff", "admin"],
            "DEPT_HEAD_CERTIFICATION": ["dept_head", "stores_staff", "admin"],
            "MAY_BE_PAID_STAMP": ["stores_staff", "admin"],
            "DEAN_CERTIFICATION": ["dean", "stores_staff", "admin"],
            "SCANNED_SENT_TO_FINANCE": ["stores_staff", "admin"],
            "PAID": ["finance", "admin"],
        },
    }


# ---------------------------------------------------------------------------
# Invoice endpoints
# ---------------------------------------------------------------------------
@api_router.post("/invoices")
async def create_invoice(payload: InvoiceCreate, user: dict = Depends(get_current_user)):
    inv_id = str(uuid.uuid4())
    now = _iso_now()
    first_history = _build_history_entry("RECEIVED", user, notes="Invoice received from vendor.")
    invoice = {
        "id": inv_id,
        "vendor_name": payload.vendor_name,
        "invoice_number": payload.invoice_number,
        "invoice_date": payload.invoice_date,
        "amount": float(payload.amount),
        "po_reference": payload.po_reference or "",
        "description": payload.description or "",
        "status": "RECEIVED",
        "grn_number": None,
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
        "returned": False,
        "history": [first_history],
        "attachments": [],
    }
    await db.invoices.insert_one(invoice)
    return _serialize_invoice(invoice)


@api_router.get("/invoices")
async def list_invoices(
    status: Optional[str] = None,
    vendor: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if status:
        query["status"] = status
    if vendor:
        query["vendor_name"] = {"$regex": vendor, "$options": "i"}
    if search:
        query["$or"] = [
            {"invoice_number": {"$regex": search, "$options": "i"}},
            {"vendor_name": {"$regex": search, "$options": "i"}},
            {"po_reference": {"$regex": search, "$options": "i"}},
            {"grn_number": {"$regex": search, "$options": "i"}},
        ]
    cursor = db.invoices.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(2000)
    for inv in items:
        inv["hours_in_current_stage"] = round(_hours_in_stage(inv.get("history", []), inv.get("status", "")), 2)
        inv["is_stuck"] = _is_stuck(inv)
    return items


@api_router.get("/invoices/stuck")
async def stuck_invoices(user: dict = Depends(get_current_user)):
    items = await db.invoices.find({"status": {"$nin": ["PAID", "RETURNED_TO_VENDOR"]}}, {"_id": 0}).to_list(2000)
    stuck = []
    for inv in items:
        h = _hours_in_stage(inv.get("history", []), inv.get("status", ""))
        if h >= STUCK_DAYS * 24:
            inv["hours_in_current_stage"] = round(h, 2)
            inv["days_in_current_stage"] = round(h / 24, 2)
            stuck.append(inv)
    return stuck


@api_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv["hours_in_current_stage"] = round(_hours_in_stage(inv.get("history", []), inv.get("status", "")), 2)
    inv["is_stuck"] = _is_stuck(inv)
    # Compute per-stage durations
    history = inv.get("history", [])
    for i, h in enumerate(history):
        start = _parse_iso(h["entered_at"])
        end = _parse_iso(history[i + 1]["entered_at"]) if i + 1 < len(history) else datetime.now(timezone.utc)
        h["duration_hours"] = round((end - start).total_seconds() / 3600.0, 2)
    return inv


@api_router.post("/invoices/{invoice_id}/advance")
async def advance_invoice(invoice_id: str, payload: StageAdvanceRequest, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] == "PAID":
        raise HTTPException(status_code=400, detail="Invoice already paid")
    if inv["status"] == "RETURNED_TO_VENDOR":
        raise HTTPException(status_code=400, detail="Invoice was returned to vendor. Use resubmit endpoint.")

    try:
        idx = STAGES.index(inv["status"])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid current stage")
    if idx + 1 >= len(STAGES):
        raise HTTPException(status_code=400, detail="No further stage available")
    next_stage = STAGES[idx + 1]

    extra: dict = {}
    update: dict = {"status": next_stage, "updated_at": _iso_now()}

    if next_stage == "GRN_RAISED":
        if not payload.grn_number:
            raise HTTPException(status_code=400, detail="grn_number is required when moving to GRN_RAISED")
        extra["grn_number"] = payload.grn_number
        update["grn_number"] = payload.grn_number

    if next_stage == "PAID":
        update["completed_at"] = _iso_now()

    history_entry = _build_history_entry(next_stage, user, payload.notes or "", extra)
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": update, "$push": {"history": history_entry}},
    )
    return await get_invoice(invoice_id, user)


@api_router.post("/invoices/{invoice_id}/return-to-vendor")
async def return_invoice(invoice_id: str, payload: ReturnRequest, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] in {"PAID", "RETURNED_TO_VENDOR"}:
        raise HTTPException(status_code=400, detail="Cannot return invoice from this state")
    history_entry = _build_history_entry("RETURNED_TO_VENDOR", user, payload.reason)
    await db.invoices.update_one(
        {"id": invoice_id},
        {
            "$set": {"status": "RETURNED_TO_VENDOR", "returned": True, "updated_at": _iso_now()},
            "$push": {"history": history_entry},
        },
    )
    return await get_invoice(invoice_id, user)


@api_router.post("/invoices/{invoice_id}/resubmit")
async def resubmit_invoice(invoice_id: str, payload: StageAdvanceRequest, user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] != "RETURNED_TO_VENDOR":
        raise HTTPException(status_code=400, detail="Invoice not in returned state")
    history_entry = _build_history_entry("RECEIVED", user, payload.notes or "Resubmitted after vendor correction.")
    await db.invoices.update_one(
        {"id": invoice_id},
        {
            "$set": {"status": "RECEIVED", "returned": False, "updated_at": _iso_now()},
            "$push": {"history": history_entry},
        },
    )
    return await get_invoice(invoice_id, user)


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------
@api_router.post("/invoices/{invoice_id}/attachments")
async def upload_attachment(invoice_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/invoices/{invoice_id}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    content_type = file.content_type or "application/octet-stream"
    result = put_object(path, data, content_type)
    record = {
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "uploaded_by_id": user["id"],
        "uploaded_by_name": user["name"],
        "uploaded_at": _iso_now(),
        "is_deleted": False,
    }
    await db.invoices.update_one({"id": invoice_id}, {"$push": {"attachments": record}})
    return record


@api_router.get("/files/{path:path}")
async def download_file(path: str, request: Request, auth: Optional[str] = Query(None)):
    token = auth or _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    data, ctype = get_object(path)
    return Response(content=data, media_type=ctype)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
def _compute_avg_paid_hours(paid_invoices: List[dict]) -> float:
    """Average end-to-end processing hours across paid invoices."""
    if not paid_invoices:
        return 0.0
    total_h = 0.0
    for p in paid_invoices:
        try:
            start = _parse_iso(p["created_at"])
            end = _parse_iso(p["completed_at"]) if p.get("completed_at") else datetime.now(timezone.utc)
            total_h += (end - start).total_seconds() / 3600.0
        except Exception:
            pass
    return total_h / len(paid_invoices)


def _compute_stage_distribution(invoices: List[dict]) -> dict:
    distribution = {s: 0 for s in STAGES}
    distribution["RETURNED_TO_VENDOR"] = 0
    for inv in invoices:
        status = inv.get("status", "RECEIVED")
        distribution[status] = distribution.get(status, 0) + 1
    return distribution


@api_router.get("/analytics/summary")
async def analytics_summary(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(5000)
    in_flight = [i for i in invoices if i["status"] not in {"PAID", "RETURNED_TO_VENDOR"}]
    paid = [i for i in invoices if i["status"] == "PAID"]
    returned = [i for i in invoices if i["status"] == "RETURNED_TO_VENDOR"]
    stuck = [i for i in invoices if _is_stuck(i)]
    avg_hours = _compute_avg_paid_hours(paid)

    return {
        "total_invoices": len(invoices),
        "in_flight": len(in_flight),
        "paid": len(paid),
        "returned": len(returned),
        "stuck": len(stuck),
        "avg_processing_hours": round(avg_hours, 2),
        "avg_processing_days": round(avg_hours / 24, 2),
        "stage_distribution": _compute_stage_distribution(invoices),
        "stage_labels": STAGE_LABELS,
        "stuck_threshold_days": STUCK_DAYS,
    }


def _stage_duration_hours(history: List[dict], idx: int, invoice_status: str) -> Optional[float]:
    """Hours spent in history[idx]'s stage, or None when the stage is open & terminal (PAID)."""
    h = history[idx]
    start = _parse_iso(h["entered_at"])
    is_last = idx + 1 >= len(history)
    if is_last:
        if invoice_status == "PAID":
            return None
        end = datetime.now(timezone.utc)
    else:
        end = _parse_iso(history[idx + 1]["entered_at"])
    return (end - start).total_seconds() / 3600.0


@api_router.get("/analytics/stage-tat")
async def stage_tat(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(5000)
    totals = {s: 0.0 for s in STAGES}
    counts = {s: 0 for s in STAGES}
    for inv in invoices:
        history = inv.get("history", [])
        for i, h in enumerate(history):
            if h["stage"] not in STAGES:
                continue
            dur = _stage_duration_hours(history, i, inv["status"])
            if dur is None:
                continue
            totals[h["stage"]] += dur
            counts[h["stage"]] += 1

    rows = [
        {
            "stage": s,
            "label": STAGE_LABELS[s],
            "avg_hours": round(totals[s] / counts[s], 2) if counts[s] else 0,
            "avg_days": round((totals[s] / counts[s]) / 24, 2) if counts[s] else 0,
            "sample_size": counts[s],
        }
        for s in STAGES
    ]
    bottleneck = max(rows, key=lambda r: r["avg_hours"]) if rows else None
    return {"rows": rows, "bottleneck": bottleneck}


@api_router.get("/analytics/vendors")
async def vendor_stats(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(5000)
    vendors: dict = {}
    for inv in invoices:
        v = inv["vendor_name"]
        if v not in vendors:
            vendors[v] = {"vendor_name": v, "total": 0, "paid": 0, "returned": 0, "in_flight": 0, "total_amount": 0.0, "avg_hours": 0.0, "hours_sum": 0.0, "paid_count": 0}
        vendors[v]["total"] += 1
        vendors[v]["total_amount"] += float(inv.get("amount", 0))
        if inv["status"] == "PAID":
            vendors[v]["paid"] += 1
            try:
                start = _parse_iso(inv["created_at"])
                end = _parse_iso(inv["completed_at"]) if inv.get("completed_at") else datetime.now(timezone.utc)
                vendors[v]["hours_sum"] += (end - start).total_seconds() / 3600.0
                vendors[v]["paid_count"] += 1
            except Exception:
                pass
        elif inv["status"] == "RETURNED_TO_VENDOR":
            vendors[v]["returned"] += 1
        else:
            vendors[v]["in_flight"] += 1
    out = []
    for v in vendors.values():
        v["avg_hours"] = round(v["hours_sum"] / v["paid_count"], 2) if v["paid_count"] else 0
        v["avg_days"] = round(v["avg_hours"] / 24, 2)
        v["total_amount"] = round(v["total_amount"], 2)
        v.pop("hours_sum", None)
        v.pop("paid_count", None)
        out.append(v)
    out.sort(key=lambda x: x["total"], reverse=True)
    return out


@api_router.get("/invoices/export/csv")
async def export_csv(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(5000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Invoice #", "Vendor", "Amount", "Invoice Date", "PO Ref", "GRN #",
        "Current Status", "Created At", "Completed At", "Days in Current Stage", "Is Stuck",
    ])
    for inv in invoices:
        h = _hours_in_stage(inv.get("history", []), inv.get("status", ""))
        writer.writerow([
            inv.get("invoice_number", ""),
            inv.get("vendor_name", ""),
            inv.get("amount", ""),
            inv.get("invoice_date", ""),
            inv.get("po_reference", ""),
            inv.get("grn_number", "") or "",
            STAGE_LABELS.get(inv.get("status", ""), inv.get("status", "")),
            inv.get("created_at", ""),
            inv.get("completed_at", "") or "",
            round(h / 24, 2),
            "YES" if _is_stuck(inv) else "NO",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=invoices.csv"},
    )


# ---------------------------------------------------------------------------
# Notifications: stuck digest
# ---------------------------------------------------------------------------
@api_router.post("/notifications/digest")
async def send_digest(user: dict = Depends(get_current_user)):
    """Manually trigger an email digest of stuck invoices to the current user's email."""
    stuck = await stuck_invoices(user)
    if not stuck:
        return {"sent": False, "reason": "no stuck invoices"}
    rows = "".join(
        f"<tr><td style='padding:8px;border-bottom:1px solid #E5E7EB'>{i['invoice_number']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E7EB'>{i['vendor_name']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E7EB'>{STAGE_LABELS.get(i['status'], i['status'])}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E7EB'>{i['days_in_current_stage']} d</td></tr>"
        for i in stuck
    )
    html = f"""
    <div style='font-family:Arial,sans-serif;color:#09090B;max-width:640px'>
      <h2 style='margin:0 0 8px 0;font-size:20px'>Invoices stuck &gt; {STUCK_DAYS} days</h2>
      <p style='color:#52525B;margin:0 0 16px 0'>The following invoices have been stalled and need attention.</p>
      <table cellspacing='0' cellpadding='0' style='width:100%;border-collapse:collapse;border:1px solid #E5E7EB'>
        <thead><tr style='background:#F8F9FA'>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #E5E7EB'>Invoice #</th>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #E5E7EB'>Vendor</th>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #E5E7EB'>Stage</th>
          <th style='text-align:left;padding:8px;border-bottom:1px solid #E5E7EB'>Days</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    """
    email_id = await send_email(user["email"], f"[InvoiceFlow] {len(stuck)} invoices stuck", html)
    return {"sent": bool(email_id), "count": len(stuck), "email_id": email_id, "no_api_key": not bool(RESEND_API_KEY)}


# ---------------------------------------------------------------------------
# Router registration
# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
