import { prisma, logAudit, dispatchNotification } from "@duga/core/server";
import type { Module } from ".";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { can, str, num, idArray, isAssignedTo, resolveTargetStudentIds, ensureTeacher, assertFeeAccess } from "../helpers";

function isManager(ctx: Ctx): boolean {
  return ["OWNER", "ADMIN", "TEACHER"].includes(ctx.session.user.role);
}

// Build "ASSIGNED" progress rows for every targeted student of a content item.
async function syncTargets(schoolId: string, contentId: string, classGroupIds: string[], studentIds: string[]): Promise<void> {
  const ids = await resolveTargetStudentIds(schoolId, classGroupIds, studentIds);
  const existing = await prisma.contentProgress.findMany({ where: { contentId }, select: { studentId: true } });
  const have = new Set(existing.map((e) => e.studentId));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length) {
    await prisma.contentProgress.createMany({
      data: missing.map((studentId) => ({ schoolId, contentId, studentId, status: "ASSIGNED" })),
    });
  }
}

async function notifyAssigned(schoolId: string, ids: string[], title: string, body: string, link: string): Promise<void> {
  const users = await prisma.student.findMany({ where: { id: { in: ids } }, select: { userId: true } });
  await Promise.all(
    users.map((u) =>
      dispatchNotification({ schoolId, userId: u.userId, type: "content", title, body, link }).catch(() => undefined),
    ),
  );
}

async function notifyParents(schoolId: string, parentIds: string[], title: string, body: string, link: string): Promise<void> {
  if (!parentIds.length) return;
  const parents = await prisma.parent.findMany({ where: { schoolId, id: { in: parentIds } }, select: { userId: true } });
  await Promise.all(
    parents.map((parent) =>
      dispatchNotification({ schoolId, userId: parent.userId, type: "content", title, body, link }).catch(() => undefined),
    ),
  );
}

async function consumerStudents(ctx: Ctx) {
  const student = ctx.session.user.student;
  if (student) return [{ id: student.id, classGroupId: student.currentClassGroupId }];
  if (ctx.session.user.role !== "PARENT") return [];
  const links = await prisma.studentParent.findMany({
    where: { parentId: ctx.session.user.parent!.id },
    select: { student: { select: { id: true, currentClassGroupId: true } } },
  });
  return links.map((link) => ({ id: link.student.id, classGroupId: link.student.currentClassGroupId }));
}

function assignedToConsumer(item: { targetClassGroupIds: unknown; targetStudentIds: unknown; targetParentIds?: unknown }, students: Array<{ id: string; classGroupId: string | null }>, parentId?: string) {
  return !!parentId && idArray(item.targetParentIds).includes(parentId) || students.some((student) => isAssignedTo(item, student.id, student.classGroupId));
}

