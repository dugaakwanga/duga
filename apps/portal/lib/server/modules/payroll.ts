import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, num, str } from "../helpers";

const BURSAR_ACCESS_KEY = "bursarFinanceAccess";

async function assertPayrollAccess(ctx: Parameters<NonNullable<Module["list"]>>[0], manage = false) {
  can(ctx, manage ? "payroll:manage" : "payroll:view");
  if (ctx.session.user.role === "BURSAR") {
    const setting = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: BURSAR_ACCESS_KEY } } });
    if (setting?.value !== true) {
      const err = new Error("The owner has not assigned payroll access to this bursar") as Error & { status?: number };
      err.status = 403;
      throw err;
    }
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
    const [staff, entries, access] = await Promise.all([
      prisma.user.findMany({ where: { schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] }, status: "ACTIVE" }, include: { salaryProfile: true, teacher: true, admin: true }, orderBy: [{ firstName: "asc" }] }),
      prisma.payrollEntry.findMany({ where: { schoolId, month }, include: { user: { select: { firstName: true, lastName: true, role: true } } }, orderBy: { user: { firstName: "asc" } } }),
      prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: BURSAR_ACCESS_KEY } } }),
    ]);
    return { role: ctx.session.user.role, month, staff, entries, bursarAccess: access?.value === true };
  },
  actions: {
    setBursarAccess: async (ctx) => {
      if (ctx.session.user.role !== "OWNER") throw new Error("Only the owner can assign bursar finance access");
      const enabled = ctx.body.enabled === true;
      await prisma.schoolSetting.upsert({ where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: BURSAR_ACCESS_KEY } }, update: { value: enabled }, create: { schoolId: ctx.session.user.schoolId, key: BURSAR_ACCESS_KEY, value: enabled } });
      return { enabled };
    },
    setSalary: async (ctx) => {
      if (ctx.session.user.role !== "OWNER") throw new Error("Only the owner can set staff salaries and rules");
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
      const attendance = await prisma.staffAttendance.groupBy({ by: ["userId"], where: { schoolId, date: { gte: start, lt: end }, checkInAt: { not: null } }, _count: { id: true } });
      const attendanceByUser = new Map(attendance.map((row) => [row.userId, row._count.id]));
      let created = 0;
      for (const user of staff) {
        const profile = user.salaryProfile; if (!profile) continue;
        // Absences are not assumed as lateness. The owner/bursar enters actual
        // late days, while this field shows clocked work days for review.
        const entry = await prisma.payrollEntry.upsert({
          where: { schoolId_userId_month: { schoolId, userId: user.id, month } },
          update: {},
          create: { schoolId, userId: user.id, month, baseSalary: profile.monthlyAmount, reward: profile.rewardAmount, netPay: Number(profile.monthlyAmount) + Number(profile.rewardAmount), note: `${attendanceByUser.get(user.id) ?? 0} attendance day(s) clocked` },
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
