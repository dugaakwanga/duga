import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";
import { embedTexts, cosineSimilarity } from "./ai";

// Tolerant of "JSS 1" vs "JSS1" / "Primary 4" vs "PRIMARY4" style mismatches
// — same normalization scheme.ts uses for the same reason.
function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// A textbook chunk is fed straight into an AI prompt alongside the model's
// other instructions — same reasoning/cap as scheme.ts's MAX_CHUNK_CHARS.
const MAX_CHUNK_CHARS = 8000;
// Target size when SPLITTING the extracted text into chunks (before the hard
// cap above) — coarse on purpose: keeps a ~250-page textbook to roughly
// 100-150 chunks, so ingestion (and the embedding calls it makes) finishes
// in one request instead of needing pagination/resumption.
const CHUNK_TARGET_CHARS = 3000;

function stripNulBytes(s: string): string {
  return s.split(String.fromCharCode(0)).join("");
}

interface RawChunk {
  text: string;
  pageStart: number;
  pageEnd: number;
}

// Splits page-tagged extracted text into ~CHUNK_TARGET_CHARS pieces on
// paragraph boundaries, tracking which page(s) each chunk actually came
// from. Deliberately NOT header-based the way schemeParser.ts is — a
// textbook has no reliable repeating "SCHEME OF WORK"-style marker to split
// on, so this just packs paragraphs in reading order instead.
function chunkPages(pages: Array<{ num: number; text: string }>): RawChunk[] {
  const chunks: RawChunk[] = [];
  let buffer = "";
  let start: number | null = null;
  let end: number | null = null;

  function flush() {
    const text = buffer.trim();
    if (text.length > 0) chunks.push({ text, pageStart: start ?? 1, pageEnd: end ?? start ?? 1 });
    buffer = "";
    start = null;
    end = null;
  }

  for (const page of pages) {
    const cleanPage = stripNulBytes(page.text);
    const paragraphs = cleanPage.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      if (buffer.length > 0 && buffer.length + para.length + 2 > CHUNK_TARGET_CHARS) flush();
      if (start === null) start = page.num;
      end = page.num;
      buffer += (buffer ? "\n\n" : "") + para;
    }
  }
  flush();
  return chunks;
}

