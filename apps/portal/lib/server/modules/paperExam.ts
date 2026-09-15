import { prisma, logAudit } from "@duga/core/server";
import { getResultConfig, computeScoreTotals } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num } from "../helpers";
import { generateVision } from "./ai";

// A student's photographed answer script is graded by AI only as a
// *suggestion* — nothing here ever writes a score on its own. A teacher (or
// the owner) must review and explicitly approve it; only then is the score
// written into SubjectScore, through the same locked-component check as any
// other score entry (see results.ts — an approval can't touch a locked
// component either).

// Older freeform flow (no PaperExam attached) — a single overall score.
function parseAiGrading(reply: string, maxScore: number): { score: number; feedback: string } {
  // The prompt asks for "SCORE: <n>" on its own line followed by feedback —
  // tolerant of the model wrapping it in markdown/extra text either side.
  const m = reply.match(/SCORE\s*:\s*(\d+(?:\.\d+)?)/i);
  const score = m ? Math.max(0, Math.min(maxScore, Math.round(Number(m[1])))) : 0;
  let feedback = reply.replace(/SCORE\s*:\s*\d+(?:\.\d+)?/i, "").trim() || reply.trim();
  // No "SCORE:" line at all usually means the model declined outright (a
  // refusal, a content-policy block, an "I can't view images" reply) —
  // don't let that raw prose surface to the teacher looking like real
  // feedback on the student's work.
  if (!m && /^(i'?m sorry|i apologize|i cannot|i can'?t|unfortunately|as an ai)\b/i.test(feedback)) {
    feedback = "The AI couldn't grade this script (it declined to respond) — please review and score it manually.";
  }
  return { score, feedback };
}

interface QuestionBreakdown {
  questionId: string;
  question: string;
  maxScore: number;
  score: number;
  feedback: string;
}

// Structured flow — one "Q<n>: <score>/<max> - <feedback>" line per
// question, in order. Falls back to a 0 + "couldn't parse" note for any
// question whose line didn't come back in the expected shape, rather than
// failing the whole grade over one malformed line.
function parsePerQuestionGrading(
  reply: string,
  questions: Array<{ id: string; question: string; maxScore: number }>,
): { breakdown: QuestionBreakdown[]; totalScore: number; summary: string } {
  const lines = reply.split(/\n+/).map((l) => l.trim());
  const breakdown = questions.map((q, i) => {
    const re = new RegExp(`^Q${i + 1}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*/\\s*\\d+(?:\\.\\d+)?\\s*-\\s*(.+)$`, "i");
    const line = lines.find((l) => re.test(l));
    const m = line ? line.match(re) : null;
    const score = m ? Math.max(0, Math.min(q.maxScore, Math.round(Number(m[1])))) : 0;
    const feedback = m ? m[2]!.trim() : "Couldn't read the AI's grading for this question — please check the script directly.";
    return { questionId: q.id, question: q.question, maxScore: q.maxScore, score, feedback };
  });
  const totalScore = breakdown.reduce((a, b) => a + b.score, 0);
  const summary = breakdown.map((b, i) => `Q${i + 1}: ${b.score}/${b.maxScore} — ${b.feedback}`).join("\n");
  return { breakdown, totalScore, summary };
}

