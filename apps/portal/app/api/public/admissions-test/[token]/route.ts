import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";
import { verifyApplicationTestToken } from "@duga/core";

// Public, unauthenticated: an admissions applicant with no portal account
// opens this via the signed link they were given after applying.
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const claims = await verifyApplicationTestToken(token);
    if (!claims) {
      return NextResponse.json({ ok: false, error: "This link is invalid or has expired." }, { status: 401 });
    }

    const application = await prisma.application.findFirst({ where: { id: claims.sub, schoolId: claims.schoolId } });
    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }

    const test = await prisma.admissionsTest.findFirst({
      where: { schoolId: claims.schoolId, isActive: true, OR: [{ section: application.section }, { section: null }] },
      // Prefer a section-specific test over an all-sections fallback (Postgres
      // defaults DESC to NULLS FIRST, so nulls:"last" must be explicit here).
      orderBy: { section: { sort: "desc", nulls: "last" } },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!test) {
      return NextResponse.json({ ok: false, error: "No entrance test is currently available." }, { status: 404 });
    }

    const attempt = await prisma.admissionsTestAttempt.findUnique({ where: { applicationId: application.id } });
    if (attempt?.isSubmitted) {
      return NextResponse.json({
        ok: true,
        data: {
          applicantName: application.applicantName,
          alreadySubmitted: true,
          result: { score: attempt.score, maxScore: attempt.maxScore, percentage: attempt.percentage },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        applicantName: application.applicantName,
        alreadySubmitted: false,
        test: {
          id: test.id,
          title: test.title,
          instruction: test.instruction,
          durationMinutes: test.durationMinutes,
          passMark: test.passMark,
          questions: test.questions.map((q) => ({ id: q.id, type: q.type, question: q.question, options: q.options, score: q.score, order: q.order })),
        },
      },
    });
  } catch (e) {
    console.error("public admissions-test error:", e);
    return NextResponse.json({ ok: false, error: "Could not load the entrance test" }, { status: 500 });
  }
}
