import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { subfeatureEnabled } from "../features";
import { feeInfoOf } from "../helpers";

// Role-aware dashboard summaries.
export const dashboardModule: Module = {
  async list(ctx) {
    const role = ctx.session.user.role;
    const schoolId = ctx.session.user.schoolId;
    const financeOn = await subfeatureEnabled(schoolId, role, "finance");

    if (role === "OWNER" || role === "ADMIN") {
      const [studentCount, staffCount, classCount, invoiceStats, applications, unpaid, today] = await Promise.all([
        prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
        prisma.user.count({ where: { schoolId, role: { in: ["TEACHER", "ADMIN"] }, status: "ACTIVE" } }),
        prisma.classGroup.count({ where: { schoolId } }),
        prisma.invoice.aggregate({ where: { schoolId }, _sum: { totalAmount: true, paidAmount: true, balance: true } }),
        prisma.application.count({ where: { schoolId, status: "RECEIVED" } }),
        prisma.invoice.count({ where: { schoolId, status: { in: ["UNPAID", "PARTIAL"] } } }),
        prisma.studentAttendance.count({ where: { schoolId, date: new Date() } }),
      ]);
      // Finance figures are owner-only by default; the admin sees them only if
      // the owner granted finance access. The superadmin's finance master
      // switch overrides both (finance off -> figures hidden for everyone).
      let finance = financeOn;
      if (role === "ADMIN") {
        const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: "adminFinanceAccess" } } });
        finance = financeOn && (row?.value === true || row?.value === "true");
      }
      return {
        role,
        counts: { studentCount, staffCount, classCount, applications, unpaid, today },
        feeSummary: finance
          ? {
              total: invoiceStats._sum.totalAmount ?? 0,
              paid: invoiceStats._sum.paidAmount ?? 0,
              balance: invoiceStats._sum.balance ?? 0,
            }
          : null,
        recentAnnouncements: await prisma.announcement.findMany({
          where: { schoolId },
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { author: { select: { firstName: true, lastName: true } } },
        }),
      };
    }

    if (role === "TEACHER") {
      const teacher = ctx.session.user.teacher!;
      const [classSubjects, upcomingLive, pendingGrading] = await Promise.all([
        prisma.classSubject.findMany({
          where: { teacherId: teacher.id },
          include: { classGroup: { include: { level: true } }, subject: true },
          take: 8,
        }),
        prisma.liveClass.findMany({ where: { teacherId: teacher.id, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 5 }),
        prisma.assignmentSubmission.count({ where: { schoolId, gradedAt: null } }),
      ]);
      return { role, classSubjects, upcomingLive, pendingGrading };
    }

    if (role === "PARENT") {
      const parent = ctx.session.user.parent!;
      const children = await prisma.studentParent.findMany({
        where: { parentId: parent.id },
        include: { student: { include: { classGroup: { include: { level: true } } } } },
      });
      const childIds = children.map((c) => c.studentId);
      return {
        role,
        children,
        invoices: financeOn
          ? await prisma.invoice.findMany({ where: { schoolId, studentId: { in: childIds }, status: { in: ["UNPAID", "PARTIAL"] } }, take: 5 })
          : null,
        announcements: await prisma.announcement.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 3 }),
        reportCards: await prisma.reportCard.findMany({ where: { schoolId, studentId: { in: childIds }, isPublished: true }, include: { student: { select: { id: true } } }, take: 3 }),
      };
    }

    if (role === "STUDENT") {
      const student = ctx.session.user.student!;
      const classGroupId = student.currentClassGroupId;
      const [classSubjects, assignments, live, reportCard, invoice] = await Promise.all([
        prisma.classSubject.findMany({
          where: { classGroupId: classGroupId ?? "none" },
          include: { subject: true, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } },
        }),
        prisma.assignment.findMany({ where: { schoolId, isPublished: true }, include: { classSubject: { include: { subject: true } } }, take: 5 }),
        prisma.liveClass.findMany({
          where: { schoolId, status: "SCHEDULED", scheduledAt: { gte: new Date() } },
          orderBy: { scheduledAt: "asc" },
          take: 5,
        }),
        prisma.reportCard.findFirst({ where: { studentId: student.id }, orderBy: { createdAt: "desc" } }),
        financeOn
          ? prisma.invoice.findFirst({ where: { studentId: student.id }, orderBy: { createdAt: "desc" } })
          : Promise.resolve(null),
      ]);
      return { role, classSubjects, assignments, live, reportCard, invoice, fee: feeInfoOf(student) };
    }

    return { role };
  },
};
