import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Upload, X, FileText } from "lucide-react";

// Added "invoice" to props to handle editing
const InvoiceForm = ({ open, onOpenChange, onCreated, invoice }) => {
  const [form, setForm] = useState({
    vendor_name: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    invoice_receiving_date: "",
    amount: "",
    po_reference: "", // Updated name to match your new scheme
    description: "",
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // This hook fills the form if we are editing an existing invoice
  useEffect(() => {
    if (invoice) {
      setForm({
        vendor_name: invoice.vendor_name || "",
        invoice_number: invoice.invoice_number || "",
        invoice_receiving_date: invoice.invoice_receiving_date?.split("T")[0] || "",
        invoice_date: invoice.invoice_date?.split("T")[0] || "",
        amount: invoice.amount || "",
        po_reference: invoice.po_reference || "",
        description: invoice.description || "",
      });
    } else {
      reset();
    }
  }, [invoice, open]);

  const reset = () => {
    setForm({
      vendor_name: "",
      invoice_number: "",
      invoice_date: new Date().toISOString().split("T")[0],
      invoice_receiving_date: "",
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
      if (invoice) {
        // --- EDIT MODE ---
        await api.put(`/invoices/${invoice.id}`, {
          ...form,
          amount: parseFloat(form.amount),
        });
        toast.success("Invoice updated successfully");
      } else {
        // --- CREATE MODE ---
        const { data: inv } = await api.post("/invoices", {
          ...form,
          amount: parseFloat(form.amount),
        });
        if (file) {
          const fd = new FormData();
          fd.append("file", file);
          await api.post(`/invoices/${inv.id}/attachments`, fd);
        }
        toast.success(`Invoice ${inv.invoice_number} recorded`);
      }
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error("Error saving data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-xl border-[#09090B]" data-testid="invoice-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            {invoice ? "Edit Invoice" : "New Invoice"}
          </DialogTitle>
          <DialogDescription>
            {invoice ? "Update the details for this invoice." : "Record a new bill received from a vendor."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2" data-testid="invoice-form">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="label-caps">Vendor Name *</Label>
              <Input
                value={form.vendor_name}
                onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                className="mt-2 rounded-none border-[#E5E7EB]"
                required
              />
            </div>
            <div>
              <Label className="label-caps">Invoice # *</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                className="mt-2 rounded-none border-[#E5E7EB]"
                required
              />
            </div>
            <div>
              <Label className="label-caps">Invoice Date</Label>
              <Input
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                className="mt-2 rounded-none border-[#E5E7EB]"
              />
              <Input
                type="date"
                value={form.invoice_receiving_date}
                onChange={(e) => setForm({ ...form, invoice_receiving_date: e.target.value,})}
                className="mt-2 rounded-none border-[#E5E7EB]"
              />
            </div>
            <div>
              <Label className="label-caps">Amount (INR) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="mt-2 rounded-none border-[#E5E7EB]"
                required
              />
            </div>
          </div>
          <div>
            <Label className="label-caps">PO/WO Reference</Label>
            <Input
              value={form.po_reference}
              onChange={(e) => setForm({ ...form, po_reference: e.target.value })}
              className="mt-2 rounded-none border-[#E5E7EB]"
            />
          </div>
          <div>
            <Label className="label-caps">Description / Notes</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="mt-2 rounded-none border-[#E5E7EB]"
            />
          </div>
          
          {/* File upload only shown when creating a new invoice */}
          {!invoice && (
            <div>
              <Label className="label-caps">Scanned Bill (PDF/Image)</Label>
              <div className="mt-2">
                <Input 
                  type="file" 
                  onChange={(e) => setFile(e.target.files[0])}
                  className="rounded-none border-dashed border-2" 
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-none border-[#E5E7EB]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-none bg-[#09090B] text-white"
            >
              {loading ? "Saving…" : (invoice ? "Save Changes" : "Create Invoice →")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceForm;
