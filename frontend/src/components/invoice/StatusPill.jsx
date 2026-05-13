import React from "react";
import { AlertTriangle } from "lucide-react";
import { STAGE_LABELS } from "@/lib/constants";

const getPillStyle = (status, stuck) => {
  if (status === "PAID") return "bg-[#16A34A] text-white";
  if (status === "RETURNED_TO_VENDOR") return "bg-[#F59E0B] text-white";
  if (stuck) return "bg-[#E11D48] text-white";
  return "bg-[#7A1A2C] text-white";
};

const StatusPill = ({ status, stuck }) => (
  <span className={`inline-flex items-center px-3 py-1.5 text-xs font-bold tracking-wider uppercase ${getPillStyle(status, stuck)}`}>
    {stuck && <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />}
    {STAGE_LABELS[status] || status}
  </span>
);

export default StatusPill;
export { getPillStyle };
