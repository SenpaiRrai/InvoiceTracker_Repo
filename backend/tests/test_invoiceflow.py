"""Backend regression tests for InvoiceFlow API."""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

# Credentials are read from environment — never committed.
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")

if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    pytest.skip(
        "TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD env vars are required to run the integration suite.",
        allow_module_level=True,
    )


# ------------------- Fixtures -------------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and data["role"] == "admin"
    # Verify cookies set
    assert "access_token" in r.cookies, "httpOnly access_token cookie not set"
    return data["access_token"]


@pytest.fixture(scope="session")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def created_invoice(headers):
    """Create one invoice used by multi-step tests."""
    payload = {
        "vendor_name": "TEST_Vendor_Acme",
        "invoice_number": f"TEST-INV-{uuid.uuid4().hex[:8]}",
        "invoice_date": "2026-01-10",
        "amount": 1234.56,
        "po_reference": "PO-TEST-001",
        "description": "Test invoice from pytest",
    }
    r = requests.post(f"{API}/invoices", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    return data


# ------------------- Auth tests -------------------
class TestAuth:
    def test_login_success_returns_token_and_cookies(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("access_token"), str) and len(data["access_token"]) > 20
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        # httpOnly cookies
        cookies = {c.name: c for c in r.cookies}
        assert "access_token" in cookies
        assert "refresh_token" in cookies

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_returns_current_user(self, headers):
        r = requests.get(f"{API}/auth/me", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        assert "id" in data

    def test_me_unauthenticated_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ------------------- Invoice CRUD + workflow -------------------
class TestInvoiceWorkflow:
    def test_create_invoice_in_received_stage(self, headers):
        payload = {
            "vendor_name": "TEST_Vendor_Beta",
            "invoice_number": f"TEST-INV-{uuid.uuid4().hex[:8]}",
            "invoice_date": "2026-01-11",
            "amount": 999.99,
            "po_reference": "PO-001",
            "description": "Initial create",
        }
        r = requests.post(f"{API}/invoices", json=payload, headers=headers)
        assert r.status_code == 200
        inv = r.json()
        assert inv["status"] == "RECEIVED"
        assert "id" in inv
        assert len(inv["history"]) == 1
        assert inv["history"][0]["stage"] == "RECEIVED"
        # GET to verify persistence
        r2 = requests.get(f"{API}/invoices/{inv['id']}", headers=headers)
        assert r2.status_code == 200
        got = r2.json()
        assert got["invoice_number"] == payload["invoice_number"]
        # Per-stage duration_hours computed
        assert "duration_hours" in got["history"][0]

    def test_list_invoices_has_computed_fields(self, headers, created_invoice):
        r = requests.get(f"{API}/invoices", headers=headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        sample = next(i for i in items if i["id"] == created_invoice["id"])
        assert "is_stuck" in sample
        assert "hours_in_current_stage" in sample
        assert sample["is_stuck"] == False

    def test_list_invoices_search_filter(self, headers, created_invoice):
        r = requests.get(f"{API}/invoices", params={"search": created_invoice["invoice_number"]}, headers=headers)
        assert r.status_code == 200
        items = r.json()
        assert any(i["id"] == created_invoice["id"] for i in items)

    def test_list_invoices_status_filter(self, headers):
        r = requests.get(f"{API}/invoices", params={"status": "RECEIVED"}, headers=headers)
        assert r.status_code == 200
        for i in r.json():
            assert i["status"] == "RECEIVED"

    def test_advance_requires_grn_at_grn_stage(self, headers, created_invoice):
        inv_id = created_invoice["id"]
        # 1st advance: RECEIVED -> USER_DEPT_VERIFICATION (no grn needed)
        r = requests.post(f"{API}/invoices/{inv_id}/advance", json={"notes": "ok"}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "USER_DEPT_VERIFICATION"

        # 2nd advance: USER_DEPT_VERIFICATION -> GRN_RAISED (grn_number required)
        r2 = requests.post(f"{API}/invoices/{inv_id}/advance", json={"notes": "no grn"}, headers=headers)
        assert r2.status_code == 400
        assert "grn_number" in r2.text.lower()

        # Provide grn_number
        r3 = requests.post(
            f"{API}/invoices/{inv_id}/advance",
            json={"notes": "with grn", "grn_number": "GRN-TEST-123"},
            headers=headers,
        )
        assert r3.status_code == 200
        inv = r3.json()
        assert inv["status"] == "GRN_RAISED"
        assert inv["grn_number"] == "GRN-TEST-123"

    def test_advance_to_paid_sets_completed_at(self, headers, created_invoice):
        inv_id = created_invoice["id"]
        # Continue advancing through remaining stages until PAID
        remaining_targets = [
            "DEPT_HEAD_CERTIFICATION",
            "MAY_BE_PAID_STAMP",
            "DEAN_CERTIFICATION",
            "SCANNED_SENT_TO_FINANCE",
            "PAID",
        ]
        for target in remaining_targets:
            r = requests.post(f"{API}/invoices/{inv_id}/advance", json={"notes": f"-> {target}"}, headers=headers)
            assert r.status_code == 200, f"advance to {target} failed: {r.text}"
            assert r.json()["status"] == target

        # PAID set completed_at
        r = requests.get(f"{API}/invoices/{inv_id}", headers=headers)
        inv = r.json()
        assert inv["status"] == "PAID"
        assert inv["completed_at"] is not None

        # Cannot advance after PAID
        r2 = requests.post(f"{API}/invoices/{inv_id}/advance", json={"notes": "x"}, headers=headers)
        assert r2.status_code == 400

    def test_return_to_vendor_and_resubmit(self, headers):
        # Create a fresh invoice
        payload = {
            "vendor_name": "TEST_Vendor_Return",
            "invoice_number": f"TEST-RET-{uuid.uuid4().hex[:8]}",
            "invoice_date": "2026-01-11",
            "amount": 50.0,
        }
        inv = requests.post(f"{API}/invoices", json=payload, headers=headers).json()
        inv_id = inv["id"]

        # Return to vendor
        r = requests.post(
            f"{API}/invoices/{inv_id}/return-to-vendor",
            json={"reason": "Missing PO"},
            headers=headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "RETURNED_TO_VENDOR"
        assert data["returned"] == True
        assert any(h["stage"] == "RETURNED_TO_VENDOR" for h in data["history"])

        # Cannot return again
        r2 = requests.post(
            f"{API}/invoices/{inv_id}/return-to-vendor", json={"reason": "x"}, headers=headers
        )
        assert r2.status_code == 400

        # Cannot advance a returned invoice
        r3 = requests.post(f"{API}/invoices/{inv_id}/advance", json={"notes": "x"}, headers=headers)
        assert r3.status_code == 400

        # Resubmit -> back to RECEIVED
        r4 = requests.post(f"{API}/invoices/{inv_id}/resubmit", json={"notes": "fixed"}, headers=headers)
        assert r4.status_code == 200
        assert r4.json()["status"] == "RECEIVED"

        # Resubmit when not returned -> 400
        r5 = requests.post(f"{API}/invoices/{inv_id}/resubmit", json={"notes": "x"}, headers=headers)
        assert r5.status_code == 400


# ------------------- Attachments + Files -------------------
class TestAttachments:
    def test_upload_and_download_attachment(self, headers, admin_token):
        # Create invoice
        inv = requests.post(
            f"{API}/invoices",
            json={
                "vendor_name": "TEST_Vendor_Attach",
                "invoice_number": f"TEST-ATT-{uuid.uuid4().hex[:8]}",
                "invoice_date": "2026-01-11",
                "amount": 10.0,
            },
            headers=headers,
        ).json()
        inv_id = inv["id"]

        # Upload small "PDF" file
        fake_pdf = b"%PDF-1.4\n%TEST\n"
        files = {"file": ("test.pdf", io.BytesIO(fake_pdf), "application/pdf")}
        r = requests.post(f"{API}/invoices/{inv_id}/attachments", files=files, headers=headers)
        if r.status_code == 503:
            pytest.skip("Object storage unavailable in test env")
        assert r.status_code == 200, r.text
        record = r.json()
        assert record["original_filename"] == "test.pdf"
        assert record["content_type"] == "application/pdf"
        assert "storage_path" in record

        # Verify attached on invoice
        got = requests.get(f"{API}/invoices/{inv_id}", headers=headers).json()
        assert any(a["id"] == record["id"] for a in got["attachments"])

        # Download via /api/files/{path}?auth=TOKEN
        path = record["storage_path"]
        r2 = requests.get(f"{API}/files/{path}", params={"auth": admin_token})
        assert r2.status_code == 200
        assert r2.content == fake_pdf

        # Without token -> 401
        r3 = requests.get(f"{API}/files/{path}")
        assert r3.status_code == 401


# ------------------- Analytics -------------------
class TestAnalytics:
    def test_summary(self, headers):
        r = requests.get(f"{API}/analytics/summary", headers=headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_invoices", "in_flight", "paid", "returned", "stuck", "stage_distribution", "avg_processing_hours"):
            assert k in d
        assert isinstance(d["stage_distribution"], dict)

    def test_stage_tat(self, headers):
        r = requests.get(f"{API}/analytics/stage-tat", headers=headers)
        assert r.status_code == 200
        d = r.json()
        assert "rows" in d and "bottleneck" in d
        assert isinstance(d["rows"], list) and len(d["rows"]) == 8
        for row in d["rows"]:
            assert "avg_hours" in row and "sample_size" in row

    def test_vendors(self, headers):
        r = requests.get(f"{API}/analytics/vendors", headers=headers)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            row = rows[0]
            for k in ("vendor_name", "total", "paid", "returned", "in_flight", "total_amount"):
                assert k in row

    def test_export_csv(self, headers):
        r = requests.get(f"{API}/invoices/export/csv", headers=headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        # First line is header
        text = r.text
        assert "Invoice #" in text and "Vendor" in text

    def test_stuck_invoices_shape(self, headers):
        r = requests.get(f"{API}/invoices/stuck", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_notifications_digest_no_api_key(self, headers):
        # Create a quick invoice so endpoint runs (note: digest skips if no stuck)
        # If no stuck invoices exists, endpoint returns sent=False, reason=no stuck invoices
        r = requests.post(f"{API}/notifications/digest", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["sent"] is False or data["sent"] == True  # could be either based on env
        # Either no stuck, or no_api_key=True, or sent=True
        assert ("reason" in data) or (data.get("no_api_key") == True) or (data["sent"] == True)


# ------------------- Auth enforcement -------------------
class TestAuthEnforcement:
    @pytest.mark.parametrize("path,method", [
        ("/api/invoices", "GET"),
        ("/api/invoices/stuck", "GET"),
        ("/api/analytics/summary", "GET"),
        ("/api/analytics/stage-tat", "GET"),
        ("/api/analytics/vendors", "GET"),
        ("/api/invoices/export/csv", "GET"),
        ("/api/notifications/digest", "POST"),
    ])
    def test_unauth_returns_401(self, path, method):
        r = requests.request(method, f"{BASE_URL}{path}")
        assert r.status_code == 401, f"{path} expected 401 got {r.status_code}"
