import { prisma } from "./prisma";
import { computeGrade } from "../grading";
import { getDefaultGradingScale } from "./school";

export interface ResultComponent {
  name: string;
  category: "CA" | "EXAM";
  max: number;
  order: number;
}

export interface ResultConfigShape {
  id: string;
  schoolId: string;
  caCap: number;
  examCap: number;
  components: ResultComponent[];
}

export const DEFAULT_RESULT_COMPONENTS: ResultComponent[] = [
  { name: "CA1", category: "CA", max: 10, order: 1 },
  { name: "CA2", category: "CA", max: 10, order: 2 },
  { name: "CA3", category: "CA", max: 10, order: 3 },
  { name: "Test", category: "CA", max: 10, order: 4 },
  { name: "Assignment", category: "CA", max: 10, order: 5 },
  { name: "Exam", category: "EXAM", max: 60, order: 6 },
];

export const DEFAULT_CA_CAP = 40;
export const DEFAULT_EXAM_CAP = 60;

// The seven traits on the school's printed behavioral-assessment grid,
// graded A-E. Seeded onto a report card's `psychomotor` field when it's
// first collated (left blank — "" — until the class teacher grades them);
// re-collation never overwrites a value the teacher/admin already set.
export const DEFAULT_BEHAVIORAL_TRAITS = [
  "Neatness",
  "Punctuality",
  "Honesty",
  "Self Control",
  "Obedience",
  "Politeness",
  "Relationship with Others",
];

// Runs `fn` over `items` with at most `limit` in flight at once — the
// remote Supabase pooler this app talks to (see .env DATABASE_URL's
// connection_limit) only allows a handful of concurrent connections, so an
// unbounded Promise.all over a whole class's worth of writes would just
// queue up and time out instead of actually running faster.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function normalizeComponents(value: unknown): ResultComponent[] {
  if (!Array.isArray(value)) return DEFAULT_RESULT_COMPONENTS;
  const comps = (value as Array<{ name?: unknown; category?: unknown; max?: unknown; order?: unknown }>)
    .filter((c) => typeof c.name === "string" && c.name && (c.category === "CA" || c.category === "EXAM"))
    .map((c, i) => ({
      name: c.name as string,
      category: c.category as "CA" | "EXAM",
      max: typeof c.max === "number" && c.max >= 0 ? c.max : 0,
      order: typeof c.order === "number" ? c.order : i,
    }))
    .filter((c) => c.max > 0);
  return comps.length ? comps : DEFAULT_RESULT_COMPONENTS;
}

// Each school section (Primary, Secondary, ...) can have its own result
// configuration. A section-specific row (section = e.g. "Primary") is
// preferred; the school-wide row (section = "") is the fallback when a
// section has no config of its own, and the hardcoded defaults are the
// fallback below that.
export async function getResultConfig(schoolId: string, section?: string): Promise<ResultConfigShape> {
  const row = section
    ? (await prisma.resultConfig.findUnique({ where: { schoolId_section: { schoolId, section } } })) ??
      (await prisma.resultConfig.findUnique({ where: { schoolId_section: { schoolId, section: "" } } }))
    : await prisma.resultConfig.findUnique({ where: { schoolId_section: { schoolId, section: "" } } });
  return {
    id: row?.id ?? "",
    schoolId,
    caCap: row?.caCap ?? DEFAULT_CA_CAP,
    examCap: row?.examCap ?? DEFAULT_EXAM_CAP,
    components: row ? normalizeComponents(row.components) : DEFAULT_RESULT_COMPONENTS,
  };
}

// Compute CA/EXAM/total from a component->score map, capped by the config.
export function computeScoreTotals(
  config: ResultConfigShape,
  scores: Record<string, number | null | undefined>,
): { ca: number; exam: number; total: number } {
  let ca = 0;
  let exam = 0;
  for (const comp of config.components) {
    const raw = scores?.[comp.name];
    const v = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(raw, comp.max)) : 0;
    if (comp.category === "EXAM") exam += v;
    else ca += v;
  }
  ca = Math.min(ca, config.caCap);
  exam = Math.min(exam, config.examCap);
  return { ca, exam, total: ca + exam };
}

export interface CollateOptions {
  schoolId: string;
  termId: string;
  classGroupId: string;
  publishedBy?: string;
  publish?: boolean;
  // When provided, only these students get published (position/rank is still
  // computed across the whole class). Used for per-student publishing.
  publishStudentIds?: string[];
}

