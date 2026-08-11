import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num, dayOfWeekNames } from "../helpers";

export const timetableModule: Module = {
  async list(ctx) {
    can(ctx, "timetable:view");
    const schoolId = ctx.session.user.schoolId;
    const role = ctx.session.user.role;
    const termId = ctx.query.get("termId");
    const classGroupId = ctx.query.get("classGroupId");

    const entriesWhere: Record<string, unknown> = { schoolId };
    if (termId) entriesWhere.termId = termId;

    if (role === "TEACHER") {
      entriesWhere.teacherId = ctx.session.user.teacher!.id;
    } else if (role === "STUDENT") {
      entriesWhere.classGroupId = ctx.session.user.student!.currentClassGroupId ?? "none";
    } else if (role === "PARENT") {
      const links = await prisma.studentParent.findMany({ where: { parentId: ctx.session.user.parent!.id }, include: { student: { select: { currentClassGroupId: true } } } });
      const groups = [...new Set(links.map((l) => l.student.currentClassGroupId).filter(Boolean))];
      entriesWhere.classGroupId = { in: groups };
    } else if (classGroupId) {
      entriesWhere.classGroupId = classGroupId;
    }

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

    const examTimetable = await prisma.examTimetableEntry.findMany({
      where: { schoolId, ...(role === "STUDENT" ? { classGroupId: ctx.session.user.student!.currentClassGroupId ?? undefined } : {}) },
      include: { subject: true, classGroup: { include: { level: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 200,
    });

    const isManager = role === "OWNER" || role === "ADMIN";
    const refs = isManager
      ? {
          classes: await prisma.classGroup.findMany({ where: { schoolId }, include: { level: true }, orderBy: { name: "asc" }, take: 300 }),
          subjects: await prisma.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 200 }),
          teachers: await prisma.user.findMany({ where: { schoolId, role: "TEACHER" }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: "asc" }, take: 300 }),
          terms: await prisma.term.findMany({ where: { schoolId }, orderBy: { name: "asc" }, take: 100 }),
        }
      : {};

    return { grid, examTimetable, refs };
  },

  actions: {
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
      const entry = await prisma.timetableEntry.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "timetable.deleted", entityType: "TimetableEntry", entityId: ctx.id });
      return entry;
    },

    updateEntry: async (ctx) => {
      can(ctx, "timetable:manage");
      const existing = await prisma.timetableEntry.findUnique({ where: { id: ctx.id } });
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
      const entry = await prisma.timetableEntry.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "timetable.updated", entityType: "TimetableEntry", entityId: ctx.id });
      return entry;
    },

    addExam: async (ctx) => {
      can(ctx, "timetable:manage");
      const schoolId = ctx.session.user.schoolId;
      const subjectId = str(ctx.body.subjectId);
      const date = str(ctx.body.date);
      if (!subjectId || !date) throw new Error("subjectId and date required");
      const entry = await prisma.examTimetableEntry.create({
        data: {
          schoolId,
          termId: str(ctx.body.termId),
          subjectId,
          classGroupId: str(ctx.body.classGroupId),
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
      const existing = await prisma.examTimetableEntry.findUnique({ where: { id: ctx.id } });
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
      const entry = await prisma.examTimetableEntry.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "timetable.examUpdated", entityType: "ExamTimetableEntry", entityId: ctx.id });
      return entry;
    },

    removeExam: async (ctx) => {
      can(ctx, "timetable:manage");
      const entry = await prisma.examTimetableEntry.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "timetable.examDeleted", entityType: "ExamTimetableEntry", entityId: ctx.id });
      return entry;
    },
  },
};
