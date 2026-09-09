import { prisma } from "@duga/core/server";
import { collateReportCards, resolveResultsAccess, logAudit, dispatchToMany, getDefaultGradingScale } from "@duga/core/server";
import { getResultConfig, computeScoreTotals, type ResultComponent } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num, studentScope, resolveSection } from "../helpers";
import { assessmentWindowOpen } from "./calendar";

// Grade-point average for a card, derived from the school's grading scale.
async function gpaCalculator(schoolId: string, section?: string) {
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
async function schoolAndReportCardConfig(schoolId: string, section?: string) {
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
      showAffective: row?.showAffective ?? true,
      showAttendance: row?.showAttendance ?? true,
      showLogo: row?.showLogo ?? true,
      showWatermark: row?.showWatermark ?? false,
      signatureLabels: Array.isArray(row?.signatureLabels) ? row.signatureLabels : ["Class Teacher", "Principal"],
    },
  };
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
    select: { classSubjectId: true, submitted: true },
  });
  const map: Record<string, { entered: number; submitted: number; total: number; allSubmitted: boolean }> = {};
  for (const cs of classSubjects) {
    const scores = rows.filter((r) => r.classSubjectId === cs.id);
    const total = cs.classGroup.students.length;
    const entered = scores.length;
    const submitted = scores.filter((s) => s.submitted).length;
    map[cs.id] = { entered, submitted, total, allSubmitted: total > 0 && submitted === total };
  }
  return map;
}

