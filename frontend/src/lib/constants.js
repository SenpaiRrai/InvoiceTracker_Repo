export const STAGE_ORDER = [
  "RECEIVED",
  "USER_DEPT_VERIFICATION",
  "GRN_RAISED",
  "DEPT_HEAD_CERTIFICATION",
  "MAY_BE_PAID_STAMP",
  "DEAN_CERTIFICATION",
  "SCANNED_SENT_TO_FINANCE",
  "PAID",
];

export const STAGE_LABELS = {
  RECEIVED: "Bill Received",
  USER_DEPT_VERIFICATION: "User Dept Verification",
  GRN_RAISED: "GRN Raised",
  DEPT_HEAD_CERTIFICATION: "Dept Head Certification",
  MAY_BE_PAID_STAMP: "May Be Paid / To Be Paid Stamp",
  DEAN_CERTIFICATION: "Dean Certification",
  SCANNED_SENT_TO_FINANCE: "Scanned & Sent to Finance",
  PAID: "Payment Processed",
  RETURNED_TO_VENDOR: "Returned to Vendor",
};

export const STAGE_SHORT = {
  RECEIVED: "Received",
  USER_DEPT_VERIFICATION: "User Dept",
  GRN_RAISED: "GRN",
  DEPT_HEAD_CERTIFICATION: "Dept Head",
  MAY_BE_PAID_STAMP: "MBP Stamp",
  DEAN_CERTIFICATION: "Dean",
  SCANNED_SENT_TO_FINANCE: "Finance",
  PAID: "Paid",
  RETURNED_TO_VENDOR: "Returned",
};

export const ROLE_LABELS = {
  admin: "Admin",
  stores_staff: "Stores Staff",
  user_dept: "User Department",
  dept_head: "Department Head",
  dean: "Dean",
  finance: "Finance",
};

export const ROLES = Object.keys(ROLE_LABELS);

export const formatCurrency = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { dateStyle: "medium" });
};

export const hoursToHuman = (h) => {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};