export const paperExamModule: Module = {
  async list(ctx) {
    can(ctx, "results:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const where: Record<string, unknown> = { schoolId };
    if (role === "STUDENT") {
      where.studentId = ctx.session.user.student!.id;
    } else if (role === "TEACHER") {
      where.classSubject = { is: { teacherId: ctx.session.user.teacher!.id } };
    }
    // ADMIN/OWNER see everything (view-only, same as the results page).
    const items = await prisma.paperExamSubmission.findMany({
      where,
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
        classSubject: { include: { subject: true, classGroup: { include: { level: true } } } },
        paperExam: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { role, items };
  },

  actions: {
    // Students in a class subject's class — powers the student picker in the
    // upload form (the teacher, not the student, submits — see submit below).
    roster: async (ctx) => {
      can(ctx, "results:enter");
      const role = ctx.session.user.role;
      const schoolId = ctx.session.user.schoolId;
      const classSubjectId = str(ctx.query.get("classSubjectId"));
      if (!classSubjectId) throw new Error("classSubjectId required");
      const classSubject = await prisma.classSubject.findFirst({
        where: { id: classSubjectId, schoolId, ...(role === "TEACHER" ? { teacherId: ctx.session.user.teacher?.id } : {}) },
        select: { classGroupId: true },
      });
      if (!classSubject) throw new Error(role === "TEACHER" ? "You can only view your own subjects" : "Class subject not found");
      const students = await prisma.student.findMany({
        where: { schoolId, currentClassGroupId: classSubject.classGroupId, status: "ACTIVE" },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { admissionNumber: "asc" },
      });
      return { items: students.map((s) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}`, admissionNumber: s.admissionNumber })) };
    },

    // Exam definitions a teacher has built for their subjects (or, for
    // admin/owner, every exam) — powers both the "Manage Exams" list and the
    // exam picker in the upload form.
    examList: async (ctx) => {
      can(ctx, "results:enter");
      const role = ctx.session.user.role;
      const schoolId = ctx.session.user.schoolId;
      const classSubjectId = str(ctx.query.get("classSubjectId"));
      const items = await prisma.paperExam.findMany({
        where: {
          schoolId,
          ...(role === "TEACHER" ? { classSubject: { teacherId: ctx.session.user.teacher?.id } } : {}),
          ...(classSubjectId ? { classSubjectId } : {}),
        },
        include: {
          classSubject: { include: { subject: true, classGroup: { include: { level: true } } } },
          _count: { select: { questions: true, submissions: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return { items };
    },

    // One exam with its full question list, for the edit form.
    examGet: async (ctx) => {
      can(ctx, "results:enter");
      const role = ctx.session.user.role;
      const schoolId = ctx.session.user.schoolId;
      const exam = await prisma.paperExam.findFirst({
        where: { id: ctx.id, schoolId, ...(role === "TEACHER" ? { classSubject: { teacherId: ctx.session.user.teacher?.id } } : {}) },
        include: { questions: { orderBy: { order: "asc" } } },
      });
      if (!exam) throw new Error("Exam not found");
      return exam;
    },

    // Create or update an exam's title/instructions/component/status and its
    // whole question list at once (the question list is small enough — a
    // handful of theory questions, not hundreds — that replacing it wholesale
    // on every save is simpler and safer than diffing individual rows, same
    // approach the CBT test builder uses).
    examSave: async (ctx) => {
      can(ctx, "results:enter");
      const role = ctx.session.user.role;
      if (role === "ADMIN") throw new Error("Admins can view exams but not author them — that's the subject teacher's call.");
      const schoolId = ctx.session.user.schoolId;
      const id = str(ctx.body.id);
      const classSubjectId = str(ctx.body.classSubjectId);
      const title = str(ctx.body.title);
      const component = str(ctx.body.component);
      const instructions = str(ctx.body.instructions);
      const status = ctx.body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
      const questionsInput = Array.isArray(ctx.body.questions) ? (ctx.body.questions as Array<Record<string, unknown>>) : [];
      if (!title || !component) throw new Error("Title and component are required");
      if (questionsInput.length === 0) throw new Error("Add at least one question");

      const questions = questionsInput.map((q, i) => {
        const question = str(q.question);
        const markingNotes = str(q.markingNotes);
        const maxScore = num(q.maxScore);
        if (!question || !markingNotes || maxScore === undefined) {
          throw new Error(`Question ${i + 1} needs the question text, a max score, and marking notes for the AI to grade against`);
        }
        return { order: i, question, maxScore, markingNotes };
      });

      if (id) {
        const existing = await prisma.paperExam.findFirst({
          where: { id, schoolId, ...(role === "TEACHER" ? { classSubject: { teacherId: ctx.session.user.teacher?.id } } : {}) },
        });
        if (!existing) throw new Error("Exam not found");
        await prisma.paperExamQuestion.deleteMany({ where: { paperExamId: id } });
        const updated = await prisma.paperExam.update({
          where: { id },
          data: { title, instructions, component, status, questions: { create: questions } },
        });
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.examUpdated", entityType: "PaperExam", entityId: updated.id });
        return updated;
      }

      if (!classSubjectId) throw new Error("classSubjectId required");
      const termId = str(ctx.body.termId) ?? (await prisma.term.findFirst({ where: { schoolId, status: "ACTIVE" }, select: { id: true } }))?.id;
      const classSubject = await prisma.classSubject.findFirst({
        where: { id: classSubjectId, schoolId, ...(role === "TEACHER" ? { teacherId: ctx.session.user.teacher?.id } : {}) },
        select: { id: true },
      });
      if (!classSubject) throw new Error(role === "TEACHER" ? "You can only build exams for your own subjects" : "Class subject not found");

      const created = await prisma.paperExam.create({
        data: { schoolId, classSubjectId, termId, title, instructions, component, status, createdByUserId: ctx.session.user.id, questions: { create: questions } },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.examCreated", entityType: "PaperExam", entityId: created.id });
      return created;
    },

    examDelete: async (ctx) => {
      can(ctx, "results:enter");
      const role = ctx.session.user.role;
      if (role === "ADMIN") throw new Error("Admins can't delete exams — that's the subject teacher's call.");
      const schoolId = ctx.session.user.schoolId;
      const exam = await prisma.paperExam.findFirst({
        where: { id: ctx.id, schoolId, ...(role === "TEACHER" ? { classSubject: { teacherId: ctx.session.user.teacher?.id } } : {}) },
      });
      if (!exam) throw new Error("Exam not found");
      await prisma.paperExam.delete({ where: { id: exam.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.examDeleted", entityType: "PaperExam", entityId: ctx.id });
      return { ok: true };
    },

    // The subject teacher (or admin/owner) collects the physical scripts and
    // uploads a photo per student — not the student themselves, per the
    // school's actual workflow (a student handing in loose photos of their
    // own paper invites mix-ups/fraud that the teacher collecting and
    // scanning them all at once avoids). Every script is now graded against
    // a specific PaperExam's question rubric, not a one-off freeform score.
    submit: async (ctx) => {
      const role = ctx.session.user.role;
      if (!["TEACHER", "ADMIN", "OWNER"].includes(role)) {
        throw new Error("Only the subject teacher (or an admin) can submit a paper exam script");
      }
      const schoolId = ctx.session.user.schoolId;
      const paperExamId = str(ctx.body.paperExamId);
      if (!paperExamId) throw new Error("Choose an exam first — build one under Manage Exams if none exists yet");

      const exam = await prisma.paperExam.findFirst({
        where: { id: paperExamId, schoolId, ...(role === "TEACHER" ? { classSubject: { teacherId: ctx.session.user.teacher?.id } } : {}) },
        include: { questions: true, classSubject: { select: { classGroupId: true } } },
      });
      if (!exam) throw new Error(role === "TEACHER" ? "You can only submit scripts for your own exams" : "Exam not found");
      if (exam.questions.length === 0) throw new Error("This exam has no questions yet — add some under Manage Exams first");

      const imageUrls = Array.isArray(ctx.body.imageUrls) ? (ctx.body.imageUrls as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0) : [];
      if (imageUrls.length === 0) throw new Error("Upload at least one photo of the answer script");

      const studentId = str(ctx.body.studentId) ?? "";
      if (!studentId) throw new Error("studentId required");
      const roster = await prisma.student.findFirst({ where: { id: studentId, schoolId, currentClassGroupId: exam.classSubject.classGroupId } });
      if (!roster) throw new Error("Student is not in this exam's class");

      const maxScore = exam.questions.reduce((a, q) => a + q.maxScore, 0);
      const submission = await prisma.paperExamSubmission.create({
        data: {
          schoolId,
          studentId,
          classSubjectId: exam.classSubjectId,
          termId: exam.termId,
          component: exam.component,
          maxScore,
          paperExamId: exam.id,
          imageUrls: imageUrls as never,
          submittedByUserId: ctx.session.user.id,
        },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.submitted", entityType: "PaperExamSubmission", entityId: submission.id, meta: { paperExamId: exam.id, component: exam.component } });
      return submission;
    },

    // Teacher (or owner) triggers AI grading — a suggestion only. Re-running
    // this on the same submission replaces the previous AI suggestion (a
    // teacher can ask for a re-grade after fixing the marking scheme, say).
    grade: async (ctx) => {
      can(ctx, "results:enter");
      if (ctx.session.user.role === "ADMIN") throw new Error("Admins can view paper exam submissions but not grade them — that's the class teacher's call.");
      const schoolId = ctx.session.user.schoolId;
      const submission = await prisma.paperExamSubmission.findFirst({
        where: { id: ctx.id, schoolId },
        include: {
          classSubject: { include: { subject: true, teacher: true } },
          paperExam: { include: { questions: { orderBy: { order: "asc" } } } },
        },
      });
      if (!submission) throw new Error("Submission not found");
      if (ctx.session.user.role === "TEACHER" && submission.classSubject.teacher?.userId !== ctx.session.user.id && submission.classSubject.teacherId !== ctx.session.user.teacher?.id) {
        throw new Error("You can only grade submissions for your own subjects");
      }
      const imageUrls = Array.isArray(submission.imageUrls) ? (submission.imageUrls as unknown[]).filter((u): u is string => typeof u === "string") : [];

      if (submission.paperExam && submission.paperExam.questions.length > 0) {
        const questions = submission.paperExam.questions;
        const system =
          "You are grading a Nigerian school pupil's handwritten paper exam from photographed pages. Read the handwriting carefully — pupils' handwriting is often imperfect; do your best to make out what's written before judging it.\n\n" +
          "You are given a numbered list of questions, each with its own maximum score and the teacher's marking notes (the key points/model answer expected). Grade EACH question separately against its own marking notes.\n\n" +
          "Grading standard: these are children, not university students — accept a correct idea expressed in a pupil's own simple words, and do not penalize weak spelling or grammar if the meaning is clear. But grade on genuine understanding, not effort: award marks only for what the marking notes actually asked for. A vague, generic or off-topic answer that does not demonstrate the specific point in the marking notes should score low or zero even if it reads nicely — do not inflate scores just to be encouraging. If a question was left blank or is fully illegible, score it 0 and say so.\n\n" +
          "Respond with exactly one line per question, in order, in this exact format and nothing else:\nQ<number>: <score>/<max> - <one short sentence of feedback>";
        const prompt =
          `Subject: ${submission.classSubject.subject.name}\nExam: ${submission.paperExam.title}${submission.paperExam.instructions ? `\nInstructions: ${submission.paperExam.instructions}` : ""}\n\n` +
          questions.map((q, i) => `Q${i + 1} (max ${q.maxScore}): ${q.question}\nMarking notes: ${q.markingNotes}`).join("\n\n") +
          `\n\nGrade the attached photographed answer script against each question above, in the same order.`;

        const reply = await generateVision(system, prompt, imageUrls, 2200);
        const { breakdown, totalScore, summary } = parsePerQuestionGrading(reply, questions);

        const updated = await prisma.paperExamSubmission.update({
          where: { id: submission.id },
          data: { aiScore: totalScore, aiFeedback: summary, aiBreakdown: breakdown as never, status: "AI_GRADED" },
        });
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.aiGraded", entityType: "PaperExamSubmission", entityId: submission.id, meta: { aiScore: totalScore } });
        return updated;
      }

      // Older freeform flow (no PaperExam attached) — a single overall score
      // against an optional loose answer key.
      const answerKey = str(ctx.body.answerKey) ?? submission.answerKey ?? undefined;
      const system =
        "You are grading a Nigerian school student's handwritten paper exam from a photo. Read the handwriting carefully. " +
        "Grade strictly out of the given maximum score. " +
        "Respond in this exact format: a line 'SCORE: <number>' followed by a short paragraph of feedback explaining what was right/wrong. " +
        "If the handwriting is illegible in places, say so in the feedback and grade only what you could read.";
      const prompt = `Subject: ${submission.classSubject.subject.name}\nComponent: ${submission.component}\nMaximum score: ${submission.maxScore}\n${
        answerKey ? `Answer key / marking scheme:\n${answerKey}\n\n` : "No answer key was provided — grade using your own subject knowledge, and be conservative.\n\n"
      }Grade the attached photographed answer script.`;

      const reply = await generateVision(system, prompt, imageUrls, 2000);
      const { score, feedback } = parseAiGrading(reply, submission.maxScore);

      const updated = await prisma.paperExamSubmission.update({
        where: { id: submission.id },
        data: { aiScore: score, aiFeedback: feedback, answerKey: answerKey ?? null, status: "AI_GRADED" },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.aiGraded", entityType: "PaperExamSubmission", entityId: submission.id, meta: { aiScore: score } });
      return updated;
    },

    // Teacher (or owner) vets the AI's suggestion — approving writes the
    // final score into SubjectScore.scores[component], subject to the same
    // component lock as manual entry; rejecting just records the decision.
    review: async (ctx) => {
      can(ctx, "results:enter");
      if (ctx.session.user.role === "ADMIN") throw new Error("Admins can't approve or reject paper exam scores directly — that's the class teacher's call.");
      const schoolId = ctx.session.user.schoolId;
      const decision = str(ctx.body.decision); // "APPROVE" | "REJECT"
      if (decision !== "APPROVE" && decision !== "REJECT") throw new Error("decision must be APPROVE or REJECT");

      const submission = await prisma.paperExamSubmission.findFirst({
        where: { id: ctx.id, schoolId },
        include: { classSubject: { include: { classGroup: { include: { level: true } }, teacher: true } } },
      });
      if (!submission) throw new Error("Submission not found");
      if (ctx.session.user.role === "TEACHER" && submission.classSubject.teacherId !== ctx.session.user.teacher?.id) {
        throw new Error("You can only review submissions for your own subjects");
      }

      if (decision === "REJECT") {
        const updated = await prisma.paperExamSubmission.update({ where: { id: submission.id }, data: { status: "REJECTED", reviewedByUserId: ctx.session.user.id, reviewedAt: new Date() } });
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.rejected", entityType: "PaperExamSubmission", entityId: submission.id });
        return updated;
      }

      // A teacher can override the AI's score per question before approving
      // (not just the overall total) — the approved breakdown replaces the
      // AI's own scores (feedback text kept as-is) and the approved total is
      // the sum of those, not whatever the AI originally suggested.
      const breakdownInput = Array.isArray(ctx.body.breakdown) ? (ctx.body.breakdown as Array<{ questionId?: unknown; score?: unknown }>) : null;
      const existingBreakdown = Array.isArray(submission.aiBreakdown) ? (submission.aiBreakdown as unknown as QuestionBreakdown[]) : null;

      let score: number | null;
      let newBreakdown: QuestionBreakdown[] | undefined;
      if (breakdownInput && existingBreakdown && existingBreakdown.length > 0) {
        const overrides = new Map(breakdownInput.map((b) => [String(b.questionId), num(b.score)]));
        newBreakdown = existingBreakdown.map((b) => {
          const override = overrides.get(b.questionId);
          const s = override !== undefined && override !== null ? Math.max(0, Math.min(b.maxScore, override)) : b.score;
          return { ...b, score: s };
        });
        score = newBreakdown.reduce((a, b) => a + b.score, 0);
      } else {
        score = num(ctx.body.score) ?? submission.aiScore ?? null;
      }
      if (score === null) throw new Error("A score is required to approve");
      score = Math.max(0, Math.min(submission.maxScore, score));
      if (!submission.termId) throw new Error("This submission has no term set — cannot write a score");

      const lock = await prisma.assessmentLock.findUnique({ where: { classSubjectId_termId_component: { classSubjectId: submission.classSubjectId, termId: submission.termId, component: submission.component } } });
      if (lock) throw new Error(`"${submission.component}" is locked for this term — ask an admin to reopen it first.`);

      const config = await getResultConfig(schoolId, submission.classSubject.classGroup.level.section);
      const existing = await prisma.subjectScore.findUnique({ where: { classSubjectId_studentId_termId: { classSubjectId: submission.classSubjectId, studentId: submission.studentId, termId: submission.termId } } });
      const scores: Record<string, number> = { ...((existing?.scores as Record<string, number> | null | undefined) ?? {}), [submission.component]: score };
      const { ca, exam, total } = computeScoreTotals(config, scores);

      await prisma.subjectScore.upsert({
        where: { classSubjectId_studentId_termId: { classSubjectId: submission.classSubjectId, studentId: submission.studentId, termId: submission.termId } },
        update: { scores: scores as never, caTotal: ca, examTotal: exam, total, enteredByTeacherId: ctx.session.user.teacher?.id },
        create: { schoolId, classSubjectId: submission.classSubjectId, studentId: submission.studentId, termId: submission.termId, scores: scores as never, caTotal: ca, examTotal: exam, total, enteredByTeacherId: ctx.session.user.teacher?.id },
      });

      const updated = await prisma.paperExamSubmission.update({
        where: { id: submission.id },
        data: {
          status: "APPROVED",
          teacherScore: score,
          reviewedByUserId: ctx.session.user.id,
          reviewedAt: new Date(),
          ...(newBreakdown ? { aiBreakdown: newBreakdown as never } : {}),
        },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.approved", entityType: "PaperExamSubmission", entityId: submission.id, meta: { score, component: submission.component } });
      return updated;
    },
  },
};
