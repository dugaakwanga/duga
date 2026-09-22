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
  /** ₦ deducted per late day — one school-wide amount applied to every
   * staff member, not set per person (it used to live on StaffSalary; a
   * school punishes lateness the same way for everyone). */
  latePenaltyAmount: number;
}

async function getPayrollRules(schoolId: string): Promise<PayrollRules> {
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: PAYROLL_RULES_KEY } } });
  const raw = row?.value && typeof row.value === "object" ? (row.value as { lateAfterTime?: unknown; latePenaltyAmount?: unknown }) : {};
  const lateAfterTime = typeof raw.lateAfterTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.lateAfterTime) ? raw.lateAfterTime : DEFAULT_LATE_AFTER_TIME;
  const latePenaltyAmount = typeof raw.latePenaltyAmount === "number" && raw.latePenaltyAmount >= 0 ? raw.latePenaltyAmount : 0;
  return { lateAfterTime, latePenaltyAmount };
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
    const [staff, entries, access, payrollRules, deductions] = await Promise.all([
      prisma.user.findMany({ where: { schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] }, status: "ACTIVE" }, include: { salaryProfile: true, teacher: true, admin: true }, orderBy: [{ firstName: "asc" }] }),
      prisma.payrollEntry.findMany({ where: { schoolId, month }, include: { user: { select: { firstName: true, lastName: true, role: true } } }, orderBy: { user: { firstName: "asc" } } }),
      prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: BURSAR_ACCESS_KEY } } }),
      getPayrollRules(schoolId),
      prisma.staffDeduction.findMany({ where: { schoolId, month }, orderBy: { createdAt: "desc" } }),
    ]);
    return { role: ctx.session.user.role, month, staff, entries, bursarAccess: access?.value === true, payrollRules, deductions };
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
      const latePenaltyAmount = Math.max(0, num(ctx.body.latePenaltyAmount) ?? 0);
      const schoolId = ctx.session.user.schoolId;
      await prisma.schoolSetting.upsert({ where: { schoolId_key: { schoolId, key: PAYROLL_RULES_KEY } }, update: { value: { lateAfterTime, latePenaltyAmount } }, create: { schoolId, key: PAYROLL_RULES_KEY, value: { lateAfterTime, latePenaltyAmount } } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "payroll.rulesUpdated", entityType: "School", entityId: schoolId, meta: { lateAfterTime, latePenaltyAmount } });
      return { lateAfterTime, latePenaltyAmount };
    },
    setSalary: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const userId = str(ctx.body.userId); if (!userId) throw new Error("userId required");
      const user = await prisma.user.findFirst({ where: { id: userId, schoolId: ctx.session.user.schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] } } });
      if (!user) throw new Error("Staff member not found");
      const monthlyAmount = Math.max(0, num(ctx.body.monthlyAmount) ?? 0);
      const rewardAmount = Math.max(0, num(ctx.body.rewardAmount) ?? 0);
      const salary = await prisma.staffSalary.upsert({ where: { userId }, update: { monthlyAmount, rewardAmount }, create: { schoolId: ctx.session.user.schoolId, userId, monthlyAmount, rewardAmount } });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "payroll.salarySet", entityType: "StaffSalary", entityId: salary.id });
      return salary;
    },
    // Ad-hoc deductions (e.g. didn't submit lesson notes) — logged by hand,
    // any time, for any month. If that month's payroll entry already exists
    // and isn't PAID, the amount is folded in immediately; otherwise it sits
    // logged and generate() picks it up when that month is generated.
    addDeduction: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const userId = str(ctx.body.userId);
      const month = str(ctx.body.month);
      const amount = num(ctx.body.amount);
      const reason = str(ctx.body.reason);
      if (!userId || !month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("userId and month (YYYY-MM) are required");
      if (amount === undefined || amount <= 0) throw new Error("A positive amount is required");
      if (!reason) throw new Error("A reason is required");
      const user = await prisma.user.findFirst({ where: { id: userId, schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] } } });
      if (!user) throw new Error("Staff member not found");

      const deduction = await prisma.staffDeduction.create({ data: { schoolId, userId, month, amount, reason, createdByUserId: ctx.session.user.id } });

      const entry = await prisma.payrollEntry.findUnique({ where: { schoolId_userId_month: { schoolId, userId, month } } });
      if (entry && entry.status === "DRAFT") {
        const extraDeduction = Number(entry.extraDeduction) + amount;
        const netPay = Math.max(0, Number(entry.baseSalary) + Number(entry.reward) - Number(entry.lateDeduction) - extraDeduction);
        await prisma.payrollEntry.update({ where: { id: entry.id }, data: { extraDeduction, netPay } });
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "payroll.deductionAdded", entityType: "StaffDeduction", entityId: deduction.id, meta: { userId, month, amount, reason } });
      return deduction;
    },
    removeDeduction: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const deduction = await prisma.staffDeduction.findFirst({ where: { id: ctx.id, schoolId } });
      if (!deduction) throw new Error("Deduction not found");

      const entry = await prisma.payrollEntry.findUnique({ where: { schoolId_userId_month: { schoolId, userId: deduction.userId, month: deduction.month } } });
      if (entry) {
        if (entry.status !== "DRAFT") throw new Error("This month's payroll has already been published — unpublish it first if this deduction needs removing");
        const extraDeduction = Math.max(0, Number(entry.extraDeduction) - Number(deduction.amount));
        const netPay = Math.max(0, Number(entry.baseSalary) + Number(entry.reward) - Number(entry.lateDeduction) - extraDeduction);
        await prisma.payrollEntry.update({ where: { id: entry.id }, data: { extraDeduction, netPay } });
      }
      await prisma.staffDeduction.delete({ where: { id: ctx.id } });
      return { ok: true };
    },
    generate: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId; const month = str(ctx.body.month) ?? new Date().toISOString().slice(0, 7); const { start, end } = monthRange(month);
      const staff = await prisma.user.findMany({ where: { schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] }, status: "ACTIVE" }, include: { salaryProfile: true } });
      const { lateAfterTime, latePenaltyAmount } = await getPayrollRules(schoolId);
      const [attendanceRows, deductionRows] = await Promise.all([
        prisma.staffAttendance.findMany({ where: { schoolId, date: { gte: start, lt: end }, checkInAt: { not: null } }, select: { userId: true, checkInAt: true } }),
        prisma.staffDeduction.findMany({ where: { schoolId, month }, select: { userId: true, amount: true } }),
      ]);
      const attendanceByUser = new Map<string, { count: number; late: number }>();
      for (const row of attendanceRows) {
        const agg = attendanceByUser.get(row.userId) ?? { count: 0, late: 0 };
        agg.count += 1;
        if (isLateCheckIn(row.checkInAt!, lateAfterTime)) agg.late += 1;
        attendanceByUser.set(row.userId, agg);
      }
      const deductionByUser = new Map<string, number>();
      for (const row of deductionRows) deductionByUser.set(row.userId, (deductionByUser.get(row.userId) ?? 0) + Number(row.amount));
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
        const lateDeduction = attendance.late * latePenaltyAmount;
        // Any deductions already logged for this staff/month (see
        // addDeduction) are folded in here on first creation — logged after
        // that point, addDeduction patches the entry directly instead.
        const extraDeduction = deductionByUser.get(user.id) ?? 0;
        const netPay = Math.max(0, Number(profile.monthlyAmount) + Number(profile.rewardAmount) - lateDeduction - extraDeduction);
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
            extraDeduction,
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
      if (entry.status !== "DRAFT") throw new Error("Only a draft payroll entry can be changed — unpublish it first if it needs correcting");
      const { latePenaltyAmount } = await getPayrollRules(ctx.session.user.schoolId);
      const lateDays = Math.max(0, num(ctx.body.lateDays) ?? entry.lateDays);
      const reward = Math.max(0, num(ctx.body.reward) ?? Number(entry.reward));
      const extraDeduction = Math.max(0, num(ctx.body.extraDeduction) ?? Number(entry.extraDeduction));
      const lateDeduction = lateDays * latePenaltyAmount;
      const netPay = Math.max(0, Number(entry.baseSalary) + reward - lateDeduction - extraDeduction);
      return prisma.payrollEntry.update({ where: { id: entry.id }, data: { lateDays, lateDeduction, reward, extraDeduction, netPay, note: str(ctx.body.note) } });
    },
    // Deletes every still-DRAFT entry for a month — lets a bursar throw away
    // a bad generation and re-run `generate` from scratch. Never touches an
    // entry that's already been published or paid, so this is always safe
    // to call even on a month that's partly progressed.
    deleteDraft: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const month = str(ctx.body.month);
      if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("month (YYYY-MM) is required");
      const { count } = await prisma.payrollEntry.deleteMany({ where: { schoolId, month, status: "DRAFT" } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "payroll.draftDeleted", entityType: "PayrollEntry", entityId: month, meta: { month, count } });
      return { deleted: count };
    },
    // The "accept this draft" step: locks every DRAFT entry for the month
    // from further adjustment and makes it the school's official payroll
    // for that month, ready to actually disburse.
    publishMonth: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const month = str(ctx.body.month);
      if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("month (YYYY-MM) is required");
      const { count } = await prisma.payrollEntry.updateMany({ where: { schoolId, month, status: "DRAFT" }, data: { status: "PUBLISHED" } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "payroll.monthPublished", entityType: "PayrollEntry", entityId: month, meta: { month, count } });
      return { published: count };
    },
    // Reopens a published (not yet paid) month for correction — only
    // entries with nothing paid against them yet revert to DRAFT; anything
    // already PARTIAL/PAID is left untouched rather than risking an
    // inconsistent paidAmount-vs-status state.
    unpublishMonth: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const month = str(ctx.body.month);
      if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("month (YYYY-MM) is required");
      const { count } = await prisma.payrollEntry.updateMany({ where: { schoolId, month, status: "PUBLISHED", paidAmount: 0 }, data: { status: "DRAFT" } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "payroll.monthUnpublished", entityType: "PayrollEntry", entityId: month, meta: { month, count } });
      return { unpublished: count };
    },
    // Records a disbursement against one entry — full or partial. Requires
    // the month to have been published first (the review/accept step),
    // same as fees.ts's invoice payments require an invoice to exist.
    recordPayment: async (ctx) => {
      await assertPayrollAccess(ctx, true);
      const schoolId = ctx.session.user.schoolId;
      const entry = await prisma.payrollEntry.findFirst({ where: { id: ctx.id, schoolId } });
      if (!entry) throw new Error("Payroll entry not found");
      if (entry.status === "DRAFT") throw new Error("Publish this month's payroll before recording a payment");
      const remaining = Number(entry.netPay) - Number(entry.paidAmount);
      const amount = num(ctx.body.amount);
      if (amount === undefined || amount <= 0) throw new Error("A positive amount is required");
      if (amount > remaining) throw new Error(`Amount must not exceed what's left to pay (₦${remaining.toLocaleString()})`);
      const payment = await prisma.payrollPayment.create({
        data: {
          schoolId,
          payrollEntryId: entry.id,
          amount,
          method: (str(ctx.body.method) as "CASH") ?? "CASH",
          note: str(ctx.body.note),
          recordedByUserId: ctx.session.user.id,
        },
      });
      const paidAmount = Number(entry.paidAmount) + amount;
      const status = paidAmount >= Number(entry.netPay) ? "PAID" : "PARTIAL";
      const updated = await prisma.payrollEntry.update({
        where: { id: entry.id },
        data: { paidAmount, status, processedAt: status === "PAID" ? new Date() : entry.processedAt },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "payroll.paymentRecorded", entityType: "PayrollEntry", entityId: entry.id, meta: { amount, status } });
      return { entry: updated, payment };
    },
  },
};
