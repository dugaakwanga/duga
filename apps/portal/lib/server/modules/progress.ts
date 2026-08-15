import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { subfeatureEnabled } from "../features";

// ---------------------------------------------------------------------------
// School progress analytics — role-scoped.
//  • OWNER  → everything (whole school + finance)
//  • ADMIN  → whole school except money
//  • BURSAR → monetary progress only
//  • TEACHER→ their classes & subjects (academic + attendance)
//  • STUDENT→ their own progress
//  • PARENT → their linked children
// ---------------------------------------------------------------------------

type SectionFlags = { fees: boolean; attendance: boolean; enrollment: boolean; scores: boolean; classes: boolean };

const ROLE_SECTIONS: Record<string, SectionFlags> = {
  OWNER: { fees: true, attendance: true, enrollment: true, scores: true, classes: true },
  ADMIN: { fees: false, attendance: true, enrollment: true, scores: true, classes: true },
  BURSAR: { fees: true, attendance: false, enrollment: false, scores: false, classes: false },
  TEACHER: { fees: false, attendance: true, enrollment: true, scores: true, classes: true },
  STUDENT: { fees: false, attendance: true, enrollment: false, scores: true, classes: true },
  PARENT: { fees: false, attendance: true, enrollment: false, scores: true, classes: true },
};

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

