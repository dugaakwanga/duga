import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { can, str, num, idArray, isAssignedTo, resolveTargetStudentIds, ensureTeacher, assertFeeAccess } from "../helpers";

// Sync "assigned" game progress rows for the targeted students.
async function syncGameTargets(schoolId: string, gameId: string, classGroupIds: string[], studentIds: string[]): Promise<void> {
  const ids = await resolveTargetStudentIds(schoolId, classGroupIds, studentIds);
  const existing = await prisma.gameProgress.findMany({ where: { gameId }, select: { studentId: true } });
  const have = new Set(existing.map((e) => e.studentId));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length) {
    await prisma.gameProgress.createMany({
      data: missing.map((studentId) => ({ schoolId, gameId, studentId })),
    });
  }
}

async function childrenOfParent(ctx: Ctx): Promise<string[]> {
  const links = await prisma.studentParent.findMany({
    where: { parentId: ctx.session.user.parent!.id },
    select: { studentId: true },
  });
  return links.map((l) => l.studentId);
}

export const gamesModule: Module = {
  async list(ctx) {
    const isManagerRole = ["OWNER", "ADMIN", "TEACHER"].includes(ctx.session.user.role);
    can(ctx, isManagerRole ? "games:manage" : "games:play");
    const schoolId = ctx.session.user.schoolId;
    if (isManagerRole) {
      const teacher = ctx.session.user.teacher;
      const where = ctx.session.user.role === "TEACHER" ? { schoolId, teacherId: teacher!.id } : { schoolId };
      const items = await prisma.educationalGame.findMany({
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
        items: items.map((g) => ({
          ...g,
          assignedCount: g.progress.length,
          playedCount: g.progress.filter((p) => p.plays > 0).length,
          totalReward: g.progress.reduce((acc, p) => acc + p.rewardPoints, 0),
          avgScore: g.progress.length ? Math.round(g.progress.reduce((acc, p) => acc + p.bestScore, 0) / g.progress.length) : 0,
        })),
      };
    }

    // Players (students, and parents of children) only see assigned games.
    const student = ctx.session.user.student;
    const myIds = student ? [student.id] : await childrenOfParent(ctx);
    const classGroupId = student?.currentClassGroupId ?? null;

    const all = await prisma.educationalGame.findMany({ where: { schoolId, isPublished: true }, orderBy: { publishedAt: "desc" }, take: 300 });
    const visible = all.filter((g) => myIds.some((sid) => isAssignedTo(g, sid, classGroupId)));
    const progress = await prisma.gameProgress.findMany({ where: { studentId: { in: myIds } } });
    const byGame = new Map<string, typeof progress>();
    progress.forEach((p) => {
      const list = byGame.get(p.gameId) ?? [];
      list.push(p);
      byGame.set(p.gameId, list);
    });
    return {
      role: ctx.session.user.role,
      mode: "play",
      items: visible.map((g) => {
        const mine = byGame.get(g.id) ?? [];
        return {
          ...g,
          myProgress: mine.map((p) => ({ id: p.id, plays: p.plays, bestScore: p.bestScore, rewardPoints: p.rewardPoints, completed: p.completed, lastPlayedAt: p.lastPlayedAt })),
          totalReward: mine.reduce((acc, p) => acc + p.rewardPoints, 0),
        };
      }),
    };
  },

  async get(ctx) {
    can(ctx, "games:manage");
    const item = await prisma.educationalGame.findFirst({
      where: { id: ctx.id, schoolId: ctx.session.user.schoolId },
      include: { teacher: { include: { user: { select: { firstName: true, lastName: true } } } }, progress: { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } } },
    });
    if (!item) throw new Error("Game not found");
    return item;
  },

  async create(ctx) {
    can(ctx, "games:manage");
    const teacher = ctx.session.user.role === "TEACHER" ? ctx.session.user.teacher! : await ensureTeacher(ctx);
    const schoolId = ctx.session.user.schoolId;
    const title = str(ctx.body.title);
    if (!title) throw new Error("title required");
    const isPublished = ctx.body.isPublished === true || ctx.body.isPublished === "true";
    const classGroupIds = idArray(ctx.body.targetClassGroupIds);
    const studentIds = idArray(ctx.body.targetStudentIds);

    const game = await prisma.educationalGame.create({
      data: {
        schoolId,
        teacherId: teacher.id,
        title,
        description: str(ctx.body.description),
        category: str(ctx.body.category) ?? "QUIZ",
        gameUrl: str(ctx.body.gameUrl),
        difficulty: str(ctx.body.difficulty) ?? "MEDIUM",
        rewardPoints: num(ctx.body.rewardPoints) ?? 0,
        targetClassGroupIds: classGroupIds,
        targetStudentIds: studentIds,
        isPublished,
        publishedAt: isPublished ? new Date() : undefined,
      },
    });
    if (isPublished) {
      await syncGameTargets(schoolId, game.id, classGroupIds, studentIds);
    }
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "games.created", entityType: "EducationalGame", entityId: game.id });
    return game;
  },

  async update(ctx) {
    can(ctx, "games:manage");
    const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
    if (!item) throw new Error("Game not found");
    if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");

    const body = ctx.body;
    const isPublished = body.isPublished === true || body.isPublished === "true";
    const classGroupIds = body.targetClassGroupIds !== undefined ? idArray(body.targetClassGroupIds) : idArray(item.targetClassGroupIds);
    const studentIds = body.targetStudentIds !== undefined ? idArray(body.targetStudentIds) : idArray(item.targetStudentIds);

    const updated = await prisma.educationalGame.update({
      where: { id: ctx.id },
      data: {
        title: str(body.title) ?? item.title,
        description: body.description === undefined ? item.description : str(body.description),
        category: str(body.category) ?? item.category,
        gameUrl: body.gameUrl === undefined ? item.gameUrl : str(body.gameUrl),
        difficulty: str(body.difficulty) ?? item.difficulty,
        rewardPoints: num(body.rewardPoints) ?? item.rewardPoints,
        targetClassGroupIds: classGroupIds,
        targetStudentIds: studentIds,
        ...(body.isPublished !== undefined ? { isPublished, publishedAt: isPublished ? new Date() : undefined } : {}),
      },
    });
    if (updated.isPublished) {
      await syncGameTargets(ctx.session.user.schoolId, updated.id, classGroupIds, studentIds);
    }
    await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "games.updated", entityType: "EducationalGame", entityId: ctx.id });
    return updated;
  },

  async remove(ctx) {
    can(ctx, "games:manage");
    const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
    if (!item) throw new Error("Game not found");
    if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
    await prisma.educationalGame.delete({ where: { id: ctx.id } });
    await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "games.deleted", entityType: "EducationalGame", entityId: ctx.id });
    return { ok: true };
  },

  actions: {
    publish: async (ctx) => {
      can(ctx, "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId } });
      if (!item) throw new Error("Game not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      await prisma.educationalGame.update({ where: { id: ctx.id }, data: { isPublished: true, publishedAt: new Date() } });
      await syncGameTargets(schoolId, item.id, idArray(item.targetClassGroupIds), idArray(item.targetStudentIds));
      return { ok: true };
    },

    unpublish: async (ctx) => {
      can(ctx, "games:manage");
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!item) throw new Error("Game not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      await prisma.educationalGame.update({ where: { id: ctx.id }, data: { isPublished: false, publishedAt: null } });
      return { ok: true };
    },

    // Student records a play of the game and their score.
    play: async (ctx) => {
      can(ctx, "games:play");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can play games");
      assertFeeAccess(student);
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId, isPublished: true } });
      if (!item) throw new Error("Game not found or not published");
      if (!isAssignedTo(item, student.id, student.currentClassGroupId)) throw new Error("This game is not assigned to you");

      const score = num(ctx.body.score) ?? 0;
      const existing = await prisma.gameProgress.findUnique({ where: { gameId_studentId: { gameId: item.id, studentId: student.id } } });
      const bestScore = existing ? Math.max(existing.bestScore, score) : score;
      const firstReward = existing && existing.rewardPoints > 0 ? existing.rewardPoints : item.rewardPoints;

      const progress = await prisma.gameProgress.upsert({
        where: { gameId_studentId: { gameId: item.id, studentId: student.id } },
        update: {
          plays: (existing?.plays ?? 0) + 1,
          bestScore,
          rewardPoints: firstReward,
          completed: score > 0,
          lastPlayedAt: new Date(),
        },
        create: {
          schoolId,
          gameId: item.id,
          studentId: student.id,
          plays: 1,
          bestScore: score,
          rewardPoints: item.rewardPoints,
          completed: score > 0,
          lastPlayedAt: new Date(),
        },
      });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "games.played", entityType: "GameProgress", entityId: progress.id, meta: { score, bestScore } });
      return progress;
    },
  },
};