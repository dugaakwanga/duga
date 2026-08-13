import { prisma } from "@duga/core/server";
import { collateReportCards, resolveResultsAccess, logAudit, dispatchToMany } from "@duga/core/server";
import { getResultConfig, computeScoreTotals, type ResultComponent } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num, studentScope, assertFeeAccess } from "../helpers";

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
    const config = await getResultConfig(schoolId);

    // Entry grid for teachers: return class subjects with class students
    if (role === "TEACHER") {
      const teacher = ctx.session.user.teacher!;
      const classSubjects = await prisma.classSubject.findMany({
        where: { teacherId: teacher.id },
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
        gated.push({
          ...rc,
          access: access.allowed && !(Number(student.feeAmount) > 0 && student.feeDays > 0 && (!student.feePaidThrough || student.feePaidThrough.getTime() < Date.now())) ? "granted" : "locked",
          gatedReason: Number(student.feeAmount) > 0 && student.feeDays > 0 && (!student.feePaidThrough || student.feePaidThrough.getTime() < Date.now()) ? "fee_expired" : access.reason,
          items: access.allowed ? await prisma.reportCardItem.findMany({ where: { reportCardId: rc.id }, include: { subject: true }, orderBy: { position: "asc" } }) : null,
        });
      }
      return { role, reportCards: gated };
    }

    // Admin / owner
    const [reportCards, classSubjects] = await Promise.all([
      prisma.reportCard.findMany({
        where: { schoolId },
        include: { term: true, student: { include: { user: { select: { firstName: true, lastName: true } } }, select: { photoUrl: true } }, classGroup: { include: { level: true } }, items: { include: { subject: true }, orderBy: { position: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.classSubject.findMany({
        where: { schoolId },
        include: { subject: true, classGroup: { include: { level: true, students: { select: { id: true } } } } },
      }),
    ]);
    const submissions = await submissionSummary(schoolId, classSubjects);
    return { role, reportCards, config, submissions };
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
        items: { include: { subject: true }, orderBy: { position: "asc" } },
      },
    });
    if (!rc) throw new Error("Report card not found");
    // Students/parents must also pass the fee gate (published + paid/overridden).
    if (role === "STUDENT" || role === "PARENT") {
      const access = await resolveResultsAccess(rc.studentId, rc.termId);
      assertFeeAccess(rc.student);
      if (!access.allowed) {
        const err = new Error("This report card is locked") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
    }
    return rc;
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
        const teachesClass = teacherId && card.classGroupId && await prisma.classSubject.findFirst({ where: { teacherId, classGroupId: card.classGroupId } });
        if (!teachesClass) {
          const err = new Error("You can only rate students in classes you teach") as Error & { status?: number };
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

      if (teacher) {
        const own = await prisma.classSubject.findFirst({ where: { id: classSubjectId, teacherId: teacher.id } });
        if (!own) throw new Error("You can only enter scores for your own subjects");
      }

      // Locked once submitted (until an admin reopens).
      if (teacher) {
        const locked = await prisma.subjectScore.findFirst({ where: { classSubjectId, termId, submitted: true }, take: 1 });
        if (locked) throw new Error("These scores have been submitted to the admin and are locked. Ask an admin to reopen them.");
      }

      const config = await getResultConfig(schoolId);
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
      if (teacher) {
        const own = await prisma.classSubject.findFirst({ where: { id: classSubjectId, teacherId: teacher.id } });
        if (!own) throw new Error("You can only submit scores for your own subjects");
      }
      const result = await prisma.subjectScore.updateMany({
        where: { schoolId, classSubjectId, termId },
        data: { submitted: true, submittedAt: new Date() },
      });
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

    // Admin configures the report card contents (components + caps).
    saveConfig: async (ctx) => {
      can(ctx, "results:publish");
      const schoolId = ctx.session.user.schoolId;
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
        where: { schoolId },
        update: { caCap, examCap, components: components as never },
        create: { schoolId, caCap, examCap, components: components as never },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "results.configUpdated", entityType: "School", entityId: schoolId, meta: { caCap, examCap, count: components.length } });
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
        getResultConfig(schoolId),
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