// Converts the AI's lightweight, markdown-ish lesson draft (headings written
// as "Label:" lines, "**bold**", "- " bullets, and an
// "[[ILLUSTRATION_HERE]]" token per image — see extractIllustrations in
// ai.ts) into real HTML the rich-text editor (LessonEditor) and the
// student-facing renderer (LessonContent) can both load directly, instead
// of showing literal asterisks and tokens on screen.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineFormat(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  return out;
}

function textToHtml(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    let clean = raw.trim();
    if (!clean) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      continue;
    }
    // Defensive against real markdown syntax a provider adds despite being
    // asked not to (seen from Gemini: "### Label:" headings, "---"
    // dividers, and fenced code blocks) — without this, those symbols
    // would otherwise render as literal "####"/"---" text on screen.
    if (/^```/.test(clean)) continue;
    if (/^[-=*_]{3,}$/.test(clean)) continue;
    clean = clean.replace(/^#{1,6}\s+/, "");
    if (!clean) continue;
    // A sub-heading is written the same way as a heading but with TWO
    // trailing colons (e.g. "Types of soil::") — checked before the
    // single-colon heading below since "Label::" would otherwise just fail
    // that pattern silently (it requires exactly one trailing colon).
    const subheading = clean.match(/^\*{0,2}([A-Za-z][A-Za-z /'’]{2,40})::\*{0,2}$/);
    if (subheading) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<h4>${escapeHtml(subheading[1]!)}</h4>`;
      continue;
    }
    // Allows an apostrophe so a label like "What you'll learn:" (straight
    // or curly quote) is recognized as a heading instead of silently
    // falling through to a plain paragraph.
    const heading = clean.match(/^\*{0,2}([A-Za-z][A-Za-z /'’]{2,40}):\*{0,2}$/);
    if (heading) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<h3>${escapeHtml(heading[1]!)}</h3>`;
      continue;
    }
    if (/^[-•]\s+/.test(clean)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineFormat(clean.replace(/^[-•]\s+/, ""))}</li>`;
      continue;
    }
    if (/^\d+\.\s+/.test(clean)) {
      // Numbered steps render fine as a plain paragraph — Quill's own
      // ordered-list button is how a teacher makes a REAL numbered list;
      // re-numbering AI-authored steps automatically risks it drifting
      // from what the text says (step 3 explicitly referencing "step 3").
      html += `<p>${inlineFormat(clean)}</p>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    html += `<p>${inlineFormat(clean)}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

export function lessonDraftToHtml(content: string, images: string[]): string {
  const parts = content.split("[[ILLUSTRATION_HERE]]");
  let html = "";
  parts.forEach((part, i) => {
    html += textToHtml(part);
    if (i < parts.length - 1 && images[i]) {
      html += `<p><img src="${images[i]}" alt="" /></p>`;
    }
  });
  return html || "<p></p>";
}

// Old notes were saved as plain text with literal "[[ILLUSTRATION_HERE]]"
// tokens and a separate attachments array (see LessonContent's original
// design) rather than real HTML — detect that shape so it can still be
// opened in the new rich editor instead of showing raw tokens/markdown.
export function looksLikeHtml(content: string): boolean {
  return /^\s*</.test(content);
}

export function legacyContentToHtml(content: string, attachments: string[]): string {
  return lessonDraftToHtml(content, attachments);
}

// A short, plain-text snippet for a note's card preview — strips real tags
// from new HTML notes, or the inline-image token from old plain-text ones,
// either way leaving nothing but readable text.
export function plainSnippet(content: string, maxLen = 200): string {
  const text = looksLikeHtml(content)
    ? content.replace(/<[^>]+>/g, " ")
    : content.replace(/\[\[ILLUSTRATION_HERE\]\]/g, " ");
  const clean = text
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s{2,}/g, " ")
    .trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}
