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

      const [distinctSubjects, classCount, students, notesCount, assignmentsCount, testsCount, pendingGrading, contentCount, gameCount, upcomingLive, today] =
        await Promise.all([
          // A "class subject" row exists once per class a subject is taught
          // in, so counting rows directly makes one subject taught across
          // many classes look like many subjects. Count distinct subjects.
          prisma.classSubject.findMany({
            where: { schoolId, ...(tId ? { teacherId: tId } : {}), ...(section ? { classGroup: { level: { section } } } : {}) },
            select: { subjectId: true },
            distinct: ["subjectId"],
          }),
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
          classSubjects: distinctSubjects.length,
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

    // Class-teacher dashboard: for a class this teacher is the FORM teacher
    // of, show how the class is performing across every subject (not just
    // the ones this teacher personally teaches) plus its attendance trend —
    // the oversight view a homeroom/class teacher needs, distinct from "My
    // Subjects" (their own subject-teaching workload). Only reachable by an
    // actual class teacher — there is nothing to show anyone else here.
    classDashboard: async (ctx) => {
      can(ctx, "classes:view");
      const teacher = ctx.session.user.teacher;
      if (!teacher) throw new Error("Only a class teacher can view this");
      const schoolId = ctx.session.user.schoolId;

      const formClasses = await prisma.classGroup.findMany({
        where: { schoolId, formTeacherId: teacher.id },
        include: { level: true, _count: { select: { students: true } } },
        orderBy: { createdAt: "asc" },
      });
      if (formClasses.length === 0) throw new Error("You are not a class teacher for any class");

      const requested = str(ctx.query.get("classGroupId"));
      const selected = formClasses.find((c) => c.id === requested) ?? formClasses[0]!;

      const [students, classSubjects] = await Promise.all([
        prisma.student.findMany({ where: { schoolId, currentClassGroupId: selected.id, status: "ACTIVE" }, select: { id: true } }),
        prisma.classSubject.findMany({
          where: { schoolId, classGroupId: selected.id },
          select: { id: true, subject: { select: { name: true } }, teacher: { select: { user: { select: { firstName: true, lastName: true } } } } },
        }),
      ]);
      const studentIds = students.map((s) => s.id);

      // Attendance trend for this class over the last 7 days.
      const since = new Date();
      since.setDate(since.getDate() - 6);
      const attendanceRows = await prisma.studentAttendance.findMany({
        where: { schoolId, classGroupId: selected.id, date: { gte: since } },
        select: { date: true, status: true },
      });
      const buckets = new Map<string, { present: number; total: number }>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        buckets.set(d.toISOString().slice(0, 10), { present: 0, total: 0 });
      }
      for (const r of attendanceRows) {
        const key = r.date.toISOString().slice(0, 10);
        const b = buckets.get(key);
        if (!b) continue;
        b.total += 1;
        if (r.status === "PRESENT") b.present += 1;
      }
      const attendance = [...buckets.entries()].map(([label, b]) => ({
        label: new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        value: b.total === 0 ? 0 : Math.round((b.present / b.total) * 100),
      }));

      // Per-subject average across every subject taught to this class,
      // whoever teaches it — this is the whole point of the class-teacher
      // view: seeing how the class does outside the subject(s) this teacher
      // personally handles.
      const items = classSubjects.length
        ? await prisma.reportCardItem.findMany({
            where: { classSubjectId: { in: classSubjects.map((cs) => cs.id) }, reportCard: { schoolId, isPublished: true } },
            select: { total: true, classSubjectId: true },
          })
        : [];
      const bySubject = new Map<string, { total: number; count: number; pass: number; teacherName: string }>();
      for (const cs of classSubjects) {
        bySubject.set(cs.id, {
          total: 0,
          count: 0,
          pass: 0,
          teacherName: cs.teacher?.user ? `${cs.teacher.user.firstName} ${cs.teacher.user.lastName}` : "Unassigned",
        });
      }
      const nameById = new Map(classSubjects.map((cs) => [cs.id, cs.subject.name]));
      for (const item of items) {
        const e = bySubject.get(item.classSubjectId ?? "");
        if (!e || item.total === null) continue;
        e.total += item.total;
        e.count += 1;
        if (item.total >= 50) e.pass += 1;
      }
      const subjects = [...bySubject.entries()]
        .map(([csId, e]) => ({
          name: nameById.get(csId) ?? "",
          teacherName: e.teacherName,
          value: e.count === 0 ? 0 : Math.round(e.total / e.count),
          passRate: e.count === 0 ? 0 : Math.round((e.pass / e.count) * 100),
          count: e.count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const lastAttendance = attendance[attendance.length - 1];

      return {
        classes: formClasses.map((c) => ({ id: c.id, name: `${c.level.name} ${c.name}`, studentCount: c._count.students })),
        selectedClassId: selected.id,
        studentCount: studentIds.length,
        attendance,
        subjects,
        todayAttendanceRate: lastAttendance?.value ?? null,
      };
    },
  },
};
