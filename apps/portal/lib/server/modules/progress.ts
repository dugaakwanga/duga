import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { subfeatureEnabled } from "../features";

// ---------------------------------------------------------------------------
// School progress analytics — role-scoped statistical charts.
//  • OWNER/ADMIN  → whole-school overview
//  • TEACHER      → the classes & students they teach
//  • STUDENT      → their own progress
// ---------------------------------------------------------------------------

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

async function feesSeries(schoolId: string, studentIds?: string[]) {
  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  const where = {
    schoolId,
    status: "SUCCESS",
    paidAt: { gte: since },
    ...(studentIds ? { studentId: { in: studentIds } } : {}),
  } as never;
  const rows = await prisma.payment.findMany({ where, select: { paidAt: true, amount: true } });
  const buckets = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    buckets.set(monthLabel(d), 0);
  }
  for (const r of rows) {
    if (!r.paidAt) continue;
    const key = monthLabel(r.paidAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount));
  }
  return [...buckets.entries()].map(([label, value]) => ({ label, value }));
}

async function attendanceSeries(schoolId: string, studentIds?: string[]) {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const where = {
    schoolId,
    date: { gte: since },
    ...(studentIds ? { studentId: { in: studentIds } } : {}),
  } as never;
  const rows = await prisma.studentAttendance.findMany({ where, select: { date: true, status: true } });
  const buckets = new Map<string, { present: number; total: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), { present: 0, total: 0 });
  }
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    b.total += 1;
    if (r.status === "PRESENT") b.present += 1;
  }
  return [...buckets.entries()].map(([label, b]) => ({
    label: new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    value: b.total === 0 ? 0 : Math.round((b.present / b.total) * 100),
  }));
}

async function enrollmentSeries(schoolId: string, studentIds?: string[]) {
  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  const rows = await prisma.student.findMany({
    where: { schoolId, createdAt: { gte: since }, ...(studentIds ? { id: { in: studentIds } } : {}) },
    select: { createdAt: true },
  });
  const buckets = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    buckets.set(monthLabel(d), 0);
  }
  for (const r of rows) {
    const key = monthLabel(r.createdAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([label, value]) => ({ label, value }));
}

async function scoreSeries(schoolId: string, studentIds?: string[]) {
  const where = {
    schoolId,
    isPublished: true,
    average: { not: null },
    ...(studentIds ? { studentId: { in: studentIds } } : {}),
  } as never;
  const cards = await prisma.reportCard.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { average: true, term: { select: { name: true } } },
  });
  const byTerm = new Map<string, { total: number; count: number; pass: number }>();
  for (const c of cards) {
    const key = c.term?.name ?? "Unknown";
    const e = byTerm.get(key) ?? { total: 0, count: 0, pass: 0 };
    e.total += c.average ?? 0;
    e.count += 1;
    if ((c.average ?? 0) >= 50) e.pass += 1;
    byTerm.set(key, e);
  }
  return [...byTerm.entries()].map(([label, e]) => ({
    label,
    value: e.count === 0 ? 0 : Math.round(e.total / e.count),
    passRate: e.count === 0 ? 0 : Math.round((e.pass / e.count) * 100),
  }));
}

async function feeSummary(schoolId: string, studentIds?: string[]) {
  const where = { schoolId, ...(studentIds ? { studentId: { in: studentIds } } : {}) } as never;
  const agg = await prisma.invoice.aggregate({ where, _sum: { totalAmount: true, paidAmount: true, balance: true } });
  return {
    total: agg._sum.totalAmount ?? 0,
    paid: agg._sum.paidAmount ?? 0,
    balance: agg._sum.balance ?? 0,
  };
}

async function classStats(schoolId: string, teacherId?: string, studentIds?: string[]) {
  const studentWhere = {
    schoolId,
    status: "ACTIVE",
    ...(studentIds ? { id: { in: studentIds } } : {}),
  } as never;
  const [studentCount, teacherCount, classCount] = await Promise.all([
    prisma.student.count({ where: studentWhere }),
    prisma.user.count({ where: { schoolId, role: { in: ["TEACHER", "ADMIN"] }, status: "ACTIVE" } }),
    prisma.classGroup.count({ where: teacherId ? { schoolId, formTeacherId: teacherId } : { schoolId } }),
  ]);
  return { studentCount, teacherCount, classCount };
}

export const progressModule: Module = {
  async list(ctx) {
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const teacher = ctx.session.user.teacher;

    // Teacher scope: students in the classes/subjects they teach.
    let scopedStudentIds: string[] | undefined;
    if (role === "TEACHER" && teacher) {
      const classSubjectIds = (
        await prisma.classSubject.findMany({
          where: { teacherId: teacher.id },
          select: { classGroupId: true },
        })
      ).map((c) => c.classGroupId);
      const students = await prisma.student.findMany({
        where: { schoolId, status: "ACTIVE", currentClassGroupId: { in: classSubjectIds } },
        select: { id: true },
        take: 500,
      });
      scopedStudentIds = students.map((s) => s.id);
    }

    // Student scope: just themselves.
    let ownIds: string[] | undefined;
    if (role === "STUDENT" && ctx.session.user.student) {
      ownIds = [ctx.session.user.student.id];
    }

    // Parent scope: only the children linked to this parent.
    let parentIds: string[] | undefined;
    if (role === "PARENT" && ctx.session.user.parent) {
      const links = await prisma.studentParent.findMany({
        where: { parentId: ctx.session.user.parent.id },
        select: { studentId: true },
      });
      parentIds = links.map((l) => l.studentId);
    }

    const ids = role === "TEACHER" ? scopedStudentIds : role === "STUDENT" ? ownIds : role === "PARENT" ? parentIds : undefined;

    const financeOn = await subfeatureEnabled(schoolId, role, "finance");
    const [fees, attendance, enrollment, scores, summary, classes] = await Promise.all([
      financeOn ? feesSeries(schoolId, ids) : Promise.resolve([] as Array<{ label: string; value: number }>),
      attendanceSeries(schoolId, ids),
      enrollmentSeries(schoolId, ids),
      scoreSeries(schoolId, ids),
      financeOn ? feeSummary(schoolId, ids) : Promise.resolve({ total: 0, paid: 0, balance: 0 }),
      classStats(schoolId, role === "TEACHER" ? teacher?.id : undefined, ids),
    ]);

    return {
      role,
      scoped: role === "OWNER" ? false : true,
      classes,
      fees: financeOn ? { series: fees, summary } : null,
      attendance: { series: attendance },
      enrollment: { series: enrollment },
      scores: { series: scores },
      generatedAt: new Date().toISOString(),
    };
  },
};