async function subjectScoreSeries(schoolId: string, classSubjectIds: string[]) {
  if (classSubjectIds.length === 0) return [];
  const items = await prisma.reportCardItem.findMany({
    where: {
      classSubjectId: { in: classSubjectIds },
      reportCard: { schoolId, isPublished: true },
    },
    select: { total: true, reportCard: { select: { term: { select: { name: true } } } } },
  });
  const byTerm = new Map<string, { total: number; count: number; pass: number }>();
  for (const item of items) {
    if (item.total === null) continue;
    const key = item.reportCard.term?.name ?? "Unknown";
    const entry = byTerm.get(key) ?? { total: 0, count: 0, pass: 0 };
    entry.total += item.total;
    entry.count += 1;
    if (item.total >= 50) entry.pass += 1;
    byTerm.set(key, entry);
  }
  return [...byTerm.entries()].map(([label, entry]) => ({
    label,
    value: entry.count === 0 ? 0 : Math.round(entry.total / entry.count),
    passRate: entry.count === 0 ? 0 : Math.round((entry.pass / entry.count) * 100),
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

export const progressModule: Module = {
  async list(ctx) {
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const teacher = ctx.session.user.teacher;
    const student = ctx.session.user.student;
    const parent = ctx.session.user.parent;
    const sections = ROLE_SECTIONS[role] ?? { fees: false, attendance: true, enrollment: false, scores: true, classes: true };

    // Resolve which student ids this role sees.
    let ids: string[] | undefined;
    let myClasses: Array<{ id: string; name: string; levelName: string; studentCount: number }> = [];
    if (role === "TEACHER" && teacher) {
      const taught = await prisma.classSubject.findMany({
        where: { teacherId: teacher.id },
        select: { classGroupId: true },
      });
      const classGroupIds = new Set(taught.map((r) => r.classGroupId));
      const formClasses = await prisma.classGroup.findMany({
        where: { schoolId, formTeacherId: teacher.id },
        select: { id: true },
      });
      for (const c of formClasses) classGroupIds.add(c.id);
      const [students, classGroups] = await Promise.all([
        prisma.student.findMany({
          where: { schoolId, status: "ACTIVE", currentClassGroupId: { in: [...classGroupIds] } },
          select: { id: true },
          take: 500,
        }),
        prisma.classGroup.findMany({
          where: { schoolId, id: { in: [...classGroupIds] } },
          select: { id: true, name: true, level: { select: { name: true } }, students: { where: { status: "ACTIVE" }, select: { id: true } } },
        }),
      ]);
      ids = students.map((s) => s.id);
      myClasses = classGroups.map((cg) => ({ id: cg.id, name: `${cg.level.name} ${cg.name}`, levelName: cg.level.name, studentCount: cg.students.length }));
    } else if (role === "STUDENT" && student) {
      ids = [student.id];
    } else if (role === "PARENT" && parent) {
      const links = await prisma.studentParent.findMany({ where: { parentId: parent.id }, select: { studentId: true } });
      ids = links.map((l) => l.studentId);
    }

    const financeOn = await subfeatureEnabled(schoolId, role, "finance");
    const showFees = sections.fees && financeOn;
    const teacherClassSubjectIds = role === "TEACHER" && teacher
      ? (await prisma.classSubject.findMany({ where: { teacherId: teacher.id }, select: { id: true } })).map((item) => item.id)
      : [];

    const [fees, attendance, enrollment, scores, feeSum, scopeStats] = await Promise.all([
      showFees ? feesSeries(schoolId, ids) : Promise.resolve([] as Array<{ label: string; value: number }>),
      sections.attendance ? attendanceSeries(schoolId, ids) : Promise.resolve([] as Array<{ label: string; value: number }>),
      sections.enrollment ? enrollmentSeries(schoolId, ids) : Promise.resolve([] as Array<{ label: string; value: number }>),
      sections.scores
        ? role === "TEACHER"
          ? subjectScoreSeries(schoolId, teacherClassSubjectIds)
          : scoreSeries(schoolId, ids)
        : Promise.resolve([] as Array<{ label: string; value: number; passRate: number }>),
      showFees ? feeSummary(schoolId, ids) : Promise.resolve({ total: 0, paid: 0, balance: 0 }),
      classStats(schoolId, ids),
    ]);

    // Teacher: subject-level averages from the classes they teach.
    let subjects: Array<{ id: string; name: string; section: string; classGroupName: string; value: number; students: number; count: number }> = [];
    if (role === "TEACHER" && teacher) {
      const classSubjects = await prisma.classSubject.findMany({
        where: { teacherId: teacher.id },
        select: {
          id: true,
          classGroup: { select: { id: true, name: true, level: { select: { name: true } } } },
          subject: { select: { name: true, section: true } },
        },
      });
      if (classSubjects.length) {
        const items = await prisma.reportCardItem.findMany({
          where: { classSubjectId: { in: classSubjects.map((cs) => cs.id) }, reportCard: { isPublished: true, schoolId } },
          select: { total: true, classSubjectId: true },
        });
        const counts = new Map<string, number>();
        for (const cg of myClasses) counts.set(cg.id, cg.studentCount);
        const map = new Map<string, { id: string; name: string; section: string; classGroupName: string; value: number; students: number; count: number }>();
        for (const cs of classSubjects) {
          const groupName = `${cs.classGroup.level.name} ${cs.classGroup.name}`;
          map.set(cs.id, { id: cs.id, name: cs.subject.name, section: cs.subject.section, classGroupName: groupName, value: 0, students: counts.get(cs.classGroup.id) ?? 0, count: 0 });
        }
        for (const it of items) {
          const e = map.get(it.classSubjectId ?? "");
          if (!e || it.total === null) continue;
          e.value += it.total;
          e.count += 1;
        }
        subjects = [...map.values()].map((e) => ({ ...e, value: e.count === 0 ? 0 : Math.round(e.value / e.count) }));
        subjects.sort((a, b) => a.classGroupName.localeCompare(b.classGroupName) || a.name.localeCompare(b.name));
      }
    }

    return {
      role,
      scope:
        role === "OWNER" || role === "ADMIN" || role === "BURSAR"
          ? "school"
          : role === "TEACHER"
            ? "classes"
            : role === "STUDENT"
              ? "own"
              : "children",
      sections,
      classes: role === "TEACHER" ? { ...scopeStats, classCount: myClasses.length } : scopeStats,
      myClasses,
      subjects,
      fees: showFees ? { series: fees, summary: feeSum } : null,
      attendance: sections.attendance ? { series: attendance } : null,
      enrollment: sections.enrollment ? { series: enrollment } : null,
      scores: sections.scores ? { series: scores } : null,
      generatedAt: new Date().toISOString(),
    };
  },
};

async function classStats(schoolId: string, ids?: string[]) {
  const studentWhere = { schoolId, status: "ACTIVE", ...(ids ? { id: { in: ids } } : {}) } as never;
  const [studentCount, teacherCount, classCount] = await Promise.all([
    prisma.student.count({ where: studentWhere }),
    prisma.user.count({ where: { schoolId, role: { in: ["TEACHER", "ADMIN", "BURSAR"] }, status: "ACTIVE" } }),
    prisma.classGroup.count({ where: { schoolId } }),
  ]);
  return { studentCount, teacherCount, classCount };
}
