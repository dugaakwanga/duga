import { prisma, logAudit, dispatchNotification } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num, dayOfWeekNames, resolveSection } from "../helpers";

type RegularEntryInput = {
  classGroupId: string;
  teacherId: string;
  subjectId?: string;
  classSubjectId?: string;
  termId?: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
};

function assertValidTimeRange(startTime: string, endTime: string) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(startTime) || !time.test(endTime) || startTime >= endTime) {
    throw new Error("Choose a valid start and end time (end time must be after start time)");
  }
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

function timeAfter(start: string, minutes: number) {
  const [hourText = "0", minuteText = "0"] = start.split(":");
  const hours = Number(hourText);
  const mins = Number(minuteText);
  const value = (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(mins) ? mins : 0) + minutes;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

async function validateRegularEntry(schoolId: string, input: RegularEntryInput, ignoreId?: string) {
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6 || !Number.isInteger(input.periodNumber) || input.periodNumber < 1) {
    throw new Error("Choose a valid day and period number");
  }
  assertValidTimeRange(input.startTime, input.endTime);

  const [classGroup, teacher, subject] = await Promise.all([
    prisma.classGroup.findFirst({ where: { id: input.classGroupId, schoolId }, include: { level: true } }),
    prisma.teacher.findFirst({ where: { id: input.teacherId, schoolId }, select: { id: true } }),
    input.subjectId ? prisma.subject.findFirst({ where: { id: input.subjectId, schoolId }, select: { id: true, section: true } }) : Promise.resolve(null),
  ]);
  if (!classGroup) throw new Error("Class group not found in this school");
  if (!teacher) throw new Error("Teacher not found in this school");
  if (input.subjectId && !subject) throw new Error("Subject not found in this school");
  if (subject && subject.section !== classGroup.level.section) throw new Error("The selected subject does not belong to this class section");

  if (input.classSubjectId) {
    const classSubject = await prisma.classSubject.findFirst({
      where: { id: input.classSubjectId, schoolId, classGroupId: input.classGroupId, teacherId: input.teacherId, ...(input.subjectId ? { subjectId: input.subjectId } : {}) },
      select: { id: true },
    });
    if (!classSubject) throw new Error("The selected class, subject, and teacher assignment is invalid");
  }

  const candidates = await prisma.timetableEntry.findMany({
    where: { schoolId, dayOfWeek: input.dayOfWeek, OR: [{ teacherId: input.teacherId }, { classGroupId: input.classGroupId }] },
    select: { id: true, teacherId: true, classGroupId: true, termId: true, startTime: true, endTime: true },
  });
  const conflict = candidates.find((entry) =>
    entry.id !== ignoreId && entry.termId === (input.termId ?? null) && overlaps(input.startTime, input.endTime, entry.startTime, entry.endTime),
  );
  if (conflict) {
    if (conflict.teacherId === input.teacherId) throw new Error("This teacher already has a class during that time");
    throw new Error("This class already has a period during that time");
  }
  return classGroup;
}

