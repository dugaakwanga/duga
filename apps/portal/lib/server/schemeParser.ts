// Splits a scheme-of-work PDF's extracted text into per (subject, level,
// term) chunks. These documents consistently repeat a "<LEVEL> <SUBJECT>
// SCHEME OF WORK" (or "<SUBJECT> SCHEME OF WORK (<LEVEL>)") header line once
// per term — see apps/portal/lib/server/modules/scheme.ts for how this is
// used. Deliberately NOT a full table parser: it only finds where each
// term's section starts, tags it with a best-effort level/subject/term, and
// keeps the raw text — the AI reads that directly to find a specific week or
// topic, which is far more robust to the source document's exact layout
// than trying to parse the week/topic/subtopic table structure ourselves.

const LEVEL_PATTERN =
  /\b(PRE-?NURSERY|NURSERY\s?[123]|PRIMARY\s?[1-6]|JSS\s?[123]|JS\s?[123]|SSS\s?[123]|SS\s?[123])\b/;

const TERM_PATTERN = /\b(FIRST|SECOND|THIRD)\s+TERM\b/;

// A real section header ("MATHEMATICS SCHEME OF WORK (PRIMARY 4)") vs a
// table-of-contents line ("MATHEMATICS SCHEME OF WORK ....... 780") — TOC
// entries always have a dot-leader (or a long run of them) before the page
// number, which a real header line never does.
function isTocLine(line: string): boolean {
  return /\.{3,}/.test(line) || /…{2,}/.test(line);
}

function normalizeLine(line: string): string {
  return line.replace(/[ \t]+/g, " ").trim();
}

function levelFromHeader(header: string): string | null {
  const m = header.match(LEVEL_PATTERN);
  if (!m) return null;
  // Normalize spacing/casing: "JSS1" / "JSS 1" -> "JSS 1", "SS2" -> "SS 2".
  const raw = m[1]!.toUpperCase();
  const compact = raw.match(/^([A-Z-]+)\s?(\d)?$/);
  if (!compact) return raw;
  return compact[2] ? `${compact[1]!.replace(/^JS$/, "JSS")} ${compact[2]}` : compact[1]!;
}

function subjectFromHeader(header: string): string {
  let s = header;
  // Drop a parenthetical only when it's the level (e.g. "(PRIMARY 4)"), not
  // a real part of the subject name (e.g. "(CRS)").
  s = s.replace(/\(([^)]*)\)/g, (whole, inner) => (LEVEL_PATTERN.test(inner) ? " " : whole));
  s = s.replace(LEVEL_PATTERN, " ");
  s = s.replace(/SCHEME\s*OF\s*WORK/i, " ");
  s = s.replace(/[ \t]+/g, " ").trim();
  // Title-case for display; the raw header (inside `text`) keeps the original.
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bCrs\b/, "CRS")
    .replace(/\bIrs\b/, "IRS");
}

export interface SchemeChunk {
  levelName: string | null;
  subjectName: string;
  term: string | null;
  text: string;
  pageStart: number;
  pageEnd: number;
}

export function parseSchemeText(pagedText: string): SchemeChunk[] {
  // pagedText is a concatenation of "\n\n===== PAGE N =====\n<page text>"
  // blocks (see scheme.ts ingest). Split into individual pages first so each
  // chunk can carry an accurate page range.
  const pageBlocks = pagedText
    .split(/={5}\s*PAGE\s+(\d+)\s*={5}/)
    .slice(1); // first element before the first marker is empty/front-matter
  const pages: Array<{ num: number; text: string }> = [];
  for (let i = 0; i < pageBlocks.length; i += 2) {
    pages.push({ num: Number(pageBlocks[i]), text: pageBlocks[i + 1] ?? "" });
  }

  type HeaderHit = { pageIndex: number; charIndex: number; header: string };
  const hits: HeaderHit[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const lines = pages[pageIndex]!.text.split("\n");
    let charIndex = 0;
    for (const rawLine of lines) {
      const line = normalizeLine(rawLine);
      if (/SCHEME\s*OF\s*WORK/i.test(line) && line.length < 120 && !isTocLine(line)) {
        hits.push({ pageIndex, charIndex, header: line });
      }
      charIndex += rawLine.length + 1;
    }
  }
  if (hits.length === 0) return [];

  const chunks: SchemeChunk[] = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const next = hits[i + 1];
    const endPageIndex = next ? next.pageIndex : pages.length - 1;
    const endCharIndex = next ? next.charIndex : pages[endPageIndex]!.text.length;

    let text = "";
    if (hit.pageIndex === endPageIndex) {
      text = pages[hit.pageIndex]!.text.slice(hit.charIndex, endCharIndex);
    } else {
      text = pages[hit.pageIndex]!.text.slice(hit.charIndex);
      for (let p = hit.pageIndex + 1; p < endPageIndex; p++) text += "\n" + pages[p]!.text;
      text += "\n" + pages[endPageIndex]!.text.slice(0, endCharIndex);
    }
    text = text.trim();
    // A real subject section runs for a page or more of week-by-week detail;
    // a stray "SCHEME OF WORK" mention in a sentence elsewhere won't.
    if (text.length < 200) continue;

    const termMatch = text.match(TERM_PATTERN);
    chunks.push({
      levelName: levelFromHeader(hit.header),
      subjectName: subjectFromHeader(hit.header) || hit.header,
      term: termMatch ? termMatch[1]!.toUpperCase() : null,
      text,
      pageStart: pages[hit.pageIndex]!.num,
      pageEnd: pages[endPageIndex]!.num,
    });
  }
  return chunks;
}
