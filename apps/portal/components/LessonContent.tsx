"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { DocumentViewerModal, isDocumentLink } from "@/components/DocumentViewer";

// Renders a lesson note the way it's meant to be read — section headings,
// bullet lists, and paragraphs styled like a real document, with each
// illustration shown exactly where the AI placed it in the text (marked by
// a literal "[[ILLUSTRATION_HERE]]" token — see extractIllustrations in
// ai.ts) instead of a plain-text dump with images bolted on at the end.
// Any extra images beyond what the text actually references (manually
// uploaded, or added via the standalone "Generate illustration" button)
// still show, in a small gallery after the text.

const TOKEN = "[[ILLUSTRATION_HERE]]";

function TextBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];
  let key = 0;

  function flushBullets() {
    if (bullets.length === 0) return;
    nodes.push(
      <ul key={key++} style={{ margin: "4px 0 14px", paddingLeft: 22 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ marginBottom: 5, lineHeight: 1.65 }}>{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  }
  function flushPara() {
    if (para.length === 0) return;
    nodes.push(
      <p key={key++} style={{ margin: "0 0 14px", lineHeight: 1.75 }}>{para.join(" ")}</p>,
    );
    para = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      flushPara();
      continue;
    }
    const heading = line.match(/^([A-Za-z][A-Za-z /]{2,40}):$/);
    if (heading) {
      flushBullets();
      flushPara();
      nodes.push(
        <h3 key={key++} style={{ fontSize: 15.5, fontWeight: 800, margin: "20px 0 8px", color: "var(--duga-primary-ink, var(--duga-ink))" }}>
          {heading[1]}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("• ")) {
      flushPara();
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    para.push(line);
  }
  flushBullets();
  flushPara();
  return <>{nodes}</>;
}

// New notes (written with LessonEditor, a real rich-text editor) store
// `content` as actual HTML — headings, bold, lists and inline <img> tags
// are already real markup, so they render as-is. Older notes, saved before
// the rich editor existed, are plain text with the token scheme described
// above; those still go through the manual parser below.
function isHtml(content: string): boolean {
  return /^\s*</.test(content);
}

export default function LessonContent({ content, images }: { content: string; images: string[] }) {
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);

  // A document link (see LessonEditor's "Attach a PDF/Word note") used to
  // just navigate away — intercept the click and open it in the in-app
  // viewer below instead, so "reading the note" doesn't mean leaving it.
  function onContentClick(e: MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || !isDocumentLink(href)) return;
    e.preventDefault();
    setViewer({ url: href, name: link.textContent?.trim() || "Document" });
  }

  if (isHtml(content)) {
    // Quill (LessonEditor) saves ordinary inter-word spaces as literal
    // "&nbsp;" entities rather than plain spaces — a well-known quirk of how
    // its contenteditable model serializes text. A non-breaking space is, by
    // definition, never a line-break opportunity, so a whole paragraph can
    // end up as one giant unbreakable "word" the browser can't wrap at all —
    // exactly what caused the card-preview bug fixed earlier, just showing
    // up here as full-content overflow instead. A real space renders
    // identically (HTML collapses runs of whitespace either way), so this is
    // safe to normalize at render time without touching the stored HTML.
    const wrappable = content.replace(/&nbsp;/g, " ");
    return (
      <>
        <div
          className="lesson-content-html"
          // minWidth: 0 overrides the browser's default `auto` for a grid/flex
          // item — without it, this block sizes to its text's UNWRAPPED width
          // (every paragraph laid out on one line) instead of shrinking to fit
          // the modal, and gets clipped by the card's overflow-x: hidden. The
          // parent here is the "viewItem" modal's `display: grid` wrapper in
          // learning/page.tsx. overflowWrap: "anywhere" is a second safety
          // net — even a genuinely long unbroken token (a URL, say) can now
          // still be forced to wrap rather than overflow.
          style={{ fontSize: 14, lineHeight: 1.75, minWidth: 0, overflowWrap: "anywhere" }}
          onClick={onContentClick}
          // Authored only by teaching staff through LessonEditor (a controlled
          // rich-text editor, not free-form HTML input) or converted
          // server/client-side from the AI's own plain-text draft — never
          // reflects arbitrary student/parent input.
          dangerouslySetInnerHTML={{ __html: wrappable }}
        />
        <DocumentViewerModal url={viewer?.url ?? null} name={viewer?.name} onClose={() => setViewer(null)} />
      </>
    );
  }

  const parts = content.split(TOKEN);
  const inlineCount = parts.length - 1;
  const extraImages = images.slice(inlineCount).filter(Boolean);

  return (
    <div style={{ fontSize: 14, minWidth: 0, overflowWrap: "anywhere" }}>
      {parts.map((part, i) => (
        <span key={i}>
          <TextBlock text={part} />
          {i < inlineCount && images[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={images[i]}
              alt=""
              style={{ width: "100%", maxWidth: 460, display: "block", margin: "6px 0 18px", borderRadius: 12, border: "1px solid var(--duga-border)" }}
            />
          )}
        </span>
      ))}
      {extraImages.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          {extraImages.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" style={{ width: 160, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--duga-border)" }} />
          ))}
        </div>
      )}
    </div>
  );
}
