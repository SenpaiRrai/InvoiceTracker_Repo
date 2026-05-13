import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/contexts/AuthContext";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronLeft, RotateCcw, ArrowRight, Send } from "lucide-react";
import StatusPill from "@/components/invoice/StatusPill";
import InvoiceMetaCard from "@/components/invoice/InvoiceMetaCard";
import AttachmentsCard from "@/components/invoice/AttachmentsCard";
import TimelineCard from "@/components/invoice/TimelineCard";
import { AdvanceDialog, ReturnDialog, ResubmitDialog } from "@/components/invoice/ActionDialogs";

const getNextStage = (currentStatus) => {
  const idx = STAGE_ORDER.indexOf(currentStatus);
  if (idx < 0 || idx + 1 >= STAGE_ORDER.length) return null;
  return STAGE_ORDER[idx + 1];
};

const ActionBar = ({ inv, nextStage, isFinal, isReturned, onAdvance, onReturn, onResubmit, onEmailDigest }) => (
  <div className="flex gap-2 flex-wrap">
    {!isFinal && !isReturned && (
      <>
        <Button onClick={onReturn} variant="outline" className="rounded-none border-[#F59E0B] text-[#F59E0B] hover:bg-[#F59E0B] hover:text-white" data-testid="return-button">
          <RotateCcw className="w-4 h-4 mr-2" /> Return to Vendor
        </Button>
        {nextStage && (
          <Button onClick={onAdvance} className="rounded-none bg-[#16A34A] hover:bg-[#15803D] text-white" data-testid="advance-button">
            Advance to {STAGE_LABELS[nextStage]} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </>
    )}
    {isReturned && (
      <Button onClick={onResubmit} className="rounded-none bg-[#7A1A2C] hover:bg-[#5C1421] text-white" data-testid="resubmit-button">
        <Send className="w-4 h-4 mr-2" /> Mark Resubmitted
      </Button>
    )}
    {inv.is_stuck && (
      <Button onClick={onEmailDigest} variant="outline" className="rounded-none border-[#E11D48] text-[#E11D48] hover:bg-[#E11D48] hover:text-white" data-testid="email-digest-button">
        <Send className="w-4 h-4 mr-2" /> Email me digest
      </Button>
    )}
  </div>
);

const InvoiceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdvance, setShowAdvance] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showResubmit, setShowResubmit] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/invoices/${id}`);
      setInv(data);
    } catch (err) {
      console.warn("[invoice-detail] load failed:", err?.message);
      toast.error("Invoice not found");
      navigate("/invoices");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const triggerEmailDigest = async () => {
    try {
      const { data } = await api.post("/notifications/digest");
      if (data.no_api_key) {
        toast.warning("Email digest skipped — Resend API key not configured.");
      } else if (data.sent) {
        toast.success(`Digest sent to your email (${data.count} stuck invoices)`);
      } else {
        toast.info(data.reason || "No stuck invoices");
      }
    } catch (err) {
      console.warn("[digest] failed:", err?.message);
      toast.error("Could not send digest");
    }
  };

  if (loading || !inv) {
    return <div className="p-8 label-caps text-[#52525B]" data-testid="invoice-detail-loading">Loading invoice…</div>;
  }

  const nextStage = getNextStage(inv.status);
  const isFinal = inv.status === "PAID";
  const isReturned = inv.status === "RETURNED_TO_VENDOR";

  return (
    <div className="p-8 max-w-[1400px]" data-testid="invoice-detail-page">
      <Link to="/invoices" className="inline-flex items-center text-sm text-[#52525B] hover:text-[#09090B] mb-4" data-testid="back-to-invoices">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to invoices
      </Link>

      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps mb-2">{inv.vendor_name}</div>
          <h1 className="font-display font-black text-4xl tracking-tight font-mono-data">{inv.invoice_number}</h1>
          <div className="flex items-center gap-3 mt-3">
            <StatusPill status={inv.status} stuck={inv.is_stuck} />
            {inv.is_stuck && (
              <span className="text-xs text-[#E11D48] font-semibold">
                Stuck for {(inv.hours_in_current_stage / 24).toFixed(1)} days
              </span>
            )}
          </div>
        </div>
        <ActionBar
          inv={inv}
          nextStage={nextStage}
          isFinal={isFinal}
          isReturned={isReturned}
          onAdvance={() => setShowAdvance(true)}
          onReturn={() => setShowReturn(true)}
          onResubmit={() => setShowResubmit(true)}
          onEmailDigest={triggerEmailDigest}
        />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <InvoiceMetaCard inv={inv} />
          <AttachmentsCard
            invoiceId={inv.id}
            attachments={inv.attachments}
            onUploaded={load}
          />
        </div>
        <div className="lg:col-span-2">
          <TimelineCard
            history={inv.history}
            isFinal={isFinal}
            isReturned={isReturned}
            isStuck={inv.is_stuck}
          />
        </div>
      </div>

      <AdvanceDialog
        open={showAdvance}
        onOpenChange={setShowAdvance}
        invoice={inv}
        nextStage={nextStage}
        onAdvanced={setInv}
      />
      <ReturnDialog
        open={showReturn}
        onOpenChange={setShowReturn}
        invoice={inv}
        onReturned={setInv}
      />
      <ResubmitDialog
        open={showResubmit}
        onOpenChange={setShowResubmit}
        invoice={inv}
        onResubmitted={setInv}
      />
    </div>
  );
};

export default InvoiceDetail;
