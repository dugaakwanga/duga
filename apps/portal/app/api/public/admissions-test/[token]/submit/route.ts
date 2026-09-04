import { NextRequest, NextResponse } from "next/server";
import { prisma, dispatchToMany, checkRateLimit } from "@duga/core/server";
import { verifyApplicationTestToken } from "@duga/core";

// Public, unauthenticated submission endpoint — grading mirrors
// learning.ts's submitTest (auto-graded multiple-choice/true-false), but
// keyed by applicationId instead of studentId since the applicant has no
// Student record.
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const claims = await verifyApplicationTestToken(token);
    if (!claims) {
      return NextResponse.json({ ok: false, error: "This link is invalid or has expired." }, { status: 401 });
    }

    const rl = checkRateLimit(`admissions-test:${claims.sub}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: "Too many submission attempts. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
    }

    const application = await prisma.application.findFirst({ where: { id: claims.sub, schoolId: claims.schoolId } });
    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }

    const existing = await prisma.admissionsTestAttempt.findUnique({ where: { applicationId: application.id } });
    if (existing?.isSubmitted) {
      return NextResponse.json({ ok: false, error: "This entrance test has already been submitted." }, { status: 409 });
    }

    const test = await prisma.admissionsTest.findFirst({
      where: { schoolId: claims.schoolId, isActive: true, OR: [{ section: application.section }, { section: null }] },
      orderBy: { section: { sort: "desc", nulls: "last" } },
      include: { questions: true },
    });
    if (!test) {
      return NextResponse.json({ ok: false, error: "No entrance test is currently available." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const answers = Array.isArray(body.answers) ? (body.answers as Array<{ questionId: string; selectedIndex: number }>) : [];
    const questionMap = new Map(test.questions.map((q) => [q.id, q]));
    let score = 0;
    let maxScore = 0;
    const graded: { questionId: string; selectedIndex: number; isCorrect: boolean; scoreAwarded: number }[] = [];
    for (const a of answers) {
      const q = questionMap.get(a.questionId);
      if (!q) continue;
      maxScore += q.score;
      const isCorrect = a.selectedIndex === q.correctIndex;
      if (isCorrect) score += q.score;
      graded.push({ questionId: q.id, selectedIndex: a.selectedIndex, isCorrect, scoreAwarded: isCorrect ? q.score : 0 });
    }
    for (const q of test.questions) {
      if (!answers.some((a) => a.questionId === q.id)) {
        maxScore += q.score;
        graded.push({ questionId: q.id, selectedIndex: -1, isCorrect: false, scoreAwarded: 0 });
      }
    }
    const percentage = maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0;

    const attempt = await prisma.admissionsTestAttempt.upsert({
      where: { applicationId: application.id },
      update: {
        testId: test.id,
        submittedAt: new Date(),
        score,
        maxScore,
        percentage,
        isSubmitted: true,
        answers: { deleteMany: {}, create: graded.map((g) => ({ questionId: g.questionId, selectedIndex: g.selectedIndex, isCorrect: g.isCorrect, scoreAwarded: g.scoreAwarded })) },
      },
      create: {
        schoolId: claims.schoolId,
        testId: test.id,
        applicationId: application.id,
        submittedAt: new Date(),
        score,
        maxScore,
        percentage,
        isSubmitted: true,
        answers: { create: graded.map((g) => ({ questionId: g.questionId, selectedIndex: g.selectedIndex, isCorrect: g.isCorrect, scoreAwarded: g.scoreAwarded })) },
      },
    });

    // Surface completion to admin/owner and nudge the application forward so
    // it shows up as ready for review, without overriding a decision already made.
    if (application.status === "RECEIVED") {
      await prisma.application.update({ where: { id: application.id }, data: { status: "REVIEWING" } });
    }
    const staff = await prisma.user.findMany({ where: { schoolId: claims.schoolId, role: { in: ["OWNER", "ADMIN"] } }, select: { id: true } });
    if (staff.length) {
      await dispatchToMany(staff.map((s) => s.id), {
        schoolId: claims.schoolId,
        type: "application",
        title: "Entrance test completed",
        body: `${application.applicantName} scored ${percentage}% on the admissions entrance test.`,
        link: "/portal/applications",
      });
    }

    return NextResponse.json({ ok: true, data: { attemptId: attempt.id, score, maxScore, percentage } });
  } catch (e) {
    console.error("public admissions-test submit error:", e);
    return NextResponse.json({ ok: false, error: "Could not submit the entrance test" }, { status: 500 });
  }
}
