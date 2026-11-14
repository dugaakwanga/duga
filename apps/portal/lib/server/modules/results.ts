import { prisma } from "@duga/core/server";
import { scoreMaximums } from "@duga/core";
import { collateReportCards, resolveResultsAccess, logAudit, dispatchToMany, getDefaultGradingScale } from "@duga/core/server";
import { getResultConfig, computeScoreTotals, type ResultComponent } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num, studentScope, resolveSection } from "../helpers";
import { assessmentWindowOpen } from "./calendar";

// Grade-point average for a card, derived from the school's grading scale.
export async function gpaCalculator(schoolId: string, section?: string) {
  const scale = await getDefaultGradingScale(schoolId, section);
  const gpOf = new Map(scale.map((b) => [b.grade, b.gp]));
  return (items: Array<{ grade: string | null }> | null | undefined): number | null => {
    if (!items || items.length === 0) return null;
    const gps = items
      .map((i) => (i.grade && i.grade !== "-" ? gpOf.get(i.grade) : undefined))
      .filter((g): g is number => typeof g === "number");
    if (gps.length === 0) return null;
    return Math.round((gps.reduce((a, b) => a + b, 0) / gps.length) * 100) / 100;
  };
}

// Small, cheap fetch bundled into report-card responses so the client-side
// PDF renderer has everything it needs (school letterhead + which sections
// to render) without a separate round trip.
export async function schoolAndReportCardConfig(schoolId: string, section?: string) {
  const [school, sectionConfig, fallbackConfig] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, shortName: true, address: true, logoUrl: true } }),
    section ? prisma.reportCardConfig.findUnique({ where: { schoolId_section: { schoolId, section } } }) : Promise.resolve(null),
    prisma.reportCardConfig.findUnique({ where: { schoolId_section: { schoolId, section: "" } } }),
  ]);
  const row = sectionConfig ?? fallbackConfig;
  return {
    school,
    reportCardConfig: {
      showCognitive: row?.showCognitive ?? true,
      showPsychomotor: row?.showPsychomotor ?? true,
      showAttendance: row?.showAttendance ?? true,
      showFees: row?.showFees ?? true,
      showLogo: row?.showLogo ?? true,
      showWatermark: row?.showWatermark ?? false,
      motto: row?.motto ?? null,
      town: row?.town ?? null,
      state: row?.state ?? null,
      sectionLabel: row?.sectionLabel ?? (section ? `${section} Section`.toUpperCase() : null),
    },
  };
}

// Resolves the two auto-signing identities printed on a report card: the
// class's own form teacher (their name + uploaded signature) and the
// school's Principal (whichever Admin's designation contains "principal",
// or the longest-standing Admin account if none has set one) — replacing
// the old free-text Name fields admins used to retype by hand on every card.
async function resolveSignatories(
  schoolId: string,
  classGroupIds: Array<string | null | undefined>,
): Promise<{
  principalName: string | null;
  principalDesignation: string;
  principalSignatureUrl: string | null;
  formTeachersByClassGroup: Map<string, { name: string; signatureUrl: string | null }>;
}> {
  const uniqueIds = [...new Set(classGroupIds.filter((id): id is string => Boolean(id)))];
  const adminSelect = { include: { user: { select: { firstName: true, lastName: true } } } } as const;
  const [principalMatch, classGroups] = await Promise.all([
    prisma.admin.findFirst({
      where: { schoolId, designation: { contains: "principal", mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      ...adminSelect,
    }),
    uniqueIds.length
      ? prisma.classGroup.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, formTeacher: { select: { signatureUrl: true, user: { select: { firstName: true, lastName: true } } } } },
        })
      : Promise.resolve([]),
  ]);
  // Only an admin who actually claimed the "Principal" designation lends
  // their title to the label. Falling back to just the longest-standing
  // admin account (so cards aren't blank before anyone's set that up) must
  // NOT also adopt whatever unrelated designation that account happens to
  // already hold (e.g. a legacy "Administrator" value) — the printed label
  // always defaults to "Principal" in that case.
  const principalAdmin = principalMatch ?? (await prisma.admin.findFirst({ where: { schoolId }, orderBy: { createdAt: "asc" }, ...adminSelect }));
  const formTeachersByClassGroup = new Map<string, { name: string; signatureUrl: string | null }>();
  for (const cg of classGroups) {
    if (!cg.formTeacher) continue;
    formTeachersByClassGroup.set(cg.id, { name: `${cg.formTeacher.user.firstName} ${cg.formTeacher.user.lastName}`, signatureUrl: cg.formTeacher.signatureUrl });
  }
  return {
    principalName: principalAdmin ? `${principalAdmin.user.firstName} ${principalAdmin.user.lastName}` : null,
    principalDesignation: principalMatch?.designation || "Principal",
    principalSignatureUrl: principalAdmin?.signatureUrl ?? null,
    formTeachersByClassGroup,
  };
}

