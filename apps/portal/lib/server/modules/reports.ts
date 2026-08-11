import { prisma } from "@duga/core/server";
import type { Module } from ".";

// The finance/reports dashboard is owner-only by default. The owner can grant
// the admin access via the "adminFinanceAccess" school setting (settings page).
async function canViewFinance(ctx: { session: { user: { role: string; schoolId: string } } }): Promise<boolean> {
  const role = ctx.session.user.role;
  if (role === "OWNER") return true;
  if (role !== "ADMIN") return false;
  const row = await prisma.schoolSetting.findUnique({
    where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: "adminFinanceAccess" } },
  });
  return row?.value === true || row?.value === "true";
}

export const reportsModule: Module = {
  async list(ctx) {
    if (!(await canViewFinance(ctx))) {
      const err = new Error("Only the school owner can view the finance dashboard") as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    const schoolId = ctx.session.user.schoolId;

    // Fee collection summary (owner-only financials)
    const feeSummary = await prisma.invoice.aggregate({
      where: { schoolId },
      _sum: { totalAmount: true, paidAmount: true, balance: true },
      _count: true,
    });
    const byStatus = await prisma.invoice.groupBy({ by: ["status"], where: { schoolId }, _count: true, _sum: { paidAmount: true, balance: true } });
    const paymentsByMethod = await prisma.payment.groupBy({ by: ["method"], where: { schoolId, status: "SUCCESS" }, _sum: { amount: true }, _count: true });

    // Attendance overview
    const attendance = await prisma.studentAttendance.groupBy({
      by: ["status"],
      where: { schoolId },
      _count: true,
    });

    const [studentCount, staffCount, termCount, classCount] = await Promise.all([
      prisma.student.count({ where: { schoolId } }),
      prisma.user.count({ where: { schoolId, role: { in: ["TEACHER", "ADMIN"] } } }),
      prisma.term.count({ where: { schoolId } }),
      prisma.classGroup.count({ where: { schoolId } }),
    ]);

    return {
      feeSummary,
      byStatus,
      paymentsByMethod,
      attendance,
      counts: { studentCount, staffCount, termCount, classCount },
    };
  },

  actions: {
    // Fee status per class/term for the fees dashboard
    feeStatus: async (ctx) => {
      if (!(await canViewFinance(ctx))) {
        const err = new Error("Only the school owner can view the finance dashboard") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
      const schoolId = ctx.session.user.schoolId;
      const classGroups = await prisma.classGroup.findMany({
        where: { schoolId },
        include: { level: true, _count: { select: { students: true } } },
      });
      const invoices = await prisma.invoice.findMany({
        where: { schoolId },
        include: { student: true },
      });
      const rows = classGroups.map((cg) => {
        const classInvoices = invoices.filter((i) => i.student.currentClassGroupId === cg.id);
        return {
          class: `${cg.level.name} ${cg.name}`,
          students: cg._count.students,
          invoiced: classInvoices.length,
          paid: classInvoices.filter((i) => ["PAID", "OVERPAID"].includes(i.status)).length,
          partial: classInvoices.filter((i) => i.status === "PARTIAL").length,
          unpaid: classInvoices.filter((i) => i.status === "UNPAID").length,
          collected: classInvoices.reduce((a, i) => a + Number(i.paidAmount), 0),
          expected: classInvoices.reduce((a, i) => a + Number(i.totalAmount), 0),
        };
      });
      return rows;
    },
  },
};
