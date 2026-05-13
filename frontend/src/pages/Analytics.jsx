import React, { useCallback, useEffect, useState } from "react";
import { api, API } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Flame, Download } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { toast } from "sonner";

const SummaryTile = ({ label, value, accent }) => (
  <div className="flat-card p-4">
    <div className="label-caps">{label}</div>
    <div className={`font-display font-black text-3xl mt-1 ${accent || ""}`}>{value}</div>
  </div>
);

const Analytics = () => {
  const [stageData, setStageData] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [s, t, v] = await Promise.all([
        api.get("/analytics/summary"),
        api.get("/analytics/stage-tat"),
        api.get("/analytics/vendors"),
      ]);
      setSummary(s.data);
      setStageData(t.data);
      setVendors(v.data);
    } catch (err) {
      console.warn("[analytics] load failed:", err?.message);
      toast.error("Could not load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const exportCsv = async () => {
    try {
      const resp = await fetch(`${API}/invoices/export/csv`, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn("[analytics] csv export failed:", err?.message);
      toast.error("Export failed");
    }
  };

  if (loading) return <div className="p-8 label-caps text-[#52525B]" data-testid="analytics-loading">Loading analytics…</div>;

  const chartRows = (stageData?.rows || []).map((r) => ({
    name: r.label.length > 18 ? r.label.slice(0, 16) + "…" : r.label,
    fullName: r.label,
    stage: r.stage,
    hours: r.avg_hours,
    days: r.avg_days,
    samples: r.sample_size,
  }));

  return (
    <div className="p-8 max-w-[1400px]" data-testid="analytics-page">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps mb-2">Reporting / TAT</div>
          <h1 className="font-display font-black text-4xl tracking-tight">Workflow analytics</h1>
          <p className="text-sm text-[#52525B] mt-2">Where time is spent and which vendors slow things down.</p>
        </div>
        <Button onClick={exportCsv} className="rounded-none bg-[#09090B] hover:bg-[#27272A] text-white" data-testid="analytics-export-csv">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </header>

      {stageData?.bottleneck && stageData.bottleneck.sample_size > 0 && (
        <div className="border-2 border-[#09090B] p-5 mb-6 flex items-start gap-3 bg-white" data-testid="bottleneck-card">
          <Flame className="w-5 h-5 text-[#E11D48] mt-0.5" />
          <div>
            <div className="label-caps mb-1">Current bottleneck</div>
            <div className="font-display font-black text-2xl tracking-tight">{stageData.bottleneck.label}</div>
            <div className="text-sm text-[#52525B] mt-1">
              Avg time spent here: <span className="font-mono-data font-semibold text-[#09090B]">{stageData.bottleneck.avg_days} days</span> ({stageData.bottleneck.avg_hours} hours), based on {stageData.bottleneck.sample_size} sample{stageData.bottleneck.sample_size !== 1 ? "s" : ""}.
            </div>
          </div>
        </div>
      )}

      <div className="flat-card p-6 mb-6" data-testid="stage-tat-card">
        <div className="label-caps">Stage-wise Avg TAT</div>
        <h2 className="font-display font-bold text-xl tracking-tight mt-1 mb-4">How long invoices sit at each step</h2>
        {chartRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#52525B]">No data yet</div>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={chartRows} margin={{ top: 10, right: 20, bottom: 60, left: 10 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="name" stroke="#52525B" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
                <YAxis stroke="#52525B" tick={{ fontSize: 11 }} label={{ value: "Hours", angle: -90, position: "insideLeft", style: { fill: "#52525B", fontSize: 11 } }} />
                <Tooltip
                  contentStyle={{ borderRadius: 0, border: "1px solid #09090B", padding: "8px" }}
                  formatter={(v) => [`${v}h (${(v / 24).toFixed(1)}d)`, "Avg TAT"]}
                  labelFormatter={(l, p) => p?.[0]?.payload?.fullName || l}
                />
                <Bar dataKey="hours" fill="#7A1A2C" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {(stageData?.rows || []).map((r) => (
            <div key={r.stage} className="border border-[#E5E7EB] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[#52525B] truncate">{r.label}</div>
              <div className="font-mono-data font-bold text-lg">{r.avg_days}d</div>
              <div className="text-[10px] text-[#52525B]">{r.sample_size} samples</div>
            </div>
          ))}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryTile label="Total Invoices" value={summary.total_invoices} />
          <SummaryTile label="Avg End-to-End" value={`${summary.avg_processing_days}d`} />
          <SummaryTile label="Returned" value={summary.returned} accent="text-[#F59E0B]" />
          <SummaryTile label="Stuck Now" value={summary.stuck} accent={summary.stuck > 0 ? "text-[#E11D48]" : ""} />
        </div>
      )}

      <div className="flat-card overflow-hidden" data-testid="vendor-stats-card">
        <div className="p-5 border-b border-[#E5E7EB]">
          <div className="label-caps">Vendor-wise statistics</div>
          <h2 className="font-display font-bold text-xl tracking-tight mt-1">By vendor</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
              <tr className="text-left">
                <th className="px-4 py-3 label-caps">Vendor</th>
                <th className="px-4 py-3 label-caps">Invoices</th>
                <th className="px-4 py-3 label-caps">Paid</th>
                <th className="px-4 py-3 label-caps">Returned</th>
                <th className="px-4 py-3 label-caps">In Flight</th>
                <th className="px-4 py-3 label-caps">Total Value</th>
                <th className="px-4 py-3 label-caps">Avg TAT</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[#52525B]">No vendor data yet</td></tr>
              ) : (
                vendors.map((v) => (
                  <tr key={v.vendor_name} className="border-b border-[#E5E7EB] hover:bg-[#F8F9FA]" data-testid={`vendor-row-${v.vendor_name}`}>
                    <td className="px-4 py-3 font-semibold">{v.vendor_name}</td>
                    <td className="px-4 py-3 font-mono-data">{v.total}</td>
                    <td className="px-4 py-3 font-mono-data text-[#16A34A]">{v.paid}</td>
                    <td className="px-4 py-3 font-mono-data text-[#F59E0B]">{v.returned}</td>
                    <td className="px-4 py-3 font-mono-data text-[#7A1A2C]">{v.in_flight}</td>
                    <td className="px-4 py-3 font-mono-data">{formatCurrency(v.total_amount)}</td>
                    <td className="px-4 py-3 font-mono-data">{v.avg_days > 0 ? `${v.avg_days}d` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