function applySignatories<T extends { classGroupId?: string | null }>(
  cards: T[],
  signatories: Awaited<ReturnType<typeof resolveSignatories>>,
): Array<T & { formMasterName: string | null; formMasterSignatureUrl: string | null; principalName: string | null; principalDesignation: string; principalSignatureUrl: string | null }> {
  return cards.map((rc) => {
    const ft = rc.classGroupId ? signatories.formTeachersByClassGroup.get(rc.classGroupId) : undefined;
    return {
      ...rc,
      formMasterName: ft?.name ?? null,
      formMasterSignatureUrl: ft?.signatureUrl ?? null,
      principalName: signatories.principalName,
      principalDesignation: signatories.principalDesignation,
      principalSignatureUrl: signatories.principalSignatureUrl,
    };
  });
}

// Which assessment components (e.g. "Assignment", "Test", "Exam" — whatever
// ResultConfig.components names for this section) are currently locked for a
// class-subject's term. Independent per component, so a teacher can keep
// entering "Exam" scores while "Assignment" stays locked from an earlier
// submission, instead of the old single classSubject-wide submitted flag.
async function lockedComponentSet(classSubjectId: string, termId: string): Promise<Set<string>> {
  const locks = await prisma.assessmentLock.findMany({ where: { classSubjectId, termId }, select: { component: true } });
  return new Set(locks.map((l) => l.component));
}

async function submissionSummary(
  schoolId: string,
  classSubjects: Array<{ id: string; classGroup: { students: Array<{ id: string }> } }>,
  termId?: string,
): Promise<Record<string, { entered: number; submitted: number; total: number; allSubmitted: boolean }>> {
  const ids = classSubjects.map((cs) => cs.id);
  if (!ids.length) return {};
  const rows = await prisma.subjectScore.findMany({
    where: { schoolId, classSubjectId: { in: ids }, ...(termId ? { termId } : {}) },
    select: { classSubjectId: true, studentId: true, submitted: true },
  });
  const map: Record<string, { entered: number; submitted: number; total: number; allSubmitted: boolean }> = {};
  for (const cs of classSubjects) {
    const roster = new Set(cs.classGroup.students.map((student) => student.id));
    const scores = rows.filter((r) => r.classSubjectId === cs.id && roster.has(r.studentId));
    const total = cs.classGroup.students.length;
    const entered = scores.length;
    const submitted = scores.filter((s) => s.submitted).length;
    map[cs.id] = { entered, submitted, total, allSubmitted: total > 0 && submitted === total };
  }
  return map;
}

function scoreTeachingAssignment(teacherId: string) {
  return [
    { teacherId },
    { teacherId: null, classGroup: { formTeacherId: teacherId } },
  ];
}

function canTeachSubject(teacherId: string | undefined, subject: { teacherId: string | null; classGroup: { formTeacherId: string | null } }) {
  return Boolean(teacherId && teacherId === (subject.teacherId ?? subject.classGroup.formTeacherId));
}

