import React from "react";
import { formatCurrency, formatDateTime } from "@/lib/constants";

const Row = ({ label, children }) => (
  <div>
    <div className="label-caps text-[10px]">{label}</div>
    <div>{children}</div>
  </div>
);

const InvoiceMetaCard = ({ inv }) => (
  <div className="flat-card p-5" data-testid="invoice-meta-card">
    <div className="label-caps mb-3">Invoice Details</div>
    <div className="space-y-3 text-sm">
      <Row label="Vendor"><div className="font-semibold">{inv.vendor_name}</div></Row>
      <Row label="Amount"><div className="font-mono-data font-semibold text-lg">{formatCurrency(inv.amount)}</div></Row>
      <Row label="Invoice Date">{formatDateTime(inv.invoice_date)}</Row>
      <Row label="PO/WO Reference"><div className="font-mono-data">{inv.po_reference || "—"}</div></Row>
      <Row label="GRN/SRN Number"><div className="font-mono-data">{inv.grn_number || "—"}</div></Row>
      <Row label="Created">
        <div className="text-[#52525B]">{formatDateTime(inv.created_at)} by {inv.created_by_name}</div>
      </Row>
      {inv.completed_at && (
        <Row label="Completed">
          <div className="text-[#16A34A] font-semibold">{formatDateTime(inv.completed_at)}</div>
        </Row>
      )}
      {inv.description && (
        <Row label="Description"><div className="text-[#52525B] text-sm">{inv.description}</div></Row>
      )}
    </div>
  </div>
);

export default InvoiceMetaCard;