// Constraint-based timetable builder shared by the manual "Generate" button and
// the AI assistant. It uses the subject's weekly period requirement and only
// creates slots that are free for BOTH the class and the assigned teacher, so
// the same subject/teacher never clashes across classes at the same time.
export async function generateSmartTimetable(
  schoolId: string,
  opts: { termId?: string; section?: string; periodsPerDay?: number } = {},
): Promise<{ created: number; skipped: number }> {
  const { termId, section } = opts;
  const periodsPerDay = Math.max(1, Math.min(12, opts.periodsPerDay ?? 7));
  const dayNumbers = [1, 2, 3, 4, 5];
  const candidates = await prisma.classSubject.findMany({
    where: { schoolId, teacherId: { not: null }, ...(section ? { classGroup: { level: { section } } } : {}) },
    include: { classGroup: { include: { level: true } }, subject: true },
  });
  if (!candidates.length) throw new Error("Assign teachers to class subjects before generating a timetable");
  const existing = await prisma.timetableEntry.findMany({
    where: { schoolId, ...(termId ? { termId } : { termId: null }) },
    select: { classSubjectId: true, classGroupId: true, teacherId: true, dayOfWeek: true, startTime: true, endTime: true },
  });
  const teacherSlots = new Map<string, Array<{ start: string; end: string }>>();
  const classSlots = new Map<string, Array<{ start: string; end: string }>>();
  const currentCount = new Map<string, number>();
  const subjectDays = new Map<string, Set<number>>();
  for (const entry of existing) {
    const day = entry.dayOfWeek;
    const teacherKey = `${entry.teacherId}:${day}`;
    const classKey = `${entry.classGroupId}:${day}`;
    teacherSlots.set(teacherKey, [...(teacherSlots.get(teacherKey) ?? []), { start: entry.startTime, end: entry.endTime }]);
    classSlots.set(classKey, [...(classSlots.get(classKey) ?? []), { start: entry.startTime, end: entry.endTime }]);
    if (entry.classSubjectId) {
      currentCount.set(entry.classSubjectId, (currentCount.get(entry.classSubjectId) ?? 0) + 1);
      subjectDays.set(entry.classSubjectId, new Set([...(subjectDays.get(entry.classSubjectId) ?? []), day]));
    }
  }

  const toCreate: Array<{ schoolId: string; termId?: string; classGroupId: string; classSubjectId: string; subjectId: string; teacherId: string; dayOfWeek: number; periodNumber: number; startTime: string; endTime: string }> = [];
  let skipped = 0;
  const ordered = [...candidates].sort((a, b) => (b.weeklyPeriods - (currentCount.get(b.id) ?? 0)) - (a.weeklyPeriods - (currentCount.get(a.id) ?? 0)));
  for (const assignment of ordered) {
    if (!assignment.teacherId) continue;
    const needed = Math.max(0, assignment.weeklyPeriods - (currentCount.get(assignment.id) ?? 0));
    for (let added = 0; added < needed; added++) {
      let placed = false;
      const usedDays = subjectDays.get(assignment.id) ?? new Set<number>();
      const orderedDays = [...dayNumbers].sort((a, b) => Number(usedDays.has(a)) - Number(usedDays.has(b)));
      for (const dayOfWeek of orderedDays) {
        for (let periodNumber = 1; periodNumber <= periodsPerDay; periodNumber++) {
          const startTime = timeAfter("08:00", (periodNumber - 1) * 50);
          const endTime = timeAfter(startTime, 45);
          const teacherKey = `${assignment.teacherId}:${dayOfWeek}`;
          const classKey = `${assignment.classGroupId}:${dayOfWeek}`;
          if ((teacherSlots.get(teacherKey) ?? []).some((slot) => overlaps(startTime, endTime, slot.start, slot.end))) continue;
          if ((classSlots.get(classKey) ?? []).some((slot) => overlaps(startTime, endTime, slot.start, slot.end))) continue;
          const slot = { start: startTime, end: endTime };
          teacherSlots.set(teacherKey, [...(teacherSlots.get(teacherKey) ?? []), slot]);
          classSlots.set(classKey, [...(classSlots.get(classKey) ?? []), slot]);
          subjectDays.set(assignment.id, new Set([...usedDays, dayOfWeek]));
          toCreate.push({ schoolId, ...(termId ? { termId } : {}), classGroupId: assignment.classGroupId, classSubjectId: assignment.id, subjectId: assignment.subjectId, teacherId: assignment.teacherId, dayOfWeek, periodNumber, startTime, endTime });
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) skipped += 1;
    }
  }
  if (toCreate.length) await prisma.timetableEntry.createMany({ data: toCreate });
  return { created: toCreate.length, skipped };
}

export const timetableModule: Module = {
  async list(ctx) {
    can(ctx, "timetable:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const termId = ctx.query.get("termId");
    const classGroupId = ctx.query.get("classGroupId");
    const isManager = role === "OWNER" || role === "ADMIN";
    const section = await resolveSection(ctx);

    const entriesWhere: Record<string, unknown> = { schoolId };
    if (termId) entriesWhere.termId = termId;

    if (role === "TEACHER") {
      entriesWhere.teacherId = ctx.session.user.teacher!.id;
    } else if (role === "STUDENT") {
      entriesWhere.classGroupId = ctx.session.user.student!.currentClassGroupId ?? "none";
    } else if (role === "PARENT") {
      const links = await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, include: { student: { select: { currentClassGroupId: true } } } });
      const groups = [...new Set(links.map((l) => l.student.currentClassGroupId).filter((id): id is string => !!id))];
      entriesWhere.classGroupId = { in: groups };
    } else if (classGroupId) {
      entriesWhere.classGroupId = classGroupId;
    }

    // Scope timetable data to the active school section for staff.
    if (isManager && section) entriesWhere.classGroup = { is: { level: { section } } };

    const entries = await prisma.timetableEntry.findMany({
      where: entriesWhere,
      include: { subject: true, classGroup: { include: { level: true } }, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
    });

    // group by day
    const days = dayOfWeekNames();
    const grid = days.map((name, index) => ({
      day: name,
      index,
      entries: entries.filter((e) => e.dayOfWeek === index),
    }));

    const examTimetableWhere: Record<string, unknown> = {
      schoolId,
      ...(role === "STUDENT" ? { classGroupId: ctx.session.user.student!.currentClassGroupId ?? undefined } : {}),
    };
    if (isManager && section) examTimetableWhere.classGroup = { is: { level: { section } } };
    const examTimetable = await prisma.examTimetableEntry.findMany({
      where: examTimetableWhere,
      include: { subject: true, classGroup: { include: { level: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 200,
    });

    const refs = isManager
      ? {
          classes: await prisma.classGroup.findMany({ where: { schoolId, ...(section ? { level: { section } } : {}) }, include: { level: true }, orderBy: { name: "asc" }, take: 300 }),
          subjects: await prisma.subject.findMany({ where: { schoolId, ...(section ? { section } : {}) }, orderBy: { name: "asc" }, take: 200 }),
          // TimetableEntry.teacherId references Teacher.id, not User.id.
          teachers: await prisma.teacher.findMany({ where: { schoolId, user: { status: "ACTIVE" } }, select: { id: true, user: { select: { firstName: true, lastName: true } } }, orderBy: { user: { firstName: "asc" } }, take: 300 }),
          terms: await prisma.term.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 100 }),
        }
      : {};

    return { grid, examTimetable, refs };
  },

  actions: {
    // Constraint-based timetable builder. It uses the subject's weekly period
    // requirement and only creates slots that are free for both the class and
    // assigned teacher, so generated entries obey the same rules as manual ones.
    generate: async (ctx) => {
      can(ctx, "timetable:manage");
      const schoolId = ctx.session.user.schoolId;
      const section = await resolveSection(ctx);
      const result = await generateSmartTimetable(schoolId, {
        termId: str(ctx.body.termId),
        section,
        periodsPerDay: num(ctx.body.periodsPerDay),
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "timetable.generated", entityType: "Timetable", meta: { termId: str(ctx.body.termId) ?? null, ...result } });
      return result;
    },

    // Owner/admin confirms a timetable is ready. Each affected student and
    // teacher receives one in-app alert, rather than one alert per period.
    publish: async (ctx) => {
      can(ctx, "timetable:manage");
      const schoolId = ctx.session.user.schoolId;
      const termId = str(ctx.body.termId);
      const section = await resolveSection(ctx);
      const entries = await prisma.timetableEntry.findMany({
        where: { schoolId, ...(termId ? { termId } : {}), ...(section ? { classGroup: { level: { section } } } : {}) },
        include: {
          teacher: { include: { user: { select: { id: true } } } },
          classGroup: { include: { level: true, students: { where: { status: "ACTIVE" }, select: { userId: true } } } },
        },
      });
      if (!entries.length) throw new Error("Add timetable entries before publishing");

      const recipients = new Set<string>();
      const classLabels = new Set<string>();
      for (const entry of entries) {
        recipients.add(entry.teacher.user.id);
        classLabels.add(`${entry.classGroup.level.name} ${entry.classGroup.name}`);
        entry.classGroup.students.forEach((student) => recipients.add(student.userId));
      }
      recipients.delete(ctx.session.user.id);
      const scope = termId ? "The timetable for the selected term" : "The school timetable";
      await Promise.all(
        [...recipients].map((userId) =>
          dispatchNotification({
            schoolId,
            userId,
            type: "timetable",
            title: "Timetable published",
            body: `${scope} is now available for your class or subject.`,
            link: "/portal/timetable",
          }).catch(() => undefined),
        ),
      );
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "timetable.published", entityType: "Timetable", meta: { termId: termId ?? null, entries: entries.length, classes: [...classLabels], recipients: recipients.size } });
      return { ok: true, entries: entries.length, recipients: recipients.size };
    },

    // Admin/owner: add timetable entry
    addEntry: async (ctx) => {
      can(ctx, "timetable:manage");
      const schoolId = ctx.session.user.schoolId;
      const classGroupId = str(ctx.body.classGroupId);
      const teacherId = str(ctx.body.teacherId);
      const dayOfWeek = num(ctx.body.dayOfWeek);
      const periodNumber = num(ctx.body.periodNumber);
      const startTime = str(ctx.body.startTime);
      const endTime = str(ctx.body.endTime);
      if (!classGroupId || !teacherId || dayOfWeek === undefined || periodNumber === undefined || !startTime || !endTime) {
        throw new Error("classGroupId, teacherId, dayOfWeek, periodNumber, startTime, endTime required");
      }
      const input = { classGroupId, teacherId, subjectId: str(ctx.body.subjectId), classSubjectId: str(ctx.body.classSubjectId), termId: str(ctx.body.termId), dayOfWeek, periodNumber, startTime, endTime };
      const classGroup = await validateRegularEntry(schoolId, input);
      const section = await resolveSection(ctx);
      if (section && classGroup.level.section !== section) throw new Error("You can only schedule classes in your active section");
      const entry = await prisma.timetableEntry.create({
        data: {
          schoolId,
          termId: str(ctx.body.termId),
          classGroupId,
          classSubjectId: str(ctx.body.classSubjectId),
          subjectId: str(ctx.body.subjectId),
          teacherId,
          dayOfWeek,
          periodNumber,
          startTime,
          endTime,
          room: str(ctx.body.room),
        },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "timetable.created", entityType: "TimetableEntry", entityId: entry.id });
      return entry;
    },

    removeEntry: async (ctx) => {
      can(ctx, "timetable:manage");
      const entry = await prisma.timetableEntry.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!entry) throw new Error("Timetable entry not found");
      await prisma.timetableEntry.delete({ where: { id: entry.id } });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "timetable.deleted", entityType: "TimetableEntry", entityId: ctx.id });
      return entry;
    },

    updateEntry: async (ctx) => {
      can(ctx, "timetable:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.timetableEntry.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Entry not found");
      const data: Record<string, unknown> = {};
      const b = ctx.body;
      if (b.subjectId !== undefined) data.subjectId = str(b.subjectId);
      if (b.teacherId !== undefined) data.teacherId = str(b.teacherId);
      if (b.classGroupId !== undefined) data.classGroupId = str(b.classGroupId);
      if (b.termId !== undefined) data.termId = str(b.termId);
      if (b.dayOfWeek !== undefined) data.dayOfWeek = num(b.dayOfWeek);
      if (b.periodNumber !== undefined) data.periodNumber = num(b.periodNumber);
      if (b.startTime !== undefined) data.startTime = str(b.startTime);
      if (b.endTime !== undefined) data.endTime = str(b.endTime);
      if (b.room !== undefined) data.room = str(b.room);
      const input: RegularEntryInput = {
        classGroupId: (data.classGroupId as string | undefined) ?? existing.classGroupId,
        teacherId: (data.teacherId as string | undefined) ?? existing.teacherId,
        subjectId: (data.subjectId as string | undefined) ?? existing.subjectId ?? undefined,
        classSubjectId: existing.classSubjectId ?? undefined,
        termId: (data.termId as string | undefined) ?? existing.termId ?? undefined,
        dayOfWeek: (data.dayOfWeek as number | undefined) ?? existing.dayOfWeek,
        periodNumber: (data.periodNumber as number | undefined) ?? existing.periodNumber,
        startTime: (data.startTime as string | undefined) ?? existing.startTime,
        endTime: (data.endTime as string | undefined) ?? existing.endTime,
      };
      const classGroup = await validateRegularEntry(schoolId, input, existing.id);
      const section = await resolveSection(ctx);
      if (section && classGroup.level.section !== section) throw new Error("You can only schedule classes in your active section");
      const entry = await prisma.timetableEntry.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "timetable.updated", entityType: "TimetableEntry", entityId: ctx.id });
      return entry;
    },

    addExam: async (ctx) => {
      can(ctx, "timetable:manage");
      const schoolId = ctx.session.user.schoolId;
      const subjectId = str(ctx.body.subjectId);
      const classGroupId = str(ctx.body.classGroupId);
      const date = str(ctx.body.date);
      if (!subjectId || !classGroupId || !date) throw new Error("subjectId, classGroupId and date required");
      const [subject, classGroup] = await Promise.all([
        prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true, section: true } }),
        prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId }, include: { level: true } }),
      ]);
      if (!subject || !classGroup || subject.section !== classGroup.level.section) throw new Error("Choose a subject and class from the same school section");
      const section = await resolveSection(ctx);
      if (section && classGroup.level.section !== section) throw new Error("You can only schedule exams in your active section");
      assertValidTimeRange(str(ctx.body.startTime) ?? "09:00", str(ctx.body.endTime) ?? "11:30");
      const entry = await prisma.examTimetableEntry.create({
        data: {
          schoolId,
          termId: str(ctx.body.termId),
          subjectId,
          classGroupId,
          date: new Date(`${date}T00:00:00Z`),
          startTime: str(ctx.body.startTime) ?? "09:00",
          endTime: str(ctx.body.endTime) ?? "11:30",
          venue: str(ctx.body.venue),
        },
      });
      return entry;
    },

    updateExam: async (ctx) => {
      can(ctx, "timetable:manage");
      const existing = await prisma.examTimetableEntry.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!existing) throw new Error("Exam entry not found");
      const data: Record<string, unknown> = {};
      const b = ctx.body;
      if (b.subjectId !== undefined) data.subjectId = str(b.subjectId);
      if (b.classGroupId !== undefined) data.classGroupId = str(b.classGroupId);
      if (b.termId !== undefined) data.termId = str(b.termId);
      if (b.date !== undefined) data.date = new Date(`${str(b.date)}T00:00:00Z`);
      if (b.startTime !== undefined) data.startTime = str(b.startTime);
      if (b.endTime !== undefined) data.endTime = str(b.endTime);
      if (b.venue !== undefined) data.venue = str(b.venue);
      const classGroupId = (data.classGroupId as string | undefined) ?? existing.classGroupId;
      const subjectId = (data.subjectId as string | undefined) ?? existing.subjectId;
      if (!classGroupId || !subjectId) throw new Error("Exam entries require a class group and subject");
      const [subject, classGroup] = await Promise.all([
        prisma.subject.findFirst({ where: { id: subjectId, schoolId: ctx.session.user.schoolId }, select: { id: true, section: true } }),
        prisma.classGroup.findFirst({ where: { id: classGroupId, schoolId: ctx.session.user.schoolId }, include: { level: true } }),
      ]);
      if (!subject || !classGroup || subject.section !== classGroup.level.section) throw new Error("Choose a subject and class from the same school section");
      const section = await resolveSection(ctx);
      if (section && classGroup.level.section !== section) throw new Error("You can only schedule exams in your active section");
      assertValidTimeRange((data.startTime as string | undefined) ?? existing.startTime, (data.endTime as string | undefined) ?? existing.endTime);
      const entry = await prisma.examTimetableEntry.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "timetable.examUpdated", entityType: "ExamTimetableEntry", entityId: ctx.id });
      return entry;
    },

    removeExam: async (ctx) => {
      can(ctx, "timetable:manage");
      const entry = await prisma.examTimetableEntry.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!entry) throw new Error("Exam timetable entry not found");
      await prisma.examTimetableEntry.delete({ where: { id: entry.id } });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "timetable.examDeleted", entityType: "ExamTimetableEntry", entityId: ctx.id });
      return entry;
    },
  },
};
