import { prisma } from "./prisma";
import { computeGrade, computeAverage } from "../grading";

const CA_CAP = 40; // continuous assessment max
const EXAM_CAP = 60; // exam max

export interface CollateOptions {
  schoolId: string;
  termId: string;
  classGroupId: string;
  publishedBy?: string;
  publish?: boolean;
}

function caTotal(ca: { ca1?: number | null; ca2?: number | null; ca3?: number | null; test?: number | null; assignment?: number | null } | null): number {
  if (!ca) return 0;
  const sum =
    (ca.ca1 ?? 0) + (ca.ca2 ?? 0) + (ca.ca3 ?? 0) + (ca.test ?? 0) + (ca.assignment ?? 0);
  return Math.min(sum, CA_CAP);
}

export async function collateReportCards(opts: CollateOptions) {
  const { schoolId, termId, classGroupId, publishedBy, publish } = opts;

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

  const scale = await prisma.gradingScheme
    .findFirst({ where: { schoolId, isDefault: true } })
    .then((s) => (s?.scale as Array<{ min: number; max: number; grade: string; remark: string; gp: number }>) ?? []);

  // Subject score matrix: subjectKey -> studentId -> total
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

    const [cas, exams] = await Promise.all([
      prisma.caScore.findMany({ where: { classSubjectId: cs.id, termId, studentId: { in: students.map((s) => s.id) } } }),
      prisma.examScore.findMany({ where: { classSubjectId: cs.id, termId, studentId: { in: students.map((s) => s.id) } } }),
    ]);
    const caMap = new Map(cas.map((c) => [c.studentId, c]));
    const examMap = new Map(exams.map((e) => [e.studentId, e]));

    for (const student of students) {
      const ca = caTotal(caMap.get(student.id) ?? null);
      const exam = Math.min(examMap.get(student.id)?.examScore ?? 0, EXAM_CAP);
      const total = ca + exam;
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

  const reportCards = [];
  for (const student of students) {
    const total = studentTotals[student.id];
    const count = studentCount[student.id];
    const average = count ? (total ?? 0) / count : 0;
    const overallPosition = ranked.indexOf(average) + 1;

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
            isPublished: publish ? true : existing.isPublished,
            publishedAt: publish && !existing.isPublished ? new Date() : existing.publishedAt,
            publishedBy: publish && !existing.isPublished ? publishedBy : existing.publishedBy,
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
            isPublished: Boolean(publish),
            publishedAt: publish ? new Date() : undefined,
            publishedBy: publish ? publishedBy : undefined,
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
            ca: Math.min(score, CA_CAP),
            exam: Math.max(score - Math.min(score, CA_CAP), 0),
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
            ca: Math.min(score, CA_CAP),
            exam: Math.max(score - Math.min(score, CA_CAP), 0),
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
