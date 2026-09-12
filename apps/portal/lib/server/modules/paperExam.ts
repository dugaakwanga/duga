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

function parseAiGrading(reply: string, maxScore: number): { score: number; feedback: string } {
  // The prompt asks for "SCORE: <n>" on its own line followed by feedback —
  // tolerant of the model wrapping it in markdown/extra text either side.
  const m = reply.match(/SCORE\s*:\s*(\d+(?:\.\d+)?)/i);
  const score = m ? Math.max(0, Math.min(maxScore, Math.round(Number(m[1])))) : 0;
  const feedback = reply.replace(/SCORE\s*:\s*\d+(?:\.\d+)?/i, "").trim() || reply.trim();
  return { score, feedback };
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
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { role, items };
  },

  actions: {
    // Student uploads photo(s) of their completed paper exam. Images are
    // uploaded to storage client-side first (POST /api/upload?purpose=paper-exam),
    // this just records the submission.
    submit: async (ctx) => {
      // Broader than results:enter (which STUDENT never has) — a student
      // submitting their own script is uploading evidence, not entering a
      // score; TEACHER/ADMIN/OWNER may also submit on a student's behalf
      // (e.g. an invigilator scanning a stack of scripts).
      if (!["STUDENT", "TEACHER", "ADMIN", "OWNER"].includes(ctx.session.user.role)) {
        throw new Error("Only a student or a member of staff can submit a paper exam script");
      }
      const schoolId = ctx.session.user.schoolId;
      const classSubjectId = str(ctx.body.classSubjectId);
      // Defaults to the school's current active term — a student submitting
      // an exam script has no reason to pick a term themselves.
      const termId = str(ctx.body.termId) ?? (await prisma.term.findFirst({ where: { schoolId, status: "ACTIVE" }, select: { id: true } }))?.id;
      const component = str(ctx.body.component);
      const maxScore = num(ctx.body.maxScore);
      const imageUrls = Array.isArray(ctx.body.imageUrls) ? (ctx.body.imageUrls as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0) : [];
      if (!classSubjectId || !component || maxScore === undefined) throw new Error("classSubjectId, component and maxScore required");
      if (imageUrls.length === 0) throw new Error("Upload at least one photo of the answer script");

      let studentId: string;
      if (ctx.session.user.role === "STUDENT") {
        studentId = ctx.session.user.student!.id;
      } else {
        studentId = str(ctx.body.studentId) ?? "";
        if (!studentId) throw new Error("studentId required when submitting on a student's behalf");
      }
      const roster = await prisma.student.findFirst({ where: { id: studentId, schoolId, currentClassGroupId: (await prisma.classSubject.findUnique({ where: { id: classSubjectId }, select: { classGroupId: true } }))?.classGroupId } });
      if (!roster) throw new Error("Student is not in this class subject's class");

      const submission = await prisma.paperExamSubmission.create({
        data: { schoolId, studentId, classSubjectId, termId, component, maxScore, imageUrls: imageUrls as never, submittedByUserId: ctx.session.user.id },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.submitted", entityType: "PaperExamSubmission", entityId: submission.id, meta: { classSubjectId, component } });
      return submission;
    },

    // Teacher (or owner) triggers AI grading — a suggestion only. Re-running
    // this on the same submission replaces the previous AI suggestion (a
    // teacher can ask for a re-grade after fixing the answer key, say).
    grade: async (ctx) => {
      can(ctx, "results:enter");
      if (ctx.session.user.role === "ADMIN") throw new Error("Admins can view paper exam submissions but not grade them — that's the class teacher's call.");
      const schoolId = ctx.session.user.schoolId;
      const submission = await prisma.paperExamSubmission.findFirst({
        where: { id: ctx.id, schoolId },
        include: { classSubject: { include: { subject: true, teacher: true } }, student: { include: { user: { select: { firstName: true, lastName: true } } } } },
      });
      if (!submission) throw new Error("Submission not found");
      if (ctx.session.user.role === "TEACHER" && submission.classSubject.teacher?.userId !== ctx.session.user.id && submission.classSubject.teacherId !== ctx.session.user.teacher?.id) {
        throw new Error("You can only grade submissions for your own subjects");
      }
      const answerKey = str(ctx.body.answerKey) ?? submission.answerKey ?? undefined;

      const system =
        "You are grading a Nigerian school student's handwritten paper exam from a photo. Read the handwriting carefully. " +
        "Grade strictly out of the given maximum score. " +
        "Respond in this exact format: a line 'SCORE: <number>' followed by a short paragraph of feedback explaining what was right/wrong. " +
        "If the handwriting is illegible in places, say so in the feedback and grade only what you could read.";
      const prompt = `Subject: ${submission.classSubject.subject.name}\nComponent: ${submission.component}\nMaximum score: ${submission.maxScore}\n${
        answerKey ? `Answer key / marking scheme:\n${answerKey}\n\n` : "No answer key was provided — grade using your own subject knowledge, and be conservative.\n\n"
      }Grade the attached photographed answer script.`;

      const imageUrls = Array.isArray(submission.imageUrls) ? (submission.imageUrls as unknown[]).filter((u): u is string => typeof u === "string") : [];
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
      const finalScore = num(ctx.body.score);
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

      const score = finalScore ?? submission.aiScore;
      if (score === undefined || score === null) throw new Error("A score is required to approve");
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
        data: { status: "APPROVED", teacherScore: score, reviewedByUserId: ctx.session.user.id, reviewedAt: new Date() },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "paperExam.approved", entityType: "PaperExamSubmission", entityId: submission.id, meta: { score, component: submission.component } });
      return updated;
    },
  },
};
