import sanitizeHtml from "sanitize-html";

// Strips anything that could execute script or load unexpected content —
// applied server-side to every rich-text field a lesson note, assignment,
// test, live-class listing or assignment submission stores, since all of
// them end up rendered via dangerouslySetInnerHTML (see LessonContent.tsx)
// whenever the stored string looks like HTML. Authored by a teacher/admin
// today, or a student for submissions — either way, this is the only real
// control standing between that field and stored XSS; never rely on "only
// trusted roles can write this" as the sole defense.
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "a", "img", "span", "div", "table", "thead", "tbody", "tr", "td", "th",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height"],
  span: ["style"],
  div: ["style"],
  p: ["style"],
  "*": ["class"],
};

export function sanitizeLessonHtml(input: string | undefined | null): string | undefined {
  if (input === undefined || input === null) return undefined;
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // Only allow genuinely safe URL schemes — blocks javascript:, data: (for
    // <a>, though data: images are still fine and separately allowed below)
    // and anything else that could execute in the viewer's browser.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    // Quill/our own inline styles only ever set benign formatting
    // (color/alignment/width) — still narrow it to a safe allowlist rather
    // than passing arbitrary CSS through (e.g. no `expression()`, no
    // `url(javascript:...)` in older engines).
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/, /^[a-zA-Z]+$/],
        "background-color": [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/, /^[a-zA-Z]+$/],
        "text-align": [/^left$|^right$|^center$|^justify$/],
        "font-weight": [/^\d+$|^bold$|^normal$/],
      },
    },
    disallowedTagsMode: "discard",
  });
}
