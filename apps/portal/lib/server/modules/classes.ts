import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { can, str, num, resolveSection, sectionsOfTeacher, sectionArray, isOwnerOrAdmin } from "../helpers";

async function visibleClassIds(ctx: Ctx): Promise<string[] | undefined> {
  const { role, teacher, student, parent } = ctx.session.user;
  if (role === "OWNER" || role === "ADMIN") return undefined;
  if (role === "TEACHER" && teacher) {
    const [taught, formClasses] = await Promise.all([
      prisma.classSubject.findMany({ where: { teacherId: teacher.id }, select: { classGroupId: true } }),
      prisma.classGroup.findMany({ where: { schoolId: ctx.session.user.schoolId, formTeacherId: teacher.id }, select: { id: true } }),
    ]);
    return [...new Set([...taught.map((item) => item.classGroupId), ...formClasses.map((item) => item.id)])];
  }
  if (role === "STUDENT") return student?.currentClassGroupId ? [student.currentClassGroupId] : [];
  if (role === "PARENT" && parent) {
    const links = await prisma.studentParent.findMany({ where: { parentId: parent.id }, select: { student: { select: { currentClassGroupId: true } } } });
    return [...new Set(links.map((link) => link.student.currentClassGroupId).filter((id): id is string => !!id))];
  }
  return [];
}

async function configuredSection(schoolId: string, value: unknown): Promise<string> {
  const name = str(value)?.trim();
  if (!name) throw new Error("A school section is required");
  const section = await prisma.schoolSection.findFirst({
    where: { schoolId, name: { equals: name, mode: "insensitive" } },
    select: { name: true },
  });
  if (!section) throw new Error("Choose a section configured for this school");
  return section.name;
}

