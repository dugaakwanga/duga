import { NextRequest, NextResponse } from "next/server";
import { prisma, dispatchNotification, dispatchToMany, checkRateLimit } from "@duga/core/server";
import { verifyGameInviteToken } from "@duga/core";

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const claims = await verifyGameInviteToken(token);
    if (!claims) {
      return NextResponse.json({ ok: false, error: "This invite link is invalid or has expired." }, { status: 401 });
    }

    const rl = checkRateLimit(`game-invite-play:${claims.sub}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: "Too many attempts. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
    }

    const invite = await prisma.gameInvite.findFirst({ where: { id: claims.sub, schoolId: claims.schoolId } });
    if (!invite) {
      return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });
    }
    if (invite.status === "PLAYED") {
      return NextResponse.json({ ok: false, error: "This trial has already been used." }, { status: 409 });
    }
    const alreadyPlayedElsewhere = await prisma.gameInvite.findFirst({ where: { schoolId: claims.schoolId, guestEmail: invite.guestEmail, status: "PLAYED" } });
    if (alreadyPlayedElsewhere) {
      return NextResponse.json({ ok: false, error: "This person has already used their free trial." }, { status: 409 });
    }
    // The 10-minute trial window is anchored to when they first loaded the
    // game (recorded here on first submit if not already set), not to the
    // invite's creation time — a friend might open the link hours later.
    if (invite.startedAt && Date.now() - invite.startedAt.getTime() > 10 * 60_000 + 30_000) {
      return NextResponse.json({ ok: false, error: "Your 10-minute trial window has ended." }, { status: 409 });
    }

    const game = await prisma.educationalGame.findFirst({
      where: { id: invite.gameId, schoolId: claims.schoolId, isPublished: true },
      include: { questions: true },
    });
    if (!game) {
      return NextResponse.json({ ok: false, error: "This game is no longer available." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const answers = Array.isArray(body.answers) ? (body.answers as Array<{ questionId: string; selectedIndex: number }>) : [];
    const questionMap = new Map(game.questions.map((q) => [q.id, q]));
    let correct = 0;
    for (const a of answers) {
      const q = questionMap.get(a.questionId);
      if (q && a.selectedIndex === q.correctIndex) correct += 1;
    }
    const score = Math.max(0, Math.min(100, correct * 10));

    await prisma.gameInvite.update({
      where: { id: invite.id },
      data: { status: "PLAYED", score, playedAt: new Date(), startedAt: invite.startedAt ?? new Date() },
    });

    // Let the inviting student know their friend actually played, and give
    // the school visibility into a live admissions-funnel signal.
    const inviter = await prisma.student.findFirst({ where: { id: invite.inviterStudentId }, select: { userId: true } });
    if (inviter) {
      await dispatchNotification({
        schoolId: claims.schoolId,
        userId: inviter.userId,
        type: "games",
        title: "Your friend played!",
        body: `${invite.guestName || invite.guestEmail} scored ${score}% on ${game.title}.`,
        link: "/portal/games",
        channels: ["IN_APP"],
      }).catch(() => undefined);
    }
    const staff = await prisma.user.findMany({ where: { schoolId: claims.schoolId, role: { in: ["OWNER", "ADMIN"] } }, select: { id: true } });
    if (staff.length) {
      await dispatchToMany(staff.map((s) => s.id), {
        schoolId: claims.schoolId,
        type: "games",
        title: "Outsider trial-played a game",
        body: `${invite.guestName || invite.guestEmail} trial-played ${game.title} (invited by a student) and scored ${score}%.`,
        link: "/portal/applications",
      }).catch(() => undefined);
    }

    const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    return NextResponse.json({ ok: true, data: { score, applyUrl: `${base}/apply`, loginPath: "/login" } });
  } catch (e) {
    console.error("public game-invite play error:", e);
    return NextResponse.json({ ok: false, error: "Could not submit your play" }, { status: 500 });
  }
}
