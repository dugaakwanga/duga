import { prisma, logAudit } from "@duga/core/server";
import { hasPermission, type Role } from "@duga/core";
import type { Module } from ".";
import { can, str, resolveSection } from "../helpers";
import { parseSchemeText } from "../schemeParser";
import { generate } from "./ai";

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

// A single uploaded PDF often spans more than one of the school's real
// sections at once (e.g. one "Pre-Primary & Primary" document covering
// Nursery through Primary 6) — SchemeOfWork.section is just the admin's
// rough tag for the whole file, not reliable per subject/level. This derives
// each chunk's ACTUAL section from the school's own class levels, which is
// what filtering/grouping should really be keyed on.
async function levelSectionMap(schoolId: string): Promise<Map<string, string>> {
  const levels = await prisma.classLevel.findMany({ where: { schoolId }, select: { name: true, section: true } });
  const map = new Map<string, string>();
  for (const l of levels) map.set(normalize(l.name), l.section);
  return map;
}

const PRE_PRIMARY_KEYWORDS = ["NURSERY", "PLAY", "CRECHE", "RECEPTION", "KG", "PREPRIMARY"];

// Shared by the topics action and findSchemeChunks (lesson-note grounding)
// so both scope to the same term instead of mixing First/Second/Third Term
// chunks together.
export async function activeTermWord(schoolId: string): Promise<string | null> {
  const activeTerm = await prisma.term.findFirst({ where: { schoolId, status: "ACTIVE" }, select: { termNumber: true } });
  return activeTerm ? (["FIRST", "SECOND", "THIRD"][activeTerm.termNumber - 1] ?? null) : null;
}

function deriveSection(levelName: string | null, levelMap: Map<string, string>, fallback: string): string {
  if (!levelName) return fallback;
  const n = normalize(levelName);
  if (levelMap.has(n)) return levelMap.get(n)!;
  for (const [key, section] of levelMap) {
    if (n.includes(key) || key.includes(n)) return section;
  }
  // A scheme's own level tags (e.g. "PRE-NURSERY") don't always have a
  // matching ClassLevel row — a school may only define "Nursery 1/2/3" with
  // no separate "Pre-Nursery" class. Fall back to any class level sharing an
  // obvious pre-primary keyword so it still lands in the right section.
  if (PRE_PRIMARY_KEYWORDS.some((k) => n.includes(k))) {
    for (const [key, section] of levelMap) {
      if (PRE_PRIMARY_KEYWORDS.some((k) => key.includes(k))) return section;
    }
  }
  return fallback;
}

type SchemeTable = { columns: string[]; rows: string[][] };

// Shared by the formatTable action (teacher opens a section) and the topics
// action (lesson-note "pick a topic from the scheme" list) — both need the
// same reconstructed table, cached the same way.
async function formatChunkTable(chunk: { id: string; subjectName: string; levelName: string | null; term: string | null; text: string; tableJson: unknown }): Promise<SchemeTable> {
  if (chunk.tableJson) return chunk.tableJson as SchemeTable;

  const system =
    "You reformat a messy, PDF-extracted scheme-of-work section back into a clean table. The raw text below came from a real table in a PDF but " +
    "lost its row/column structure during extraction — one word or short phrase per line, in reading order (header row, then each data row's " +
    "cells in order). Reconstruct the table's actual columns (e.g. Week, Topic, Content — or whatever this section's own header row names) and " +
    "rows. Keep the original wording exactly; do not summarize, shorten, or invent content. " +
    'Respond with ONLY a JSON object, no markdown fences, no commentary: {"columns": [...], "rows": [[...], ...]} where each row array has ' +
    "exactly one string per column, in the same column order.";
  const prompt = `Subject: ${chunk.subjectName}${chunk.levelName ? `\nLevel: ${chunk.levelName}` : ""}${chunk.term ? `\nTerm: ${chunk.term}` : ""}\n\nRaw extracted text:\n${chunk.text}`;

  let table: SchemeTable | null = null;
  try {
    // The free model reasons at length before answering — 3000 tokens
    // wasn't enough room for both the chain-of-thought AND the actual
    // JSON, so it got cut off mid-reasoning and never produced an answer
    // at all (confirmed live: finish_reason "length" with the whole
    // budget spent on reasoning prose). 8000 gives it enough room to
    // finish reasoning and still write the full table.
    const reply = await generate(system, prompt, 0.2, 8000);
    let jsonText = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start > 0 && end > start) jsonText = jsonText.slice(start, end + 1);
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
      table = {
        columns: parsed.columns.map(String),
        rows: parsed.rows.map((r: unknown) => (Array.isArray(r) ? r.map(String) : [])),
      };
    }
  } catch {
    // fall through to the error below
  }
  if (!table) throw new Error("Couldn't reformat this section into a table right now — try again in a moment.");

  await prisma.schemeOfWorkChunk.update({ where: { id: chunk.id }, data: { tableJson: table as never } });
  return table;
}

