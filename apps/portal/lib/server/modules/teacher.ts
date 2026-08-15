import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { can, str, resolveSection } from "../helpers";

async function taughtClassIds(teacherId: string, withTeacher: boolean): Promise<string[] | undefined> {
  if (!withTeacher) return undefined;
  const rows = await prisma.classSubject.findMany({ where: { teacherId }, select: { classGroupId: true } });
  return [...new Set(rows.map((r) => r.classGroupId))];
}

// Teacher workspace — the subjects/classes this teacher owns plus class service.
export const teacherModule: Module = {
  // List the teacher's class-subjects with class + student context.
  async list(ctx) {
    can(ctx, "classes:view");
    const teacher = ctx.session.user.teacher;
    const role = ctx.session.user.role;
    const schoolId = ctx.session.user.schoolId;
    const section = await resolveSection(ctx);

    const where = {
      ...(role === "OWNER" || role === "ADMIN" ? { schoolId } : { teacherId: teacher!.id }),
      ...(section ? { classGroup: { level: { section } } } : {}),
    };
    const classSubjects = await prisma.classSubject.findMany({
      where,
      include: {
        subject: true,
        classGroup: { include: { level: true, _count: { select: { students: true } } } },
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        _count: { select: { lessonNotes: true, assignments: true, tests: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return classSubjects;
  },

  actions: {
    // Distinct classes being taught.
    classes: async (ctx) => {
      can(ctx, "classes:view");
      const teacher = ctx.session.user.teacher;
      const role = ctx.session.user.role;
      const schoolId = ctx.session.user.schoolId;
      const section = await resolveSection(ctx);
      const groups = await prisma.classGroup.findMany({
        where:
          role === "OWNER" || role === "ADMIN"
            ? { schoolId, ...(section ? { level: { section } } : {}) }
            : { classSubjects: { some: { teacherId: teacher!.id, ...(section ? { classGroup: { level: { section } } } : {}) } } },
        include: { level: true, session: true, _count: { select: { students: true, classSubjects: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      return groups;
    },

    // Classes where this teacher is the class teacher (form teacher) — used for
    // taking attendance per class. Admin/owner see every class in the school.
    formClasses: async (ctx) => {
      can(ctx, "classes:view");
      const teacher = ctx.session.user.teacher;
      const role = ctx.session.user.role;
      const schoolId = ctx.session.user.schoolId;
      const section = await resolveSection(ctx);
      const groups = await prisma.classGroup.findMany({
        where: role === "OWNER" || role === "ADMIN" ? { schoolId, ...(section ? { level: { section } } : {}) } : { formTeacherId: teacher!.id, ...(section ? { level: { section } } : {}) },
        include: { level: true, _count: { select: { students: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      return groups;
    },

    // Roster of students in a class — used for taking attendance and
    // choosing individual students to target assignments/CBT.
    roster: async (ctx) => {
      can(ctx, "classes:view");
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.session.user.role;
      const teacher = ctx.session.user.teacher;
      const section = await resolveSection(ctx);
      const classGroupId = str(ctx.body.classGroupId) ?? ctx.query.get("classGroupId") ?? "";
      if (!classGroupId) throw new Error("classGroupId required");
      const classGroup = await prisma.classGroup.findFirst({
        where: {
          id: classGroupId,
          schoolId,
          ...(section ? { level: { section } } : {}),
          ...(role === "TEACHER"
            ? {
                OR: [
                  { formTeacherId: teacher!.id },
                  { classSubjects: { some: { teacherId: teacher!.id } } },
                ],
              }
            : {}),
        },
      });
      if (!classGroup) throw new Error("Class not found");

      const students = await prisma.student.findMany({
        where: { schoolId, currentClassGroupId: classGroupId, status: "ACTIVE" },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { admissionNumber: "asc" },
      });

      const date = ctx.query.get("date");
      const attendance = date
        ? await prisma.studentAttendance.findMany({
            where: { classGroupId, date: new Date(`${date}T00:00:00Z`) },
          })
        : [];

      return {
        classGroup,
        date: date ?? null,
        roster: students.map((s) => ({
          id: s.id,
          admissionNumber: s.admissionNumber,
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          attendance: attendance.find((a) => a.studentId === s.id)?.status ?? null,
        })),
      };
    },

    // Digital-classroom overview stats for the teacher home page.
    overview: async (ctx) => {
      can(ctx, "classes:view");
      const teacher = ctx.session.user.teacher;
      const role = ctx.session.user.role;
      const schoolId = ctx.session.user.schoolId;
      const section = await resolveSection(ctx);
      const asTeacher = role === "OWNER" || role === "ADMIN" ? false : true;
      const tId = asTeacher ? teacher!.id : undefined;

      const [classSubjectsCount, classCount, students, notesCount, assignmentsCount, testsCount, pendingGrading, contentCount, gameCount, upcomingLive, today] =
        await Promise.all([
          prisma.classSubject.count({ where: { schoolId, ...(tId ? { teacherId: tId } : {}), ...(section ? { classGroup: { level: { section } } } : {}) } }),
          prisma.classGroup.count({ where: tId ? { classSubjects: { some: { teacherId: tId, ...(section ? { classGroup: { level: { section } } } : {}) } } } : { schoolId, ...(section ? { level: { section } } : {}) } }),
          (async () => {
            if (tId) {
              const ids = await taughtClassIds(tId, true);
              return prisma.student.count({ where: { schoolId, currentClassGroupId: { in: ids }, status: "ACTIVE" } });
            }
            return prisma.student.count({ where: { schoolId, status: "ACTIVE" } });
          })(),
          prisma.lessonNote.count({ where: { schoolId, ...(tId ? { teacherId: tId } : {}) } }),
          prisma.assignment.count({ where: { schoolId, ...(tId ? { teacherId: tId } : {}) } }),
          prisma.test.count({ where: { schoolId, ...(tId ? { teacherId: tId } : {}) } }),
          prisma.assignmentSubmission.count({
            where: tId ? { schoolId, gradedAt: null, assignment: { teacherId: tId } } : { schoolId, gradedAt: null },
          }),
          prisma.enrollmentContent.count({ where: { schoolId, ...(tId ? { teacherId: tId } : {}) } }),
          prisma.educationalGame.count({ where: { schoolId, ...(tId ? { teacherId: tId } : {}) } }),
          prisma.liveClass.findMany({
            where: { schoolId, ...(tId ? { teacherId: tId } : {}), status: "SCHEDULED" },
            include: { classSubject: { include: { subject: true, classGroup: { include: { level: true } } } } },
            orderBy: { scheduledAt: "asc" },
            take: 5,
          }),
          prisma.studentAttendance.count({ where: { schoolId, date: new Date() } }),
        ]);

      return {
        role,
        counts: {
          classSubjects: classSubjectsCount,
          classes: classCount,
          students,
          notes: notesCount,
          assignments: assignmentsCount,
          tests: testsCount,
          pendingGrading,
          content: contentCount,
          games: gameCount,
          todayAttendance: today,
        },
        upcomingLive,
      };
    },
  },
};
