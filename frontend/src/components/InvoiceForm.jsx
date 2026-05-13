import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Upload, X, FileText } from "lucide-react";

const InvoiceForm = ({ open, onOpenChange, onCreated }) => {
  const [form, setForm] = useState({
    vendor_name: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    amount: "",
    po_reference: "",
    description: "",
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setForm({
      vendor_name: "",
      invoice_number: "",
      invoice_date: new Date().toISOString().split("T")[0],
      amount: "",
      po_reference: "",
      description: "",
    });
    setFile(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.vendor_name || !form.invoice_number || !form.amount) {
      toast.error("Vendor, invoice # and amount are required");
      return;
    }
    setLoading(true);
    try {
      const { data: inv } = await api.post("/invoices", {
        ...form,
        amount: parseFloat(form.amount),
      });
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          await api.post(`/invoices/${inv.id}/attachments`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (err) {
          toast.warning("Invoice created but attachment upload failed");
        }
      }
      toast.success(`Invoice ${inv.invoice_number} recorded`);
      reset();
      onOpenChange(false);
      onCreated?.(inv);
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-xl border-[#09090B]" data-testid="invoice-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">New Invoice</DialogTitle>
          <p className="text-sm text-[#52525B]">Record a bill received from a vendor. Workflow begins at <span className="font-semibold">Bill Received</span>.</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2" data-testid="invoice-form">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="label-caps">Vendor Name *</Label>
              <Input
                value={form.vendor_name}
                onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
                data-testid="invoice-vendor-input"
                required
              />
            </div>
            <div>
              <Label className="label-caps">Invoice # *</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
                data-testid="invoice-number-input"
                required
              />
            </div>
            <div>
              <Label className="label-caps">Invoice Date</Label>
              <Input
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
                data-testid="invoice-date-input"
              />
            </div>
            <div>
              <Label className="label-caps">Amount (INR) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
                data-testid="invoice-amount-input"
                required
              />
            </div>
          </div>
          <div>
            <Label className="label-caps">PO Reference</Label>
            <Input
              value={form.po_reference}
              onChange={(e) => setForm({ ...form, po_reference: e.target.value })}
              className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
              data-testid="invoice-po-input"
            />
          </div>
          <div>
            <Label className="label-caps">Description / Notes</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
              data-testid="invoice-description-input"
            />
          </div>
          <div>
            <Label className="label-caps">Scanned Bill (PDF/Image, max 20MB)</Label>
            <div className="mt-2">
              {file ? (
                <div className="flex items-center justify-between border border-[#E5E7EB] p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-[#7A1A2C]" />
                    <span className="truncate max-w-[300px]">{file.name}</span>
                    <span className="text-xs text-[#52525B]">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button type="button" onClick={() => setFile(null)} data-testid="remove-file-button">
                    <X className="w-4 h-4 text-[#52525B] hover:text-[#09090B]" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 border border-dashed border-[#52525B] p-4 cursor-pointer hover:border-[#09090B] hover:bg-[#F8F9FA] transition-colors">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">Click to upload scanned invoice</span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    data-testid="invoice-file-input"
                  />
                </label>
              )}
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-none border-[#E5E7EB]"
              data-testid="invoice-form-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-none bg-[#09090B] hover:bg-[#27272A] text-white"
              data-testid="invoice-form-submit"
            >
              {loading ? "Saving…" : "Create Invoice →"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceForm;
