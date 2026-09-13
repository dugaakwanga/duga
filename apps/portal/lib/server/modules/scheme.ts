import { prisma, logAudit } from "@duga/core/server";
import { hasPermission, type Role } from "@duga/core";
import type { Module } from ".";
import { can, str, resolveSection } from "../helpers";
import { parseSchemeText } from "../schemeParser";

// Tolerant of "JSS 1" vs "JSS1" / "Primary 4" vs "PRIMARY4" style mismatches
// between how a class level is named in this school and how the source PDF
// wrote it — same normalization findSchemeChunks (below) already relies on.
function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

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
        data: { schoolId, section, title, fileUrl: url, uploadedByUserId: ctx.session.user.id },
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

    // Read-only curriculum browser (the "Curriculum" nav item) — lets anyone
    // read the school's actual uploaded scheme of work directly, not just via
    // the AI lesson-note generator. Scoped to the active section (Primary/
    // Secondary), same as Classes/Timetable/etc., and further auto-scoped by
    // role: a teacher only sees the subjects they teach, a student only their
    // own class's level, a parent only their children's level(s) — admin/
    // owner see everything in the active section, same as every other
    // section-scoped page in the app.
    browse: async (ctx) => {
      can(ctx, "learning:view");
      const schoolId = ctx.session.user.schoolId;
      const section = await resolveSection(ctx);
      const role = ctx.session.user.role;

      let allowedLevels: string[] | null = null;
      let allowedSubjects: string[] | null = null;
      if (role === "TEACHER") {
        const cs = await prisma.classSubject.findMany({
          where: { schoolId, teacherId: ctx.session.user.teacher?.id ?? "none" },
          select: { subject: { select: { name: true } } },
        });
        allowedSubjects = [...new Set(cs.map((c) => normalize(c.subject.name)))];
      } else if (role === "STUDENT") {
        const student = await prisma.student.findFirst({
          where: { id: ctx.session.user.student?.id ?? "none" },
          select: { classGroup: { select: { level: { select: { name: true } } } } },
        });
        allowedLevels = student?.classGroup?.level ? [normalize(student.classGroup.level.name)] : [];
      } else if (role === "PARENT") {
        const links = await prisma.studentParent.findMany({
          where: { parent: { userId: ctx.session.user.id } },
          select: { student: { select: { classGroup: { select: { level: { select: { name: true } } } } } } },
        });
        allowedLevels = [
          ...new Set(links.map((l) => l.student.classGroup?.level.name).filter((v): v is string => !!v).map(normalize)),
        ];
      }

      const levelName = str(ctx.query.get("levelName"));
      const subjectName = str(ctx.query.get("subjectName"));
      const allChunks = await prisma.schemeOfWorkChunk.findMany({
        where: { scheme: { schoolId, ...(section ? { section } : {}) } },
        select: { id: true, schemeId: true, levelName: true, subjectName: true, term: true, text: true, pageStart: true, pageEnd: true },
        orderBy: [{ levelName: "asc" }, { subjectName: "asc" }, { term: "asc" }],
        take: 1000,
      });
      const scoped = allChunks.filter((c) => {
        if (allowedLevels && (!c.levelName || !allowedLevels.includes(normalize(c.levelName)))) return false;
        if (allowedSubjects && !allowedSubjects.some((s) => normalize(c.subjectName).includes(s) || s.includes(normalize(c.subjectName)))) return false;
        return true;
      });
      const chunks = scoped.filter((c) => (!levelName || c.levelName === levelName) && (!subjectName || c.subjectName === subjectName));

      const levels = [...new Set(scoped.map((c) => c.levelName).filter((v): v is string => !!v))].sort();
      const subjects = [...new Set(scoped.map((c) => c.subjectName))].sort();
      const schemeIds = [...new Set(scoped.map((c) => c.schemeId))];
      const schemes = schemeIds.length
        ? await prisma.schemeOfWork.findMany({ where: { id: { in: schemeIds } }, select: { id: true, title: true, fileUrl: true, section: true } })
        : [];

      return { chunks, levels, subjects, schemes, canEdit: hasPermission(role as Role, "settings:manage") };
    },

    // Admin corrects a mis-tagged or mis-parsed section — the extraction is
    // best-effort (see schemeParser.ts) and sometimes mislabels a level/term
    // or picks up a ragged table edge; this lets an admin fix that by hand
    // instead of re-uploading the whole PDF.
    updateChunk: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const chunk = await prisma.schemeOfWorkChunk.findFirst({ where: { id: ctx.id, scheme: { schoolId } } });
      if (!chunk) throw new Error("Curriculum section not found");
      const subjectName = str(ctx.body.subjectName);
      const text = str(ctx.body.text);
      if (!subjectName || !text) throw new Error("Subject and content are required");
      const updated = await prisma.schemeOfWorkChunk.update({
        where: { id: chunk.id },
        data: { levelName: str(ctx.body.levelName) ?? null, subjectName, term: str(ctx.body.term) ?? null, text: text.slice(0, MAX_CHUNK_CHARS) },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "scheme.chunkUpdated", entityType: "SchemeOfWorkChunk", entityId: chunk.id });
      return updated;
    },
  },
};

// Best-effort lookup used by ai.ts's lesson-draft action — case-insensitive,
// tolerant of "JSS 1" vs "JSS1"/"Primary 4" vs "PRIMARY4" style mismatches
// between what a class level is named in this school and how the source PDF
// wrote it, and of a topic/week hint the teacher typed matching something in
// the chunk's own body text (not just its header tags).
export async function findSchemeChunks(schoolId: string, opts: { levelName?: string; subjectName?: string; topicHint?: string }): Promise<Array<{ text: string; levelName: string | null; subjectName: string; term: string | null }>> {
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
