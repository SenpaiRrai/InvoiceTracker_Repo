import React from "react";
import { formatDateTime, hoursToHuman } from "@/lib/constants";

const getNodeColor = ({ stage, isLast, isFinal, isReturnedSnapshot, isStuck }) => {
  if (stage === "RETURNED_TO_VENDOR") return "#F59E0B";
  if (isLast && !isFinal && !isReturnedSnapshot) return isStuck ? "#E11D48" : "#7A1A2C";
  return "#16A34A";
};

const TimelineEntry = ({ entry, idx, total, isFinal, isReturned, isStuck }) => {
  const isLast = idx === total - 1;
  const color = getNodeColor({
    stage: entry.stage,
    isLast,
    isFinal,
    isReturnedSnapshot: isReturned,
    isStuck,
  });
  const showCurrentBadge = isLast && !isFinal && !isReturned;

  return (
    <div className="flex gap-4 pb-6 last:pb-0 relative" data-testid={`timeline-entry-${entry.stage}-${idx}`}>
      {!isLast && (
        <div className="absolute left-[7px] top-4 bottom-0 w-0.5" style={{ background: "#E5E7EB" }} />
      )}
      <div className="w-4 h-4 mt-1 flex-shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="font-display font-bold text-base">{entry.stage_label}</div>
          <div className="text-xs text-[#52525B] font-mono-data">{formatDateTime(entry.entered_at)}</div>
        </div>
        <div className="text-xs text-[#52525B] mt-1">
          by <span className="font-semibold text-[#09090B]">{entry.by_user_name}</span> ({entry.by_user_role})
          {showCurrentBadge && (
            <span className="ml-2 px-1.5 py-0.5 bg-[#FBEAEC] text-[#7A1A2C] font-semibold text-[10px] uppercase tracking-wider">
              Current
            </span>
          )}
          {entry.duration_hours != null && (
            <span className="ml-2 font-mono-data">· {hoursToHuman(entry.duration_hours)}</span>
          )}
        </div>
        {entry.grn_number && (
          <div className="text-xs mt-1">
            GRN: <span className="font-mono-data font-semibold">{entry.grn_number}</span>
          </div>
        )}
        {entry.notes && (
          <div className="text-sm mt-2 text-[#09090B] border-l-2 border-[#E5E7EB] pl-3">{entry.notes}</div>
        )}
      </div>
    </div>
  );
};

// Stable key for history entries — defends against array reorder and duplicates
const entryKey = (entry, idx) =>
  `${entry.stage}-${entry.entered_at}-${entry.by_user_id || "anon"}-${idx}`;

const TimelineCard = ({ history, isFinal, isReturned, isStuck }) => (
  <div className="flat-card p-6" data-testid="timeline-card">
    <div className="label-caps mb-1">Audit Trail</div>
    <h2 className="font-display font-bold text-xl tracking-tight mb-6">Workflow timeline</h2>
    <div className="relative">
      {history.map((h, idx) => (
        <TimelineEntry
          key={entryKey(h, idx)}
          entry={h}
          idx={idx}
          total={history.length}
          isFinal={isFinal}
          isReturned={isReturned}
          isStuck={isStuck}
        />
      ))}
    </div>
  </div>
);

export default TimelineCard;
