import { prisma } from "./prisma";
import { computeGrade } from "../grading";

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

export async function getResultConfig(schoolId: string): Promise<ResultConfigShape> {
  const row = await prisma.resultConfig.findUnique({ where: { schoolId } });
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

  const config = await getResultConfig(schoolId);

  const classSubjects = await prisma.classSubject.findMany({
    where: { classGroupId },
    include: { subject: true },
  });

  const students = await prisma.student.findMany({
    where: { schoolId, currentClassGroupId: classGroupId, status: "ACTIVE" },
    orderBy: { admissionNumber: "asc" },
  });

  const scale = await prisma.gradingScheme
    .findFirst({ where: { schoolId, isDefault: true } })
    .then((s) => (s?.scale as Array<{ min: number; max: number; grade: string; remark: string; gp: number }>) ?? []);

  // Subject score matrix built from per-student SubjectScore rows.
  const subjectScores: Record<string, Record<string, number>> = {};
  const studentTotals: Record<string, number> = {};
  const studentCount: Record<string, number> = {};
  const subjectStudents: Record<string, number[]> = {};
  const subjectsInReport: Record<string, { id: string; name: string; classSubjectId: string }> = {};

  for (const cs of classSubjects) {
    const key = cs.subjectId;
    subjectsInReport[key] = { id: cs.subjectId, name: cs.subject.name, classSubjectId: cs.id };
    subjectScores[key] = {};
    subjectStudents[key] = [];

    const rows = await prisma.subjectScore.findMany({ where: { classSubjectId: cs.id, termId } });
    const byStudent = new Map(rows.map((r) => [r.studentId, r]));

    for (const student of students) {
      const row = byStudent.get(student.id);
      const total = row?.total ?? 0;
      subjectScores[key][student.id] = total;
      subjectStudents[key].push(total);
      studentTotals[student.id] = (studentTotals[student.id] ?? 0) + total;
      studentCount[student.id] = (studentCount[student.id] ?? 0) + 1;
    }
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

  const reportCards = [];
  for (const student of students) {
    const total = studentTotals[student.id];
    const count = studentCount[student.id];
    const average = count ? (total ?? 0) / count : 0;
    const overallPosition = ranked.indexOf(average) + 1;
    const willPublish = shouldPublish(student.id);

    const existing = await prisma.reportCard.findUnique({
      where: { studentId_termId: { studentId: student.id, termId } },
    });
    const reportCard = existing
      ? await prisma.reportCard.update({
          where: { id: existing.id },
          data: {
            total: Math.round(studentTotals[student.id] ?? 0),
            average: Math.round(average * 100) / 100,
            position: overallPosition,
            classSize: students.length,
            subjectCount: Object.keys(subjectsInReport).length,
            isPublished: willPublish ? true : existing.isPublished,
            publishedAt: willPublish && !existing.isPublished ? new Date() : existing.publishedAt,
            publishedBy: willPublish && !existing.isPublished ? publishedBy : existing.publishedBy,
            classGroupId,
            sessionId: term.sessionId,
          },
        })
      : await prisma.reportCard.create({
          data: {
            schoolId,
            studentId: student.id,
            termId,
            sessionId: term.sessionId,
            classGroupId,
            total: Math.round(studentTotals[student.id] ?? 0),
            average: Math.round(average * 100) / 100,
            position: overallPosition,
            classSize: students.length,
            subjectCount: Object.keys(subjectsInReport).length,
            isPublished: willPublish,
            publishedAt: willPublish ? new Date() : undefined,
            publishedBy: willPublish ? publishedBy : undefined,
            isPaidGated: true,
          },
        });

    for (const [subjectKey, info] of Object.entries(subjectsInReport)) {
      const score = subjectScores[subjectKey]?.[student.id] ?? 0;
      const subjScores = subjectStudents[subjectKey] ?? [];
      const subjPosition = subjScores.indexOf(score) + 1;
      const { grade, remark } = computeGrade(score, scale);
      const existingItem = await prisma.reportCardItem.findUnique({
        where: { reportCardId_subjectId: { reportCardId: reportCard.id, subjectId: info.id } },
      });
      if (existingItem) {
        await prisma.reportCardItem.update({
          where: { id: existingItem.id },
          data: {
            ca: Math.min(score, config.caCap),
            exam: Math.max(score - Math.min(score, config.caCap), 0),
            total: Math.round(score),
            grade,
            remark,
            position: subjPosition,
          },
        });
      } else {
        await prisma.reportCardItem.create({
          data: {
            reportCardId: reportCard.id,
            classSubjectId: info.classSubjectId,
            subjectId: info.id,
            subjectName: info.name,
            ca: Math.min(score, config.caCap),
            exam: Math.max(score - Math.min(score, config.caCap), 0),
            total: Math.round(score),
            grade,
            remark,
            position: subjPosition,
          },
        });
      }
    }

    reportCards.push(reportCard);
  }

  return { reportCards, classGroup, term };
}