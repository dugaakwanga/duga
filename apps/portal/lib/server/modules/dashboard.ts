import { prisma, schoolFeeLedgerFor } from "@duga/core/server";
import type { Module } from ".";
import { subfeatureEnabled } from "../features";
import { feeInfoOf, isAssignedTo, resolveSection, staffBreakdown } from "../helpers";
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
      const [studentCount, staff, classCount, feeStudents, applications, unpaidOtherFees, today, attendanceTotal, attendancePresent, averageResult] = await Promise.all([
        prisma.student.count({ where: studentWhere }),
        staffBreakdown(schoolId, section),
        prisma.classGroup.count({ where: classWhere }),
        // The real "collected/owing" figure is the core school-fee ledger
        // (set per student via "Set school fees"), never an Invoice —
        // Invoice is the supplementary "other fees" system (PTA levy etc.).
        // feeDays is deliberately NOT required here — a fee amount entered
        // without a valid date window is still a real fee that must count
        // toward "what's expected/collected/owing"; the date window only
        // matters for the separate feature-access-expiry calculation.
        finance
          ? prisma.student.findMany({
              where: { ...studentWhere, feeAmount: { gt: 0 }, user: { status: "ACTIVE" } },
              select: { id: true, feeAmount: true, feeStartDate: true },
            })
          : Promise.resolve([]),
        prisma.application.count({ where: { schoolId, status: "RECEIVED", ...(section ? { section } : {}) } }),
        finance ? prisma.invoice.count({ where: { schoolId, status: { in: ["UNPAID", "PARTIAL"] }, ...(section ? { student: { is: { section } } } : {}) } }) : Promise.resolve(0),
        prisma.studentAttendance.count({ where: { ...attendanceWhere, date: new Date() } }),
        // Was a findMany() pulling up to 5000 raw rows (every attendance record
        // ever taken school-wide, unbounded by date) just to count them in JS
        // for a percentage — two COUNT queries get the same number without
        // shipping thousands of rows over the wire on every dashboard load.
        prisma.studentAttendance.count({ where: attendanceWhere }),
        prisma.studentAttendance.count({ where: { ...attendanceWhere, status: { in: ["PRESENT", "LATE"] } } }),
        prisma.reportCard.aggregate({ where: { schoolId, isPublished: true, ...(section ? { classGroup: { level: { section } } } : {}) }, _avg: { average: true }, _count: { average: true } }),
      ]);
      const attendanceRate = attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;
      const schoolFeeLedger = await schoolFeeLedgerFor(schoolId, feeStudents);
      let schoolFeeTotal = 0;
      let schoolFeePaid = 0;
      let schoolFeeOwing = 0;
      let owing = 0;
      for (const s of feeStudents) {
        const l = schoolFeeLedger.get(s.id)!;
        schoolFeeTotal += l.feeAmount;
        schoolFeePaid += l.paid;
        schoolFeeOwing += l.owing;
        if (l.owing > 0) owing++;
      }
      return {
        role,
        counts: { studentCount, staffCount: staff.teaching, staff, classCount, applications, unpaid: unpaidOtherFees, owing, today },
        schoolProgress: { attendanceRate, subjectAverage: Math.round(Number(averageResult._avg.average ?? 0) * 10) / 10, assessedStudents: averageResult._count.average },
        schoolFeeSummary: finance ? { total: schoolFeeTotal, paid: schoolFeePaid, owing: schoolFeeOwing } : null,
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
      const [classSubjects, upcomingLive, pendingGrading, formClasses] = await Promise.all([
        prisma.classSubject.findMany({
          where: { teacherId: teacher.id, ...(section ? { classGroup: { level: { section } } } : {}) },
          include: { classGroup: { include: { level: true } }, subject: true },
          take: 8,
        }),
        prisma.liveClass.findMany({ where: { teacherId: teacher.id, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 5 }),
        prisma.assignmentSubmission.count({ where: { schoolId, gradedAt: null, assignment: { teacherId: teacher.id } } }),
        prisma.classGroup.findMany({ where: { schoolId, formTeacherId: teacher.id }, include: { level: true } }),
      ]);

      // Class-teacher extension: an extra attendance-rate + performance card,
      // scoped only to the class(es) this teacher form-teaches (never shown
      // to a plain subject teacher).
      let classTeacherOf: Array<{ classGroupId: string; className: string; studentCount: number; attendanceRate: number; subjectAverage: number | null }> = [];
      if (formClasses.length) {
        const monthAgo = new Date(Date.now() - 30 * 86400000);
        classTeacherOf = await Promise.all(
          formClasses.map(async (cg) => {
            const [studentCount, attendanceRows, avgResult] = await Promise.all([
              prisma.student.count({ where: { schoolId, status: "ACTIVE", currentClassGroupId: cg.id } }),
              prisma.studentAttendance.findMany({ where: { schoolId, date: { gte: monthAgo }, classGroupId: cg.id }, select: { status: true } }),
              prisma.reportCard.aggregate({ where: { schoolId, isPublished: true, classGroupId: cg.id }, _avg: { average: true } }),
            ]);
            const present = attendanceRows.filter((row) => row.status === "PRESENT" || row.status === "LATE").length;
            return {
              classGroupId: cg.id,
              className: `${cg.level.name} ${cg.name}`,
              studentCount,
              attendanceRate: attendanceRows.length ? Math.round((present / attendanceRows.length) * 100) : 0,
              subjectAverage: avgResult._avg.average === null ? null : Math.round(Number(avgResult._avg.average) * 10) / 10,
            };
          }),
        );
      }

      return { role, classSubjects, upcomingLive, pendingGrading, classTeacherOf };
    }

    if (role === "PARENT") {
      const parent = ctx.session.user.parent!;
      const children = await prisma.studentParent.findMany({
        where: { parentId: parent.id },
        include: { student: { include: { classGroup: { include: { level: true } } } } },
      });
      const childIds = children.map((c) => c.studentId);
      // The real core school-fee ledger per child — never the Invoice
      // system below, which is only ever "other fees" (PTA levy etc.).
      const schoolFeeLedger = await schoolFeeLedgerFor(schoolId, children.map((c) => c.student));
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
      const childClassIdsUnique = [...new Set(children.map((c) => c.student.currentClassGroupId).filter((id): id is string => !!id))];
      const subjectRows = await prisma.classSubject.findMany({
        where: { classGroupId: { in: childClassIdsUnique } },
        include: { subject: { select: { id: true, name: true } } },
      });
      const subjectsByClass = new Map<string, Array<{ id: string; name: string }>>();
      for (const row of subjectRows) {
        const list = subjectsByClass.get(row.classGroupId) ?? [];
        list.push({ id: row.subject.id, name: row.subject.name });
        subjectsByClass.set(row.classGroupId, list);
      }
      const enriched = children.map((c) => {
        const att = attMap.get(c.studentId);
        return {
          ...c,
          student: {
            ...c.student,
            reportAverage: cardById.get(c.studentId) ?? null,
            schoolFee: schoolFeeLedger.get(c.studentId) ?? null,
            otherFeesBalance: invoiceById.get(c.studentId)?.balance ?? null,
            otherFeesStatus: invoiceById.get(c.studentId)?.status ?? null,
            attendancePct: att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null,
            subjectCount: countByClass.get(c.student.currentClassGroupId ?? "") ?? 0,
            subjects: subjectsByClass.get(c.student.currentClassGroupId ?? "") ?? [],
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
      // The real core school-fee ledger — never the (possibly null/other-
      // fees) invoice above.
      const schoolFee = (await schoolFeeLedgerFor(schoolId, [student])).get(student.id) ?? null;
      return { role, classSubjects, assignments, live, reportCard, invoice, fee: feeInfoOf(student), schoolFee };
    }

    if (role === "BURSAR") {
      if (!financeOn) {
        return { role, schoolFeeSummary: null, schoolFeeBySection: [], otherFeesSummary: null, counts: { owing: 0, unpaidOtherFees: 0 }, recentPayments: [] };
      }
      const section = await resolveSection(ctx);
      const studentSectionWhere = section ? { section } : {};
      const invoiceSectionWhere = section ? { student: { is: { section } } } : {};

      const [feeStudents, sections, otherFeesStats, unpaidOtherFees, recentPayments] = await Promise.all([
        // Every student with a core school-fee plan configured — the real
        // "what's supposed to come in / collected / owing" ledger, set per
        // student via "Set school fees" (never an Invoice). feeDays is NOT
        // required — see the identical note above.
        prisma.student.findMany({
          where: { schoolId, feeAmount: { gt: 0 }, ...studentSectionWhere, user: { status: "ACTIVE" } },
          select: { id: true, feeAmount: true, feeStartDate: true, section: true },
        }),
        prisma.schoolSection.findMany({ where: { schoolId }, select: { name: true }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
        prisma.invoice.aggregate({ where: { schoolId, ...invoiceSectionWhere }, _sum: { totalAmount: true, paidAmount: true, balance: true } }),
        prisma.invoice.count({ where: { schoolId, status: { in: ["UNPAID", "PARTIAL"] }, ...invoiceSectionWhere } }),
        prisma.payment.findMany({
          where: { schoolId, status: "SUCCESS", ...(section ? { student: { is: { section } } } : {}) },
          orderBy: { paidAt: "desc" },
          take: 5,
          include: { student: { select: { user: { select: { firstName: true, lastName: true } } } } },
        }),
      ]);

      const ledger = await schoolFeeLedgerFor(schoolId, feeStudents);
      let total = 0;
      let paid = 0;
      let owing = 0;
      let owingCount = 0;
      const bySection = new Map<string, { total: number; paid: number; owing: number }>();
      for (const s of feeStudents) {
        const l = ledger.get(s.id)!;
        total += l.feeAmount;
        paid += l.paid;
        owing += l.owing;
        if (l.owing > 0) owingCount++;
        const agg = bySection.get(s.section) ?? { total: 0, paid: 0, owing: 0 };
        agg.total += l.feeAmount;
        agg.paid += l.paid;
        agg.owing += l.owing;
        bySection.set(s.section, agg);
      }
      const schoolFeeBySection = sections
        .filter((sec) => bySection.has(sec.name))
        .map((sec) => ({ section: sec.name, ...bySection.get(sec.name)! }));

      return {
        role,
        schoolFeeSummary: { total, paid, owing },
        schoolFeeBySection,
        otherFeesSummary: { total: otherFeesStats._sum.totalAmount ?? 0, paid: otherFeesStats._sum.paidAmount ?? 0, balance: otherFeesStats._sum.balance ?? 0 },
        counts: { owing: owingCount, unpaidOtherFees },
        recentPayments,
      };
    }

    return { role };
  },
};
