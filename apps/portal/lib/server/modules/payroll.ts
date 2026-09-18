import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, num, str, financeManager } from "../helpers";

const BURSAR_ACCESS_KEY = "bursarFinanceAccess";
const PAYROLL_RULES_KEY = "payrollRules";
const DEFAULT_LATE_AFTER_TIME = "08:00";

interface PayrollRules {
  /** "HH:MM", 24-hour, compared against the staff member's own clock-in
   * time on the same day. Matches this app's existing convention of not
   * doing any explicit timezone conversion (see security.ts's
   * toLocaleTimeString() usage) — both this setting and StaffAttendance's
   * checkInAt are read in the server's local time. */
  lateAfterTime: string;
}

async function getPayrollRules(schoolId: string): Promise<PayrollRules> {
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: PAYROLL_RULES_KEY } } });
  const raw = row?.value && typeof row.value === "object" ? (row.value as { lateAfterTime?: unknown }) : {};
  const lateAfterTime = typeof raw.lateAfterTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.lateAfterTime) ? raw.lateAfterTime : DEFAULT_LATE_AFTER_TIME;
  return { lateAfterTime };
}

// Later than lateAfterTime on the day they clocked in — a day they never
// clocked in at all is an absence, not lateness (the two are deliberately
// never conflated; see the note in `generate` below).
function isLateCheckIn(checkInAt: Date, lateAfterTime: string): boolean {
  const [h, m] = lateAfterTime.split(":").map(Number);
  const hh = checkInAt.getHours();
  const mm = checkInAt.getMinutes();
  return hh > h! || (hh === h && mm > m!);
}

