import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";
import { parseSchemeText } from "../schemeParser";

// Chunk text is fed straight into an AI prompt alongside the model's other
// instructions — cap it well under the model's context window so one
// unusually large section (the parser has no upper bound; see
// schemeParser.ts) can't blow the whole prompt budget.
const MAX_CHUNK_CHARS = 8000;

// Some PDFs' extracted text carries stray NUL bytes (font/encoding
// artifacts) — Postgres's text type rejects them outright with an
// "invalid byte sequence" error, so strip before anything else touches it.
function stripNulBytes(s: string): string {
  return s.split(String.fromCharCode(0)).join("");
}

export const schemeModule: Module = {
  // Admin/owner: uploaded scheme-of-work documents and how many sections
  // were extracted from each.
  async list(ctx) {
    can(ctx, "settings:manage");
    const schoolId = ctx.session.user.schoolId;
    const schemes = await prisma.schemeOfWork.findMany({
      where: { schoolId },
      include: { _count: { select: { chunks: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { items: schemes };
  },

  actions: {
    // Downloads the already-uploaded PDF (via /api/upload?purpose=scheme),
    // extracts its text and splits it into per-subject/level/term chunks.
    ingest: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const url = str(ctx.body.url);
      const title = str(ctx.body.title) ?? "Scheme of work";
      const section = str(ctx.body.section);
      if (!url) throw new Error("url required — upload the PDF first via /api/upload?purpose=scheme");
      if (!section) throw new Error("section required");

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not download the uploaded file (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());

      const { PDFParse } = await import("pdf-parse");
      const parsed = await new PDFParse({ data: new Uint8Array(buffer) }).getText();
      const pagedText = parsed.pages.map((p) => `\n\n===== PAGE ${p.num} =====\n${stripNulBytes(p.text)}`).join("");
      const rawChunks = parseSchemeText(pagedText);
      if (rawChunks.length === 0) throw new Error("Couldn't find any recognizable curriculum sections in this PDF");

      // Forward-fill a missing level tag from the nearest earlier chunk that
      // had one — the doc's very first subject under a level heading often
      // doesn't repeat the level name in its own header line.
      let lastLevel: string | null = null;
      const scheme = await prisma.schemeOfWork.create({
        data: { schoolId, section, title, uploadedByUserId: ctx.session.user.id },
      });
      await prisma.schemeOfWorkChunk.createMany({
        data: rawChunks.map((c) => {
          if (c.levelName) lastLevel = c.levelName;
          return {
            schemeId: scheme.id,
            levelName: c.levelName ?? lastLevel,
            subjectName: c.subjectName,
            term: c.term,
            text: c.text.slice(0, MAX_CHUNK_CHARS),
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
          };
        }),
      });

      await logAudit({ schoolId, userId: ctx.session.user.id, action: "scheme.uploaded", entityType: "SchemeOfWork", entityId: scheme.id, meta: { title, section, chunks: rawChunks.length } });
      return { id: scheme.id, chunks: rawChunks.length };
    },

    delete: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const scheme = await prisma.schemeOfWork.findFirst({ where: { id: ctx.id, schoolId } });
      if (!scheme) throw new Error("Scheme of work not found");
      await prisma.schemeOfWork.delete({ where: { id: scheme.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "scheme.deleted", entityType: "SchemeOfWork", entityId: ctx.id });
      return { ok: true };
    },

    // Distinct level/subject values available for this school's uploaded
    // schemes — powers the "generate from scheme" picker without exposing
    // the full chunk list.
    options: async (ctx) => {
      can(ctx, "ai:use");
      const schoolId = ctx.session.user.schoolId;
      const rows = await prisma.schemeOfWorkChunk.findMany({
        where: { scheme: { schoolId } },
        select: { levelName: true, subjectName: true },
        distinct: ["levelName", "subjectName"],
      });
      const levels = [...new Set(rows.map((r) => r.levelName).filter((v): v is string => !!v))].sort();
      const subjects = [...new Set(rows.map((r) => r.subjectName))].sort();
      return { levels, subjects, hasAny: rows.length > 0 };
    },
  },
};

// Best-effort lookup used by ai.ts's lesson-draft action — case-insensitive,
// tolerant of "JSS 1" vs "JSS1"/"Primary 4" vs "PRIMARY4" style mismatches
// between what a class level is named in this school and how the source PDF
// wrote it, and of a topic/week hint the teacher typed matching something in
// the chunk's own body text (not just its header tags).
export async function findSchemeChunks(schoolId: string, opts: { levelName?: string; subjectName?: string; topicHint?: string }): Promise<Array<{ text: string; levelName: string | null; subjectName: string; term: string | null }>> {
  const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const level = opts.levelName ? normalize(opts.levelName) : null;
  const subject = opts.subjectName ? normalize(opts.subjectName) : null;

  const candidates = await prisma.schemeOfWorkChunk.findMany({
    where: { scheme: { schoolId } },
    select: { text: true, levelName: true, subjectName: true, term: true },
    take: 2000,
  });

  let matches = candidates.filter((c) => {
    const levelOk = !level || (c.levelName && normalize(c.levelName) === level);
    const subjectOk = !subject || normalize(c.subjectName).includes(subject) || subject.includes(normalize(c.subjectName));
    return levelOk && subjectOk;
  });
  // Loosen to subject-only if the exact level tag didn't match anything —
  // still far more useful to the AI than no curriculum context at all.
  if (matches.length === 0 && level && subject) {
    matches = candidates.filter((c) => normalize(c.subjectName).includes(subject) || subject.includes(normalize(c.subjectName)));
  }
  if (opts.topicHint) {
    const hint = opts.topicHint.toLowerCase();
    const withHint = matches.filter((c) => c.text.toLowerCase().includes(hint));
    if (withHint.length > 0) matches = withHint;
  }
  return matches.slice(0, 3);
}