export const schemeModule: Module = {
  // Admin: uploaded scheme-of-work documents, how many sections were
  // extracted from each, and which of the school's real sections they
  // actually cover (a document's own "section" tag is just its default).
  async list(ctx) {
    can(ctx, "curriculum:manage");
    const schoolId = ctx.session.user.schoolId;
    const [schemes, levelMap] = await Promise.all([
      prisma.schemeOfWork.findMany({
        where: { schoolId },
        include: { _count: { select: { chunks: true } }, chunks: { select: { levelName: true } } },
        orderBy: { createdAt: "desc" },
      }),
      levelSectionMap(schoolId),
    ]);
    const items = schemes.map(({ chunks, ...s }) => ({
      ...s,
      coversSections: [...new Set(chunks.map((c) => deriveSection(c.levelName, levelMap, s.section)))].sort(),
    }));
    return { items };
  },

  actions: {
    // Downloads the already-uploaded PDF (via /api/upload?purpose=scheme),
    // extracts its text and splits it into per-subject/level/term chunks.
    ingest: async (ctx) => {
      can(ctx, "curriculum:manage");
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
      can(ctx, "curriculum:manage");
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
    // the AI lesson-note generator. Scoped to each chunk's DERIVED section
    // (see deriveSection above, not the document's own rough tag), and
    // further auto-scoped by role: a teacher only sees the subjects they
    // teach, a student only their own class's level, a parent only their
    // children's level(s) — admin/owner see everything in the active
    // section (or every section, if none is picked), same as every other
    // section-scoped page in the app.
    browse: async (ctx) => {
      can(ctx, "learning:view");
      const schoolId = ctx.session.user.schoolId;
      const section = await resolveSection(ctx);
      const role = ctx.session.user.role;

      const [allSchemes, levelMap] = await Promise.all([
        prisma.schemeOfWork.findMany({ where: { schoolId }, select: { id: true, title: true, fileUrl: true, section: true } }),
        levelSectionMap(schoolId),
      ]);
      const schemeById = new Map(allSchemes.map((s) => [s.id, s]));
      const schemeIds = allSchemes.map((s) => s.id);

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

      const allChunks = schemeIds.length
        ? await prisma.schemeOfWorkChunk.findMany({
            where: { schemeId: { in: schemeIds } },
            select: { id: true, schemeId: true, levelName: true, subjectName: true, term: true, text: true, pageStart: true, pageEnd: true, tableJson: true },
            orderBy: [{ levelName: "asc" }, { subjectName: "asc" }, { term: "asc" }],
            take: 2000,
          })
        : [];

      const withSection = allChunks.map((c) => ({ ...c, section: deriveSection(c.levelName, levelMap, schemeById.get(c.schemeId)?.section ?? "") }));

      const chunks = withSection.filter((c) => {
        if (section && normalize(c.section) !== normalize(section)) return false;
        if (allowedLevels && (!c.levelName || !allowedLevels.includes(normalize(c.levelName)))) return false;
        if (allowedSubjects && !allowedSubjects.some((s) => normalize(c.subjectName).includes(s) || s.includes(normalize(c.subjectName)))) return false;
        return true;
      });

      const usedSchemeIds = new Set(chunks.map((c) => c.schemeId));
      const schemes = allSchemes.filter((s) => usedSchemeIds.has(s.id));

      return { chunks, schemes, canEdit: hasPermission(role as Role, "curriculum:manage") };
    },

    // Admin corrects a mis-tagged or mis-parsed section — the extraction is
    // best-effort (see schemeParser.ts) and sometimes mislabels a level/term
    // or picks up a ragged table edge; this lets an admin fix that by hand
    // instead of re-uploading the whole PDF.
    updateChunk: async (ctx) => {
      can(ctx, "curriculum:manage");
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

    // Reconstructs a chunk's real row/column table from its flattened raw
    // text — generated once, the first time anyone opens this section, and
    // cached on the row from then on (doing this for all sections up front
    // would mean hundreds of AI calls for content most of which nobody ever
    // actually opens).
    formatTable: async (ctx) => {
      can(ctx, "learning:view");
      const schoolId = ctx.session.user.schoolId;
      const chunk = await prisma.schemeOfWorkChunk.findFirst({ where: { id: ctx.id, scheme: { schoolId } } });
      if (!chunk) throw new Error("Curriculum section not found");
      const table = await formatChunkTable(chunk);
      return { table };
    },

    // Powers the lesson-note "Topic" picker — instead of a teacher typing a
    // topic freehand, list the actual weeks/topics the scheme of work has
    // for this subject/level, taken from the Week/Topic columns of each
    // matching term's reconstructed table (formatted on demand, same as
    // formatTable, and cached the same way).
    topics: async (ctx) => {
      can(ctx, "learning:view");
      const schoolId = ctx.session.user.schoolId;
      const subjectName = str(ctx.query.get("subjectName"));
      const levelName = str(ctx.query.get("levelName"));
      if (!subjectName || !levelName) throw new Error("subjectName and levelName required");
      const level = normalize(levelName);
      const subject = normalize(subjectName);
      const candidates = await prisma.schemeOfWorkChunk.findMany({
        where: { scheme: { schoolId } },
        select: { id: true, schemeId: true, levelName: true, subjectName: true, term: true, text: true, tableJson: true },
      });
      let matches = candidates.filter((c) => {
        const levelOk = c.levelName && normalize(c.levelName) === level;
        const subjectOk = normalize(c.subjectName).includes(subject) || subject.includes(normalize(c.subjectName));
        return levelOk && subjectOk;
      });

      // Scope to the school's current active term — this used to mix every
      // term's chunks together (up to 3, in whatever order the query
      // returned), so a teacher working in First Term would see Second and
      // Third Term topics in the same list. Only fall back to every term's
      // chunks when there's no active term, or scoping would leave nothing
      // (an untagged/mis-parsed chunk shouldn't just vanish).
      const termWord = await activeTermWord(schoolId);
      if (termWord) {
        const forActiveTerm = matches.filter((c) => c.term === termWord);
        if (forActiveTerm.length > 0) matches = forActiveTerm;
      }
      if (matches.length === 0) return { topics: [], grounded: false };

      const topics: Array<{ week: string | null; topic: string; term: string | null }> = [];
      for (const chunk of matches.slice(0, 3)) {
        try {
          const table = await formatChunkTable(chunk);
          const topicColIdx = table.columns.findIndex((c) => /topic/i.test(c));
          const weekColIdx = table.columns.findIndex((c) => /week/i.test(c));
          for (const row of table.rows) {
            const topic = row[topicColIdx >= 0 ? topicColIdx : 1];
            if (topic) topics.push({ week: weekColIdx >= 0 ? (row[weekColIdx] ?? null) : null, topic, term: chunk.term });
          }
        } catch {
          // skip a chunk the AI couldn't reformat — the rest still work
        }
      }
      return { topics, grounded: true };
    },

    // Re-tag an already-uploaded document's default section without
    // re-uploading and re-parsing the whole PDF. Mostly a fallback now that
    // browse() derives each chunk's real section from its level — still
    // useful for a chunk whose level couldn't be matched to any class level
    // at all (no keyword match either), which falls back to this tag.
    updateSection: async (ctx) => {
      can(ctx, "curriculum:manage");
      const schoolId = ctx.session.user.schoolId;
      const scheme = await prisma.schemeOfWork.findFirst({ where: { id: ctx.id, schoolId } });
      if (!scheme) throw new Error("Scheme of work not found");
      const section = str(ctx.body.section);
      if (!section) throw new Error("section required");
      const updated = await prisma.schemeOfWork.update({ where: { id: scheme.id }, data: { section } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "scheme.sectionUpdated", entityType: "SchemeOfWork", entityId: scheme.id, meta: { section } });
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
  // Scope to the school's active term — without this, a recurring generic
  // label that repeats every term verbatim (e.g. "REVISION" or "MIDTERM
  // EXAMINATION") could match a topicHint against the WRONG term's chunk,
  // grounding a First Term note in Second/Third Term curriculum text.
  const termWord = await activeTermWord(schoolId);
  if (termWord) {
    const forTerm = matches.filter((c) => c.term === termWord);
    if (forTerm.length > 0) matches = forTerm;
  }
  if (opts.topicHint) {
    const hint = opts.topicHint.toLowerCase();
    const withHint = matches.filter((c) => c.text.toLowerCase().includes(hint));
    if (withHint.length > 0) matches = withHint;
  }
  return matches.slice(0, 3);
}
