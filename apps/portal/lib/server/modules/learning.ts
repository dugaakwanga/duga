import { prisma } from "@duga/core/server";
import { jitsiRoomLink, logAudit, dispatchNotification, dispatchToMany } from "@duga/core/server";
import type { Module } from ".";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { can, str, num, pick, idArray, isAssignedTo, ensureTeacher, assertFeeAccess } from "../helpers";
import { assertSubfeature } from "../features";

type Kind = "notes" | "assignments" | "tests" | "live";

const subIdForKind: Record<string, string> = {
  notes: "learning:notes",
  note: "learning:notes",
  assignments: "learning:assignments",
  assignment: "learning:assignments",
  tests: "learning:cbt",
  test: "learning:cbt",
  live: "learning:live",
};

/** Block the request unless the sub-feature behind a learning kind is on. */
async function assertKindSubfeature(ctx: Ctx, kind: string): Promise<void> {
  const subId = subIdForKind[kind];
  if (subId) await assertSubfeature(ctx, subId);
}

async function visibleClassSubjectIds(ctx: Ctx): Promise<string[]> {
  const role = ctx.session.user.role;
  const teacher = ctx.session.user.teacher;
  const student = ctx.session.user.student;

  if (role === "ADMIN" || role === "OWNER") {
    const rows = await prisma.classSubject.findMany({ where: { schoolId: ctx.session.user.schoolId }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  if (teacher) {
    const rows = await prisma.classSubject.findMany({ where: { teacherId: teacher.id }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  if (student?.currentClassGroupId) {
    const rows = await prisma.classSubject.findMany({ where: { classGroupId: student.currentClassGroupId }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  // PARENT: find children's class subjects
  if (role === "PARENT") {
    const links = await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, include: { student: { select: { currentClassGroupId: true } } } });
    const groupIds = links.map((l) => l.student.currentClassGroupId).filter(Boolean) as string[];
    const rows = await prisma.classSubject.findMany({ where: { classGroupId: { in: groupIds } }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  return [];
}

const includeBase = {
  classSubject: { include: { subject: true, classGroup: { include: { level: true } }, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } } },
};

export const learningModule: Module = {
  async list(ctx) {
    const kind = (ctx.query.get("kind") ?? "notes") as Kind;
    can(ctx, "learning:view");
    await assertKindSubfeature(ctx, kind);
    const ids = await visibleClassSubjectIds(ctx);
    const where = { classSubjectId: { in: ids }, schoolId: ctx.session.user.schoolId };

    if (kind === "notes") {
      const notes = await prisma.lessonNote.findMany({ where, include: includeBase, orderBy: { createdAt: "desc" }, take: 100 });
      return { kind, items: notes };
    }
    if (kind === "assignments") {
      const teacher = ctx.session.user.teacher;
      const student = ctx.session.user.student;
      const assignmentsRes = await prisma.assignment.findMany({
        where,
        include: {
          ...includeBase,
          submissions: teacher ? { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } } : { select: { id: true, studentId: true, submittedAt: true, score: true } },
          _count: { select: { submissions: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      const filtered =
        student || ctx.session.user.role === "PARENT"
          ? assignmentsRes.filter((a) => isAssignedTo(a, student?.id ?? "", student?.currentClassGroupId ?? null))
          : assignmentsRes;
      return { kind, items: filtered };
    }
    if (kind === "tests") {
      const testsRes = await prisma.test.findMany({
        where,
        include: {
          ...includeBase,
          _count: { select: { questions: true, attempts: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      const student = ctx.session.user.student;
      const items = student ? testsRes.filter((t) => isAssignedTo(t, student.id, student.currentClassGroupId)) : testsRes;
      return { kind, items };
    }
    const live = await prisma.liveClass.findMany({
      where: { schoolId: ctx.session.user.schoolId, ...(ctx.session.user.teacher ? {} : {}) },
      include: { teacher: { include: { user: { select: { firstName: true, lastName: true } } } }, classSubject: { include: { subject: true } } },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    });
    return { kind, items: live };
  },

  async get(ctx) {
    const kind = (ctx.query.get("kind") ?? "notes") as Kind;
    can(ctx, "learning:view");
    await assertKindSubfeature(ctx, kind);
    if (kind === "notes") return prisma.lessonNote.findUnique({ where: { id: ctx.id }, include: includeBase });
    if (kind === "assignments") return prisma.assignment.findUnique({ where: { id: ctx.id }, include: { ...includeBase, submissions: { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } } } });
    if (kind === "tests") {
      const test = await prisma.test.findUnique({ where: { id: ctx.id }, include: { ...includeBase, questions: { orderBy: { order: "asc" } } } });
      if (!test) throw new Error("Test not found");
      // Students/parents must never see the correct answers.
      const role = ctx.session.user.role;
      if (role === "STUDENT" || role === "PARENT") {
        const questions = test.questions.map((q) => ({ id: q.id, type: q.type, question: q.question, options: q.options, score: q.score, order: q.order }));
        return { ...test, questions };
      }
      return test;
    }
    return prisma.liveClass.findUnique({ where: { id: ctx.id }, include: { teacher: true } });
  },

  async create(ctx) {
    const kind = (str(ctx.body.kind) ?? "note") as string;
    const role = ctx.session.user.role;
    can(ctx, "learning:manage");
    await assertKindSubfeature(ctx, kind);
    const schoolId = ctx.session.user.schoolId;
    // OWNER/ADMIN users author content on behalf of the subject's assigned
    // teacher; regular teachers author only for their own class-subjects.
    const teacher = role === "TEACHER" ? ctx.session.user.teacher! : await ensureTeacher(ctx);
    const classSubjectId = str(ctx.body.classSubjectId);
    if (!classSubjectId) throw new Error("classSubjectId required");
    const classSubject = await prisma.classSubject.findFirst({
      where: { id: classSubjectId, schoolId, ...(role === "TEACHER" ? { teacherId: teacher.id } : {}) },
      include: { classGroup: { include: { level: true } } },
    });
    if (!classSubject) throw new Error("You can only add content to your own subjects");
    const ownerTeacherId = role === "TEACHER" ? teacher.id : classSubject.teacherId;
    const common = { schoolId, classSubjectId, teacherId: ownerTeacherId, termId: str(ctx.body.termId) };

    if (kind === "note") {
      const note = await prisma.lessonNote.create({
        data: {
          ...common,
          topic: str(ctx.body.topic) ?? "Untitled",
          content: str(ctx.body.content) ?? "",
          week: num(ctx.body.week),
          attachments: ctx.body.attachments ? ctx.body.attachments : undefined,
        },
      });
      return note;
    }

    if (kind === "assignment") {
      const assignment = await prisma.assignment.create({
        data: {
          ...common,
          title: str(ctx.body.title) ?? "Untitled assignment",
          instructions: str(ctx.body.instructions) ?? "",
          dueAt: str(ctx.body.dueAt) ? new Date(String(ctx.body.dueAt)) : undefined,
          maxScore: num(ctx.body.maxScore) ?? 100,
          isPublished: ctx.body.isPublished === true || ctx.body.isPublished === "true",
          targetStudentIds: idArray(ctx.body.targetStudentIds),
        },
      });
      const targetedStudentIds = idArray(ctx.body.targetStudentIds);
      const students = targetedStudentIds.length
        ? await prisma.student.findMany({ where: { id: { in: targetedStudentIds } }, select: { id: true } })
        : await prisma.student.findMany({ where: { currentClassGroupId: classSubject.classGroupId }, select: { id: true } });
      const parentUserIds =
        (await prisma.studentParent
          .findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { parentId: true } })
          .then((rows) => prisma.parent.findMany({ where: { id: { in: rows.map((r) => r.parentId) } }, select: { userId: true } }).then((ps) => ps.map((p) => p.userId)))) ?? [];
      const scopeLabel = targetedStudentIds.length ? `${students.length} student(s)` : `the ${classSubject.classGroup?.level.name ?? ""} ${classSubject.classGroup?.name ?? "class"}`;
      await dispatchToMany(parentUserIds, { schoolId, type: "assignment", title: `New assignment: ${assignment.title}`, body: `A new assignment has been posted for ${scopeLabel}. Submit before the due date.`, link: "/portal/learning?kind=assignments" });
      return assignment;
    }

    if (kind === "test") {
      const questions = Array.isArray(ctx.body.questions) ? (ctx.body.questions as Array<Record<string, unknown>>) : [];
      if (questions.length === 0) throw new Error("At least one question is required");
      const isExam = ctx.body.isExam === true || ctx.body.isExam === "true";
      // Exams are created by teachers but published only by the owner/admin.
      const role = ctx.session.user.role;
      const canPublish = role === "OWNER" || role === "ADMIN" || !isExam;
      const test = await prisma.test.create({
        data: {
          ...common,
          title: str(ctx.body.title) ?? "Untitled test",
          description: str(ctx.body.description),
          instruction: str(ctx.body.instruction),
          passMark: num(ctx.body.passMark),
          targetStudentIds: idArray(ctx.body.targetStudentIds),
          startsAt: str(ctx.body.startsAt) ? new Date(String(ctx.body.startsAt)) : undefined,
          endsAt: str(ctx.body.endsAt) ? new Date(String(ctx.body.endsAt)) : undefined,
          durationMinutes: num(ctx.body.durationMinutes) ?? 30,
          isAutoGraded: true,
          isExam,
          shuffleQuestions: ctx.body.shuffleQuestions === true,
          status: ctx.body.status === "PUBLISHED" && canPublish ? "PUBLISHED" : "DRAFT",
          questions: {
            create: questions.map((q, i) => ({
              type: (str(q.type) as "MULTIPLE_CHOICE" | "TRUE_FALSE") ?? "MULTIPLE_CHOICE",
              question: str(q.question) ?? "",
              options: Array.isArray(q.options) ? q.options : [],
              correctIndex: num(q.correctIndex) ?? 0,
              score: num(q.score) ?? 1,
              order: i,
            })),
          },
        },
      });
      return test;
    }

    if (kind === "live") {
      const scheduledAt = str(ctx.body.scheduledAt) ? new Date(String(ctx.body.scheduledAt)) : undefined;
      if (!scheduledAt) throw new Error("scheduledAt required");
      const joinLink = jitsiRoomLink("duga", str(ctx.body.title) ?? "live");
      const live = await prisma.liveClass.create({
        data: {
          ...common,
          title: str(ctx.body.title) ?? "Live class",
          description: str(ctx.body.description),
          scheduledAt,
          durationMinutes: num(ctx.body.durationMinutes) ?? 45,
          provider: "JITSI",
          roomName: joinLink.split("/").pop() ?? "",
          joinLink,
          status: "SCHEDULED",
        },
      });
      return live;
    }

    throw new Error("Unknown kind");
  },

  async update(ctx) {
    const kind = (ctx.query.get("kind") ?? "note") as string;
    can(ctx, "learning:manage");
    await assertKindSubfeature(ctx, kind);
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const teacher = ctx.session.user.teacher;
    const teacherFilter = role === "TEACHER" && teacher ? { teacherId: teacher.id } : {};
    if (kind === "notes") {
      const item = await prisma.lessonNote.findFirst({ where: { id: ctx.id, schoolId, ...teacherFilter } });
      if (!item) throw new Error("Note not found");
      return prisma.lessonNote.update({ where: { id: ctx.id }, data: pick(ctx.body, ["topic", "content", "week"]) });
    }
    if (kind === "assignments") {
      const item = await prisma.assignment.findFirst({ where: { id: ctx.id, schoolId, ...teacherFilter } });
      if (!item) throw new Error("Assignment not found");
      return prisma.assignment.update({ where: { id: ctx.id }, data: pick(ctx.body, ["title", "instructions", "dueAt", "isPublished", "maxScore", "targetStudentIds"]) });
    }
    if (kind === "tests") {
      const test = await prisma.test.findFirst({ where: { id: ctx.id, schoolId, ...teacherFilter } });
      if (!test) throw new Error("Test not found");
      if (test?.isExam && role !== "OWNER" && role !== "ADMIN") {
        // Exams can only be published (status -> PUBLISHED) by the owner/admin.
        return prisma.test.update({
          where: { id: ctx.id },
          data: pick(ctx.body, ["title", "description", "instruction", "passMark", "startsAt", "endsAt", "durationMinutes", "shuffleQuestions", "showResults", "targetStudentIds"]),
        });
      }
      return prisma.test.update({ where: { id: ctx.id }, data: pick(ctx.body, ["title", "description", "instruction", "passMark", "startsAt", "endsAt", "durationMinutes", "status", "shuffleQuestions", "showResults", "targetStudentIds"]) });
    }
    throw new Error("Update not supported for this kind");
  },

  actions: {
    // Teacher publishes an assignment (notify targets) — also used to re-share.
    publishAssignment: async (ctx) => {
      can(ctx, "learning:manage");
      await assertSubfeature(ctx, "learning:assignments");
      const schoolId = ctx.session.user.schoolId;
      const teacher = ctx.session.user.teacher!;
      const assignment = await prisma.assignment.findFirst({ where: { id: ctx.id, schoolId, teacherId: teacher.id } });
      if (!assignment) throw new Error("Assignment not found");
      await prisma.assignment.update({ where: { id: ctx.id }, data: { isPublished: true } });
      const classSubject = await prisma.classSubject.findUnique({ where: { id: assignment.classSubjectId }, include: { classGroup: true } });
      const targeted = idArray(assignment.targetStudentIds);
      const stds = targeted.length
        ? await prisma.student.findMany({ where: { id: { in: targeted }, status: "ACTIVE" }, select: { userId: true } })
        : await prisma.student.findMany({ where: { currentClassGroupId: classSubject?.classGroupId, status: "ACTIVE" }, select: { userId: true } });
      await dispatchToMany(stds.map((s) => s.userId), { schoolId, type: "assignment", title: `New assignment: ${assignment.title}`, body: `Submit before ${assignment.dueAt ? new Date(assignment.dueAt).toLocaleString() : "the due date"}.`, link: "/portal/learning?kind=assignments" });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "assignment.published", entityType: "Assignment", entityId: ctx.id });
      return { ok: true };
    },

    // Publish a test/CBT to its targets. Regular tests can be published by the
    // owning teacher; official exams (isExam) only by the owner/admin.
    publishTest: async (ctx) => {
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.session.user.role;
      await assertSubfeature(ctx, "learning:cbt");
      const teacher = ctx.session.user.teacher;
      if (role !== "OWNER" && role !== "ADMIN") {
        can(ctx, "learning:manage");
        if (!teacher) throw new Error("Test not found");
      }
      const test = await prisma.test.findFirst({
        where: { id: ctx.id, schoolId, ...(role === "OWNER" || role === "ADMIN" ? {} : { teacherId: teacher!.id }) },
      });
      if (!test) throw new Error("Test not found");
      if (test.isExam && role !== "OWNER" && role !== "ADMIN") {
        const err = new Error("Only the school owner or admin can publish exams") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
      await prisma.test.update({ where: { id: ctx.id }, data: { status: "PUBLISHED" } });
      const targeted = idArray(test.targetStudentIds);
      const classSubject = await prisma.classSubject.findUnique({ where: { id: test.classSubjectId }, include: { classGroup: true } });
      const students = targeted.length
        ? await prisma.student.findMany({ where: { id: { in: targeted }, status: "ACTIVE" }, select: { userId: true } })
        : await prisma.student.findMany({ where: { currentClassGroupId: classSubject?.classGroupId, status: "ACTIVE" }, select: { userId: true } });
      await dispatchToMany(students.map((s) => s.userId), { schoolId, type: "test", title: `CBT available: ${test.title}`, body: "A CBT exam has been assigned to you. Complete it before it closes.", link: "/portal/learning?kind=tests" });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "test.published", entityType: "Test", entityId: ctx.id });
      return { ok: true };
    },

    // Teacher views all attempts/results for a CBT (or answers per attempt).
    testResults: async (ctx) => {
      can(ctx, "learning:grade");
      await assertSubfeature(ctx, "learning:cbt");
      const schoolId = ctx.session.user.schoolId;
      const teacher = ctx.session.user.teacher!;
      const test = await prisma.test.findFirst({ where: { id: ctx.id, schoolId, teacherId: teacher.id } });
      if (!test) throw new Error("Test not found");
      const attempts = await prisma.testAttempt.findMany({
        where: { testId: test.id },
        include: { student: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
        orderBy: { submittedAt: "asc" },
      });
      const passMark = test.passMark ?? 0;
      return {
        test,
        attempts: attempts.map((a) => ({
          id: a.id,
          studentId: a.studentId,
          studentName: `${a.student.user.firstName} ${a.student.user.lastName}`,
          email: a.student.user.email,
          score: a.score ?? 0,
          maxScore: a.maxScore ?? 0,
          percentage: a.percentage ?? 0,
          passed: (a.percentage ?? 0) >= passMark,
          submittedAt: a.submittedAt,
        })),
      };
    },

    // Share test results with all students who attempted it.
    shareResults: async (ctx) => {
      can(ctx, "learning:grade");
      await assertSubfeature(ctx, "learning:cbt");
      const schoolId = ctx.session.user.schoolId;
      const teacher = ctx.session.user.teacher!;
      const test = await prisma.test.findFirst({ where: { id: ctx.id, schoolId, teacherId: teacher.id } });
      if (!test) throw new Error("Test not found");
      await prisma.test.update({ where: { id: ctx.id }, data: { showResults: true } });
      const attempts = await prisma.testAttempt.findMany({
        where: { testId: test.id },
        include: { student: { select: { userId: true } } },
      });
      await dispatchToMany(
        attempts.map((a) => a.student.userId),
        { schoolId, type: "result", title: `Test result ready: ${test.title}`, body: "Your CBT result has been shared. Check your learning page.", link: "/portal/learning?kind=tests" },
      );
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "test.shareResults", entityType: "Test", entityId: ctx.id, meta: { count: attempts.length } });
      return { ok: true };
    },
    // Student submits an assignment
    submitAssignment: async (ctx) => {
      can(ctx, "assignments:submit");
      await assertSubfeature(ctx, "learning:assignments");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can submit assignments");
      assertFeeAccess(student);
      const submission = await prisma.assignmentSubmission.upsert({
        where: { assignmentId_studentId: { assignmentId: ctx.id!, studentId: student.id } },
        update: { content: str(ctx.body.content), attachments: ctx.body.attachments ? ctx.body.attachments : undefined, submittedAt: new Date() },
        create: {
          schoolId: ctx.session.user.schoolId,
          assignmentId: ctx.id!,
          studentId: student.id,
          content: str(ctx.body.content),
          attachments: ctx.body.attachments ? ctx.body.attachments : undefined,
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "assignment.submitted", entityType: "AssignmentSubmission", entityId: submission.id });
      return submission;
    },

    // Teacher grades a submission
    gradeAssignment: async (ctx) => {
      can(ctx, "learning:grade");
      await assertSubfeature(ctx, "learning:assignments");
      const score = num(ctx.body.score);
      if (score === undefined) throw new Error("score required");
      const submission = await prisma.assignmentSubmission.update({
        where: { id: ctx.id },
        data: { score, feedback: str(ctx.body.feedback), gradedAt: new Date(), gradedByTeacherId: ctx.session.user.teacher!.id },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "assignment.graded", entityType: "AssignmentSubmission", entityId: ctx.id, meta: { score } });
      const student = await prisma.student.findUnique({ where: { id: submission.studentId }, include: { user: true } });
      if (student) {
        await dispatchNotification({ schoolId: ctx.session.user.schoolId, userId: student.userId, type: "grade", title: "Assignment graded", body: `Your assignment scored ${score}.`, link: "/portal/learning?kind=assignments" });
      }
      return submission;
    },

    // Student submits a test; auto-graded (CBT-style)
    submitTest: async (ctx) => {
      can(ctx, "tests:take");
      await assertSubfeature(ctx, "learning:cbt");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can take tests");
      assertFeeAccess(student);
      const test = await prisma.test.findUnique({ where: { id: ctx.id }, include: { questions: true } });
      if (!test) throw new Error("Test not found");
      if (test.startsAt && new Date() < test.startsAt) throw new Error("This test has not started yet");
      if (test.endsAt && new Date() > test.endsAt) throw new Error("This test has closed");

      const answers = Array.isArray(ctx.body.answers) ? (ctx.body.answers as Array<{ questionId: string; selectedIndex: number }>) : [];
      const questionMap = new Map(test.questions.map((q) => [q.id, q]));
      let score = 0;
      let maxScore = 0;
      const graded = answers.map((a) => {
        const q = questionMap.get(a.questionId);
        if (!q) return null;
        maxScore += q.score;
        const isCorrect = a.selectedIndex === q.correctIndex;
        if (isCorrect) score += q.score;
        return { questionId: q.id, selectedIndex: a.selectedIndex, isCorrect, scoreAwarded: isCorrect ? q.score : 0 };
      });
      for (const q of test.questions) {
        if (!answers.some((a) => a.questionId === q.id)) {
          maxScore += q.score;
          graded.push({ questionId: q.id, selectedIndex: -1, isCorrect: false, scoreAwarded: 0 });
        }
      }
      const percentage = maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0;

      const attempt = await prisma.testAttempt.upsert({
        where: { testId_studentId: { testId: test.id, studentId: student.id } },
        update: {
          submittedAt: new Date(),
          score,
          maxScore,
          percentage,
          isGraded: true,
          isSubmitted: true,
          classGroupId: student.currentClassGroupId,
          answers: {
            deleteMany: {},
            create: graded.filter(Boolean).map((g) => ({ questionId: g!.questionId, selectedIndex: g!.selectedIndex, isCorrect: g!.isCorrect, scoreAwarded: g!.scoreAwarded })),
          },
        },
        create: {
          schoolId: ctx.session.user.schoolId,
          testId: test.id,
          studentId: student.id,
          classGroupId: student.currentClassGroupId,
          submittedAt: new Date(),
          score,
          maxScore,
          percentage,
          isGraded: true,
          isSubmitted: true,
          answers: { create: graded.filter(Boolean).map((g) => ({ questionId: g!.questionId, selectedIndex: g!.selectedIndex, isCorrect: g!.isCorrect, scoreAwarded: g!.scoreAwarded })) },
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "test.submitted", entityType: "TestAttempt", entityId: attempt.id, meta: { score, percentage } });
      return { attemptId: attempt.id, score, maxScore, percentage };
    },

    // Live class control
    startLive: async (ctx) => {
      can(ctx, "live:schedule");
      await assertSubfeature(ctx, "learning:live");
      const schoolId = ctx.session.user.schoolId;
      const live = await prisma.liveClass.findFirst({ where: { id: ctx.id, schoolId } });
      if (!live) throw new Error("Live class not found");
      return prisma.liveClass.update({ where: { id: ctx.id }, data: { status: "LIVE" } });
    },
    endLive: async (ctx) => {
      can(ctx, "live:schedule");
      await assertSubfeature(ctx, "learning:live");
      const schoolId = ctx.session.user.schoolId;
      const live = await prisma.liveClass.findFirst({ where: { id: ctx.id, schoolId } });
      if (!live) throw new Error("Live class not found");
      return prisma.liveClass.update({ where: { id: ctx.id }, data: { status: "ENDED" } });
    },
    joinLive: async (ctx) => {
      can(ctx, "live:join");
      await assertSubfeature(ctx, "learning:live");
      const student = ctx.session.user.student;
      if (student) assertFeeAccess(student);
      const live = await prisma.liveClass.findUnique({ where: { id: ctx.id } });
      if (!live) throw new Error("Live class not found");
      if (student) {
        await prisma.liveClassAttendance.upsert({
          where: { liveClassId_studentId: { liveClassId: live.id, studentId: student.id } },
          update: {},
          create: { liveClassId: live.id, studentId: student.id, isPresent: true },
        });
      }
      return live;
    },
  },
};
