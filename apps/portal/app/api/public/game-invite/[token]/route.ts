import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";
import { verifyGameInviteToken } from "@duga/core";

// Outsider trial-play is always capped at 10 minutes, regardless of the
// game's own configured duration for enrolled students.
const TRIAL_MINUTES = 10;

// Public, unauthenticated: a friend of an enrolled student opens this via the
// signed invite link to trial-play one game with no portal account.
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const claims = await verifyGameInviteToken(token);
    if (!claims) {
      return NextResponse.json({ ok: false, error: "This invite link is invalid or has expired." }, { status: 401 });
    }

    const invite = await prisma.gameInvite.findFirst({ where: { id: claims.sub, schoolId: claims.schoolId } });
    if (!invite) {
      return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });
    }

    // One free trial ever per email per school, regardless of which specific
    // invite or game it came from.
    const alreadyPlayed = await prisma.gameInvite.findFirst({ where: { schoolId: claims.schoolId, guestEmail: invite.guestEmail, status: "PLAYED" } });
    if (alreadyPlayed) {
      return NextResponse.json({
        ok: true,
        data: { alreadyPlayed: true, score: alreadyPlayed.score, applyUrl: applyUrl(), loginPath: "/login" },
      });
    }

    const game = await prisma.educationalGame.findFirst({
      where: { id: invite.gameId, schoolId: claims.schoolId, isPublished: true },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!game) {
      return NextResponse.json({ ok: false, error: "This game is no longer available." }, { status: 404 });
    }

    // Anchor the 10-minute trial window to first load, not to whenever they
    // happen to submit — a reload later shouldn't grant a fresh 10 minutes.
    const startedAt = invite.startedAt ?? new Date();
    if (!invite.startedAt) {
      await prisma.gameInvite.update({ where: { id: invite.id }, data: { startedAt } });
    }
    const secondsLeft = Math.max(0, TRIAL_MINUTES * 60 - Math.floor((Date.now() - startedAt.getTime()) / 1000));
    if (secondsLeft <= 0) {
      return NextResponse.json({ ok: false, error: "Your 10-minute trial window has ended." }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        alreadyPlayed: false,
        guestName: invite.guestName,
        secondsLeft,
        game: {
          id: game.id,
          title: game.title,
          kind: game.kind,
          durationMinutes: TRIAL_MINUTES,
          // correctIndex included deliberately — see games.ts's `start` action.
          questions: game.questions.map((q) => ({ id: q.id, question: q.question, options: q.options, correctIndex: q.correctIndex })),
        },
      },
    });
  } catch (e) {
    console.error("public game-invite error:", e);
    return NextResponse.json({ ok: false, error: "Could not load the game invite" }, { status: 500 });
  }
}

function applyUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return `${base}/apply`;
}
