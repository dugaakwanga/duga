"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Modal, Spinner, Alert } from "@duga/ui";

// Bundled as a static asset by Next's build rather than pointed at a CDN —
// this app is used heavily on Nigerian mobile networks and as a PWA, so the
// viewer needs to work without depending on an external host being
// reachable at that moment.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

// A lesson-note/Family-Corner document link used to just navigate away or
// trigger a download, or (the previous version of this component) render
// the PDF in a plain <iframe> relying on the browser's own built-in PDF
// plugin — which many mobile browsers either don't have at all or only
// render the first page of inside an iframe, with no way to scroll further.
// Rendering every page ourselves with pdf.js (via react-pdf) works
// identically everywhere: desktop, mobile, and inside the installed PWA.
function isWordDoc(url: string): boolean {
  return /\.docx?(\?|$)/i.test(url);
}

export function isDocumentLink(url: string): boolean {
  return /\.(pdf|docx?)(\?|$)/i.test(url);
}

function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.floor(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ height: "100%", overflowY: "auto", background: "var(--duga-surface-2, #f4f6f9)" }}>
      {error ? (
        <div style={{ padding: 24 }}>
          <Alert tone="danger">Couldn&apos;t load this PDF ({error}).</Alert>
        </div>
      ) : (
        <Document
          file={url}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(e) => setError(e.message)}
          loading={
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Spinner size={28} />
            </div>
          }
          // Every page rendered up front in one scrollable column — the
          // whole document, not just the first page, and no separate
          // "next/previous page" controls needed.
        >
          {width > 0 &&
            Array.from({ length: numPages ?? 0 }, (_, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
                <Page pageNumber={i + 1} width={Math.min(width - 20, 900)} />
              </div>
            ))}
        </Document>
      )}
    </div>
  );
}

export function DocumentViewerModal({ url, name, onClose }: { url: string | null; name?: string; onClose: () => void }) {
  if (!url) return null;
  const wordDoc = isWordDoc(url);
  return (
    <Modal open={!!url} onClose={onClose} title={name ?? "Document"} maxWidth={900}>
      <div style={{ height: "75vh", borderRadius: 8, overflow: "hidden", border: "1px solid var(--duga-border)" }}>
        {wordDoc ? (
          <iframe
            src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
            title={name ?? "Document"}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        ) : (
          <PdfViewer url={url} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <a href={url} target="_blank" rel="noopener noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">
          Open in a new tab
        </a>
      </div>
    </Modal>
  );
}