export const classesModule: Module = {
  async list(ctx) {
    can(ctx, "classes:view");
    const schoolId = ctx.session.user.schoolId;
    const section = await resolveSection(ctx);
    const visibleIds = await visibleClassIds(ctx);
    const sectionWhere = section ? { section } : {};
    const [sessions, classGroups, teachers, schoolSections] = await Promise.all([
      prisma.academicSession.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        include: { terms: { select: { id: true, name: true, termNumber: true, status: true }, orderBy: { termNumber: "asc" } } },
      }),
      prisma.classGroup.findMany({
        where: { schoolId, ...(visibleIds ? { id: { in: visibleIds } } : {}), ...(section ? { level: { section } } : {}) },
        include: {
          level: true,
          session: true,
          formTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
          classSubjects: { include: { subject: { select: { id: true, name: true, section: true } }, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } } },
          _count: { select: { students: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      ctx.session.user.role === "OWNER" || ctx.session.user.role === "ADMIN"
        ? prisma.user.findMany({
            where: { schoolId, role: "TEACHER", status: "ACTIVE" },
            include: { teacher: true },
            orderBy: { firstName: "asc" },
            take: 300,
          })
        : Promise.resolve([]),
      prisma.schoolSection.findMany({ where: { schoolId }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    ]);
    const levels = visibleIds
      ? [...new Map(classGroups.map((group) => [group.level.id, group.level])).values()].sort((a, b) => a.order - b.order)
      : await prisma.classLevel.findMany({ where: { schoolId, ...sectionWhere }, orderBy: { order: "asc" } });
    const subjects = visibleIds
      ? [...new Map(classGroups.flatMap((group) => group.classSubjects.map((item) => [item.subject.id, item.subject] as const))).values()].sort((a, b) => a.name.localeCompare(b.name))
      : await prisma.subject.findMany({ where: { schoolId, ...sectionWhere }, orderBy: { name: "asc" } });
    // ClassGroup.formTeacherId and ClassSubject.teacherId reference Teacher IDs,
    // not User IDs. Return the matching IDs to prevent failed assignments.
    const teacherOptions = await Promise.all(teachers
      .filter((user) => user.teacher)
      .map(async (user) => ({
        id: user.teacher!.id,
        firstName: user.firstName,
        lastName: user.lastName,
        subjectIds: (user.teacher!.subjectIds as string[] | null) ?? [],
        sections: await sectionsOfTeacher(user.teacher!.id),
      })));
    return { items: classGroups, levels, sessions, subjects, sections: schoolSections, teachers: teacherOptions, role: ctx.session.user.role };
  },

  async get(ctx) {
    can(ctx, "classes:view");
    const schoolId = ctx.session.user.schoolId;
    const visibleIds = await visibleClassIds(ctx);
    const cls = await prisma.classGroup.findFirst({
      where: { schoolId, AND: [{ id: ctx.id ?? "none" }, ...(visibleIds ? [{ id: { in: visibleIds } }] : [])] },
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
      if (!(await sectionsOfTeacher(ft.id)).includes(level.section)) throw new Error("Form teacher is not assigned to this school section");
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
      const level = await prisma.classLevel.findUnique({ where: { id: existing.levelId }, select: { section: true } });
      if (!level || !(await sectionsOfTeacher(ft.id)).includes(level.section)) throw new Error("Form teacher is not assigned to this school section");
      data.formTeacherId = ft.id;
    }
    const cls = await prisma.classGroup.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "class.updated", entityType: "ClassGroup", entityId: ctx.id, meta: data });
    return cls;
  },

  actions: {
    addSection: async (ctx) => {
      isOwnerOrAdmin(ctx);
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.name)?.trim();
      if (!name) throw new Error("Section name is required");
      const limitRow = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: "maxSections" } } });
      const maxSections = Math.max(1, Number(limitRow?.value ?? 2) || 2);
      const current = await prisma.schoolSection.count({ where: { schoolId } });
      if (current >= maxSections) throw new Error(`Your school is limited to ${maxSections} section(s). Ask the Superadmin to increase this limit.`);
      const exists = await prisma.schoolSection.findFirst({ where: { schoolId, name: { equals: name, mode: "insensitive" } } });
      if (exists) throw new Error("A section with this name already exists");
      const section = await prisma.schoolSection.create({ data: { schoolId, name, order: current + 1 } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "section.created", entityType: "SchoolSection", entityId: section.id, meta: { name } });
      return section;
    },

    // Rename a school section and cascade it to every related record
    // (levels, subjects, students and staff section assignments).
    updateSection: async (ctx) => {
      isOwnerOrAdmin(ctx);
      const schoolId = ctx.session.user.schoolId;
      const oldName = str(ctx.body.section)?.trim();
      const newName = str(ctx.body.name)?.trim();
      if (!oldName || !newName) throw new Error("Section name is required");
      if (oldName === newName) return { ok: true };
      const exists = await prisma.schoolSection.findFirst({ where: { schoolId, name: { equals: newName, mode: "insensitive" }, NOT: { name: { equals: oldName, mode: "insensitive" } } } });
      if (exists) throw new Error("A section with this name already exists");

      await prisma.$transaction([
        prisma.schoolSection.updateMany({ where: { schoolId, name: oldName }, data: { name: newName } }),
        prisma.classLevel.updateMany({ where: { schoolId, section: oldName }, data: { section: newName } }),
        prisma.subject.updateMany({ where: { schoolId, section: oldName }, data: { section: newName } }),
        prisma.student.updateMany({ where: { schoolId, section: oldName }, data: { section: newName } }),
      ]);

      const teachers = await prisma.teacher.findMany({ where: { schoolId }, select: { id: true, sections: true } });
      for (const teacher of teachers) {
        const arr = sectionArray(teacher.sections);
        if (arr.includes(oldName)) {
          await prisma.teacher.update({ where: { id: teacher.id }, data: { sections: arr.map((s) => (s === oldName ? newName : s)) } });
        }
      }
      const admins = await prisma.admin.findMany({ where: { schoolId }, select: { id: true, sections: true } });
      for (const admin of admins) {
        const arr = sectionArray(admin.sections);
        if (arr.includes(oldName)) {
          await prisma.admin.update({ where: { id: admin.id }, data: { sections: arr.map((s) => (s === oldName ? newName : s)) } });
        }
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "section.updated", entityType: "SchoolSection", meta: { from: oldName, to: newName } });
      return { ok: true };
    },

    // Delete a section, but only once it has no classes, subjects or students.
    removeSection: async (ctx) => {
      isOwnerOrAdmin(ctx);
      const schoolId = ctx.session.user.schoolId;
      const name = str(ctx.body.section)?.trim();
      if (!name) throw new Error("Section name is required");
      const [levels, subjects, students] = await Promise.all([
        prisma.classLevel.count({ where: { schoolId, section: name } }),
        prisma.subject.count({ where: { schoolId, section: name } }),
        prisma.student.count({ where: { schoolId, section: name } }),
      ]);
      if (levels + subjects + students > 0) {
        throw new Error(`This section still has ${levels} level(s), ${subjects} subject(s) and ${students} student(s). Remove them first.`);
      }
      await prisma.schoolSection.deleteMany({ where: { schoolId, name } });
      const teachers = await prisma.teacher.findMany({ where: { schoolId }, select: { id: true, sections: true } });
      for (const teacher of teachers) {
        const arr = sectionArray(teacher.sections).filter((s) => s !== name);
        await prisma.teacher.update({ where: { id: teacher.id }, data: { sections: arr } });
      }
      const admins = await prisma.admin.findMany({ where: { schoolId }, select: { id: true, sections: true } });
      for (const admin of admins) {
        const arr = sectionArray(admin.sections).filter((s) => s !== name);
        await prisma.admin.update({ where: { id: admin.id }, data: { sections: arr } });
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "section.deleted", entityType: "SchoolSection", meta: { name } });
      return { ok: true };
    },

    // Assign one or more subjects (each optionally with a teacher) to a class
    assignSubject: async (ctx) => {
      can(ctx, "classes:manage");
      const schoolId = ctx.session.user.schoolId;
      const raw = ctx.body.subjectIds ?? (ctx.body.subjectId ? [ctx.body.subjectId] : []);
      const subjectIds: string[] = (Array.isArray(raw) ? raw.map((s: unknown) => str(s)) : [str(raw)]).filter((s): s is string => !!s);
      if (subjectIds.length === 0) throw new Error("subjectIds required");
      const cls = await prisma.classGroup.findFirst({ where: { id: ctx.id, schoolId }, include: { level: { select: { section: true } } } });
      if (!cls) throw new Error("Class not found");
      const subjects = await prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId } });
      if (subjects.length !== subjectIds.length) throw new Error("One or more subjects not found");
      if (subjects.some((subject) => subject.section !== cls.level.section)) {
        throw new Error(`Only ${cls.level.section.toLowerCase()} subjects can be assigned to this class`);
      }
      // Per-subject teacher map (subjectId -> teacherId) with single-teacher fallback.
      const teachers = ctx.body.teachers && typeof ctx.body.teachers === "object" ? (ctx.body.teachers as Record<string, unknown>) : {};
      const singleTeacherId = str(ctx.body.teacherId);
      const assigned: string[] = [];
      for (const subjectId of subjectIds) {
        const teacherId = str(teachers[subjectId]) ?? singleTeacherId;
        let teacher = null;
        if (teacherId) {
          teacher = await prisma.teacher.findFirst({ where: { schoolId, OR: [{ id: teacherId }, { userId: teacherId }] } });
          if (!teacher) throw new Error(`Teacher not found for subject ${subjectId}`);
          if (!(await sectionsOfTeacher(teacher.id)).includes(cls.level.section)) {
            throw new Error("Selected teacher is not assigned to this school section");
          }
          if (!((teacher.subjectIds as string[] | null) ?? []).includes(subjectId)) {
            throw new Error("Selected teacher has not been assigned this subject in Staff");
          }
        }
        const cs = await prisma.classSubject.upsert({
          where: { classGroupId_subjectId: { classGroupId: ctx.id!, subjectId } },
          update: { teacherId: teacher?.id ?? null },
          create: { schoolId, classGroupId: ctx.id!, subjectId, teacherId: teacher?.id ?? null, weeklyPeriods: Number(ctx.body.weeklyPeriods) || 4 },
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
      if (!name) throw new Error("name and section required");
      const section = await configuredSection(schoolId, ctx.body.section);
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
      if (!name) throw new Error("name and section required");
      const section = await configuredSection(schoolId, ctx.body.section);
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
      if (ctx.body.section !== undefined) data.section = await configuredSection(schoolId, ctx.body.section);
      if (ctx.body.code !== undefined) data.code = str(ctx.body.code) ?? null;
      const dup = await prisma.subject.findFirst({
        where: { schoolId, name: String(data.name ?? existing.name), section: String(data.section ?? existing.section), NOT: { id: ctx.id } },
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
      if (ctx.body.section !== undefined) data.section = await configuredSection(schoolId, ctx.body.section);
      if (ctx.body.order !== undefined && ctx.body.order !== "") data.order = num(ctx.body.order);
      const dup = await prisma.classLevel.findFirst({
        where: { schoolId, name: String(data.name ?? existing.name), section: String(data.section ?? existing.section), NOT: { id: ctx.id } },
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
