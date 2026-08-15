import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { subfeatureEnabled } from "../features";
import { feeInfoOf, isAssignedTo, resolveSection } from "../helpers";
import type { Section } from "@/lib/sections";

// Role-aware dashboard summaries.
export const dashboardModule: Module = {
  async list(ctx) {
    const role = ctx.session.user.role;
    const schoolId = ctx.session.user.schoolId;
    const financeOn = await subfeatureEnabled(schoolId, role, "finance");

    if (role === "OWNER" || role === "ADMIN") {
      const section = await resolveSection(ctx);
      const studentWhere: { schoolId: string; status: "ACTIVE"; section?: Section } = {
        schoolId,
        status: "ACTIVE",
        ...(section ? { section } : {}),
      };
      const classWhere = { schoolId, ...(section ? { level: { section } } : {}) };
      // Finance remains owner-only unless the owner explicitly grants the
      // admin access. Never calculate or return it for an unauthorised admin.
      let finance = financeOn;
      if (role === "ADMIN") {
        const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: "adminFinanceAccess" } } });
        finance = financeOn && (row?.value === true || row?.value === "true");
      }
      const attendanceWhere = { schoolId, ...(section ? { student: { section } } : {}) };
      const [studentCount, staff, classCount, invoiceStats, applications, unpaid, today, attendanceRows, averageResult] = await Promise.all([
        prisma.student.count({ where: studentWhere }),
        prisma.teacher.findMany({ where: { schoolId, user: { status: "ACTIVE" } }, select: { id: true, sections: true } }),
        prisma.classGroup.count({ where: classWhere }),
        finance ? prisma.invoice.aggregate({ where: { schoolId, ...(section ? { student: { is: { section } } } : {}) }, _sum: { totalAmount: true, paidAmount: true, balance: true } }) : Promise.resolve({ _sum: { totalAmount: 0, paidAmount: 0, balance: 0 } }),
        prisma.application.count({ where: { schoolId, status: "RECEIVED", ...(section ? { section } : {}) } }),
        finance ? prisma.invoice.count({ where: { schoolId, status: { in: ["UNPAID", "PARTIAL"] }, ...(section ? { student: { is: { section } } } : {}) } }) : Promise.resolve(0),
        prisma.studentAttendance.count({ where: { ...attendanceWhere, date: new Date() } }),
        prisma.studentAttendance.findMany({ where: attendanceWhere, select: { status: true }, take: 5000 }),
        prisma.reportCard.aggregate({ where: { schoolId, isPublished: true, ...(section ? { classGroup: { level: { section } } } : {}) }, _avg: { average: true }, _count: { average: true } }),
      ]);
      const staffCount = section ? staff.filter((teacher) => Array.isArray(teacher.sections) && teacher.sections.includes(section)).length : staff.length;
      const present = attendanceRows.filter((row) => row.status === "PRESENT" || row.status === "LATE").length;
      const attendanceRate = attendanceRows.length ? Math.round((present / attendanceRows.length) * 100) : 0;
      return {
        role,
        counts: { studentCount, staffCount, classCount, applications, unpaid, today },
        schoolProgress: { attendanceRate, subjectAverage: Math.round(Number(averageResult._avg.average ?? 0) * 10) / 10, assessedStudents: averageResult._count.average },
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
      const section = await resolveSection(ctx);
      const [classSubjects, upcomingLive, pendingGrading] = await Promise.all([
        prisma.classSubject.findMany({
          where: { teacherId: teacher.id, ...(section ? { classGroup: { level: { section } } } : {}) },
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
      const monthAgo = new Date(Date.now() - 30 * 86400000);
      const [reportCards, latestInvoices, attendanceRows, subjectCounts] = await Promise.all([
        prisma.reportCard.findMany({
          where: { schoolId, studentId: { in: childIds }, isPublished: true },
          orderBy: { createdAt: "desc" },
          distinct: ["studentId"],
          select: { studentId: true, average: true },
        }),
        financeOn
          ? prisma.invoice.findMany({
              where: { schoolId, studentId: { in: childIds } },
              orderBy: { createdAt: "desc" },
              distinct: ["studentId"],
              select: { studentId: true, balance: true, status: true },
            })
          : Promise.resolve([] as Array<{ studentId: string; balance: number; status: string }>),
        prisma.studentAttendance.findMany({
          where: { schoolId, studentId: { in: childIds }, date: { gte: monthAgo } },
          select: { studentId: true, status: true },
        }),
        prisma.classSubject.groupBy({
          by: ["classGroupId"],
          where: { classGroupId: { in: children.map((c) => c.student.currentClassGroupId ?? "none") } },
          _count: { _all: true },
        }),
      ]);
      const cardById = new Map(reportCards.map((r) => [r.studentId, r.average]));
      const invoiceById = new Map(latestInvoices.map((i) => [i.studentId, i]));
      const attMap = new Map<string, { present: number; total: number }>();
      for (const a of attendanceRows) {
        const e = attMap.get(a.studentId) ?? { present: 0, total: 0 };
        e.total += 1;
        if (a.status === "PRESENT") e.present += 1;
        attMap.set(a.studentId, e);
      }
      const countByClass = new Map(subjectCounts.map((s) => [s.classGroupId, s._count._all]));
      const enriched = children.map((c) => {
        const att = attMap.get(c.studentId);
        return {
          ...c,
          student: {
            ...c.student,
            reportAverage: cardById.get(c.studentId) ?? null,
            feeBalance: invoiceById.get(c.studentId)?.balance ?? null,
            feeStatus: invoiceById.get(c.studentId)?.status ?? null,
            attendancePct: att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null,
            subjectCount: countByClass.get(c.student.currentClassGroupId ?? "") ?? 0,
          },
        };
      });
      const childSections = [...new Set(children.map((child) => child.student.section))];
      const childClassIds = [...new Set(children.map((child) => child.student.currentClassGroupId).filter((id): id is string => !!id))];
      const childLevelIds = [...new Set(children.map((child) => child.student.classGroup?.levelId).filter((id): id is string => !!id))];
      const announcements = await prisma.announcement.findMany({
        where: {
          schoolId,
          OR: [
            { audience: "EVERYONE" },
            { audience: "ROLE", targetRole: "PARENT" },
            ...(childSections.length ? [{ audience: "SECTION" as const, targetSection: { in: childSections } }] : []),
            ...(childClassIds.length ? [{ audience: "CLASS" as const, targetClassGroupId: { in: childClassIds } }] : []),
            ...(childLevelIds.length ? [{ audience: "LEVEL" as const, targetLevelId: { in: childLevelIds } }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      return {
        role,
        children: enriched,
        invoices: financeOn
          ? await prisma.invoice.findMany({ where: { schoolId, studentId: { in: childIds }, status: { in: ["UNPAID", "PARTIAL"] } }, take: 5 })
          : null,
        announcements,
        reportCards: await prisma.reportCard.findMany({ where: { schoolId, studentId: { in: childIds }, isPublished: true }, include: { student: { select: { id: true } } }, take: 3 }),
      };
    }

    if (role === "STUDENT") {
      const student = ctx.session.user.student!;
      const classGroupId = student.currentClassGroupId;
      const [classSubjects, assignmentCandidates, live, reportCard, invoice] = await Promise.all([
        prisma.classSubject.findMany({
          where: { classGroupId: classGroupId ?? "none" },
          include: { subject: true, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } },
        }),
        prisma.assignment.findMany({
          where: { schoolId, isPublished: true, classSubject: { classGroupId: classGroupId ?? "none" } },
          include: { classSubject: { include: { subject: true } } },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        prisma.liveClass.findMany({
          where: { schoolId, status: "SCHEDULED", scheduledAt: { gte: new Date() }, classSubject: { classGroupId: classGroupId ?? "none" } },
          orderBy: { scheduledAt: "asc" },
          take: 5,
        }),
        prisma.reportCard.findFirst({ where: { studentId: student.id }, orderBy: { createdAt: "desc" } }),
        financeOn
          ? prisma.invoice.findFirst({ where: { studentId: student.id }, orderBy: { createdAt: "desc" } })
          : Promise.resolve(null),
      ]);
      const assignments = assignmentCandidates
        .filter((assignment) => isAssignedTo(assignment, student.id, classGroupId))
        .slice(0, 5);
      return { role, classSubjects, assignments, live, reportCard, invoice, fee: feeInfoOf(student) };
    }

    return { role };
  },
};
