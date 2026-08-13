import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num } from "../helpers";

export const classesModule: Module = {
  async list(ctx) {
    can(ctx, "classes:view");
    const schoolId = ctx.session.user.schoolId;
    const [sessions, levels, classGroups, subjects, teachers] = await Promise.all([
      prisma.academicSession.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } }),
      prisma.classLevel.findMany({ where: { schoolId }, orderBy: { order: "asc" } }),
      prisma.classGroup.findMany({
        where: { schoolId },
        include: {
          level: true,
          session: true,
          formTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
          classSubjects: { include: { subject: { select: { id: true, name: true, section: true } }, teacher: { select: { id: true } } } },
          _count: { select: { students: true } },
        },
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
    // ClassGroup.formTeacherId and ClassSubject.teacherId reference Teacher IDs,
    // not User IDs. Return the matching IDs to prevent failed assignments.
    const teacherOptions = teachers
      .filter((user) => user.teacher)
      .map((user) => ({ id: user.teacher!.id, firstName: user.firstName, lastName: user.lastName }));
    return { items: classGroups, levels, sessions, subjects, teachers: teacherOptions, role: ctx.session.user.role };
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
      const ft = await prisma.teacher.findFirst({ where: { schoolId, OR: [{ id: String(b.formTeacherId) }, { userId: String(b.formTeacherId) }] } });
      if (!ft) throw new Error("Form teacher not found");
      b.formTeacherId = ft.id;
    }
    const dup = await prisma.classGroup.findUnique({
      where: { schoolId_sessionId_levelId_name: { schoolId, sessionId, levelId, name } },
    });
    if (dup) throw new Error(`A class "${name}" already exists for this level and session`);
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
      const ft = await prisma.teacher.findFirst({ where: { schoolId, OR: [{ id: String(data.formTeacherId) }, { userId: String(data.formTeacherId) }] } });
      if (!ft) throw new Error("Form teacher not found");
      data.formTeacherId = ft.id;
    }
    const cls = await prisma.classGroup.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "class.updated", entityType: "ClassGroup", entityId: ctx.id, meta: data });
    return cls;
  },

  actions: {
    // Assign one or more subjects + teacher to a class
    assignSubject: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const raw = ctx.body.subjectIds ?? (ctx.body.subjectId ? [ctx.body.subjectId] : []);
      const subjectIds: string[] = (Array.isArray(raw) ? raw.map((s: unknown) => str(s)) : [str(raw)]).filter((s): s is string => !!s);
      const teacherId = str(ctx.body.teacherId);
      if (subjectIds.length === 0 || !teacherId) throw new Error("subjectIds and teacherId required");
      const cls = await prisma.classGroup.findFirst({ where: { id: ctx.id, schoolId } });
      if (!cls) throw new Error("Class not found");
      const subjects = await prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId } });
      if (subjects.length !== subjectIds.length) throw new Error("One or more subjects not found");
      const teacher = await prisma.teacher.findFirst({ where: { schoolId, OR: [{ id: teacherId }, { userId: teacherId }] } });
      if (!teacher) throw new Error("Teacher not found");
      const assigned: string[] = [];
      for (const subjectId of subjectIds) {
        const cs = await prisma.classSubject.upsert({
          where: { classGroupId_subjectId: { classGroupId: ctx.id!, subjectId } },
          update: { teacherId: teacher.id },
          create: { schoolId, classGroupId: ctx.id!, subjectId, teacherId: teacher.id, weeklyPeriods: Number(ctx.body.weeklyPeriods) || 4 },
        });
        assigned.push(cs.id);
        await logAudit({ schoolId, userId: ctx.session.user.id, action: "classSubject.assigned", entityType: "ClassSubject", entityId: cs.id });
      }
      return { count: assigned.length };
    },

    // Subjects (school-wide) create
    addSubject: async (ctx) => {
      can(ctx, "subjects:manage");
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      const section = str(ctx.body.section) as "PRIMARY" | "SECONDARY" | undefined;
      if (!name || !section) throw new Error("name and section required");
      const dup = await prisma.subject.findUnique({
        where: { schoolId_name_section: { schoolId, name, section } },
      });
      if (dup) throw new Error(`Subject "${name}" already exists for ${section.toLowerCase()}`);
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
      const dup = await prisma.classLevel.findUnique({
        where: { schoolId_section_name: { schoolId, section, name } },
      });
      if (dup) throw new Error(`Level "${name}" already exists for ${section.toLowerCase()}`);
      const order = (await prisma.classLevel.count({ where: { schoolId } })) + 1;
      const level = await prisma.classLevel.create({ data: { schoolId, name, section, order } });
      return level;
    },

    addSession: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      const dup = await prisma.academicSession.findUnique({
        where: { schoolId_name: { schoolId, name } },
      });
      if (dup) throw new Error(`Session "${name}" already exists`);
      const session = await prisma.academicSession.create({ data: { schoolId, name } });
      return session;
    },

    // ---- Subject edit/delete ------------------------------------------
    updateSubject: async (ctx) => {
      can(ctx, "subjects:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.subject.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Subject not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.name)) data.name = str(ctx.body.name);
      if (ctx.body.section !== undefined) data.section = str(ctx.body.section) as "PRIMARY" | "SECONDARY";
      if (ctx.body.code !== undefined) data.code = str(ctx.body.code) ?? null;
      const dup = await prisma.subject.findFirst({
        where: { schoolId, name: String(data.name ?? existing.name), section: (String(data.section ?? existing.section) as "PRIMARY" | "SECONDARY"), NOT: { id: ctx.id } },
      });
      if (dup) throw new Error(`Subject "${data.name}" already exists for that section`);
      const subject = await prisma.subject.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "subject.updated", entityType: "Subject", entityId: ctx.id });
      return subject;
    },

    deleteSubject: async (ctx) => {
      can(ctx, "subjects:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.subject.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Subject not found");
      const used = await prisma.classSubject.count({ where: { subjectId: ctx.id } });
      if (used > 0) throw new Error("This subject is assigned to classes — unassign it first");
      await prisma.subject.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "subject.deleted", entityType: "Subject", entityId: ctx.id });
      return { ok: true };
    },

    // ---- Level edit/delete --------------------------------------------
    updateLevel: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.classLevel.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Level not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.name)) data.name = str(ctx.body.name);
      if (ctx.body.section !== undefined) data.section = str(ctx.body.section) as "PRIMARY" | "SECONDARY";
      if (ctx.body.order !== undefined && ctx.body.order !== "") data.order = num(ctx.body.order);
      const dup = await prisma.classLevel.findFirst({
        where: { schoolId, name: String(data.name ?? existing.name), section: (String(data.section ?? existing.section) as "PRIMARY" | "SECONDARY"), NOT: { id: ctx.id } },
      });
      if (dup) throw new Error(`Level "${data.name}" already exists for that section`);
      const level = await prisma.classLevel.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "level.updated", entityType: "ClassLevel", entityId: ctx.id });
      return level;
    },

    deleteLevel: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.classLevel.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Level not found");
      const classes = await prisma.classGroup.count({ where: { levelId: ctx.id } });
      if (classes > 0) throw new Error("This level still has classes — delete or move those classes first");
      await prisma.classLevel.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "level.deleted", entityType: "ClassLevel", entityId: ctx.id });
      return { ok: true };
    },

    // ---- Session edit/delete ------------------------------------------
    updateSession: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.academicSession.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Session not found");
      const name = str(ctx.body.name);
      if (!name) throw new Error("name required");
      const dup = await prisma.academicSession.findFirst({ where: { schoolId, name, NOT: { id: ctx.id } } });
      if (dup) throw new Error(`Session "${name}" already exists`);
      const session = await prisma.academicSession.update({ where: { id: ctx.id }, data: { name } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "session.updated", entityType: "AcademicSession", entityId: ctx.id });
      return session;
    },

    deleteSession: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.academicSession.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Session not found");
      const classes = await prisma.classGroup.count({ where: { sessionId: ctx.id } });
      if (classes > 0) throw new Error("This session still has classes — delete those classes first");
      await prisma.academicSession.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "session.deleted", entityType: "AcademicSession", entityId: ctx.id });
      return { ok: true };
    },

    // ---- Class group delete / subject unassign ------------------------
    deleteClass: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const cls = await prisma.classGroup.findFirst({ where: { id: ctx.id, schoolId } });
      if (!cls) throw new Error("Class not found");
      await prisma.classGroup.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "class.deleted", entityType: "ClassGroup", entityId: ctx.id });
      return { ok: true };
    },

    unassignSubject: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const subjectId = str(ctx.body.subjectId);
      if (!subjectId) throw new Error("subjectId required");
      const cs = await prisma.classSubject.findFirst({ where: { classGroupId: ctx.id, subjectId, schoolId } });
      if (!cs) throw new Error("Subject is not assigned to this class");
      await prisma.classSubject.delete({ where: { id: cs.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "classSubject.unassigned", entityType: "ClassSubject", entityId: cs.id });
      return { ok: true };
    },
  },
};
