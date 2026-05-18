import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, API } from "@/contexts/AuthContext";
import { STAGE_LABELS, STAGE_SHORT, STAGE_ORDER, formatCurrency, formatDate, hoursToHuman } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, Search, ChevronRight, AlertTriangle, Trash2, Pencil, FileText } from "lucide-react";
import InvoiceForm from "@/components/InvoiceForm";
import { toast } from "sonner";

const getStatusBadgeStyle = (status, stuck) => {
  if (status === "PAID") return { bg: "bg-[#16A34A] text-white", label: "Paid", showIcon: false };
  if (status === "RETURNED_TO_VENDOR") return { bg: "bg-[#F59E0B] text-white", label: "Returned", showIcon: false };
  return {
    bg: stuck ? "bg-[#E11D48] text-white" : "bg-[#7A1A2C] text-white",
    label: STAGE_SHORT[status] || status,
    showIcon: stuck,
  };
};

const StatusBadge = ({ status, stuck }) => {
  const s = getStatusBadgeStyle(status, stuck);
  return (
    <span className={`inline-flex items-center px-2 py-1 text-[10px] font-bold tracking-wider uppercase ${s.bg}`}>
      {s.showIcon && <AlertTriangle className="w-3 h-3 mr-1" />}
      {s.label}
    </span>
  );
};

const EmptyRow = ({ loading }) => (
  <tr>
    <td colSpan={8} className="px-4 py-12 text-center text-sm text-[#52525B]">
      {loading ? "Loading…" : (
        <>No invoices yet. Click <span className="font-semibold text-[#09090B]">New Invoice</span> to start.</>
      )}
    </td>
  </tr>
);

const Invoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice]= useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus !== "ALL") params.status = filterStatus;
      if (search) params.search = search;
      const { data } = await api.get("/invoices", { params });
      setInvoices(data);
    } catch (err) {
      console.warn("[invoices] load failed:", err?.message);
      toast.error("Could not load invoices");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (e) => {
    e.preventDefault();
    load();
  };

  const handleDelete = async (e, id, num) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete invoice ${num}?`)) {
      try {
        await api.delete(`/invoices/${id}`);
        toast.success("Invoice deleted");
        load(); // This reloads the list
      } catch (err) {
        toast.error("Failed to delete invoice");
      }
    }
  };

  const handleEdit = (e, inv) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingInvoice(inv);
    setShowForm(true);
  };

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
      console.warn("[invoices] csv export failed:", err?.message);
      toast.error("Export failed");
    }
  };

  return (
    <div className="p-8 max-w-[1400px]" data-testid="invoices-page">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps mb-2">All Invoices</div>
          <h1 className="font-display font-black text-4xl tracking-tight">Invoice register</h1>
          <p className="text-sm text-[#52525B] mt-2">{invoices.length} record{invoices.length !== 1 ? "s" : ""} matching current filters.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportCsv} variant="outline" className="rounded-none border-[#09090B] text-[#09090B] hover:bg-[#09090B] hover:text-white" data-testid="export-csv-button">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={() => setShowForm(true)} className="rounded-none bg-[#09090B] hover:bg-[#27272A] text-white" data-testid="new-invoice-button">
            <Plus className="w-4 h-4 mr-2" /> New Invoice
          </Button>
        </div>
      </header>

      <div className="flat-card p-4 mb-4 flex gap-3 flex-wrap items-center">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#52525B]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, vendor, PO/WO, GRN/SRN"
              className="rounded-none border-[#E5E7EB] pl-9 focus-visible:ring-0 focus-visible:border-[#09090B]"
              data-testid="search-input"
            />
          </div>
          <Button type="submit" variant="outline" className="rounded-none border-[#E5E7EB]" data-testid="search-button">
            Search
          </Button>
        </form>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[220px] rounded-none border-[#E5E7EB] focus:ring-0" data-testid="status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="ALL">All statuses</SelectItem>
            {STAGE_ORDER.map((s) => (
              <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
            ))}
            <SelectItem value="RETURNED_TO_VENDOR">Returned to Vendor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flat-card overflow-hidden" data-testid="invoices-table-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
              <tr className="text-left">
                <th className="px-4 py-3 label-caps">Invoice #</th>
                <th className="px-4 py-3 label-caps">Vendor</th>
                <th className="px-4 py-3 label-caps">Amount</th>
                <th className="px-4 py-3 label-caps">Date</th>
                <th className="px-4 py-3 label-caps">Status</th>
                <th className="px-4 py-3 label-caps">At Stage</th>
                <th className="px-4 py-3 label-caps">GRN/SRN</th>
                <th className="px-4 py-3 label-caps text-center">Scan</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(loading || invoices.length === 0) ? (
                <EmptyRow loading={loading} />
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-[#E5E7EB] hover:bg-[#F8F9FA] transition-colors" data-testid={`invoice-row-${inv.invoice_number}`}>
                    <td className="px-4 py-3 font-mono-data font-semibold">{inv.invoice_number}</td>
                    <td className="px-4 py-3">{inv.vendor_name}</td>
                    <td className="px-4 py-3 font-mono-data">{formatCurrency(inv.amount)}</td>
                    <td className="px-4 py-3 text-[#52525B]">{formatDate(inv.invoice_date)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} stuck={inv.is_stuck} /></td>
                    <td className={`px-4 py-3 font-mono-data ${inv.is_stuck ? "text-[#E11D48] font-bold" : "text-[#52525B]"}`}>
                      {hoursToHuman(inv.hours_in_current_stage)}
                    </td>
                    <td className="px-4 py-3 font-mono-data text-[#52525B]">{inv.grn_number || "—"}</td>
                    <td className="px-4 py-3">
  {inv.attachments && inv.attachments.length > 0 ? (
    <a 
      href={`${API}/files/${inv.attachments[0].storage_path}`} 
      target="_blank" 
      rel="noopener noreferrer"
      className="text-[#52525B] hover:text-[#09090B] transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <FileText className="w-5 h-5" />
    </a>
  ) : (
    <span className="text-gray-300">—</span>
  )}
</td>
                    <td className="px-4 py-3 text-right">
  <div className="flex items-center justify-end gap-1">
    <button 
      onClick={(e) => handleEdit(e, inv)} 
      className="p-1.5 text-[#52525B] hover:text-blue-600 transition-colors"
      title="Edit Data"
    >
      <Pencil className="w-4 h-4" />
    </button>
    <button 
      onClick={(e) => handleDelete(e, inv.id, inv.invoice_number)} 
      className="p-1.5 text-[#52525B] hover:text-red-600 transition-colors"
      title="Delete Invoice"
    >
      <Trash2 className="w-4 h-4" />
    </button>
    <Link to={`/invoices/${inv.id}`} className="p-1.5 text-[#7A1A2C] hover:text-[#5C1421]">
      <ChevronRight className="w-4 h-4" />
    </Link>
  </div>
</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

     <InvoiceForm open={showForm} 
  onOpenChange={(open) => {
    setShowForm(open);
    if (!open) setEditingInvoice(null); // Clear edit mode when closed
  }} 
  onCreated={load} 
  invoice={editingInvoice} // Pass the invoice if we are editing
/>
    </div>
  );
};

export default Invoices;