async function validateTargets(ctx: Ctx, classGroupIds: string[], studentIds: string[], parentIds: string[]) {
  const schoolId = ctx.session.user.schoolId;
  if (!classGroupIds.length && !studentIds.length && !parentIds.length) throw new Error("Assign content to at least one class, student, or parent");
  const [groups, parents] = await Promise.all([
    prisma.classGroup.findMany({ where: { schoolId, id: { in: classGroupIds } }, select: { id: true } }),
    parentIds.length ? prisma.parent.findMany({ where: { schoolId, id: { in: parentIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  if (groups.length !== new Set(classGroupIds).size) throw new Error("One or more selected classes were not found");
  if (parents.length !== new Set(parentIds).size) throw new Error("One or more selected parents were not found");
  const students = await prisma.student.findMany({ where: { schoolId, id: { in: studentIds }, status: "ACTIVE" }, select: { id: true, currentClassGroupId: true } });
  if (students.length !== new Set(studentIds).size) throw new Error("One or more selected students were not found or inactive");
  if (ctx.session.user.role === "TEACHER") {
    if (parentIds.length) throw new Error("Only the owner or an admin can assign learning content directly to parents");
    const taught = await prisma.classSubject.findMany({ where: { teacherId: ctx.session.user.teacher!.id }, select: { classGroupId: true } });
    const allowed = new Set(taught.map((row) => row.classGroupId));
    if (classGroupIds.some((id) => !allowed.has(id)) || students.some((student) => !student.currentClassGroupId || !allowed.has(student.currentClassGroupId))) {
      throw new Error("Teachers can only assign content to students and classes they teach");
    }
  }
}

export const elearnModule: Module = {
  async list(ctx) {
    can(ctx, "elearn:view");
    const schoolId = ctx.session.user.schoolId;

    // Teachers/admins manage the content they created (or all school content).
    if (isManager(ctx)) {
      const teacher = ctx.session.user.teacher;
      const where = ctx.session.user.role === "TEACHER" ? { schoolId, teacherId: teacher!.id } : { schoolId };
      const items = await prisma.enrollmentContent.findMany({
        where,
        include: {
          teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
          progress: { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return {
        role: "manage",
        items: items.map((c) => ({
          ...c,
          assignedCount: c.progress.length,
          completedCount: c.progress.filter((p) => p.status === "COMPLETED").length,
          totalReward: c.progress.reduce((acc, p) => acc + p.pointsEarned, 0),
        })),
      };
    }

    // Students (and parents of linked children) only see what is assigned to them.
    const consumers = await consumerStudents(ctx);
    const myIds = consumers.map((student) => student.id);

    const all = await prisma.enrollmentContent.findMany({
      where: { schoolId, isPublished: true },
      orderBy: { publishedAt: "desc" },
      take: 300,
    });
    const visible = all.filter((c) => assignedToConsumer(c, consumers, ctx.session.user.parent?.id));

    const progress = await prisma.contentProgress.findMany({ where: { studentId: { in: myIds } } });
    const byContent = new Map<string, typeof progress>();
    progress.forEach((p) => {
      const list = byContent.get(p.contentId) ?? [];
      list.push(p);
      byContent.set(p.contentId, list);
    });

    return {
      role: ctx.session.user.role,
      mode: "consume",
      items: visible.map((c) => {
        const mine = byContent.get(c.id) ?? [];
        return {
          ...c,
          myProgress: mine.map((p) => ({ id: p.id, status: p.status, pointsEarned: p.pointsEarned, completedAt: p.completedAt })),
          // Parents can learn alongside their children but do not earn or see
          // rewards based on a child's progress.
          rewardPoints: ctx.session.user.role === "PARENT" ? 0 : c.rewardPoints,
          totalReward: ctx.session.user.role === "PARENT" ? 0 : mine.reduce((acc, p) => acc + p.pointsEarned, 0),
        };
      }),
    };
  },

  async get(ctx) {
    can(ctx, "elearn:view");
    const role = ctx.session.user.role;
    const item = await prisma.enrollmentContent.findFirst({
      where: {
        id: ctx.id,
        schoolId: ctx.session.user.schoolId,
        // Students/parents can only reach published content that is assigned to them.
        ...(role !== "OWNER" && role !== "ADMIN" && role !== "TEACHER" ? { isPublished: true } : {}),
      },
      include: {
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        ...(role === "OWNER" || role === "ADMIN" || role === "TEACHER"
          ? { progress: { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } } }
          : {}),
      },
    });
    if (!item) throw new Error("Content not found");
    // Consumers must be a target of the content (self or linked child).
    if (role === "STUDENT" || role === "PARENT") {
      const consumers = await consumerStudents(ctx);
      if (!assignedToConsumer(item, consumers, ctx.session.user.parent?.id)) throw new Error("Content not found");
      if (role === "PARENT") return { ...item, rewardPoints: 0 };
    }
    return item;
  },

  async create(ctx) {
    can(ctx, "elearn:manage");
    const teacher = ctx.session.user.role === "TEACHER" ? ctx.session.user.teacher! : await ensureTeacher(ctx);
    const schoolId = ctx.session.user.schoolId;
    const title = str(ctx.body.title);
    if (!title) throw new Error("title required");
    const isPublished = ctx.body.isPublished === true || ctx.body.isPublished === "true";
    const classGroupIds = idArray(ctx.body.targetClassGroupIds);
    const studentIds = idArray(ctx.body.targetStudentIds);
    const parentIds = idArray(ctx.body.targetParentIds);
    await validateTargets(ctx, classGroupIds, studentIds, parentIds);

    const item = await prisma.enrollmentContent.create({
      data: {
        schoolId,
        teacherId: teacher.id,
        title,
        description: str(ctx.body.description),
        category: str(ctx.body.category) ?? "VIDEO",
        url: str(ctx.body.url),
        body: str(ctx.body.body),
        rewardPoints: num(ctx.body.rewardPoints) ?? 0,
        targetClassGroupIds: classGroupIds,
        targetStudentIds: studentIds,
        targetParentIds: parentIds,
        isPublished,
        publishedAt: isPublished ? new Date() : undefined,
      },
    });

    if (isPublished) {
      await syncTargets(schoolId, item.id, classGroupIds, studentIds);
      await notifyAssigned(schoolId, await resolveTargetStudentIds(schoolId, classGroupIds, studentIds), "New learning content", `"${item.title}" has been assigned to you.`, "/portal/elearn");
      await notifyParents(schoolId, parentIds, "New learning content", `"${item.title}" has been assigned to you.`, "/portal/elearn");
    }
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "elearn.created", entityType: "EnrollmentContent", entityId: item.id });
    return item;
  },

  async update(ctx) {
    can(ctx, "elearn:manage");
    const item = await prisma.enrollmentContent.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
    if (!item) throw new Error("Content not found");
    if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");

    const body = ctx.body;
    const isPublished = body.isPublished === true || body.isPublished === "true";
    const classGroupIds = body.targetClassGroupIds !== undefined ? idArray(body.targetClassGroupIds) : idArray(item.targetClassGroupIds);
    const studentIds = body.targetStudentIds !== undefined ? idArray(body.targetStudentIds) : idArray(item.targetStudentIds);
    const parentIds = body.targetParentIds !== undefined ? idArray(body.targetParentIds) : idArray(item.targetParentIds);
    await validateTargets(ctx, classGroupIds, studentIds, parentIds);

    const updated = await prisma.enrollmentContent.update({
      where: { id: ctx.id },
      data: {
        title: str(body.title) ?? item.title,
        description: body.description === undefined ? item.description : str(body.description),
        category: str(body.category) ?? item.category,
        url: body.url === undefined ? item.url : str(body.url),
        body: body.body === undefined ? item.body : str(body.body),
        rewardPoints: num(body.rewardPoints) ?? item.rewardPoints,
        targetClassGroupIds: classGroupIds,
        targetStudentIds: studentIds,
        targetParentIds: parentIds,
        ...(body.isPublished !== undefined ? { isPublished, publishedAt: isPublished ? new Date() : undefined } : {}),
      },
    });
    if (updated.isPublished) {
      await syncTargets(ctx.session.user.schoolId, updated.id, classGroupIds, studentIds);
    }
    await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "elearn.updated", entityType: "EnrollmentContent", entityId: ctx.id });
    return updated;
  },

  async remove(ctx) {
    can(ctx, "elearn:manage");
    const item = await prisma.enrollmentContent.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
    if (!item) throw new Error("Content not found");
    if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
    await prisma.enrollmentContent.delete({ where: { id: ctx.id } });
    await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "elearn.deleted", entityType: "EnrollmentContent", entityId: ctx.id });
    return { ok: true };
  },

  actions: {
    publish: async (ctx) => {
      can(ctx, "elearn:manage");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.enrollmentContent.findFirst({ where: { id: ctx.id, schoolId } });
      if (!item) throw new Error("Content not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      await prisma.enrollmentContent.update({ where: { id: ctx.id }, data: { isPublished: true, publishedAt: new Date() } });
      const classGroupIds = idArray(item.targetClassGroupIds);
      const studentIds = idArray(item.targetStudentIds);
      const parentIds = idArray(item.targetParentIds);
      await syncTargets(schoolId, item.id, classGroupIds, studentIds);
      await notifyAssigned(schoolId, await resolveTargetStudentIds(schoolId, classGroupIds, studentIds), "New learning content", `"${item.title}" has been assigned to you.`, "/portal/elearn");
      await notifyParents(schoolId, parentIds, "New learning content", `"${item.title}" has been assigned to you.`, "/portal/elearn");
      return { ok: true };
    },

    parentOptions: async (ctx) => {
      can(ctx, "elearn:manage");
      if (ctx.session.user.role !== "OWNER" && ctx.session.user.role !== "ADMIN") throw new Error("Only the owner or an admin can assign learning content directly to parents");
      return prisma.parent.findMany({
        where: { schoolId: ctx.session.user.schoolId },
        select: { id: true, user: { select: { firstName: true, lastName: true } } },
        orderBy: { user: { firstName: "asc" } },
        take: 500,
      });
    },

    unpublish: async (ctx) => {
      can(ctx, "elearn:manage");
      const item = await prisma.enrollmentContent.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!item) throw new Error("Content not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      await prisma.enrollmentContent.update({ where: { id: ctx.id }, data: { isPublished: false, publishedAt: null } });
      return { ok: true };
    },

    // Student marks a content item as started.
    start: async (ctx) => {
      can(ctx, "elearn:view");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can start content");
      await assertFeeAccess(ctx.session.user.schoolId, student, "elearn");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.enrollmentContent.findFirst({ where: { id: ctx.id, schoolId, isPublished: true } });
      if (!item) throw new Error("Item not found or not published");
      if (!isAssignedTo(item, student.id, student.currentClassGroupId)) throw new Error("This content is not assigned to you");
      return prisma.contentProgress.upsert({
        where: { contentId_studentId: { contentId: item.id, studentId: student.id } },
        update: { status: "STARTED" },
        create: { schoolId, contentId: item.id, studentId: student.id, status: "STARTED" },
      });
    },

    // Student marks content as complete and earns its reward points.
    complete: async (ctx) => {
      can(ctx, "elearn:view");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can complete content");
      await assertFeeAccess(ctx.session.user.schoolId, student, "elearn");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.enrollmentContent.findFirst({ where: { id: ctx.id, schoolId, isPublished: true } });
      if (!item) throw new Error("Item not found or not published");
      if (!isAssignedTo(item, student.id, student.currentClassGroupId)) throw new Error("This content is not assigned to you");
      const existing = await prisma.contentProgress.findUnique({ where: { contentId_studentId: { contentId: item.id, studentId: student.id } } });
      if (existing?.status === "COMPLETED") throw new Error("Already completed");

      const progress = await prisma.contentProgress.upsert({
        where: { contentId_studentId: { contentId: item.id, studentId: student.id } },
        update: { status: "COMPLETED", pointsEarned: item.rewardPoints, completedAt: new Date() },
        create: { schoolId, contentId: item.id, studentId: student.id, status: "COMPLETED", pointsEarned: item.rewardPoints, completedAt: new Date() },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "elearn.completed", entityType: "ContentProgress", entityId: progress.id, meta: { points: item.rewardPoints } });
      return progress;
    },
  },
};

async function childrenOfParent(ctx: Ctx): Promise<string[]> {
  const links = await prisma.studentParent.findMany({
    where: { parentId: ctx.session.user.parent!.id },
    select: { studentId: true },
  });
  return links.map((l) => l.studentId);
}
