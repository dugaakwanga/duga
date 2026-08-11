import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

export const classesModule: Module = {
  async list(ctx) {
    can(ctx, "classes:view");
    const schoolId = ctx.session.user.schoolId;
    const [sessions, levels, classGroups, subjects, teachers] = await Promise.all([
      prisma.academicSession.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } }),
      prisma.classLevel.findMany({ where: { schoolId }, orderBy: { order: "asc" } }),
      prisma.classGroup.findMany({
        where: { schoolId },
        include: { level: true, session: true, formTeacher: { include: { user: { select: { firstName: true, lastName: true } } } }, _count: { select: { students: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
      prisma.user.findMany({
        where: { schoolId, role: "TEACHER" },
        include: { teacher: true },
        orderBy: { firstName: "asc" },
        take: 300,
      }),
    ]);
    return { items: classGroups, levels, sessions, subjects, teachers, role: ctx.session.user.role };
  },

  async get(ctx) {
    can(ctx, "classes:view");
    const schoolId = ctx.session.user.schoolId;
    const cls = await prisma.classGroup.findFirst({
      where: { id: ctx.id, schoolId },
      include: {
        level: true,
        session: true,
        formTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        classSubjects: { include: { subject: true, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } } },
        students: { include: { user: { select: { firstName: true, lastName: true, status: true } } }, orderBy: { admissionNumber: "asc" } },
        timetableEntries: { include: { subject: true, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } } },
      },
    });
    if (!cls) throw new Error("Class not found");
    return cls;
  },

  async create(ctx) {
    can(ctx, "classes:manage");
    const schoolId = ctx.session.user.schoolId;
    const b = ctx.body;
    const levelId = str(b.levelId);
    const sessionId = str(b.sessionId);
    const name = str(b.name);
    if (!levelId || !sessionId || !name) throw new Error("levelId, sessionId and name required");
    const [level, session] = await Promise.all([
      prisma.classLevel.findFirst({ where: { id: levelId, schoolId } }),
      prisma.academicSession.findFirst({ where: { id: sessionId, schoolId } }),
    ]);
    if (!level) throw new Error("Level not found");
    if (!session) throw new Error("Session not found");
    if (b.formTeacherId) {
      const ft = await prisma.teacher.findFirst({ where: { id: String(b.formTeacherId), schoolId } });
      if (!ft) throw new Error("Form teacher not found");
    }
    const cls = await prisma.classGroup.create({
      data: { schoolId, levelId, sessionId, name, room: str(b.room), formTeacherId: str(b.formTeacherId) },
    });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "class.created", entityType: "ClassGroup", entityId: cls.id, meta: { name } });
    return cls;
  },

  async update(ctx) {
    can(ctx, "classes:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.classGroup.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Class not found");
    const data: Record<string, unknown> = {};
    const b = ctx.body;
    if (b.name) data.name = String(b.name);
    if (b.room) data.room = String(b.room);
    if (b.formTeacherId === "none" || b.formTeacherId === "") data.formTeacherId = null;
    else if (b.formTeacherId) data.formTeacherId = String(b.formTeacherId);
    if (data.formTeacherId) {
      const ft = await prisma.teacher.findFirst({ where: { id: String(data.formTeacherId), schoolId } });
      if (!ft) throw new Error("Form teacher not found");
    }
    const cls = await prisma.classGroup.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "class.updated", entityType: "ClassGroup", entityId: ctx.id, meta: data });
    return cls;
  },

  actions: {
    // Assign subject + teacher to a class
    assignSubject: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const subjectId = str(ctx.body.subjectId);
      const teacherId = str(ctx.body.teacherId);
      if (!subjectId || !teacherId) throw new Error("subjectId and teacherId required");
      const cls = await prisma.classGroup.findFirst({ where: { id: ctx.id, schoolId } });
      if (!cls) throw new Error("Class not found");
      const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
      if (!subject) throw new Error("Subject not found");
      const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
      if (!teacher) throw new Error("Teacher not found");
      const cs = await prisma.classSubject.upsert({
        where: { classGroupId_subjectId: { classGroupId: ctx.id!, subjectId } },
        update: { teacherId },
        create: { schoolId, classGroupId: ctx.id!, subjectId, teacherId, weeklyPeriods: Number(ctx.body.weeklyPeriods) || 4 },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "classSubject.assigned", entityType: "ClassSubject", entityId: cs.id });
      return cs;
    },

    // Subjects (school-wide) create
    addSubject: async (ctx) => {
      can(ctx, "subjects:manage");
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      const section = str(ctx.body.section) as "PRIMARY" | "SECONDARY" | undefined;
      if (!name || !section) throw new Error("name and section required");
      const subject = await prisma.subject.create({ data: { schoolId, name, code: str(ctx.body.code), section } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "subject.created", entityType: "Subject", entityId: subject.id });
      return subject;
    },

    // Level create
    addLevel: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      const section = str(ctx.body.section) as "PRIMARY" | "SECONDARY" | undefined;
      if (!name || !section) throw new Error("name and section required");
      const order = (await prisma.classLevel.count({ where: { schoolId } })) + 1;
      const level = await prisma.classLevel.create({ data: { schoolId, name, section, order } });
      return level;
    },

    addSession: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      const session = await prisma.academicSession.create({ data: { schoolId, name } });
      return session;
    },
  },
};
