import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/constants";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, TrendingUp, FileCheck, RotateCcw, Activity, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLORS = ["#7A1A2C", "#D97757", "#16A34A", "#F59E0B", "#0EA5E9", "#DB2777", "#65A30D", "#0F766E", "#E11D48"];

const StatTile = ({ label, value, sub, accent, icon: Icon, testid }) => (
  <div className="flat-card p-5 hover-lift" data-testid={testid}>
    <div className="flex items-start justify-between mb-3">
      <div className="label-caps">{label}</div>
      {Icon && <Icon className={`w-4 h-4 ${accent || "text-[#52525B]"}`} />}
    </div>
    <div className={`font-display font-black text-4xl tracking-tight ${accent || ""}`}>{value}</div>
    {sub && <div className="text-xs text-[#52525B] mt-2">{sub}</div>}
  </div>
);

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [stuck, setStuck] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([
        api.get("/analytics/summary"),
        api.get("/invoices/stuck"),
      ]);
      setSummary(s.data);
      setStuck(st.data);
    } catch (err) {
      console.warn("[dashboard] failed to load:", err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading || !summary) {
    return (
      <div className="p-8 label-caps text-[#52525B]" data-testid="dashboard-loading">
        Loading dashboard…
      </div>
    );
  }

  const distData = STAGE_ORDER.concat(["RETURNED_TO_VENDOR"])
    .map((k, i) => ({ name: STAGE_LABELS[k], value: (summary?.stage_distribution && summary.stage_distribution[k]) || 0, color: COLORS[i % COLORS.length], key: k }))
    .filter((d) => d.value > 0);
  return (
    <div className="max-w-[1400px]" data-testid="dashboard-page">
      {/* Subtle campus banner — themes the page without fighting data density */}
      <div className="relative h-32 md:h-40 overflow-hidden border-b border-[#E5E7EB]">
        <img
          src="https://customer-assets.emergentagent.com/job_invoice-status-pulse/artifacts/m5okmycl_College%20Recent%20Photo.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-[3px] scale-110 opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#F8F9FA] via-[#F8F9FA]/85 to-[#F8F9FA]/30" />
        <div className="absolute inset-0 flex items-center px-8">
          <div>
            <div className="label-caps mb-1">Manipal Tata Medical College · Jamshedpur</div>
            <div className="font-display font-black text-2xl md:text-3xl tracking-tight">Stores Department</div>
          </div>
        </div>
      </div>

      <div className="p-8">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps mb-2">Live status</div>
          <h1 className="font-display font-black text-4xl tracking-tight">Invoice control desk</h1>
          <p className="text-sm text-[#52525B] mt-2">Track every bill from receipt to payment — and act on stalls instantly.</p>
        </div>
        <Link to="/invoices">
          <Button className="rounded-none bg-[#09090B] hover:bg-[#27272A] text-white" data-testid="dashboard-view-all-button">
            View all invoices <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </header>

      {Array.isArray(stuck) && stuck.length > 0 && (
        <div className="border-2 border-[#E11D48] bg-[#FEF2F2] p-5 mb-6 stuck-pulse" data-testid="stuck-banner">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#E11D48] mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-[#9F1239]">
                {stuck.length} invoice{stuck.length > 1 ? "s" : ""} stuck &gt; {summary.stuck_threshold_days} days
              </div>
              <div className="text-sm text-[#9F1239]/80 mt-1">These invoices haven't moved at their current stage. Open them and advance or return.</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {stuck.slice(0, 6).map((i) => (
                  <Link
                    key={i.id}
                    to={`/invoices/${i.id}`}
                    className="text-xs font-mono-data px-2 py-1 bg-white border border-[#E11D48] text-[#E11D48] hover:bg-[#E11D48] hover:text-white transition-colors"
                    data-testid={`stuck-link-${i.invoice_number}`}
                  >
                    {i.invoice_number} · {i.days_in_current_stage.toFixed(1)}d
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatTile testid="stat-in-flight" label="In Flight" value={summary.in_flight} sub={`of ${summary.total_invoices} total`} icon={Activity} />
        <StatTile testid="stat-stuck" label="Stuck > 3 days" value={summary.stuck} sub={`Threshold ${summary.stuck_threshold_days} days`} icon={AlertTriangle} accent={summary.stuck > 0 ? "text-[#E11D48]" : ""} />
        <StatTile testid="stat-paid" label="Paid" value={summary.paid} sub="Completed invoices" icon={FileCheck} accent="text-[#16A34A]" />
        <StatTile testid="stat-avg-tat" label="Avg Processing TAT" value={`${summary.avg_processing_days}d`} sub={`${summary.avg_processing_hours} hours`} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="flat-card p-6 lg:col-span-2" data-testid="distribution-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label-caps">Stage Distribution</div>
              <h2 className="font-display font-bold text-xl mt-1 tracking-tight">Where invoices are right now</h2>
            </div>
          </div>
          {distData.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#52525B]">No invoices yet. Create your first one to begin.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                      {distData.map((d) => (
                        <Cell key={d.key} fill={d.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 0, border: "1px solid #09090B" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {distData.map((d) => (
                  <div key={d.key} className="flex items-center justify-between text-sm border-b border-[#E5E7EB] pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5" style={{ background: d.color }} />
                      <span className="text-[#09090B]">{d.name}</span>
                    </div>
                    <span className="font-mono-data font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flat-card p-6" data-testid="returned-card">
          <div className="label-caps">Returned to Vendor</div>
          <div className="font-display font-black text-5xl mt-2 tracking-tight">{summary.returned}</div>
          <div className="text-xs text-[#52525B] mt-2 mb-4 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Invoices sent back for correction
          </div>
          <div className="border-t border-[#E5E7EB] pt-4 mt-auto">
            <div className="label-caps mb-2">Total Records</div>
            <div className="font-display font-black text-3xl tracking-tight">{summary.total_invoices}</div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Dashboard;