export async function collateReportCards(opts: CollateOptions) {
  const { schoolId, termId, classGroupId, publishedBy, publish, publishStudentIds } = opts;

  const term = await prisma.term.findFirst({ where: { id: termId, schoolId } });
  if (!term) throw new Error("Term not found");

  const classGroup = await prisma.classGroup.findFirst({
    where: { id: classGroupId, schoolId },
    include: { level: true },
  });
  if (!classGroup) throw new Error("Class not found");

  const classSubjects = await prisma.classSubject.findMany({
    where: { classGroupId },
    include: { subject: true },
  });

  const students = await prisma.student.findMany({
    where: { schoolId, currentClassGroupId: classGroupId, status: "ACTIVE" },
    orderBy: { admissionNumber: "asc" },
  });

  // Grading scale: use the school's default scheme, or fall back to the
  // standard WAEC-style scale when none is configured so grades are never empty.
  const scale = await getDefaultGradingScale(schoolId, classGroup.level.section);

  // Next term (same session, next termNumber) — used for "next term's fees"
  // and the "payable on or before" date. Left null past the last term of a
  // session; that data isn't knowable until the next session is set up.
  const nextTerm = await prisma.term.findFirst({
    where: { schoolId, sessionId: term.sessionId, termNumber: term.termNumber + 1 },
  });

  // Attendance: how many distinct days this class took attendance this term
  // ("No. of times school opened"), and how many of those each student was
  // marked present for.
  const attendanceRows = await prisma.studentAttendance.findMany({
    where: { schoolId, classGroupId, termId },
    select: { date: true, studentId: true, status: true },
  });
  const schoolDaysOpened = new Set(attendanceRows.map((r) => r.date.toISOString().slice(0, 10))).size;
  const daysPresentByStudent = new Map<string, number>();
  for (const row of attendanceRows) {
    if (row.status === "PRESENT" || row.status === "LATE") {
      daysPresentByStudent.set(row.studentId, (daysPresentByStudent.get(row.studentId) ?? 0) + 1);
    }
  }

  // Fees: this term's invoice balance ("fees owed") and next term's
  // applicable fee structures ("next term's fees"), same most-specific-wins
  // matching fees.ts uses when generating invoices.
  const [invoices, nextTermStructures] = await Promise.all([
    prisma.invoice.findMany({ where: { schoolId, termId, studentId: { in: students.map((s) => s.id) } } }),
    nextTerm
      ? prisma.feeStructure.findMany({ where: { schoolId, termId: nextTerm.id } })
      : Promise.resolve([]),
  ]);
  const invoiceByStudent = new Map(invoices.map((inv) => [inv.studentId, inv]));
  const nextTermFeesByStudent = new Map<string, number>();
  for (const student of students) {
    const applicable = nextTermStructures.filter(
      (s) =>
        (!s.classGroupId || s.classGroupId === classGroupId) &&
        (!s.levelId || s.levelId === classGroup.levelId) &&
        (!s.section || s.section === student.section),
    );
    if (applicable.length) {
      nextTermFeesByStudent.set(student.id, applicable.reduce((a, s) => a + Number(s.amount), 0));
    }
  }

  const asOfDate = term.endDate ?? new Date();
  function ageAsOf(dob: Date | null): number | null {
    if (!dob) return null;
    let age = asOfDate.getFullYear() - dob.getFullYear();
    const beforeBirthday = asOfDate.getMonth() < dob.getMonth() || (asOfDate.getMonth() === dob.getMonth() && asOfDate.getDate() < dob.getDate());
    if (beforeBirthday) age -= 1;
    return age;
  }

  // Subject score matrix built from per-student SubjectScore rows, keeping
  // the full row (not just its total) so ca/exam/component breakdown can be
  // snapshotted onto the report exactly as entered, not re-derived.
  const subjectScoreRows: Record<string, Map<string, { ca: number; exam: number; total: number; scores: unknown }>> = {};
  const studentTotals: Record<string, number> = {};
  const studentCount: Record<string, number> = {};
  const subjectStudents: Record<string, number[]> = {};
  const subjectsInReport: Record<string, { id: string; name: string; classSubjectId: string }> = {};

  for (const cs of classSubjects) {
    const key = cs.subjectId;
    subjectsInReport[key] = { id: cs.subjectId, name: cs.subject.name, classSubjectId: cs.id };
    subjectStudents[key] = [];

    const rows = await prisma.subjectScore.findMany({ where: { classSubjectId: cs.id, termId } });
    const byStudent = new Map(rows.map((r) => [r.studentId, { ca: r.caTotal, exam: r.examTotal, total: r.total, scores: r.scores }]));
    subjectScoreRows[key] = byStudent;

    for (const student of students) {
      const total = byStudent.get(student.id)?.total ?? 0;
      subjectStudents[key].push(total);
      studentTotals[student.id] = (studentTotals[student.id] ?? 0) + total;
      studentCount[student.id] = (studentCount[student.id] ?? 0) + 1;
    }
  }
  const classAverageBySubject: Record<string, number> = {};
  for (const [key, totals] of Object.entries(subjectStudents)) {
    classAverageBySubject[key] = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : 0;
  }

  const allAverages = students.map((s) => {
    const total = studentTotals[s.id];
    const count = studentCount[s.id];
    return count ? (total ?? 0) / count : 0;
  });
  const ranked = [...allAverages].sort((a, b) => b - a);

  const shouldPublish = (studentId: string) => {
    if (!publish) return false;
    if (publishStudentIds && publishStudentIds.length > 0) return publishStudentIds.includes(studentId);
    return true;
  };

  // One batch read for every student's existing card (instead of one query
  // per student) — needed only to preserve `psychomotor`/`publishedAt` state
  // that an upsert's `update` branch can't conditionally read for itself.
  const existingCards = await prisma.reportCard.findMany({ where: { termId, studentId: { in: students.map((s) => s.id) } } });
  const existingByStudent = new Map(existingCards.map((c) => [c.studentId, c]));

  // A remote Supabase pooler connection is the bottleneck here, not CPU —
  // cap how many upserts run at once instead of firing them all together.
  const WRITE_CONCURRENCY = 4;

  const reportCards = await mapWithConcurrency(students, WRITE_CONCURRENCY, async (student) => {
    const total = studentTotals[student.id];
    const count = studentCount[student.id];
    const average = count ? (total ?? 0) / count : 0;
    const overallPosition = ranked.indexOf(average) + 1;
    const willPublish = shouldPublish(student.id);
    const invoice = invoiceByStudent.get(student.id);
    const nextTermFees = nextTermFeesByStudent.get(student.id);
    const existing = existingByStudent.get(student.id);

    const commonData = {
      total: Math.round(studentTotals[student.id] ?? 0),
      average: Math.round(average * 100) / 100,
      position: overallPosition,
      classSize: students.length,
      subjectCount: Object.keys(subjectsInReport).length,
      classGroupId,
      sessionId: term.sessionId,
      studentAge: ageAsOf(student.dateOfBirth),
      schoolDaysOpened,
      daysPresent: daysPresentByStudent.get(student.id) ?? 0,
      feesOwed: invoice ? invoice.balance : undefined,
      nextTermFees: nextTermFees !== undefined ? nextTermFees : undefined,
      feesPayableBy: nextTerm?.startDate ?? undefined,
    };
    return prisma.reportCard.upsert({
      where: { studentId_termId: { studentId: student.id, termId } },
      // psychomotor is deliberately omitted here — re-collation must never
      // overwrite behavioral grades a class teacher already entered.
      update: {
        ...commonData,
        isPublished: willPublish ? true : existing?.isPublished ?? false,
        publishedAt: willPublish && !existing?.isPublished ? new Date() : existing?.publishedAt,
        publishedBy: willPublish && !existing?.isPublished ? publishedBy : existing?.publishedBy,
      },
      create: {
        schoolId,
        studentId: student.id,
        termId,
        ...commonData,
        isPublished: willPublish,
        publishedAt: willPublish ? new Date() : undefined,
        publishedBy: willPublish ? publishedBy : undefined,
        isPaidGated: true,
        psychomotor: Object.fromEntries(DEFAULT_BEHAVIORAL_TRAITS.map((t) => [t, ""])),
      },
    });
  });

  const itemJobs = students.flatMap((student, i) =>
    Object.entries(subjectsInReport).map(([subjectKey, info]) => ({ student, reportCard: reportCards[i]!, subjectKey, info })),
  );
  await mapWithConcurrency(itemJobs, WRITE_CONCURRENCY, async ({ student, reportCard, subjectKey, info }) => {
    const row = subjectScoreRows[subjectKey]?.get(student.id);
    const ca = row?.ca ?? 0;
    const exam = row?.exam ?? 0;
    const score = row?.total ?? 0;
    const subjScores = subjectStudents[subjectKey] ?? [];
    const subjPosition = subjScores.indexOf(score) + 1;
    const { grade, remark } = computeGrade(score, scale);
    const itemData = {
      ca,
      exam,
      total: Math.round(score),
      grade,
      remark,
      position: subjPosition,
      classAverage: classAverageBySubject[subjectKey] ?? null,
      componentScores: (row?.scores as object | undefined) ?? {},
    };
    return prisma.reportCardItem.upsert({
      where: { reportCardId_subjectId: { reportCardId: reportCard.id, subjectId: info.id } },
      update: itemData,
      create: {
        reportCardId: reportCard.id,
        classSubjectId: info.classSubjectId,
        subjectId: info.id,
        subjectName: info.name,
        ...itemData,
      },
    });
  });

  return { reportCards, classGroup, term };
}