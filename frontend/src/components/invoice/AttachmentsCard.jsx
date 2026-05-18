import React, { useState } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { api } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/constants";

const AttachmentItem = ({ att, onClick }) => (
  <button
    onClick={() => onClick(att)}
    className="w-full text-left flex items-center gap-2 border border-[#E5E7EB] p-2 hover:border-[#09090B] transition-colors"
    data-testid={`attachment-${att.id}`}
  >
    <Paperclip className="w-4 h-4 text-[#7A1A2C]" />
    <div className="flex-1 min-w-0">
      <div className="text-sm truncate">{att.original_filename}</div>
      <div className="text-[10px] text-[#52525B]">{(att.size / 1024).toFixed(0)} KB · {formatDateTime(att.uploaded_at)}</div>
    </div>
  </button>
);

const AttachmentsCard = ({ invoiceId, attachments, onUploaded }) => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/invoices/${invoiceId}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Attachment uploaded");
      onUploaded?.();
    } catch (err) {
      console.warn("[attachments] upload failed:", err?.message);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDownload = async (att) => {
    try {
      const resp = await api.get(`/files/${att.storage_path}`, { responseType: "blob" });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.original_filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn("[attachments] download failed:", err?.message);
      toast.error("Could not download file");
    }
  };

  // --- NEW: Function to delete an attachment ---
  const handleDelete = async (e, attachmentId) => {
    e.stopPropagation(); // Prevents triggering the download
    if (window.confirm("Are you sure you want to delete this attachment?")) {
      try {
        await api.delete(`/invoices/${invoiceId}/attachments/${attachmentId}`);
        toast.success("Attachment deleted");
        onUploaded?.(); // Refresh the data
      } catch (err) {
        toast.error("Failed to delete attachment");
      }
    }
  };

  const items = attachments || [];

  return (
    <div className="flat-card p-5" data-testid="attachments-card">
      <div className="flex items-center justify-between mb-3">
        <div className="label-caps">Attachments</div>
        <label className="text-xs text-[#7A1A2C] hover:text-[#5C1421] cursor-pointer font-semibold">
          {uploading ? "Uploading…" : "+ Upload"}
          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={handleUpload}
            data-testid="upload-attachment-input"
          />
        </label>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((att) => (
            <div key={att.id} className="relative group">
              <AttachmentItem att={att} onClick={handleDownload} />
              
              {/* Delete Button - only visible on hover */}
              <button 
                onClick={(e) => handleDelete(e, att.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all border border-red-100"
                title="Delete file"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-[#52525B] py-4 text-center border border-dashed border-[#E5E7EB]">
          No attachments yet
        </div>
      )}
    </div>
  );
};

export default AttachmentsCard;
