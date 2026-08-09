import { prisma } from "@duga/core/server";
import { collateReportCards, resolveResultsAccess, logAudit, dispatchToMany } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num } from "../helpers";

export const resultsModule: Module = {
  async list(ctx) {
    can(ctx, "results:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;

    // Entry grid for teachers: return class subjects with class students
    if (role === "TEACHER") {
      const teacher = ctx.session.user.teacher!;
      const [classSubjects, terms] = await Promise.all([
        prisma.classSubject.findMany({
          where: { teacherId: teacher.id },
          include: { subject: true, classGroup: { include: { level: true, students: { include: { user: { select: { firstName: true, lastName: true, id: true } } } } } } },
        }),
        prisma.term.findMany({ where: { schoolId }, include: { session: true }, orderBy: [{ session: { createdAt: "desc" } }, { termNumber: "asc" }] }),
      ]);
      const activeTerm = terms.find((t) => t.status === "ACTIVE") ?? terms[0];
      return { role, classSubjects, terms, activeTermId: activeTerm?.id };
    }

    if (role === "STUDENT" || role === "PARENT") {
      const studentIds =
        role === "STUDENT"
          ? [ctx.session.user.student!.id]
          : (await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, select: { studentId: true } })).map((l) => l.studentId);

      const reportCards = await prisma.reportCard.findMany({
        where: { schoolId, studentId: { in: studentIds } },
        include: { term: true, student: { include: { user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { createdAt: "desc" },
      });

      // Gate: only show published cards that are paid/overridden
      const gated = [];
      for (const rc of reportCards) {
        if (!rc.isPublished) continue;
        const access = await resolveResultsAccess(rc.studentId, rc.termId);
        gated.push({
          ...rc,
          access: access.allowed ? "granted" : "locked",
          gatedReason: access.reason,
          items: access.allowed ? await prisma.reportCardItem.findMany({ where: { reportCardId: rc.id }, orderBy: { position: "asc" } }) : null,
        });
      }
      return { role, reportCards: gated };
    }

    // Admin / owner
    const reportCards = await prisma.reportCard.findMany({
      where: { schoolId },
      include: { term: true, student: { include: { user: { select: { firstName: true, lastName: true } } } }, classGroup: { include: { level: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return { role, reportCards };
  },

  async get(ctx) {
    can(ctx, "reportcards:view");
    const rc = await prisma.reportCard.findUnique({
      where: { id: ctx.id },
      include: {
        term: true,
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
        items: { include: { subject: true }, orderBy: { position: "asc" } },
      },
    });
    if (!rc) throw new Error("Report card not found");
    return rc;
  },

  actions: {
    // Bulk entry of CA + exam scores for a class subject
    saveScores: async (ctx) => {
      can(ctx, "results:enter");
      const teacher = ctx.session.user.teacher;
      const classSubjectId = str(ctx.body.classSubjectId);
      const termId = str(ctx.body.termId);
      const rows = Array.isArray(ctx.body.rows) ? (ctx.body.rows as Array<{ studentId: string; ca1?: number; ca2?: number; ca3?: number; test?: number; assignment?: number; exam?: number }>) : [];
      if (!classSubjectId || rows.length === 0) throw new Error("classSubjectId and rows required");

      if (teacher) {
        const own = await prisma.classSubject.findFirst({ where: { id: classSubjectId, teacherId: teacher.id } });
        if (!own) throw new Error("You can only enter scores for your own subjects");
      }

      for (const r of rows) {
        const caTotal = ((r.ca1 ?? 0) + (r.ca2 ?? 0) + (r.ca3 ?? 0) + (r.test ?? 0) + (r.assignment ?? 0));
        await prisma.caScore.upsert({
          where: { classSubjectId_studentId_termId: { classSubjectId, studentId: r.studentId, termId: termId ?? "" } },
          update: { ca1: r.ca1, ca2: r.ca2, ca3: r.ca3, test: r.test, assignment: r.assignment, total: Math.min(caTotal, 40), enteredByTeacherId: teacher?.id },
          create: { schoolId: ctx.session.user.schoolId, classSubjectId, studentId: r.studentId, termId, ca1: r.ca1, ca2: r.ca2, ca3: r.ca3, test: r.test, assignment: r.assignment, total: Math.min(caTotal, 40), enteredByTeacherId: teacher?.id },
        });
        const exam = Math.min(r.exam ?? 0, 60);
        await prisma.examScore.upsert({
          where: { classSubjectId_studentId_termId: { classSubjectId, studentId: r.studentId, termId: termId ?? "" } },
          update: { examScore: exam, total: exam, enteredByTeacherId: teacher?.id },
          create: { schoolId: ctx.session.user.schoolId, classSubjectId, studentId: r.studentId, termId, examScore: exam, total: exam, enteredByTeacherId: teacher?.id },
        });
      }
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "results.scoresEntered", entityType: "ClassSubject", entityId: classSubjectId, meta: { rows: rows.length } });
      return { count: rows.length };
    },

    // Entry sheet for a class subject
    entrySheet: async (ctx) => {
      can(ctx, "results:enter");
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
      const [cas, exams] = await Promise.all([
        prisma.caScore.findMany({ where: { classSubjectId, termId: termId ?? undefined } }),
        prisma.examScore.findMany({ where: { classSubjectId, termId: termId ?? undefined } }),
      ]);
      const caMap = new Map(cas.map((c) => [c.studentId, c]));
      const examMap = new Map(exams.map((e) => [e.studentId, e]));
      const rows = cs.classGroup.students.map((s) => ({
        studentId: s.id,
        name: `${s.user.firstName} ${s.user.lastName}`,
        admissionNumber: s.admissionNumber,
        ca1: caMap.get(s.id)?.ca1 ?? null,
        ca2: caMap.get(s.id)?.ca2 ?? null,
        ca3: caMap.get(s.id)?.ca3 ?? null,
        test: caMap.get(s.id)?.test ?? null,
        assignment: caMap.get(s.id)?.assignment ?? null,
        exam: examMap.get(s.id)?.examScore ?? null,
      }));
      return { classSubject: { id: cs.id, subject: cs.subject.name, class: `${cs.classGroup.level.name} ${cs.classGroup.name}` }, rows };
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
