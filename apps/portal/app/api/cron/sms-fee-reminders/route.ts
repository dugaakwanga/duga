import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@duga/core/server";
import { sendWeeklySchoolFeeSmsReminders } from "@/lib/server/modules/fees";

// Triggered by Vercel Cron (see vercel.json: Monday mornings) — the weekly
// per-parent school-fee SMS the owner asked for. Deliberately a SEPARATE
// cron from /api/cron/fee-reminders (which runs Mon/Wed/Fri for the
// supplementary "other fees" invoice reminders) so SMS spend stays exactly
// once a week per parent, not three times.
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
      results[school.id] = await sendWeeklySchoolFeeSmsReminders(school.id);
    } catch (e) {
      console.error(`sms fee reminder cron failed for school ${school.id}:`, e);
      results[school.id] = -1;
    }
  }
  return NextResponse.json({ ok: true, schools: schools.length, results });
}
