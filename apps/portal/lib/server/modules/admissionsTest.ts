import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num, bool } from "../helpers";

// Manages the school's admissions-CBT question bank (staff-only, behind the
// same "applications:manage" permission as the rest of admissions) and lets
// staff review scored attempts from applicants who took it. The applicant-
// facing side (no portal account) lives in apps/portal/app/api/public/
// admissions-test and apps/portal/app/apply/test.

export const admissionsTestModule: Module = {
  async list(ctx) {
    can(ctx, "applications:view");
    const schoolId = ctx.session.user.schoolId;
    const tests = await prisma.admissionsTest.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true, attempts: true } } },
    });
    return tests;
  },

  async get(ctx) {
    can(ctx, "applications:view");
    const test = await prisma.admissionsTest.findFirst({
      where: { id: ctx.id, schoolId: ctx.session.user.schoolId },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!test) throw new Error("Test not found");
    const attempts = await prisma.admissionsTestAttempt.findMany({ where: { testId: test.id }, orderBy: { startedAt: "desc" } });
    const applications = attempts.length
      ? await prisma.application.findMany({ where: { id: { in: attempts.map((a) => a.applicationId) } }, select: { id: true, applicantName: true, email: true, section: true, status: true } })
      : [];
    const appById = new Map(applications.map((a) => [a.id, a]));
    return { ...test, attempts: attempts.map((a) => ({ ...a, application: appById.get(a.applicationId) ?? null })) };
  },

  async create(ctx) {
    can(ctx, "applications:manage");
    const title = str(ctx.body.title);
    if (!title) throw new Error("Title is required");
    const test = await prisma.admissionsTest.create({
      data: {
        schoolId: ctx.session.user.schoolId,
        title,
        section: str(ctx.body.section) ?? null,
        instruction: str(ctx.body.instruction),
        durationMinutes: num(ctx.body.durationMinutes) ?? 30,
        passMark: num(ctx.body.passMark),
        isActive: ctx.body.isActive !== false,
      },
    });
    await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "admissionsTest.created", entityType: "AdmissionsTest", entityId: test.id, meta: { title } });
    return test;
  },

  async update(ctx) {
    can(ctx, "applications:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.admissionsTest.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Test not found");
    const data: Record<string, unknown> = {};
    if (str(ctx.body.title)) data.title = str(ctx.body.title);
    if (ctx.body.section !== undefined) data.section = str(ctx.body.section) ?? null;
    if (ctx.body.instruction !== undefined) data.instruction = str(ctx.body.instruction) ?? null;
    if (ctx.body.durationMinutes !== undefined) data.durationMinutes = num(ctx.body.durationMinutes) ?? existing.durationMinutes;
    if (ctx.body.passMark !== undefined) data.passMark = num(ctx.body.passMark) ?? null;
    if (typeof bool(ctx.body.isActive) === "boolean") data.isActive = bool(ctx.body.isActive);
    const test = await prisma.admissionsTest.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "admissionsTest.updated", entityType: "AdmissionsTest", entityId: ctx.id });
    return test;
  },

  async remove(ctx) {
    can(ctx, "applications:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.admissionsTest.findFirst({ where: { id: ctx.id, schoolId }, include: { _count: { select: { attempts: true } } } });
    if (!existing) throw new Error("Test not found");
    if (existing._count.attempts > 0) {
      throw new Error("This test already has applicant attempts recorded — deactivate it instead of deleting so those scores are preserved.");
    }
    await prisma.admissionsTest.delete({ where: { id: ctx.id } });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "admissionsTest.deleted", entityType: "AdmissionsTest", entityId: ctx.id });
    return { ok: true };
  },

  actions: {
    addQuestion: async (ctx) => {
      can(ctx, "applications:manage");
      const schoolId = ctx.session.user.schoolId;
      const test = await prisma.admissionsTest.findFirst({ where: { id: ctx.id, schoolId } });
      if (!test) throw new Error("Test not found");
      const question = str(ctx.body.question);
      const options = Array.isArray(ctx.body.options) ? ctx.body.options : [];
      if (!question || options.length < 2) throw new Error("A question and at least two options are required");
      const count = await prisma.admissionsQuestion.count({ where: { testId: test.id } });
      const q = await prisma.admissionsQuestion.create({
        data: {
          testId: test.id,
          type: (str(ctx.body.type) as "MULTIPLE_CHOICE" | "TRUE_FALSE") ?? "MULTIPLE_CHOICE",
          question,
          options,
          correctIndex: num(ctx.body.correctIndex) ?? 0,
          score: num(ctx.body.score) ?? 1,
          order: count,
        },
      });
      return q;
    },

    // Bulk-adds questions parsed client-side from an uploaded CSV, mirroring
    // the teacher CBT bulk-import flow.
    bulkAddQuestions: async (ctx) => {
      can(ctx, "applications:manage");
      const schoolId = ctx.session.user.schoolId;
      const test = await prisma.admissionsTest.findFirst({ where: { id: ctx.id, schoolId } });
      if (!test) throw new Error("Test not found");
      const rows = Array.isArray(ctx.body.questions) ? (ctx.body.questions as Array<Record<string, unknown>>) : [];
      if (rows.length === 0) throw new Error("No questions to import");
      const startOrder = await prisma.admissionsQuestion.count({ where: { testId: test.id } });
      const created = await prisma.$transaction(
        rows.map((q, i) =>
          prisma.admissionsQuestion.create({
            data: {
              testId: test.id,
              type: (str(q.type) as "MULTIPLE_CHOICE" | "TRUE_FALSE") ?? "MULTIPLE_CHOICE",
              question: str(q.question) ?? "",
              options: Array.isArray(q.options) ? q.options : [],
              correctIndex: num(q.correctIndex) ?? 0,
              score: num(q.score) ?? 1,
              order: startOrder + i,
            },
          }),
        ),
      );
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "admissionsTest.bulkQuestionsImported", entityType: "AdmissionsTest", entityId: test.id, meta: { count: created.length } });
      return { ok: true, count: created.length };
    },

    updateQuestion: async (ctx) => {
      can(ctx, "applications:manage");
      const schoolId = ctx.session.user.schoolId;
      const questionId = str(ctx.body.questionId);
      if (!questionId) throw new Error("questionId is required");
      const q = await prisma.admissionsQuestion.findFirst({ where: { id: questionId, test: { schoolId } } });
      if (!q) throw new Error("Question not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.question)) data.question = str(ctx.body.question);
      if (Array.isArray(ctx.body.options)) data.options = ctx.body.options;
      if (ctx.body.correctIndex !== undefined) data.correctIndex = num(ctx.body.correctIndex) ?? q.correctIndex;
      if (ctx.body.score !== undefined) data.score = num(ctx.body.score) ?? q.score;
      const updated = await prisma.admissionsQuestion.update({ where: { id: questionId }, data });
      return updated;
    },

    deleteQuestion: async (ctx) => {
      can(ctx, "applications:manage");
      const schoolId = ctx.session.user.schoolId;
      const questionId = str(ctx.body.questionId);
      if (!questionId) throw new Error("questionId is required");
      const q = await prisma.admissionsQuestion.findFirst({ where: { id: questionId, test: { schoolId } } });
      if (!q) throw new Error("Question not found");
      await prisma.admissionsQuestion.delete({ where: { id: questionId } });
      return { ok: true };
    },
  },
};
