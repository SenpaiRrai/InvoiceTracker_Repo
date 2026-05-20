import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STAGE_LABELS } from "@/lib/constants";
import { api } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const AdvanceDialog = ({ open, onOpenChange, invoice, nextStage, onAdvanced }) => {
  const [notes, setNotes] = useState("");
  const [grn, setGrn] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setNotes("");
    setGrn("");
    setFile(null);
  };

  const handleAdvance = async () => {
    if (nextStage === "GRN_RAISED" && !grn) {
      toast.error("GRN/SRN number is required");
      return;
    }

    if (nextStage === "SCANNED_SENT_TO_FINANCE" && !file) {
      toast.error("Please upload the scanned bill before sending to Finance.");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Advance invoice stage
      const { data } = await api.post(`/invoices/${invoice.id}/advance`, {
        notes,
        grn_number: nextStage === "GRN_RAISED" ? grn : undefined,
      });

      // Step 2: Upload attachment if available
      if (file) {
        const fd = new FormData();
        fd.append("file", file);

        await api.post(`/invoices/${invoice.id}/attachments`, fd, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
      }

      toast.success(`Advanced to ${STAGE_LABELS[data.status]}`);

      reset();
      onOpenChange(false);
      onAdvanced?.(data);

    } catch (err) {
      console.warn("[advance] failed:", err?.message);
      toast.error(err.response?.data?.detail || "Could not advance invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none border-[#09090B]" data-testid="advance-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            Advance Invoice
          </DialogTitle>

          <p className="text-sm text-[#52525B]">
            Moving from{" "}
            <span className="font-semibold">
              {STAGE_LABELS[invoice.status]}
            </span>{" "}
            →{" "}
            <span className="font-semibold text-[#16A34A]">
              {nextStage && STAGE_LABELS[nextStage]}
            </span>
          </p>
        </DialogHeader>

        {nextStage === "GRN_RAISED" && (
          <div>
            <Label className="label-caps">GRN/SRN Number *</Label>

            <Input
              value={grn}
              onChange={(e) => setGrn(e.target.value)}
              placeholder="GRN/SRN-2026-0001"
              className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
              data-testid="grn-number-input"
            />
          </div>
        )}

        {nextStage === "SCANNED_SENT_TO_FINANCE" && (
          <div>
            <Label className="label-caps">
              Upload Scanned Invoice *
            </Label>

            <Input
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
              className="mt-2 rounded-none border-[#E5E7EB]"
              data-testid="invoice-file-upload"
            />
          </div>
        )}

        <div>
          <Label className="label-caps">Notes</Label>

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
            data-testid="advance-notes-input"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-none"
          >
            Cancel
          </Button>

          <Button
            onClick={handleAdvance}
            disabled={loading}
            className="rounded-none bg-[#16A34A] hover:bg-[#15803D] text-white"
            data-testid="confirm-advance-button"
          >
            {loading ? "Advancing…" : "Confirm advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
export const ReturnDialog = ({ open, onOpenChange, invoice, onReturned }) => {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!reason) {
      toast.error("Please provide a reason");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(`/invoices/${invoice.id}/return-to-vendor`, { reason });
      toast.success("Returned to vendor");
      setReason("");
      onOpenChange(false);
      onReturned?.(data);
    } catch (err) {
      console.warn("[return] failed:", err?.message);
      toast.error(err.response?.data?.detail || "Could not return");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none border-[#F59E0B]" data-testid="return-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">Return to Vendor</DialogTitle>
          <p className="text-sm text-[#52525B]">
            This will pause the workflow and mark the invoice as <span className="font-semibold">Returned to Vendor</span>.
          </p>
        </DialogHeader>
        <div>
          <Label className="label-caps">Reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Wrong amount / missing GST / etc."
            className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
            data-testid="return-reason-input"
            required
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-none">Cancel</Button>
          <Button onClick={submit} disabled={loading} className="rounded-none bg-[#F59E0B] hover:bg-[#D97706] text-white" data-testid="confirm-return-button">
            {loading ? "Returning…" : "Confirm return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ResubmitDialog = ({ open, onOpenChange, invoice, onResubmitted }) => {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/invoices/${invoice.id}/resubmit`, { notes });
      toast.success("Invoice resubmitted");
      setNotes("");
      onOpenChange(false);
      onResubmitted?.(data);
    } catch (err) {
      console.warn("[resubmit] failed:", err?.message);
      toast.error(err.response?.data?.detail || "Could not resubmit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none border-[#7A1A2C]" data-testid="resubmit-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">Resubmit Invoice</DialogTitle>
          <p className="text-sm text-[#52525B]">
            Mark this as resubmitted by the vendor after correction. Will restart at <span className="font-semibold">Bill Received</span>.
          </p>
        </DialogHeader>
        <div>
          <Label className="label-caps">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
            data-testid="resubmit-notes-input"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-none">Cancel</Button>
          <Button onClick={submit} disabled={loading} className="rounded-none bg-[#7A1A2C] hover:bg-[#5C1421] text-white" data-testid="confirm-resubmit-button">
            {loading ? "Submitting…" : "Confirm resubmit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
export const FinanceReturnDialog = ({
  open,
  onOpenChange,
  invoice,
  onReturned
}) => {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!reason) {
      toast.error("Please provide a reason");
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post(
        `/invoices/${invoice.id}/finance-return`,
        { reason }
      );

      toast.success("Invoice returned by Finance");

      setReason("");
      onOpenChange(false);

      const refreshed = await api.get(
  `/invoices/${invoice.id}`
);

onReturned?.(refreshed.data);

    } catch (err) {
      console.warn("[finance-return] failed:", err?.message);

      toast.error(
        err.response?.data?.detail ||
        "Could not process finance return"
      );

    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="rounded-none border-red-500"
        data-testid="finance-return-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl tracking-tight">
            Finance Invoice Return
          </DialogTitle>

          <p className="text-sm text-[#52525B]">
            Return invoice back for correction/review.
          </p>
        </DialogHeader>

        <div>
          <Label className="label-caps">
            Reason *
          </Label>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason for finance return..."
            className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-none"
          >
            Cancel
          </Button>

          <Button
            onClick={submit}
            disabled={loading}
            className="rounded-none bg-red-500 hover:bg-red-600 text-white"
          >
            {loading ? "Returning..." : "Confirm Finance Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
