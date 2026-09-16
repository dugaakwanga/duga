import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";
import { sendFeeReminders } from "@/lib/server/modules/fees";

// Triggered by Vercel Cron (see vercel.json: Mon/Wed/Fri mornings) — runs
// the same reminder every school's bursar can already trigger manually from
// the Fees page (fees/remind), but automatically and across every school on
// the platform, not just the one the caller happens to be signed into.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const schools = await prisma.school.findMany({ where: { platformStatus: "ACTIVE" }, select: { id: true } });
  const results: Record<string, number> = {};
  for (const school of schools) {
    try {
      results[school.id] = await sendFeeReminders(school.id);
    } catch (e) {
      console.error(`fee reminder cron failed for school ${school.id}:`, e);
      results[school.id] = -1;
    }
  }
  return NextResponse.json({ ok: true, schools: schools.length, results });
}
