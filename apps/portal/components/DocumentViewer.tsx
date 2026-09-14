"use client";

import { Modal } from "@duga/ui";

// A lesson-note document link (see LessonEditor's "Attach a PDF/Word note"
// button) used to just navigate away or trigger a download — this renders
// it inline in the app instead. PDFs use the browser's own built-in PDF
// renderer (every modern browser has one); Word docs can't be rendered by
// the browser at all, so those go through Google's free public document
// viewer instead (works for any public HTTPS URL, no account needed).
function isWordDoc(url: string): boolean {
  return /\.docx?(\?|$)/i.test(url);
}

export function isDocumentLink(url: string): boolean {
  return /\.(pdf|docx?)(\?|$)/i.test(url);
}

export function DocumentViewerModal({ url, name, onClose }: { url: string | null; name?: string; onClose: () => void }) {
  if (!url) return null;
  const src = isWordDoc(url) ? `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true` : url;
  return (
    <Modal open={!!url} onClose={onClose} title={name ?? "Document"} maxWidth={900}>
      <div style={{ height: "75vh", borderRadius: 8, overflow: "hidden", border: "1px solid var(--duga-border)" }}>
        <iframe src={src} title={name ?? "Document"} style={{ width: "100%", height: "100%", border: "none" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <a href={url} target="_blank" rel="noopener noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">
          Open in a new tab
        </a>
      </div>
    </Modal>
  );
}