export const textbooksModule: Module = {
  // Admin: uploaded textbooks and how many pages/chunks were extracted from
  // each, plus the school's own subjects/levels for the upload form's
  // dropdowns (a textbook is admin-tagged, not auto-detected — see ingest).
  async list(ctx) {
    can(ctx, "curriculum:manage");
    const schoolId = ctx.session.user.schoolId;
    const [items, levels, subjects] = await Promise.all([
      prisma.textbook.findMany({
        where: { schoolId },
        include: { _count: { select: { chunks: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.classLevel.findMany({ where: { schoolId }, select: { name: true, section: true }, orderBy: { order: "asc" } }),
      prisma.subject.findMany({ where: { schoolId }, select: { name: true }, distinct: ["name"], orderBy: { name: "asc" } }),
    ]);
    return { items, levels, subjects: subjects.map((s) => s.name) };
  },

  actions: {
    // Downloads the already-uploaded PDF (via /api/upload?purpose=textbook),
    // extracts its text, splits it into chunks, and embeds every chunk so
    // findTextbookChunks (below) can semantically match a lesson-draft
    // request against the right page(s).
    ingest: async (ctx) => {
      can(ctx, "curriculum:manage");
      const schoolId = ctx.session.user.schoolId;
      const url = str(ctx.body.url);
      const title = str(ctx.body.title) ?? "Textbook";
      const subjectName = str(ctx.body.subjectName);
      const levelName = str(ctx.body.levelName);
      const section = str(ctx.body.section);
      if (!url) throw new Error("url required — upload the PDF first via /api/upload?purpose=textbook");
      if (!subjectName || !levelName || !section) throw new Error("subjectName, levelName and section are required");

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not download the uploaded file (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());

      const { PDFParse } = await import("pdf-parse");
      const parsed = await new PDFParse({ data: new Uint8Array(buffer) }).getText();
      const rawChunks = chunkPages(parsed.pages.map((p) => ({ num: p.num, text: p.text })));
      if (rawChunks.length === 0) throw new Error("Couldn't extract any readable text from this PDF");

      const texts = rawChunks.map((c) => c.text.slice(0, MAX_CHUNK_CHARS));
      // Embeds up to 100 chunks per call (see embedTexts) — a whole textbook
      // typically finishes in one or two calls, not one per chunk.
      const embeddings = await embedTexts(texts);

      const textbook = await prisma.textbook.create({
        data: { schoolId, subjectName, levelName, section, title, fileUrl: url, uploadedByUserId: ctx.session.user.id },
      });
      await prisma.textbookChunk.createMany({
        data: rawChunks.map((c, i) => ({
          textbookId: textbook.id,
          text: texts[i]!,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          embedding: (embeddings[i] ?? []) as never,
        })),
      });

      await logAudit({ schoolId, userId: ctx.session.user.id, action: "textbook.uploaded", entityType: "Textbook", entityId: textbook.id, meta: { title, subjectName, levelName, chunks: rawChunks.length } });
      return { id: textbook.id, chunks: rawChunks.length };
    },

    delete: async (ctx) => {
      can(ctx, "curriculum:manage");
      const schoolId = ctx.session.user.schoolId;
      const textbook = await prisma.textbook.findFirst({ where: { id: ctx.id, schoolId } });
      if (!textbook) throw new Error("Textbook not found");
      await prisma.textbook.delete({ where: { id: textbook.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "textbook.deleted", entityType: "Textbook", entityId: ctx.id });
      return { ok: true };
    },
  },
};

// Best-effort semantic lookup used by ai.ts's lesson-draft action — matches
// findSchemeChunks's signature so draftLesson can call both the same way.
// Unlike findSchemeChunks' keyword/tag matching (fine for a handful of
// scheme-of-work chunks), a textbook can run to hundreds of chunks, so this
// narrows by subject/level first, then ranks what's left by embedding
// similarity to the requested topic — genuinely finding the right page(s),
// not just the first chunk whose tag happens to match.
export async function findTextbookChunks(
  schoolId: string,
  opts: { levelName?: string; subjectName?: string; topicHint?: string },
): Promise<Array<{ text: string; levelName: string; subjectName: string; pageStart: number | null; pageEnd: number | null }>> {
  const level = opts.levelName ? normalize(opts.levelName) : null;
  const subject = opts.subjectName ? normalize(opts.subjectName) : null;
  if (!level && !subject) return [];

  const textbooks = await prisma.textbook.findMany({
    where: {
      schoolId,
      ...(level ? { levelName: { equals: opts.levelName, mode: "insensitive" } } : {}),
    },
    select: { id: true, subjectName: true, levelName: true },
  });
  const matchingBooks = textbooks.filter((t) => {
    const levelOk = !level || normalize(t.levelName) === level;
    const subjectOk = !subject || normalize(t.subjectName).includes(subject) || subject.includes(normalize(t.subjectName));
    return levelOk && subjectOk;
  });
  if (matchingBooks.length === 0) return [];

  const candidates = await prisma.textbookChunk.findMany({
    where: { textbookId: { in: matchingBooks.map((b) => b.id) } },
    select: { text: true, pageStart: true, pageEnd: true, embedding: true, textbookId: true },
    take: 1000,
  });
  if (candidates.length === 0) return [];

  const query = opts.topicHint || opts.subjectName || "";
  if (!query.trim()) return [];

  let queryEmbedding: number[] | undefined;
  try {
    [queryEmbedding] = await embedTexts([query]);
  } catch {
    // Embedding unavailable right now (quota/outage) — no reasonable
    // keyword fallback at this scale, so just skip textbook grounding for
    // this request rather than failing lesson generation outright.
    return [];
  }
  if (!queryEmbedding) return [];

  const bookById = new Map(matchingBooks.map((b) => [b.id, b]));
  const ranked = candidates
    .map((c) => ({
      chunk: c,
      score: cosineSimilarity(queryEmbedding, (c.embedding as number[] | null) ?? []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ chunk }) => {
      const book = bookById.get(chunk.textbookId)!;
      return { text: chunk.text, levelName: book.levelName, subjectName: book.subjectName, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd };
    });
  return ranked;
}
