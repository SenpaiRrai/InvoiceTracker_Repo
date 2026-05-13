import React, { useState } from "react";
import { Paperclip } from "lucide-react";
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
          {items.map((att) => <AttachmentItem key={att.id} att={att} onClick={handleDownload} />)}
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