export const resultsModule: Module = {
  async list(ctx) {
    can(ctx, "results:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const section = await resolveSection(ctx);
    const config = await getResultConfig(schoolId, section);
    const gpaOf = await gpaCalculator(schoolId, section);
    // The grading scale's bands double as the printed report card's "Keys
    // Grade" box (min-max -> remark), so the client never hardcodes it.
    const gradingScale = await getDefaultGradingScale(schoolId, section);

    // Entry grid for teachers: return class subjects with class students
    if (role === "TEACHER") {
      const teacher = ctx.session.user.teacher!;
      const classSubjects = await prisma.classSubject.findMany({
        where: { schoolId, OR: scoreTeachingAssignment(teacher.id), ...(section ? { classGroup: { level: { section } } } : {}) },
        include: { subject: true, classGroup: { include: { level: true, students: { where: { status: "ACTIVE" }, include: { user: { select: { firstName: true, lastName: true, id: true } } } } } } },
      });
      const terms = await prisma.term.findMany({ where: { schoolId }, include: { session: true }, orderBy: [{ session: { createdAt: "desc" } }, { termNumber: "asc" }] });
      const activeTerm = terms.find((t) => t.status === "ACTIVE") ?? terms[0];
      const submissions = await submissionSummary(schoolId, classSubjects, activeTerm?.id);
      // Was missing entirely — a teacher's "Download PDF" / preview on this
      // page silently failed (the client guards on `!school ||
      // !reportCardConfig` before ever calling the PDF builder) because
      // this branch never returned them, only the student/parent one did.
      const { school, reportCardConfig } = await schoolAndReportCardConfig(schoolId, section);
      return { role, classSubjects, terms, config, submissions, activeTermId: activeTerm?.id, school, reportCardConfig, gradingScale };
    }

    if (role === "STUDENT" || role === "PARENT") {
      const studentIds =
        role === "STUDENT"
          ? [ctx.session.user.student!.id]
          : (await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } })).map((l) => l.studentId);

      const reportCards = await prisma.reportCard.findMany({
        where: { schoolId, studentId: { in: studentIds } },
        include: { term: { include: { session: true } }, student: { select: { id: true, photoUrl: true, admissionNumber: true, gender: true, feeAmount: true, feeDays: true, feePaidThrough: true, user: { select: { firstName: true, lastName: true } } } }, classGroup: { include: { level: true } } },
        orderBy: { createdAt: "desc" },
      });

      // Gate: only show published cards that are paid/overridden. Unified
      // with tests/assignments/elearn/games/live under one date-aware fee
      // window — resolveResultsAccess already incorporates it, so there's
      // no separate feeLocked check to reconcile against here anymore.
      const gated = [];
      for (const rc of reportCards) {
        if (!rc.isPublished) continue;
        const access = await resolveResultsAccess(rc.studentId, rc.termId);
        const items = access.allowed ? await prisma.reportCardItem.findMany({ where: { reportCardId: rc.id }, include: { subject: true }, orderBy: { position: "asc" } }) : null;
        gated.push({
          ...rc,
          access: access.allowed ? "granted" : "locked",
          gatedReason: access.reason,
          gpa: gpaOf(items),
          items,
        });
      }
      const { school, reportCardConfig } = await schoolAndReportCardConfig(schoolId, section);
      const signatories = await resolveSignatories(schoolId, gated.map((rc) => rc.classGroupId));
      return { role, reportCards: applySignatories(gated, signatories), school, reportCardConfig, config, gradingScale };
    }

    // Admin / owner: only return the active section when one is selected.
    // Compute the active term first (same as the teacher branch) so
    // "Subject submissions" is scoped to one consistent term — Reopen/View
    // only ever act against activeTermId, so showing counts aggregated
    // across every term ever would be misleading regardless.
    const terms = await prisma.term.findMany({ where: { schoolId }, include: { session: true }, orderBy: [{ session: { createdAt: "desc" } }, { termNumber: "asc" }] });
    const activeTermId = (terms.find((t) => t.status === "ACTIVE") ?? terms[0])?.id;
    const [reportCards, classSubjects] = await Promise.all([
      prisma.reportCard.findMany({
        where: { schoolId, ...(section ? { classGroup: { level: { section } } } : {}) },
        include: { term: { include: { session: true } }, student: { select: { id: true, photoUrl: true, admissionNumber: true, gender: true, user: { select: { firstName: true, lastName: true } } } }, classGroup: { include: { level: true } }, items: { include: { subject: true }, orderBy: { position: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.classSubject.findMany({
        where: { schoolId, ...(section ? { classGroup: { level: { section } } } : {}) },
        include: { subject: true, classGroup: { include: { level: true, students: { where: { status: "ACTIVE" }, select: { id: true } } } } },
      }),
    ]);
    const submissions = await submissionSummary(schoolId, classSubjects, activeTermId);
    const { school, reportCardConfig } = await schoolAndReportCardConfig(schoolId, section);
    const signatories = await resolveSignatories(schoolId, reportCards.map((rc) => rc.classGroupId));
    // classSubjects was already being fetched to compute `submissions`, but
    // was never sent to the client — the admin/owner "Subject submissions"
    // overview builds its rows from this array client-side, so without it
    // that whole card silently never rendered, no matter how many subjects
    // teachers had submitted.
    return {
      role,
      reportCards: applySignatories(reportCards.map((rc) => ({ ...rc, gpa: gpaOf(rc.items) })), signatories),
      classSubjects,
      config,
      submissions,
      school,
      reportCardConfig,
      activeTermId,
      terms,
      gradingScale,
    };
  },

  async get(ctx) {
    can(ctx, "reportcards:view");
    const role = ctx.session.user.role;
    const rc = await prisma.reportCard.findFirst({
      where: {
        id: ctx.id,
        schoolId: ctx.session.user.schoolId,
        // Students/parents can only reach their own published cards.
        ...(role === "STUDENT" || role === "PARENT" ? { ...(await studentScope(ctx)), isPublished: true } : {}),
      },
      include: {
        term: { include: { session: true } },
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
        classGroup: { select: { formTeacherId: true, level: { select: { section: true } } } },
        items: { include: { subject: true }, orderBy: { position: "asc" } },
      },
    });
    if (!rc) throw new Error("Report card not found");
    const section = rc.classGroup?.level.section ?? ctx.session.user.student?.section;
    const [{ school, reportCardConfig }, config, gradingScale] = await Promise.all([
      schoolAndReportCardConfig(ctx.session.user.schoolId, section),
      getResultConfig(ctx.session.user.schoolId, section),
      getDefaultGradingScale(ctx.session.user.schoolId, section),
    ]);
    // Students/parents must also pass the fee gate (published + paid/overridden).
    if (role === "STUDENT" || role === "PARENT") {
      // resolveResultsAccess already fully governs results gating: whether
      // "results" is in the admin's fee-gated feature list, an active
      // FeeOverride, and the student's feePaidThrough window — one unified
      // check, no separate assertFeeAccess call needed here.
      const access = await resolveResultsAccess(rc.studentId, rc.termId);
      if (!access.allowed) {
        const err = new Error("This report card is locked") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
    }
    const signatories = await resolveSignatories(ctx.session.user.schoolId, [rc.classGroupId]);
    if (role === "TEACHER") {
      const teacherId = ctx.session.user.teacher?.id;
      if (!teacherId) throw new Error("Teacher profile not found");
      const isClassTeacher = rc.classGroup?.formTeacherId === teacherId;
      // A subject teacher may inspect only the item for their own class-subject;
      // the class teacher may inspect the complete card for their class.
      if (!isClassTeacher) {
        const ownItems = await prisma.reportCardItem.findMany({
          where: { reportCardId: rc.id, classSubject: { teacherId } },
          include: { subject: true },
          orderBy: { position: "asc" },
        });
        if (!ownItems.length) {
          const err = new Error("You can only view results for subjects you teach") as Error & { status?: number };
          err.status = 403;
          throw err;
        }
        return applySignatories([{ ...rc, items: ownItems, gpa: (await gpaCalculator(ctx.session.user.schoolId))(ownItems), school, reportCardConfig, config, gradingScale }], signatories)[0];
      }
      return applySignatories([{ ...rc, gpa: (await gpaCalculator(ctx.session.user.schoolId))(rc.items), school, reportCardConfig, config, gradingScale }], signatories)[0];
    }
    return applySignatories([{ ...rc, gpa: (await gpaCalculator(ctx.session.user.schoolId))(rc.items), school, reportCardConfig, config, gradingScale }], signatories)[0];
  },

  actions: {
    // Principal/admin remarks and non-academic assessment displayed on the
    // printable report card. Objects use a simple label -> rating format.
    updateDetails: async (ctx) => {
      const card = await prisma.reportCard.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!card) throw new Error("Report card not found");
      const role = ctx.session.user.role;
      if (role === "TEACHER") {
        const teacherId = ctx.session.user.teacher?.id;
        const classGroup = card.classGroupId && await prisma.classGroup.findFirst({ where: { id: card.classGroupId, formTeacherId: teacherId }, select: { id: true } });
        if (!classGroup) {
          const err = new Error("Only the class teacher can add overall report-card comments") as Error & { status?: number };
          err.status = 403;
          throw err;
        }
      } else {
        can(ctx, "results:publish");
      }
      // psychomotor here is the behavioral-assessment grid: fixed trait name
      // -> single-letter grade (A-E), e.g. { "Neatness": "A" }.
      const psychomotor = ctx.body.psychomotor && typeof ctx.body.psychomotor === "object" ? ctx.body.psychomotor : undefined;
      const coCurricular = ctx.body.coCurricular && typeof ctx.body.coCurricular === "object" ? ctx.body.coCurricular : undefined;
      const updated = await prisma.reportCard.update({
        where: { id: card.id },
        data: {
          psychomotor,
          coCurricular,
          attendanceRemark: str(ctx.body.attendanceRemark),
          remark: str(ctx.body.remark),
          principalComment: str(ctx.body.principalComment),
          // These are auto-computed at collation time but stay editable so an
          // admin can correct them (e.g. a manual fee waiver, a corrected DOB).
          feesOwed: num(ctx.body.feesOwed),
          nextTermFees: num(ctx.body.nextTermFees),
          feesPayableBy: str(ctx.body.feesPayableBy) ? new Date(String(ctx.body.feesPayableBy)) : undefined,
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "results.detailsUpdated", entityType: "ReportCard", entityId: card.id });
      return updated;
    },

    // Class teacher flags their comments/behavioral grades as a finished
    // draft. Purely informational (see the schema comment on
    // teacherSubmittedAt) — it doesn't lock anything, it just gives the
    // admin a signal on the report-card list that this one is ready to look
    // at, and lets the teacher see their own submission status.
    submitToAdmin: async (ctx) => {
      const card = await prisma.reportCard.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!card) throw new Error("Report card not found");
      const role = ctx.session.user.role;
      if (role === "TEACHER") {
        const teacherId = ctx.session.user.teacher?.id;
        const classGroup = card.classGroupId && await prisma.classGroup.findFirst({ where: { id: card.classGroupId, formTeacherId: teacherId }, select: { id: true } });
        if (!classGroup) {
          const err = new Error("Only the class teacher can submit this report card") as Error & { status?: number };
          err.status = 403;
          throw err;
        }
      } else {
        can(ctx, "results:publish");
      }
      const updated = await prisma.reportCard.update({ where: { id: card.id }, data: { teacherSubmittedAt: new Date() } });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "results.submittedToAdmin", entityType: "ReportCard", entityId: card.id });
      return updated;
    },

    // Bulk entry of scores for a class subject, following the school's
    // ResultConfig components.
    saveScores: async (ctx) => {
      can(ctx, "results:enter");
      const { schoolId, role, teacher } = ctx.session.user;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      const rows = Array.isArray(ctx.body.rows) ? (ctx.body.rows as Array<{ studentId: string; scores?: Record<string, unknown> }>) : [];
      if (!classSubjectId || rows.length === 0 || !termId) throw new Error("classSubjectId, termId and rows required");
      if (rows.some((row) => !row || typeof row.studentId !== "string") || new Set(rows.map((row) => row.studentId)).size !== rows.length) {
        throw new Error("Provide one score row per student");
      }
      const studentIds = rows.map((row) => row.studentId);

      const classSubject = await prisma.classSubject.findFirst({
        where: { id: classSubjectId, schoolId },
        select: { id: true, teacherId: true, classGroupId: true, classGroup: { select: { formTeacherId: true, level: { select: { section: true } } } } },
      });
      if (!classSubject) throw new Error("Class subject not found");
      const restricted = role !== "OWNER";
      if (restricted && !canTeachSubject(teacher?.id, classSubject)) throw new Error("You can only enter scores for subjects you teach");
      if (!(await prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }))) throw new Error("Term not found");
      const section = classSubject.classGroup.level.section;
      const [config, windowOpen] = await Promise.all([
        getResultConfig(schoolId, section),
        restricted ? assessmentWindowOpen(schoolId, "RESULTS", { classSubjectId, termId, section }) : true,
      ]);
      if (!windowOpen) throw new Error("The results entry window is closed for this term.");
      const requireAll = ctx.body.requireAll === true;
      if (requireAll && JSON.stringify(ctx.body.components) !== JSON.stringify(config.components)) {
        throw new Error("The scoring format changed. Download a fresh Excel template.");
      }
      const save = () => prisma.$transaction(async (tx) => {
        const roster = await tx.student.findMany({
          where: { id: { in: studentIds }, schoolId, currentClassGroupId: classSubject.classGroupId, status: "ACTIVE" },
          select: { id: true, scoreEntryBlocked: true },
        });
        const rosterIds = new Set(roster.map((student) => student.id));
        const blockedIds = restricted ? new Set(roster.filter((s) => s.scoreEntryBlocked).map((s) => s.id)) : new Set<string>();
        const componentMax = new Map(config.components.map((c) => [c.name, c.max]));
        const locked = restricted ? new Set((await tx.assessmentLock.findMany({ where: { classSubjectId, termId }, select: { component: true } })).map((lock) => lock.component)) : new Set<string>();
        if (restricted) {
          if (componentMax.size > 0 && [...componentMax.keys()].every((n) => locked.has(n))) {
            throw new Error("These scores are locked. Ask an admin to reopen them.");
          }
        }

        // Keep existing values for untouched cells and locked components.
        const patch = ctx.body.patch === true;
        const existing = await tx.subjectScore.findMany({ where: { schoolId, classSubjectId, termId, studentId: { in: studentIds } } });
        const existingByStudent = new Map(existing.map((row) => [row.studentId, row]));

        const skipped: string[] = [];
        const ignoredComponents = new Set<string>();
        const writes = [];
        for (const r of rows) {
          if (!rosterIds.has(r.studentId) || blockedIds.has(r.studentId)) {
            skipped.push(r.studentId);
            continue;
          }
          const existingScores = (existingByStudent.get(r.studentId)?.scores as Record<string, number> | null | undefined) ?? {};
          const scores: Record<string, number> = Object.assign(Object.create(null), patch ? existingScores : undefined);
          for (const name of locked) {
            if (typeof existingScores[name] === "number") scores[name] = existingScores[name];
          }
          const raw = r.scores && typeof r.scores === "object" ? (r.scores as Record<string, unknown>) : {};
          for (const [k, v] of Object.entries(raw)) {
            if (!componentMax.has(k) || locked.has(k)) {
              if (patch) ignoredComponents.add(k);
              continue;
            }
            const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
            if (v === null) {
              delete scores[k];
            } else {
              const max = componentMax.get(k)!;
              if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`Enter a score from 0 to ${max} for ${k}.`);
              scores[k] = n;
            }
          }
          const { ca, exam, total } = computeScoreTotals(config, scores);
          if (!existingByStudent.has(r.studentId) && Object.keys(scores).length === 0) continue;
          writes.push(tx.subjectScore.upsert({
            where: { classSubjectId_studentId_termId: { classSubjectId, studentId: r.studentId, termId } },
            update: { scores: scores as never, caTotal: ca, examTotal: exam, total, enteredByTeacherId: teacher?.id },
            create: { schoolId, classSubjectId, studentId: r.studentId, termId, scores: scores as never, caTotal: ca, examTotal: exam, total, enteredByTeacherId: teacher?.id },
          }));
        }
        if (requireAll && (skipped.length || ignoredComponents.size)) {
          throw new Error("The roster or assessment locks changed. Reopen the score sheet and download a fresh template.");
        }
        await Promise.all(writes);
        return { count: writes.length, skipped, ignoredComponents: [...ignoredComponents] };
      }, { isolationLevel: "Serializable" });
      const result = await save().catch(async (error: unknown) => {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2034") throw error;
        return save();
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.scoresEntered", entityType: "ClassSubject", entityId: classSubjectId, meta: { termId, rows: rows.length, skipped: result.skipped.length } });
      return result;
    },

    // Admin/owner locks one assessment component — or, when `component` is
    // omitted, every component currently configured for the section — for a
    // class-subject's term. Locking (like reopening) is admin-only: a
    // teacher only ever enters scores into whatever's still unlocked, never
    // decides when entry closes. SubjectScore.submitted (and the
    // review-request notification) only fires once every configured
    // component is locked.
    submitScores: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      const componentParam = str(ctx.body.component);
      if (!classSubjectId || !termId) throw new Error("classSubjectId and termId required");
      if (!(await prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }))) throw new Error("Term not found");

      const cs = await prisma.classSubject.findFirst({
        where: { id: classSubjectId, schoolId },
        select: { id: true, subject: { select: { name: true } }, classGroup: { select: { name: true, level: { select: { name: true, section: true } } } } },
      });
      if (!cs) throw new Error("Class subject not found");

      const config = await getResultConfig(schoolId, cs.classGroup.level.section);
      const compNames = config.components.map((c) => c.name);
      const toLock = componentParam ? (compNames.includes(componentParam) ? [componentParam] : []) : compNames;
      if (toLock.length === 0) throw new Error(componentParam ? "Unknown assessment component" : "No assessment components configured for this section");

      await prisma.$transaction(
        toLock.map((component) =>
          prisma.assessmentLock.upsert({
            where: { classSubjectId_termId_component: { classSubjectId, termId, component } },
            update: {},
            create: { schoolId, classSubjectId, termId, component, lockedByUserId: ctx.session.user.id },
          }),
        ),
      );

      const nowLocked = await lockedComponentSet(classSubjectId, termId);
      const fullyLocked = compNames.length > 0 && compNames.every((n) => nowLocked.has(n));
      if (fullyLocked) {
        await prisma.subjectScore.updateMany({ where: { schoolId, classSubjectId, termId }, data: { submitted: true, submittedAt: new Date() } });

        // Let the admin/owner team know a subject is ready for review — they
        // previously had no signal that a teacher had submitted scores.
        const reviewers = await prisma.user.findMany({ where: { schoolId, role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
        if (reviewers.length) {
          const label = `${cs.subject.name} — ${cs.classGroup.level.name} ${cs.classGroup.name}`;
          await dispatchToMany(
            reviewers.map((r) => r.id),
            { schoolId, type: "results", title: "Results submitted for review", body: `${label} results have been submitted and are ready to review.`, link: "/portal/results" },
          );
        }
      }

      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.scoresSubmitted", entityType: "ClassSubject", entityId: classSubjectId, meta: { termId, locked: toLock, fullyLocked } });
      return { locked: toLock, fullyLocked };
    },

    // Admin "unlock-to-edit": reopens one component (or, when `component` is
    // omitted, every locked component) so a teacher can correct scores again
    // — the admin never edits scores directly, only reopens the window for
    // the teacher to. Every reopen is audit-logged with which component(s)
    // and by whom.
    reopenScores: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      const componentParam = str(ctx.body.component);
      if (!classSubjectId || !termId) throw new Error("classSubjectId and termId required");
      const [removed] = await prisma.$transaction([
        prisma.assessmentLock.deleteMany({
          where: { schoolId, classSubjectId, termId, ...(componentParam ? { component: componentParam } : {}) },
        }),
        prisma.subjectScore.updateMany({ where: { schoolId, classSubjectId, termId }, data: { submitted: false, submittedAt: null } }),
      ]);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.scoresReopened", entityType: "ClassSubject", entityId: classSubjectId, meta: { termId, component: componentParam ?? "ALL", removed: removed.count } });
      return { count: removed.count };
    },

    // Admin permanently deletes a subject's scores for a term (distinct from
    // reopen, which only unlocks them for the teacher to correct) — for a
    // subject entered/submitted in error and needing a clean restart.
    deleteScores: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      if (!classSubjectId || !termId) throw new Error("classSubjectId and termId required");
      const result = await prisma.subjectScore.deleteMany({ where: { schoolId, classSubjectId, termId } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.scoresDeleted", entityType: "ClassSubject", entityId: classSubjectId, meta: { termId, count: result.count } });
      return { count: result.count };
    },

    // Admin configures the report card contents (components + caps), either
    // school-wide (no section given) or scoped to one section.
    saveConfig: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
      const section = str(ctx.body.section) ?? "";
      const raw = Array.isArray(ctx.body.components) ? ctx.body.components : [];
      const components: ResultComponent[] = raw
        .map((c, i) => {
          const cc = c as Record<string, unknown>;
          const category = cc.category === "EXAM" ? "EXAM" : "CA";
          return {
            name: String(cc.name ?? "").trim(),
            category,
            max: Math.max(0, num(cc.max) ?? 0),
            order: typeof cc.order === "number" ? cc.order : i,
          } as ResultComponent;
        })
        .filter((c) => c.name && c.max > 0);
      if (new Set(components.map((c) => c.name)).size !== components.length) throw new Error("Assessment component names must be unique");
      const hasCa = components.some((c) => c.category === "CA");
      const hasExam = components.some((c) => c.category === "EXAM");
      if (!components.length || !hasCa || !hasExam) throw new Error("Result needs at least one CA and one Exam component with a max score");
      const { caCap, examCap } = scoreMaximums(components);
      const config = await prisma.resultConfig.upsert({
        where: { schoolId_section: { schoolId, section } },
        update: { components: components as never },
        create: { schoolId, section, components: components as never },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.configUpdated", entityType: "School", entityId: schoolId, meta: { section: section || "(school-wide)", caCap, examCap, count: components.length } });
      return config;
    },

    // The report-card visual builder: which sections render on a printed
    // report card, and its signature lines. Readable by everyone with
    // reportcards:view (the PDF renderer needs it); editable by OWNER/ADMIN.
    getReportCardConfig: async (ctx) => {
      can(ctx, "reportcards:view");
      const schoolId = ctx.session.user.schoolId;
      const section = (await resolveSection(ctx)) ?? str(ctx.query.get("section")) ?? undefined;
      const { reportCardConfig } = await schoolAndReportCardConfig(schoolId, section);
      return reportCardConfig;
    },

    saveReportCardConfig: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
      const section = str(ctx.body.section) ?? "";
      const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
      const signatureLabels = Array.isArray(ctx.body.signatureLabels)
        ? (ctx.body.signatureLabels as unknown[]).map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
        : ["Class Teacher", "Principal"];
      const data = {
        showCognitive: bool(ctx.body.showCognitive, true),
        showPsychomotor: bool(ctx.body.showPsychomotor, true),
        showAttendance: bool(ctx.body.showAttendance, true),
        showFees: bool(ctx.body.showFees, true),
        showLogo: bool(ctx.body.showLogo, true),
        showWatermark: bool(ctx.body.showWatermark, false),
        motto: str(ctx.body.motto) ?? null,
        town: str(ctx.body.town) ?? null,
        state: str(ctx.body.state) ?? null,
        sectionLabel: str(ctx.body.sectionLabel) ?? null,
        signatureLabels: signatureLabels.length ? (signatureLabels as never) : (["Class Teacher", "Principal"] as never),
      };
      const config = await prisma.reportCardConfig.upsert({
        where: { schoolId_section: { schoolId, section } },
        update: data,
        create: { schoolId, section, ...data },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.reportCardConfigUpdated", entityType: "School", entityId: schoolId, meta: { section: section || "(school-wide)" } });
      return config;
    },

    // Entry sheet for a class subject (config-aware).
    entrySheet: async (ctx) => {
      can(ctx, "results:enter");
      const schoolId = ctx.session.user.schoolId;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      const { role, teacher } = ctx.session.user;
      if (!classSubjectId || !termId) throw new Error("Class subject and term are required");
      const [cs, term] = await Promise.all([
        prisma.classSubject.findFirst({
          where: { id: classSubjectId, schoolId },
          include: { subject: true, classGroup: { include: { level: true, students: { where: { schoolId, status: "ACTIVE" }, include: { user: { select: { firstName: true, lastName: true } } } } } } },
        }),
        prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }),
      ]);
      if (!cs) throw new Error("Class subject not found or unavailable to your account");
      if (!term) throw new Error("Term not found");
      const canEdit = role === "OWNER" || canTeachSubject(teacher?.id, cs);
      if (role === "TEACHER" && !canEdit) throw new Error("You can only view score sheets for subjects you teach");
      const section = cs.classGroup.level.section;
      const [config, scores, lockedSet, windowOpen] = await Promise.all([
        getResultConfig(schoolId, section),
        prisma.subjectScore.findMany({ where: { schoolId, classSubjectId, termId } }),
        lockedComponentSet(classSubjectId, termId),
        canEdit && role !== "OWNER" ? assessmentWindowOpen(schoolId, "RESULTS", { classSubjectId, termId, section }) : true,
      ]);
      const scoreMap = new Map(scores.map((s) => [s.studentId, s]));
      const fullyLocked = config.components.length > 0 && config.components.every((c) => lockedSet.has(c.name));
      const rows = cs.classGroup.students.map((s) => {
        const row = scoreMap.get(s.id);
        const scoresObj: Record<string, number | null> = Object.create(null);
        for (const comp of config.components) {
          const v = (row?.scores as Record<string, number> | null | undefined)?.[comp.name];
          scoresObj[comp.name] = typeof v === "number" ? v : null;
        }
        return {
          studentId: s.id,
          name: `${s.user.firstName} ${s.user.lastName}`,
          admissionNumber: s.admissionNumber,
          scores: scoresObj,
          caTotal: row?.caTotal ?? null,
          examTotal: row?.examTotal ?? null,
          total: row?.total ?? null,
          submitted: row?.submitted ?? false,
          blocked: role !== "OWNER" && s.scoreEntryBlocked,
          blockedReason: s.scoreEntryBlockedReason ?? null,
        };
      });
      return {
        classSubject: { id: cs.id, subject: cs.subject.name, class: `${cs.classGroup.level.name} ${cs.classGroup.name}` },
        config,
        termId,
        windowOpen,
        canEdit,
        submitted: fullyLocked,
        lockedComponents: [...lockedSet],
        rows,
      };
    },

    // Publish a single student's report card.
    publishStudent: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
      const studentId = str(ctx.body.studentId);
      const termId = str(ctx.body.termId);
      if (!studentId || !termId) throw new Error("studentId and termId required");
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
      if (!student || !student.currentClassGroupId) throw new Error("Student not found or has no class");
      await collateReportCards({
        schoolId,
        termId,
        classGroupId: student.currentClassGroupId,
        publishedBy: ctx.session.user.id,
        publish: true,
        publishStudentIds: [studentId],
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.published", entityType: "ReportCard", entityId: studentId, meta: { termId, perStudent: true } });
      return { ok: true };
    },

    // Collate report cards for a class (admin/owner)
    collate: async (ctx) => {
      can(ctx, "results:publish");
      const termId = str(ctx.body.termId);
      const classGroupId = str(ctx.body.classGroupId);
      if (!termId || !classGroupId) throw new Error("termId and classGroupId required");
      const result = await collateReportCards({
        schoolId: ctx.session.user.schoolId,
        termId,
        classGroupId,
        publishedBy: ctx.session.user.id,
        publish: ctx.body.publish === true || ctx.body.publish === "true",
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "results.collated", entityType: "ReportCard", meta: { termId, classGroupId, count: result.reportCards.length } });
      return { count: result.reportCards.length };
    },

    // Publish report cards for a term/class
    publish: async (ctx) => {
      can(ctx, "results:publish");
      const termId = str(ctx.body.termId);
      const classGroupId = str(ctx.body.classGroupId);
      if (!termId || !classGroupId) throw new Error("termId and classGroupId required");
      const result = await collateReportCards({ schoolId: ctx.session.user.schoolId, termId, classGroupId, publishedBy: ctx.session.user.id, publish: true });

      // Notify parents and students — the comment above the old code already
      // said "parents/students" but only parents were ever actually notified.
      const studentIds = result.reportCards.map((rc) => rc.studentId);
      const [parentLinks, students] = await Promise.all([
        prisma.studentParent.findMany({ where: { studentId: { in: studentIds } }, include: { parent: true } }),
        prisma.student.findMany({ where: { id: { in: studentIds } }, select: { userId: true } }),
      ]);
      const parentUserIds = parentLinks.map((p) => p.parent.userId);
      await dispatchToMany(parentUserIds, { schoolId: ctx.session.user.schoolId, type: "results", title: "Report cards published", body: "Your child's report card is now available on the portal.", link: "/portal/results" });
      await dispatchToMany(students.map((s) => s.userId), { schoolId: ctx.session.user.schoolId, type: "results", title: "Report card published", body: "Your report card is now available on the portal.", link: "/portal/results" });

      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "results.published", entityType: "ReportCard", meta: { termId, classGroupId, count: result.reportCards.length } });
      return { count: result.reportCards.length };
    },
    // FeeOverride management (setOverride/deactivateOverride) lives in
    // fees.ts, not here — it's a fee-system concept a bursar needs to reach,
    // and the "results" resource/feature gate (FEATURE_BY_RESOURCE) isn't in
    // BURSAR's feature whitelist, only "fees" is.
  },
};
