import { prisma } from "@duga/core/server";
import { jitsiRoomLink, logAudit, dispatchNotification, dispatchToMany, checkRateLimit } from "@duga/core/server";
import type { Module } from ".";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { can, str, num, pick, idArray, isAssignedTo, ensureTeacher, assertFeeAccess } from "../helpers";
import { assertSubfeature } from "../features";
import { assessmentWindowOpen } from "./calendar";
import { generate } from "./ai";

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

// Parents may view lesson notes and (read-only) assignments to track their
// child's work, but must never reach CBT tests or live interactive classes —
// those stay student-only per the RBAC spec, enforced here rather than only
// hiding the tab client-side.
function assertParentCannotAccess(ctx: Ctx, kind: string): void {
  if (ctx.session.user.role === "PARENT" && (kind === "tests" || kind === "live")) {
    const err = new Error("Parents cannot access tests or live classes") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
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

async function viewerStudents(ctx: Ctx) {
  const student = ctx.session.user.student;
  if (student) return [{ id: student.id, classGroupId: student.currentClassGroupId }];
  if (ctx.session.user.role !== "PARENT") return [];
  return prisma.studentParent.findMany({
    where: { parentId: ctx.session.user.parent!.id },
    select: { student: { select: { id: true, currentClassGroupId: true } } },
  }).then((links) => links.map((link) => ({ id: link.student.id, classGroupId: link.student.currentClassGroupId })));
}

function isVisibleToViewer(item: { targetClassGroupIds?: unknown; targetStudentIds?: unknown }, students: Array<{ id: string; classGroupId: string | null }>) {
  return students.some((student) => isAssignedTo(item, student.id, student.classGroupId));
}

async function targetStudentsForClass(schoolId: string, classGroupId: string, targetStudentIds: string[]) {
  const students = await prisma.student.findMany({
    where: targetStudentIds.length
      ? { schoolId, id: { in: targetStudentIds }, currentClassGroupId: classGroupId, status: "ACTIVE" }
      : { schoolId, currentClassGroupId: classGroupId, status: "ACTIVE" },
    select: { id: true, userId: true },
  });
  if (targetStudentIds.length && students.length !== new Set(targetStudentIds).size) {
    throw new Error("Every selected student must be active and belong to the selected class");
  }
  return students;
}

// Parses the "Q1: ...\nA1: ...\nQ2: ...\nA2: ..." shape asked for in
// selfCheck's prompt below — tolerant of the model adding blank lines or
// extra prose between pairs, same spirit as paperExam.ts's line parsers.
// Accumulates any wrapped continuation lines into the current question/
// answer rather than dropping them, since a free-form model reply isn't
// guaranteed to keep each one on a single line.
function parseSelfCheckQuestions(reply: string): Array<{ question: string; modelAnswer: string }> {
  const lines = reply.split(/\n/).map((l) => l.trim());
  const questions: Array<{ question: string; modelAnswer: string }> = [];
  let question: string | null = null;
  let answer: string[] | null = null;

  function flush() {
    if (question && answer && answer.join(" ").trim()) {
      questions.push({ question, modelAnswer: answer.join(" ").trim() });
    }
    question = null;
    answer = null;
  }

  for (const line of lines) {
    const qm = line.match(/^Q\d*\s*:\s*(.+)$/i);
    if (qm) {
      flush();
      question = qm[1]!.trim();
      continue;
    }
    const am = line.match(/^A\d*\s*:\s*(.+)$/i);
    if (am && question) {
      answer = [am[1]!.trim()];
      continue;
    }
    // A continuation line — only meaningful once we're mid-answer.
    if (line && answer) answer.push(line);
  }
  flush();
  return questions;
}

// pick() passes a date field through exactly as the client sent it — a
// datetime-local input's raw value ("2026-09-16T11:27", no seconds or
// timezone) fails Prisma's strict ISO-8601 DateTime validation unconverted,
// same as any other free-form date string a client might send. Converts to
// a real Date (or null to clear the field, or undefined to leave it alone
// if the key wasn't present at all).
function dateOrNull(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const includeBase = {
  classSubject: { include: { subject: true, classGroup: { include: { level: true } }, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } } },
};

export const learningModule: Module = {
  async list(ctx) {
    const kind = (ctx.query.get("kind") ?? "notes") as Kind;
    can(ctx, "learning:view");
    assertParentCannotAccess(ctx, kind);
    await assertKindSubfeature(ctx, kind);
    const ids = await visibleClassSubjectIds(ctx);
    const where = { classSubjectId: { in: ids }, schoolId: ctx.session.user.schoolId };

    if (kind === "notes") {
      // A student/parent only ever sees a published note — the teacher
      // (or admin/owner) sees drafts too, so they can review/illustrate one
      // before publishing it.
      const consumers = await viewerStudents(ctx);
      const isConsumer = consumers.length > 0 || ctx.session.user.role === "PARENT";
      const notes = await prisma.lessonNote.findMany({
        where: { ...where, ...(isConsumer ? { isPublished: true } : {}) },
        include: includeBase,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return { kind, items: notes };
    }
    if (kind === "assignments") {
      const teacher = ctx.session.user.teacher;
      const consumers = await viewerStudents(ctx);
      const assignmentsRes = await prisma.assignment.findMany({
        where: { ...where, ...(consumers.length || ctx.session.user.role === "PARENT" ? { isPublished: true } : {}) },
        include: {
          ...includeBase,
          submissions: teacher ? { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } } : { select: { id: true, studentId: true, submittedAt: true, score: true } },
          _count: { select: { submissions: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      const filtered =
        consumers.length || ctx.session.user.role === "PARENT"
          ? assignmentsRes.filter((a) => isVisibleToViewer(a, consumers))
          : assignmentsRes;
      return { kind, items: filtered };
    }
    if (kind === "tests") {
      const consumers = await viewerStudents(ctx);
      const testsRes = await prisma.test.findMany({
        where: { ...where, ...(consumers.length || ctx.session.user.role === "PARENT" ? { status: "PUBLISHED" } : {}) },
        include: {
          ...includeBase,
          _count: { select: { questions: true, attempts: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      const items = consumers.length || ctx.session.user.role === "PARENT" ? testsRes.filter((t) => isVisibleToViewer(t, consumers)) : testsRes;
      return { kind, items };
    }
    const consumer = ctx.session.user.role === "STUDENT" || ctx.session.user.role === "PARENT";
    const live = await prisma.liveClass.findMany({
      where: { schoolId: ctx.session.user.schoolId, ...(consumer || ctx.session.user.teacher ? { classSubjectId: { in: ids } } : {}) },
      include: { teacher: { include: { user: { select: { firstName: true, lastName: true } } } }, classSubject: { include: { subject: true } } },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    });
    return { kind, items: live };
  },

  async get(ctx) {
    const kind = (ctx.query.get("kind") ?? "notes") as Kind;
    can(ctx, "learning:view");
    assertParentCannotAccess(ctx, kind);
    await assertKindSubfeature(ctx, kind);
    const schoolId = ctx.session.user.schoolId;
    const ids = await visibleClassSubjectIds(ctx);
    const consumers = await viewerStudents(ctx);
    const consumer = consumers.length > 0 || ctx.session.user.role === "PARENT";
    if (kind === "notes") {
      const note = await prisma.lessonNote.findFirst({ where: { id: ctx.id, schoolId, classSubjectId: { in: ids } }, include: includeBase });
      if (!note || (consumer && !note.isPublished)) throw new Error("Lesson note not found");
      return note;
    }
    if (kind === "assignments") {
      const assignment = await prisma.assignment.findFirst({
        where: { id: ctx.id, schoolId, classSubjectId: { in: ids } },
        include: {
          ...includeBase,
          submissions: consumer
            ? { where: { studentId: { in: consumers.map((student) => student.id) } }, include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } }
            : { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } },
        },
      });
      if (!assignment || (consumer && (!assignment.isPublished || !isVisibleToViewer(assignment, consumers)))) throw new Error("Assignment not found");
      return assignment;
    }
    if (kind === "tests") {
      const test = await prisma.test.findFirst({ where: { id: ctx.id, schoolId, classSubjectId: { in: ids } }, include: { ...includeBase, questions: { orderBy: { order: "asc" } } } });
      if (!test || (consumer && (test.status !== "PUBLISHED" || !isVisibleToViewer(test, consumers)))) throw new Error("Test not found");
      // Students/parents must never see the correct answers.
      const role = ctx.session.user.role;
      if (role === "STUDENT" || role === "PARENT") {
        const questions = test.questions.map((q) => ({ id: q.id, type: q.type, question: q.question, options: q.options, score: q.score, order: q.order }));
        return { ...test, questions };
      }
      return test;
    }
    const live = await prisma.liveClass.findFirst({ where: { id: ctx.id, schoolId, ...(consumer || ctx.session.user.teacher ? { classSubjectId: { in: ids } } : {}) }, include: { teacher: true } });
    if (!live) throw new Error("Live class not found");
    return live;
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
    const ownerTeacherId = (role === "TEACHER" ? teacher.id : classSubject.teacherId) ?? teacher.id;
    const common = { schoolId, classSubjectId, teacherId: ownerTeacherId, termId: str(ctx.body.termId) };

    if (kind === "note") {
      const note = await prisma.lessonNote.create({
        data: {
          ...common,
          topic: str(ctx.body.topic) ?? "Untitled",
          content: str(ctx.body.content) ?? "",
          week: num(ctx.body.week),
          attachments: ctx.body.attachments ? ctx.body.attachments : undefined,
          // Explicit opt-in only — omitting this keeps the column's own
          // default (true), so any caller that doesn't know about drafts
          // (an older client, a script) still gets today's always-visible
          // behavior. The teacher-facing editor always sends this.
          isPublished: typeof ctx.body.isPublished === "boolean" ? ctx.body.isPublished : undefined,
        },
      });
      return note;
    }

    if (kind === "assignment") {
      const targetStudentIds = idArray(ctx.body.targetStudentIds);
      const students = await targetStudentsForClass(schoolId, classSubject.classGroupId, targetStudentIds);
      const assignment = await prisma.assignment.create({
        data: {
          ...common,
          title: str(ctx.body.title) ?? "Untitled assignment",
          instructions: str(ctx.body.instructions) ?? "",
          dueAt: str(ctx.body.dueAt) ? new Date(String(ctx.body.dueAt)) : undefined,
          maxScore: num(ctx.body.maxScore) ?? 100,
          isPublished: ctx.body.isPublished === true || ctx.body.isPublished === "true",
          targetStudentIds,
        },
      });
      if (assignment.isPublished) {
        const parentLinks = await prisma.studentParent.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { parent: { select: { userId: true } } } });
        const scopeLabel = targetStudentIds.length ? `${students.length} student(s)` : `the ${classSubject.classGroup.level.name} ${classSubject.classGroup.name}`;
        await dispatchToMany([...students.map((s) => s.userId), ...parentLinks.map((link) => link.parent.userId)], { schoolId, type: "assignment", title: `New assignment: ${assignment.title}`, body: `A new assignment has been posted for ${scopeLabel}. Submit before the due date.`, link: "/portal/learning?kind=assignments" });
      }
      return assignment;
    }

    if (kind === "test") {
      const questions = Array.isArray(ctx.body.questions) ? (ctx.body.questions as Array<Record<string, unknown>>) : [];
      if (questions.length === 0) throw new Error("At least one question is required");
      const isExam = ctx.body.isExam === true || ctx.body.isExam === "true";
      const targetStudentIds = idArray(ctx.body.targetStudentIds);
      await targetStudentsForClass(schoolId, classSubject.classGroupId, targetStudentIds);
      // Teacher-created CBTs are submitted as drafts for owner/admin approval.
      const canPublish = role === "OWNER" || role === "ADMIN";
      const test = await prisma.test.create({
        data: {
          ...common,
          title: str(ctx.body.title) ?? "Untitled test",
          description: str(ctx.body.description),
          instruction: str(ctx.body.instruction),
          passMark: num(ctx.body.passMark),
          targetStudentIds,
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
      if (role === "TEACHER") {
        const approvers = await prisma.user.findMany({ where: { schoolId, role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
        await dispatchToMany(approvers.map((user) => user.id), { schoolId, type: "test", title: "CBT awaiting publication", body: `${ctx.session.user.firstName} ${ctx.session.user.lastName} created “${test.title}” for review.`, link: "/portal/learning?kind=tests" });
      }
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
      return prisma.lessonNote.update({ where: { id: ctx.id }, data: pick(ctx.body, ["topic", "content", "week", "attachments", "isPublished"]) });
    }
    if (kind === "assignments") {
      const item = await prisma.assignment.findFirst({ where: { id: ctx.id, schoolId, ...teacherFilter } });
      if (!item) throw new Error("Assignment not found");
      const data = pick(ctx.body, ["title", "instructions", "dueAt", "isPublished", "maxScore", "targetStudentIds"]);
      // The edit form sends maxScore as a string like every other text
      // input — maxScore is an Int column, so Prisma rejects it unconverted.
      if (data.maxScore !== undefined) data.maxScore = num(data.maxScore) ?? item.maxScore;
      if (data.dueAt !== undefined) data.dueAt = dateOrNull(data.dueAt);
      return prisma.assignment.update({ where: { id: ctx.id }, data });
    }
    if (kind === "tests") {
      const test = await prisma.test.findFirst({ where: { id: ctx.id, schoolId, ...teacherFilter } });
      if (!test) throw new Error("Test not found");
      if (test?.isExam && role !== "OWNER" && role !== "ADMIN") {
        // Exams can only be published (status -> PUBLISHED) by the owner/admin.
        const examData = pick(ctx.body, ["title", "description", "instruction", "passMark", "startsAt", "endsAt", "durationMinutes", "shuffleQuestions", "showResults", "targetStudentIds"]);
        if (examData.startsAt !== undefined) examData.startsAt = dateOrNull(examData.startsAt);
        if (examData.endsAt !== undefined) examData.endsAt = dateOrNull(examData.endsAt);
        return prisma.test.update({ where: { id: ctx.id }, data: examData });
      }
      const data = pick(ctx.body, ["title", "description", "instruction", "passMark", "startsAt", "endsAt", "durationMinutes", "status", "shuffleQuestions", "showResults", "targetStudentIds"]);
      if (data.startsAt !== undefined) data.startsAt = dateOrNull(data.startsAt);
      if (data.endsAt !== undefined) data.endsAt = dateOrNull(data.endsAt);
      return prisma.test.update({ where: { id: ctx.id }, data });
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

    // Owner/admin publishes a teacher-submitted CBT to the target class/students.
    publishTest: async (ctx) => {
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.session.user.role;
      await assertSubfeature(ctx, "learning:cbt");
      if (role !== "OWNER" && role !== "ADMIN") throw new Error("Only the school owner or admin can publish CBT exams");
      const test = await prisma.test.findFirst({
        where: { id: ctx.id, schoolId },
      });
      if (!test) throw new Error("Test not found");
      await prisma.test.update({ where: { id: ctx.id }, data: { status: "PUBLISHED" } });
      const targeted = idArray(test.targetStudentIds);
      const classSubject = await prisma.classSubject.findUnique({ where: { id: test.classSubjectId }, include: { classGroup: true } });
      const students = targeted.length
        ? await prisma.student.findMany({ where: { schoolId, id: { in: targeted }, status: "ACTIVE" }, select: { id: true, userId: true } })
        : await prisma.student.findMany({ where: { schoolId, currentClassGroupId: classSubject?.classGroupId, status: "ACTIVE" }, select: { id: true, userId: true } });
      const parentLinks = await prisma.studentParent.findMany({ where: { studentId: { in: students.map((student) => student.id) } }, select: { parent: { select: { userId: true } } } });
      await dispatchToMany([...students.map((student) => student.userId), ...parentLinks.map((link) => link.parent.userId)], { schoolId, type: "test", title: `CBT available: ${test.title}`, body: "A CBT exam has been assigned. Complete it before it closes.", link: "/portal/learning?kind=tests" });
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
      await assertFeeAccess(ctx.session.user.schoolId, student, "assignments");
      const assignment = await prisma.assignment.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId, isPublished: true }, include: { classSubject: true } });
      if (!assignment || !isAssignedTo(assignment, student.id, student.currentClassGroupId)) throw new Error("Assignment not found");
      const windowOpen = await assessmentWindowOpen(ctx.session.user.schoolId, "ASSIGNMENT", { classSubjectId: assignment.classSubjectId, section: student.section });
      if (!windowOpen) throw new Error("The submission window for this assignment has closed.");
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
      const teacher = ctx.session.user.teacher;
      if (!teacher) throw new Error("Only teachers can grade assignments");
      const existing = await prisma.assignmentSubmission.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId, assignment: { teacherId: teacher.id } }, include: { assignment: true } });
      if (!existing) throw new Error("Submission not found");
      if (score < 0 || score > existing.assignment.maxScore) throw new Error(`Score must be between 0 and ${existing.assignment.maxScore}`);
      const submission = await prisma.assignmentSubmission.update({
        where: { id: ctx.id },
        data: { score, feedback: str(ctx.body.feedback), gradedAt: new Date(), gradedByTeacherId: teacher.id },
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
      // Generous enough to cover the client's own retry-with-backoff on a
      // transient failure, tight enough to block scripted abuse.
      const rl = checkRateLimit(`submitTest:${student.id}`, 10, 60_000);
      if (!rl.allowed) {
        const err = new Error("Too many submission attempts. Please wait a moment and try again.") as Error & { status?: number };
        err.status = 429;
        throw err;
      }
      await assertFeeAccess(ctx.session.user.schoolId, student, "tests");
      const test = await prisma.test.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId, status: "PUBLISHED" }, include: { questions: true } });
      if (!test || !isAssignedTo(test, student.id, student.currentClassGroupId)) throw new Error("Test not found");
      if (test.startsAt && new Date() < test.startsAt) throw new Error("This test has not started yet");
      if (test.endsAt && new Date() > test.endsAt) throw new Error("This test has closed");
      const windowOpen = await assessmentWindowOpen(ctx.session.user.schoolId, "CBT", { classSubjectId: test.classSubjectId, section: student.section });
      if (!windowOpen) throw new Error("The exam window for this test has closed.");

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
      if (student) await assertFeeAccess(ctx.session.user.schoolId, student, "live");
      const live = await prisma.liveClass.findFirst({
        where: {
          id: ctx.id,
          schoolId: ctx.session.user.schoolId,
          ...(student ? { classSubject: { classGroupId: student.currentClassGroupId ?? "none" } } : {}),
        },
      });
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

    // ---- Deletion (owner/admin or owning teacher) -----------------------
    deleteNote: async (ctx) => {
      can(ctx, "learning:manage");
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.session.user.role;
      const teacher = ctx.session.user.teacher;
      const teacherFilter = role === "TEACHER" && teacher ? { teacherId: teacher.id } : {};
      const note = await prisma.lessonNote.findFirst({ where: { id: ctx.id, schoolId, ...teacherFilter } });
      if (!note) throw new Error("Note not found");
      await prisma.lessonNote.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "note.deleted", entityType: "LessonNote", entityId: ctx.id });
      return { ok: true };
    },

    deleteAssignment: async (ctx) => {
      can(ctx, "learning:manage");
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.session.user.role;
      const teacher = ctx.session.user.teacher;
      const teacherFilter = role === "TEACHER" && teacher ? { teacherId: teacher.id } : {};
      const assignment = await prisma.assignment.findFirst({ where: { id: ctx.id, schoolId, ...teacherFilter } });
      if (!assignment) throw new Error("Assignment not found");
      await prisma.assignment.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "assignment.deleted", entityType: "Assignment", entityId: ctx.id });
      return { ok: true };
    },

    deleteTest: async (ctx) => {
      can(ctx, "learning:manage");
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.session.user.role;
      const teacher = ctx.session.user.teacher;
      const teacherFilter = role === "TEACHER" && teacher ? { teacherId: teacher.id } : {};
      const test = await prisma.test.findFirst({ where: { id: ctx.id, schoolId, ...teacherFilter } });
      if (!test) throw new Error("Test not found");
      await prisma.test.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "test.deleted", entityType: "Test", entityId: ctx.id });
      return { ok: true };
    },

    deleteLive: async (ctx) => {
      can(ctx, "live:schedule");
      const schoolId = ctx.session.user.schoolId;
      const live = await prisma.liveClass.findFirst({ where: { id: ctx.id, schoolId } });
      if (!live) throw new Error("Live class not found");
      await prisma.liveClass.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "live.deleted", entityType: "LiveClass", entityId: ctx.id });
      return { ok: true };
    },

    // ---- Self-check questions (student-facing study aid) ----------------
    // Deliberately ephemeral: generated fresh from the note's own content
    // each time, never persisted — this is a study aid a student can revisit
    // for a new set of questions, not a graded record of what they answered.
    selfCheck: async (ctx) => {
      can(ctx, "learning:view");
      const schoolId = ctx.session.user.schoolId;
      const ids = await visibleClassSubjectIds(ctx);
      const consumers = await viewerStudents(ctx);
      const consumer = consumers.length > 0 || ctx.session.user.role === "PARENT";
      const note = await prisma.lessonNote.findFirst({ where: { id: ctx.id, schoolId, classSubjectId: { in: ids } } });
      if (!note || (consumer && !note.isPublished)) throw new Error("Lesson note not found");

      const rl = checkRateLimit(`selfcheck:${ctx.session.user.id}`, 20, 5 * 60_000);
      if (!rl.allowed) {
        const err = new Error(`Too many requests — please wait about ${Math.ceil((rl.retryAfterSeconds ?? 60) / 60)} minute(s) and try again.`) as Error & { status?: number };
        err.status = 429;
        throw err;
      }

      const plain = note.content.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 4000);
      const system =
        "You write short, friendly comprehension self-check questions for a school lesson note. " +
        "Base every question only on the given content — never invent facts not present in it. " +
        "Model answers should be one short sentence, in plain simple language a student that age would use.";
      const prompt =
        `Lesson topic: ${note.topic}\n\nLesson content:\n${plain}\n\n` +
        "Write exactly 3 short-answer comprehension questions covering different parts of the content, from easiest to hardest. " +
        "Respond in exactly this format, nothing else:\nQ1: <question>\nA1: <model answer>\nQ2: <question>\nA2: <model answer>\nQ3: <question>\nA3: <model answer>";
      // The free reasoning model this app falls back to (see ai.ts) spends a
      // large, variable share of max_tokens on hidden reasoning before ever
      // writing the actual reply — draftLesson budgets 4500 for a full note,
      // so 1500 here (a handful of short Q&A pairs) still leaves headroom,
      // rather than the reply getting cut off mid-answer.
      const reply = await generate(system, prompt, 0.5, 1500);
      const questions = parseSelfCheckQuestions(reply);
      if (!questions.length) throw new Error("Couldn't come up with self-check questions this time — please try again.");
      return { questions };
    },

    // Judges a student's typed answer against the model answer generated by
    // selfCheck above. Not a score — just correct/incorrect plus one
    // encouraging line, tolerant of wording that isn't a verbatim match.
    checkAnswer: async (ctx) => {
      can(ctx, "learning:view");
      const question = str(ctx.body.question);
      const modelAnswer = str(ctx.body.modelAnswer);
      const answer = str(ctx.body.answer);
      if (!question || !modelAnswer || !answer) throw new Error("question, modelAnswer and answer are required");

      const rl = checkRateLimit(`selfcheck:${ctx.session.user.id}`, 30, 5 * 60_000);
      if (!rl.allowed) {
        const err = new Error(`Too many requests — please wait about ${Math.ceil((rl.retryAfterSeconds ?? 60) / 60)} minute(s) and try again.`) as Error & { status?: number };
        err.status = 429;
        throw err;
      }

      const system =
        "You are a kind, encouraging teacher checking a student's short typed answer against a model answer. " +
        "Be generous — accept any answer that captures the key idea, even if the wording, length or exact phrasing differs.";
      const prompt =
        `Question: ${question}\nModel answer: ${modelAnswer}\nStudent's answer: ${answer.slice(0, 1000)}\n\n` +
        "Respond in exactly this format, nothing else:\nCORRECT: yes or no\nFEEDBACK: one short, encouraging sentence";
      // Same reasoning-overhead headroom as selfCheck above, applied to a
      // shorter task.
      const reply = await generate(system, prompt, 0.3, 700);
      const correct = /CORRECT\s*:\s*yes/i.test(reply);
      const feedbackMatch = reply.match(/FEEDBACK\s*:\s*(.+)/i);
      // A malformed/cut-off reply should never leak the raw "CORRECT: yes"
      // marker to the student — fall back to a plain, still-useful message.
      const feedback = feedbackMatch?.[1]?.trim() || (correct ? "Nice work!" : "Not quite — check the model answer below.");
      return { correct, feedback };
    },
  },
};
