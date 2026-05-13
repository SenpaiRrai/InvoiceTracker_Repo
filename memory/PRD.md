# InvoiceFlow — Product Requirements Document

**Date:** 2026-05-12

## Original Problem Statement
> I work at stores department of a big company. We process bills as follows:
> Receive bill → check → if incorrect return to vendor for correction → if correct, User Dept verifies → GRN raised (note GRN number) → Dept Head certification → "May Be Paid" / "To Be Paid" stamp → Dean certification → scan & send to finance for payment.
> I want an app/website to: track invoices, see where each one is, how much time is taken in each step, TAT per step + overall, popup chime when an invoice is stuck >3 days at any step.

## Architecture
- **Backend:** FastAPI + MongoDB (motor async), all routes under `/api`
- **Auth:** Custom JWT (multi-role) — admin/stores_staff/user_dept/dept_head/dean/finance
- **Frontend:** React + React Router + Tailwind + shadcn/ui + Recharts + Sonner toasts
- **Integrations:** Emergent Object Storage (attachments), Resend (email digest, optional)
- **Workflow stages (8):** RECEIVED → USER_DEPT_VERIFICATION → GRN_RAISED → DEPT_HEAD_CERTIFICATION → MAY_BE_PAID_STAMP → DEAN_CERTIFICATION → SCANNED_SENT_TO_FINANCE → PAID. Plus RETURNED_TO_VENDOR side-state.

## User Personas
- **Stores Staff** — primary user, creates invoices and advances stages
- **User Dept / Dept Head / Dean / Finance** — domain verifiers (log in to mark their own step)
- **Admin** — full access

## Core Requirements
1. Multi-role JWT login (Bearer + cookies)
2. Create invoice with vendor, invoice #, date, amount, PO ref, description, scanned attachment
3. 8-stage workflow with audit history (who/when/notes)
4. Required GRN number when entering GRN_RAISED stage
5. Return-to-vendor + resubmit cycle
6. Stuck detection: >3 days at any stage → in-app chime + toast + browser notification + email digest (Resend, optional)
7. Dashboard: KPI tiles, stage distribution donut, stuck banner with quick links
8. Analytics: avg stage TAT bar chart, bottleneck card, vendor-wise stats
9. CSV export of all invoices
10. File attachment upload/download via Emergent Object Storage

## Implemented (2026-05-12)
- ✅ Backend (`/app/backend/server.py`) — auth, invoices CRUD + workflow, attachments, analytics, CSV, digest. Seeded 6 demo users.
- ✅ Frontend pages: Login, Dashboard, Invoices, InvoiceDetail (with timeline), Analytics
- ✅ Sidebar layout + role badge
- ✅ Real-time stuck-invoice polling with chime + browser Notification API + toasts
- ✅ Backend tested — **25/25 passing**

## Prioritized Backlog (P1/P2)
- **P1**: Background cron job to auto-send weekly stuck-invoice digests (currently only manual trigger via UI button)
- **P1**: Server-Sent Events or WebSocket for instant stuck notifications (currently 60s polling)
- **P1**: Brute-force lockout on auth (5 attempts → 15 min)
- **P2**: User management UI (add/remove/edit users) — currently only via DB seed
- **P2**: Per-stage required role enforcement (e.g., only `dean` role can advance Dean Certification)
- **P2**: Comments thread on each invoice for inter-role discussion
- **P2**: PDF preview inline (instead of just download)
- **P2**: Date-range filter + advanced search on invoices page
- **P2**: Slack/Teams webhook alongside email digest

## Next Tasks
- Collect Resend API key from user → set `RESEND_API_KEY` in `/app/backend/.env` → restart backend
- Optional: implement P1 backlog items based on user feedback