export const resultsModule: Module = {
  async list(ctx) {
    can(ctx, "results:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const section = await resolveSection(ctx);
    const config = await getResultConfig(schoolId, section);
    const gpaOf = await gpaCalculator(schoolId, section);

    // Entry grid for teachers: return class subjects with class students
    if (role === "TEACHER") {
      const teacher = ctx.session.user.teacher!;
      const classSubjects = await prisma.classSubject.findMany({
        where: { teacherId: teacher.id, ...(section ? { classGroup: { level: { section } } } : {}) },
        include: { subject: true, classGroup: { include: { level: true, students: { include: { user: { select: { firstName: true, lastName: true, id: true } } } } } } },
      });
      const terms = await prisma.term.findMany({ where: { schoolId }, include: { session: true }, orderBy: [{ session: { createdAt: "desc" } }, { termNumber: "asc" }] });
      const activeTerm = terms.find((t) => t.status === "ACTIVE") ?? terms[0];
      const submissions = await submissionSummary(schoolId, classSubjects, activeTerm?.id);
      return { role, classSubjects, terms, config, submissions, activeTermId: activeTerm?.id };
    }

    if (role === "STUDENT" || role === "PARENT") {
      const studentIds =
        role === "STUDENT"
          ? [ctx.session.user.student!.id]
          : (await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } })).map((l) => l.studentId);

      const reportCards = await prisma.reportCard.findMany({
        where: { schoolId, studentId: { in: studentIds } },
        include: { term: true, student: { select: { id: true, photoUrl: true, feeAmount: true, feeDays: true, feePaidThrough: true, user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { createdAt: "desc" },
      });

      // Gate: only show published cards that are paid/overridden
      const gated = [];
      for (const rc of reportCards) {
        if (!rc.isPublished) continue;
        const access = await resolveResultsAccess(rc.studentId, rc.termId);
        const student = rc.student;
        const feeLocked = Number(student.feeAmount) > 0 && student.feeDays > 0 && (!student.feePaidThrough || student.feePaidThrough.getTime() < Date.now());
        const items = access.allowed ? await prisma.reportCardItem.findMany({ where: { reportCardId: rc.id }, include: { subject: true }, orderBy: { position: "asc" } }) : null;
        gated.push({
          ...rc,
          access: access.allowed && !feeLocked ? "granted" : "locked",
          gatedReason: feeLocked ? "fee_expired" : access.reason,
          gpa: gpaOf(items),
          items,
        });
      }
      const { school, reportCardConfig } = await schoolAndReportCardConfig(schoolId, section);
      return { role, reportCards: gated, school, reportCardConfig };
    }

    // Admin / owner: only return the active section when one is selected.
    const [reportCards, classSubjects] = await Promise.all([
      prisma.reportCard.findMany({
        where: { schoolId, ...(section ? { classGroup: { level: { section } } } : {}) },
        include: { term: true, student: { select: { id: true, photoUrl: true, user: { select: { firstName: true, lastName: true } } } }, classGroup: { include: { level: true } }, items: { include: { subject: true }, orderBy: { position: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.classSubject.findMany({
        where: { schoolId, ...(section ? { classGroup: { level: { section } } } : {}) },
        include: { subject: true, classGroup: { include: { level: true, students: { select: { id: true } } } } },
      }),
    ]);
    const submissions = await submissionSummary(schoolId, classSubjects);
    const { school, reportCardConfig } = await schoolAndReportCardConfig(schoolId, section);
    // So admin can open a read-only entry sheet from "Subject submissions"
    // (entrySheet already lets OWNER/ADMIN view any classSubject — it was
    // just missing a term to ask for from the client).
    const terms = await prisma.term.findMany({ where: { schoolId }, include: { session: true }, orderBy: [{ session: { createdAt: "desc" } }, { termNumber: "asc" }] });
    const activeTermId = (terms.find((t) => t.status === "ACTIVE") ?? terms[0])?.id;
    // classSubjects was already being fetched to compute `submissions`, but
    // was never sent to the client — the admin/owner "Subject submissions"
    // overview builds its rows from this array client-side, so without it
    // that whole card silently never rendered, no matter how many subjects
    // teachers had submitted.
    return { role, reportCards: reportCards.map((rc) => ({ ...rc, gpa: gpaOf(rc.items) })), classSubjects, config, submissions, school, reportCardConfig, activeTermId };
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
        term: true,
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
        classGroup: { select: { formTeacherId: true } },
        items: { include: { subject: true }, orderBy: { position: "asc" } },
      },
    });
    if (!rc) throw new Error("Report card not found");
    const { school, reportCardConfig } = await schoolAndReportCardConfig(ctx.session.user.schoolId, ctx.session.user.student?.section);
    // Students/parents must also pass the fee gate (published + paid/overridden).
    if (role === "STUDENT" || role === "PARENT") {
      // resolveResultsAccess already fully governs results gating (its own
      // resultsRequirePayment toggle + Invoice status + FeeOverride) — an
      // additional assertFeeAccess check here used the unrelated
      // feePaidThrough window and could block a student even when the admin
      // had explicitly turned resultsRequirePayment off, or vice versa.
      const access = await resolveResultsAccess(rc.studentId, rc.termId);
      if (!access.allowed) {
        const err = new Error("This report card is locked") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
    }
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
        return { ...rc, items: ownItems, gpa: (await gpaCalculator(ctx.session.user.schoolId))(ownItems), school, reportCardConfig };
      }
      return { ...rc, gpa: (await gpaCalculator(ctx.session.user.schoolId))(rc.items), school, reportCardConfig };
    }
    return { ...rc, gpa: (await gpaCalculator(ctx.session.user.schoolId))(rc.items), school, reportCardConfig };
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
      const psychomotor = ctx.body.psychomotor && typeof ctx.body.psychomotor === "object" ? ctx.body.psychomotor : undefined;
      const coCurricular = ctx.body.coCurricular && typeof ctx.body.coCurricular === "object" ? ctx.body.coCurricular : undefined;
      const updated = await prisma.reportCard.update({
        where: { id: card.id },
        data: { psychomotor, coCurricular, attendanceRemark: str(ctx.body.attendanceRemark), remark: str(ctx.body.remark) },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "results.detailsUpdated", entityType: "ReportCard", entityId: card.id });
      return updated;
    },

    // Bulk entry of scores for a class subject, following the school's
    // ResultConfig components.
    saveScores: async (ctx) => {
      can(ctx, "results:enter");
      const schoolId = ctx.session.user.schoolId;
      const teacher = ctx.session.user.teacher;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      const rows = Array.isArray(ctx.body.rows) ? (ctx.body.rows as Array<{ studentId: string; scores?: Record<string, unknown> }>) : [];
      if (!classSubjectId || rows.length === 0 || !termId) throw new Error("classSubjectId, termId and rows required");

      const classSubject = await prisma.classSubject.findFirst({
        where: { id: classSubjectId, schoolId, ...(teacher ? { teacherId: teacher.id } : {}) },
        select: { id: true, classGroupId: true, classGroup: { select: { level: { select: { section: true } } } } },
      });
      if (!classSubject) throw new Error(teacher ? "You can only enter scores for your own subjects" : "Class subject not found");
      const roster = await prisma.student.findMany({
        where: { schoolId, currentClassGroupId: classSubject.classGroupId, status: "ACTIVE" },
        select: { id: true },
      });
      const rosterIds = new Set(roster.map((student) => student.id));
      if (rows.some((row) => !rosterIds.has(row.studentId))) throw new Error("Scores can only be entered for active students in this class");

      // Locked once submitted (until an admin reopens), and outside the
      // calendar's results-entry window (owner/admin can still enter/correct
      // scores outside the window — only teacher entry is auto-locked).
      if (teacher) {
        const locked = await prisma.subjectScore.findFirst({ where: { classSubjectId, termId, submitted: true }, take: 1 });
        if (locked) throw new Error("These scores have been submitted to the admin and are locked. Ask an admin to reopen them.");
        const windowOpen = await assessmentWindowOpen(schoolId, "RESULTS", { classSubjectId, section: classSubject.classGroup.level.section });
        if (!windowOpen) throw new Error("The results entry window is closed for this term.");
      }

      const config = await getResultConfig(schoolId, classSubject.classGroup.level.section);
      const compNames = new Set(config.components.map((c) => c.name));

      for (const r of rows) {
        const scores: Record<string, number> = {};
        const raw = r.scores && typeof r.scores === "object" ? (r.scores as Record<string, unknown>) : {};
        for (const [k, v] of Object.entries(raw)) {
          if (!compNames.has(k)) continue;
          const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
          if (typeof n === "number" && !Number.isNaN(n)) scores[k] = n;
        }
        const { ca, exam, total } = computeScoreTotals(config, scores);
        await prisma.subjectScore.upsert({
          where: { classSubjectId_studentId_termId: { classSubjectId, studentId: r.studentId, termId } },
          update: { scores: scores as never, caTotal: ca, examTotal: exam, total, enteredByTeacherId: teacher?.id, submitted: false, submittedAt: null },
          create: { schoolId, classSubjectId, studentId: r.studentId, termId, scores: scores as never, caTotal: ca, examTotal: exam, total, enteredByTeacherId: teacher?.id, submitted: false },
        });
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.scoresEntered", entityType: "ClassSubject", entityId: classSubjectId, meta: { termId, rows: rows.length } });
      return { count: rows.length };
    },

    // Teacher submits a subject's scores to the admin (locks them).
    submitScores: async (ctx) => {
      can(ctx, "results:enter");
      const schoolId = ctx.session.user.schoolId;
      const teacher = ctx.session.user.teacher;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      if (!classSubjectId || !termId) throw new Error("classSubjectId and termId required");
      let own: { id: string; subject: { name: string }; classGroup: { name: string; level: { name: string; section: string } } } | null = null;
      if (teacher) {
        own = await prisma.classSubject.findFirst({
          where: { id: classSubjectId, teacherId: teacher.id },
          select: { id: true, subject: { select: { name: true } }, classGroup: { select: { name: true, level: { select: { name: true, section: true } } } } },
        });
        if (!own) throw new Error("You can only submit scores for your own subjects");
        const windowOpen = await assessmentWindowOpen(schoolId, "RESULTS", { classSubjectId, section: own.classGroup.level.section });
        if (!windowOpen) throw new Error("The results entry window is closed for this term.");
      }
      const result = await prisma.subjectScore.updateMany({
        where: { schoolId, classSubjectId, termId },
        data: { submitted: true, submittedAt: new Date() },
      });

      // Let the admin/owner team know a subject is ready for review — they
      // previously had no signal that a teacher had submitted scores.
      const reviewers = await prisma.user.findMany({ where: { schoolId, role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
      if (reviewers.length) {
        const label = own ? `${own.subject.name} — ${own.classGroup.level.name} ${own.classGroup.name}` : "A subject";
        await dispatchToMany(
          reviewers.map((r) => r.id),
          { schoolId, type: "results", title: "Results submitted for review", body: `${label} results have been submitted and are ready to review.`, link: "/portal/results" },
        );
      }

      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.scoresSubmitted", entityType: "ClassSubject", entityId: classSubjectId, meta: { termId, count: result.count } });
      return { count: result.count };
    },

    // Admin reopens a subject so teachers can edit/complete scores again.
    reopenScores: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      if (!classSubjectId || !termId) throw new Error("classSubjectId and termId required");
      const result = await prisma.subjectScore.updateMany({
        where: { schoolId, classSubjectId, termId },
        data: { submitted: false, submittedAt: null },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.scoresReopened", entityType: "ClassSubject", entityId: classSubjectId, meta: { termId } });
      return { count: result.count };
    },

    // Admin configures the report card contents (components + caps), either
    // school-wide (no section given) or scoped to one section.
    saveConfig: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
      const section = str(ctx.body.section) ?? "";
      const caCap = Math.max(0, num(ctx.body.caCap) ?? 40);
      const examCap = Math.max(0, num(ctx.body.examCap) ?? 60);
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
      const hasCa = components.some((c) => c.category === "CA");
      const hasExam = components.some((c) => c.category === "EXAM");
      if (!components.length || !hasCa || !hasExam) throw new Error("Result needs at least one CA and one Exam component with a max score");
      const config = await prisma.resultConfig.upsert({
        where: { schoolId_section: { schoolId, section } },
        update: { caCap, examCap, components: components as never },
        create: { schoolId, section, caCap, examCap, components: components as never },
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
        showAffective: bool(ctx.body.showAffective, true),
        showAttendance: bool(ctx.body.showAttendance, true),
        showLogo: bool(ctx.body.showLogo, true),
        showWatermark: bool(ctx.body.showWatermark, false),
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
      const teacher = ctx.session.user.teacher;
      if (!classSubjectId) throw new Error("classSubjectId required");
      if (teacher) {
        const own = await prisma.classSubject.findFirst({ where: { id: classSubjectId, teacherId: teacher.id } });
        if (!own) throw new Error("Not your subject");
      }
      const cs = await prisma.classSubject.findUnique({
        where: { id: classSubjectId },
        include: { subject: true, classGroup: { include: { level: true, students: { include: { user: { select: { firstName: true, lastName: true } } } } } } },
      });
      if (!cs) throw new Error("Class subject not found");
      const [config, scores] = await Promise.all([
        getResultConfig(schoolId, cs.classGroup.level.section),
        prisma.subjectScore.findMany({ where: { classSubjectId, termId: termId ?? "" } }),
      ]);
      const scoreMap = new Map(scores.map((s) => [s.studentId, s]));
      const anySubmitted = scores.some((s) => s.submitted);
      const rows = cs.classGroup.students.map((s) => {
        const row = scoreMap.get(s.id);
        const scoresObj: Record<string, number | null> = {};
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
        };
      });
      return {
        classSubject: { id: cs.id, subject: cs.subject.name, class: `${cs.classGroup.level.name} ${cs.classGroup.name}` },
        config,
        submitted: anySubmitted,
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

      // Notify parents/students
      const studentIds = result.reportCards.map((rc) => rc.studentId);
      const parentLinks = await prisma.studentParent.findMany({ where: { studentId: { in: studentIds } }, include: { parent: true } });
      const parentUserIds = parentLinks.map((p) => p.parent.userId);
      await dispatchToMany(parentUserIds, { schoolId: ctx.session.user.schoolId, type: "results", title: "Report cards published", body: "Your child's report card is now available on the portal.", link: "/portal/results" });

      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "results.published", entityType: "ReportCard", meta: { termId, classGroupId, count: result.reportCards.length } });
      return { count: result.reportCards.length };
    },

    // Owner/admin: grant/revoke fee override for a student (gates results access)
    setOverride: async (ctx) => {
      can(ctx, "overrides:manage");
      const studentId = str(ctx.body.studentId);
      const termId = str(ctx.body.termId);
      const reason = str(ctx.body.reason) ?? "EXCEPTION";
      const isActive = ctx.body.isActive !== false;
      if (!studentId) throw new Error("studentId required");
      const override = await prisma.feeOverride.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          studentId,
          termId,
          reason: reason as "SCHOLARSHIP",
          note: str(ctx.body.note),
          discountAmount: num(ctx.body.discountAmount),
          dueDate: str(ctx.body.dueDate) ? new Date(String(ctx.body.dueDate)) : undefined,
          expiresAt: str(ctx.body.expiresAt) ? new Date(String(ctx.body.expiresAt)) : undefined,
          isActive,
          createdByUserId: ctx.session.user.id,
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "results.accessOverride", entityType: "FeeOverride", entityId: override.id, meta: { studentId, reason, isActive } });
      return override;
    },
  },
};