async function assertPayrollAccess(ctx: Parameters<NonNullable<Module["list"]>>[0], manage = false) {
  can(ctx, manage ? "payroll:manage" : "payroll:view");
  if (!(await financeManager(ctx))) {
    const err = new Error("Finance is managed only by the bursar and school owner, or an admin granted access") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month must use YYYY-MM");
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export const payrollModule: Module = {
  async list(ctx) {
    await assertPayrollAccess(ctx);
    const schoolId = ctx.session.user.schoolId;
    const month = ctx.query.get("month") ?? new Date().toISOString().slice(0, 7);
    const [staff, entries, access, payrollRules] = await Promise.all([
      prisma.user.findMany({ where: { schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] }, status: "ACTIVE" }, include: { salaryProfile: true, teacher: true, admin: true }, orderBy: [{ firstName: "asc" }] }),
      prisma.payrollEntry.findMany({ where: { schoolId, month }, include: { user: { select: { firstName: true, lastName: true, role: true } } }, orderBy: { user: { firstName: "asc" } } }),
      prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: BURSAR_ACCESS_KEY } } }),
      getPayrollRules(schoolId),
    ]);
    return { role: ctx.session.user.role, month, staff, entries, bursarAccess: access?.value === true, payrollRules };
  },
  actions: {
    setBursarAccess: async (ctx) => {
      if (ctx.session.user.role !== "OWNER") throw new Error("Only the owner can assign bursar finance access");
      const enabled = ctx.body.enabled === true;
      await prisma.schoolSetting.upsert({ where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: BURSAR_ACCESS_KEY } }, update: { value: enabled }, create: { schoolId: ctx.session.user.schoolId, key: BURSAR_ACCESS_KEY, value: enabled } });
      return { enabled };
    },
    setPayrollRules: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const lateAfterTime = str(ctx.body.lateAfterTime);
      if (!lateAfterTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(lateAfterTime)) throw new Error("lateAfterTime must be HH:MM (24-hour)");
      const schoolId = ctx.session.user.schoolId;
      await prisma.schoolSetting.upsert({ where: { schoolId_key: { schoolId, key: PAYROLL_RULES_KEY } }, update: { value: { lateAfterTime } }, create: { schoolId, key: PAYROLL_RULES_KEY, value: { lateAfterTime } } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "payroll.rulesUpdated", entityType: "School", entityId: schoolId, meta: { lateAfterTime } });
      return { lateAfterTime };
    },
    setSalary: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const userId = str(ctx.body.userId); if (!userId) throw new Error("userId required");
      const user = await prisma.user.findFirst({ where: { id: userId, schoolId: ctx.session.user.schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] } } });
      if (!user) throw new Error("Staff member not found");
      const monthlyAmount = Math.max(0, num(ctx.body.monthlyAmount) ?? 0);
      const latePenalty = Math.max(0, num(ctx.body.latePenalty) ?? 0);
      const rewardAmount = Math.max(0, num(ctx.body.rewardAmount) ?? 0);
      const salary = await prisma.staffSalary.upsert({ where: { userId }, update: { monthlyAmount, latePenalty, rewardAmount }, create: { schoolId: ctx.session.user.schoolId, userId, monthlyAmount, latePenalty, rewardAmount } });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "payroll.salarySet", entityType: "StaffSalary", entityId: salary.id });
      return salary;
    },
    generate: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId; const month = str(ctx.body.month) ?? new Date().toISOString().slice(0, 7); const { start, end } = monthRange(month);
      const staff = await prisma.user.findMany({ where: { schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] }, status: "ACTIVE" }, include: { salaryProfile: true } });
      const { lateAfterTime } = await getPayrollRules(schoolId);
      const attendanceRows = await prisma.staffAttendance.findMany({ where: { schoolId, date: { gte: start, lt: end }, checkInAt: { not: null } }, select: { userId: true, checkInAt: true } });
      const attendanceByUser = new Map<string, { count: number; late: number }>();
      for (const row of attendanceRows) {
        const agg = attendanceByUser.get(row.userId) ?? { count: 0, late: 0 };
        agg.count += 1;
        if (isLateCheckIn(row.checkInAt!, lateAfterTime)) agg.late += 1;
        attendanceByUser.set(row.userId, agg);
      }
      let created = 0;
      for (const user of staff) {
        const profile = user.salaryProfile; if (!profile) continue;
        // Absences are not assumed as lateness — a day never clocked in at
        // all doesn't count toward lateDays, only a clock-in after
        // lateAfterTime does. The owner/bursar can still correct this via
        // "Adjust" (e.g. a documented excuse), which is why this only seeds
        // the value on first creation (update: {}) rather than overwriting
        // an entry someone already reviewed.
        const attendance = attendanceByUser.get(user.id) ?? { count: 0, late: 0 };
        const lateDeduction = attendance.late * Number(profile.latePenalty);
        const netPay = Math.max(0, Number(profile.monthlyAmount) + Number(profile.rewardAmount) - lateDeduction);
        const entry = await prisma.payrollEntry.upsert({
          where: { schoolId_userId_month: { schoolId, userId: user.id, month } },
          update: {},
          create: {
            schoolId,
            userId: user.id,
            month,
            baseSalary: profile.monthlyAmount,
            reward: profile.rewardAmount,
            lateDays: attendance.late,
            lateDeduction,
            netPay,
            note: `${attendance.count} attendance day(s) clocked, ${attendance.late} late (after ${lateAfterTime})`,
          },
        });
        if (entry.createdAt.getTime() > Date.now() - 10000) created++;
      }
      return { created, month };
    },
    adjust: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const entry = await prisma.payrollEntry.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } }); if (!entry) throw new Error("Payroll entry not found");
      if (entry.status === "PAID") throw new Error("A paid payroll entry cannot be changed");
      const profile = await prisma.staffSalary.findUnique({ where: { userId: entry.userId } });
      const lateDays = Math.max(0, num(ctx.body.lateDays) ?? entry.lateDays);
      const reward = Math.max(0, num(ctx.body.reward) ?? Number(entry.reward));
      const extraDeduction = Math.max(0, num(ctx.body.extraDeduction) ?? Number(entry.extraDeduction));
      const lateDeduction = lateDays * Number(profile?.latePenalty ?? 0);
      const netPay = Math.max(0, Number(entry.baseSalary) + reward - lateDeduction - extraDeduction);
      return prisma.payrollEntry.update({ where: { id: entry.id }, data: { lateDays, lateDeduction, reward, extraDeduction, netPay, note: str(ctx.body.note) } });
    },
    markPaid: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const entry = await prisma.payrollEntry.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } }); if (!entry) throw new Error("Payroll entry not found");
      return prisma.payrollEntry.update({ where: { id: entry.id }, data: { status: "PAID", processedAt: new Date() } });
    },
  },
};
