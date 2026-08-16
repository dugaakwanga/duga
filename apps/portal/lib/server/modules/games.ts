import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { can, str, num, idArray, isAssignedTo, resolveTargetStudentIds, ensureTeacher, assertFeeAccess } from "../helpers";

const GAME_LIBRARY: Array<[string, string, string, string]> = [
  ["Number Ninja", "MATH", "EASY", "Sharpen mental arithmetic — add, subtract and multiply your way to the top."],
  ["Times Table Sprint", "MATH", "MEDIUM", "Race the clock on multiplication tables from 2 to 12."],
  ["Fraction Match", "MATH", "MEDIUM", "Match equivalent fractions and build a solid fraction sense."],
  ["Shape Detective", "PUZZLE", "EASY", "Spot the hidden shapes and train your visual thinking."],
  ["Word Builder", "WORD", "EASY", "Rearrange letters to build new words from the clues."],
  ["Spelling Bee", "WORD", "MEDIUM", "Spell tricky words correctly to earn reward points."],
  ["Vocabulary Voyage", "WORD", "MEDIUM", "Travel the dictionary and master new words each level."],
  ["Grammar Quest", "QUIZ", "HARD", "Tackle challenging grammar questions on a quest for mastery."],
  ["Science Lab Challenge", "QUIZ", "MEDIUM", "Answer science questions and run a virtual lab experiment."],
  ["Human Body Explorer", "QUIZ", "MEDIUM", "Explore the organs and systems that keep the body alive."],
  ["Planet Puzzle", "PUZZLE", "EASY", "Piece together the planets and learn the solar system."],
  ["Weather Watch", "QUIZ", "EASY", "Predict and identify the weather from sky clues."],
  ["History Timeline", "PUZZLE", "MEDIUM", "Order events on the timeline and make sense of the past."],
  ["Nigeria Knowledge Quiz", "QUIZ", "MEDIUM", "Test your knowledge of Nigeria — geography, states and more."],
  ["Map Master", "PUZZLE", "HARD", "Navigate maps, capitals and coordinates like a pro."],
  ["Memory Masters", "MEMORY", "EASY", "Flip cards and train your memory through 200 levels."],
  ["Pattern Power", "PUZZLE", "MEDIUM", "Spot patterns and sequences to unlock the next level."],
  ["Reading Race", "WORD", "EASY", "Read fast and answer questions to win the reading race."],
  ["Logic Ladder", "PUZZLE", "HARD", "Climb the ladder of logic puzzles — each level harder."],
  ["Digital Safety Challenge", "QUIZ", "EASY", "Learn to stay safe online with smart digital choices."],
] as const;

// A game is valid from the moment it is published for `validDays` days.
function validUntilFor(validDays: number, publishedAt: Date): Date {
  return new Date(publishedAt.getTime() + Math.max(0, validDays) * 86400000);
}

function isExpired(item: { validUntil: Date | null }): boolean {
  return item.validUntil !== null && item.validUntil.getTime() < Date.now();
}

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

function assignedToConsumer(item: { targetClassGroupIds: unknown; targetStudentIds: unknown }, students: Array<{ id: string; classGroupId: string | null }>) {
  return students.some((student) => isAssignedTo(item, student.id, student.classGroupId));
}

async function validateTargets(ctx: Ctx, classGroupIds: string[], studentIds: string[]) {
  const schoolId = ctx.session.user.schoolId;
  if (!classGroupIds.length && !studentIds.length) throw new Error("Assign a game to at least one class or student");
  const groups = await prisma.classGroup.findMany({ where: { schoolId, id: { in: classGroupIds } }, select: { id: true } });
  if (groups.length !== new Set(classGroupIds).size) throw new Error("One or more selected classes were not found");
  const students = await prisma.student.findMany({ where: { schoolId, id: { in: studentIds }, status: "ACTIVE" }, select: { id: true, currentClassGroupId: true } });
  if (students.length !== new Set(studentIds).size) throw new Error("One or more selected students were not found or inactive");
  if (ctx.session.user.role === "TEACHER") {
    const taught = await prisma.classSubject.findMany({ where: { teacherId: ctx.session.user.teacher!.id }, select: { classGroupId: true } });
    const allowed = new Set(taught.map((row) => row.classGroupId));
    if (classGroupIds.some((id) => !allowed.has(id)) || students.some((student) => !student.currentClassGroupId || !allowed.has(student.currentClassGroupId))) {
      throw new Error("Teachers can only assign games to students and classes they teach");
    }
  }
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
    const consumers = await consumerStudents(ctx);
    const myIds = consumers.map((student) => student.id);

    const all = await prisma.educationalGame.findMany({ where: { schoolId, isPublished: true }, orderBy: { publishedAt: "desc" }, take: 300 });
    const visible = all
      .filter((g) => !isExpired(g))
      .filter((g) => assignedToConsumer(g, consumers));
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
          rewardPoints: ctx.session.user.role === "PARENT" ? 0 : g.rewardPoints,
          totalReward: ctx.session.user.role === "PARENT" ? 0 : mine.reduce((acc, p) => acc + p.rewardPoints, 0),
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
    await validateTargets(ctx, classGroupIds, studentIds);

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
        durationMinutes: num(ctx.body.durationMinutes) ?? 15,
        validDays: num(ctx.body.validDays) ?? 7,
        targetClassGroupIds: classGroupIds,
        targetStudentIds: studentIds,
        isPublished,
        publishedAt: isPublished ? new Date() : undefined,
        ...(isPublished
          ? { validUntil: validUntilFor(num(ctx.body.validDays) ?? 7, new Date()) }
          : {}),
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
    await validateTargets(ctx, classGroupIds, studentIds);

    const updated = await prisma.educationalGame.update({
      where: { id: ctx.id },
      data: {
        title: str(body.title) ?? item.title,
        description: body.description === undefined ? item.description : str(body.description),
        category: str(body.category) ?? item.category,
        gameUrl: body.gameUrl === undefined ? item.gameUrl : str(body.gameUrl),
        difficulty: str(body.difficulty) ?? item.difficulty,
        rewardPoints: num(body.rewardPoints) ?? item.rewardPoints,
        durationMinutes: num(body.durationMinutes) ?? item.durationMinutes,
        validDays: num(body.validDays) ?? item.validDays,
        targetClassGroupIds: classGroupIds,
        targetStudentIds: studentIds,
        ...(body.isPublished !== undefined
          ? {
              isPublished,
              publishedAt: isPublished ? new Date() : undefined,
              // Re-publishing (or keeping it published after an edit) refreshes
              // the validity window from today.
              validUntil: isPublished ? validUntilFor(num(body.validDays) ?? item.validDays, new Date()) : null,
            }
          : {}),
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
    // School leaderboard: top players by total best-score across the games
    // they have been assigned (or, when gameId is given, for one game only).
    leaderboard: async (ctx) => {
      can(ctx, ctx.session.user.role === "STUDENT" || ctx.session.user.role === "PARENT" ? "games:play" : "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const gameId = str(ctx.body.gameId);
      const rows = await prisma.gameProgress.findMany({
        where: { schoolId, ...(gameId ? { gameId } : {}) },
        select: {
          gameId: true,
          plays: true,
          bestScore: true,
          rewardPoints: true,
          student: {
            select: {
              id: true,
              section: true,
              admissionNumber: true,
              classGroup: { select: { name: true, level: { select: { name: true } } } },
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });
      const byStudent = new Map<
        string,
        { studentId: string; name: string; className: string | null; section: string; games: number; totalScore: number; rewardPoints: number; plays: number; best: number }
      >();
      for (const r of rows) {
        const key = r.student.id;
        const current = byStudent.get(key) ?? {
          studentId: key,
          name: `${r.student.user.firstName} ${r.student.user.lastName}`,
          className: r.student.classGroup ? `${r.student.classGroup.level.name} ${r.student.classGroup.name}` : null,
          section: r.student.section,
          games: 0,
          totalScore: 0,
          rewardPoints: 0,
          plays: 0,
          best: 0,
        };
        current.games += 1;
        current.totalScore += r.bestScore;
        current.rewardPoints += r.rewardPoints;
        current.plays += r.plays;
        current.best = Math.max(current.best, r.bestScore);
        byStudent.set(key, current);
      }
      const items = [...byStudent.values()]
        .sort((a, b) => b.totalScore - a.totalScore || b.best - a.best || b.rewardPoints - a.rewardPoints)
        .slice(0, 20)
        .map((item, index) => ({ rank: index + 1, ...item }));
      return { items, gameId: gameId ?? null };
    },

    seedLibrary: async (ctx) => {
      can(ctx, "games:manage");
      const teacher = await ensureTeacher(ctx);
      const existing = await prisma.educationalGame.findMany({ where: { schoolId: ctx.session.user.schoolId }, select: { title: true } });
      const titles = new Set(existing.map((game) => game.title));
      const missing = GAME_LIBRARY.filter(([title]) => !titles.has(title));
      if (missing.length) await prisma.educationalGame.createMany({ data: missing.map(([title, category, difficulty, description]) => ({ schoolId: ctx.session.user.schoolId, teacherId: teacher.id, title, description, category, difficulty, rewardPoints: 10, durationMinutes: 15, validDays: 7, targetClassGroupIds: [], targetStudentIds: [], isPublished: false })) });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "games.librarySeeded", entityType: "EducationalGame", meta: { created: missing.length } });
      return { created: missing.length };
    },
    publish: async (ctx) => {
      can(ctx, "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId } });
      if (!item) throw new Error("Game not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      await prisma.educationalGame.update({
        where: { id: ctx.id },
        data: { isPublished: true, publishedAt: new Date(), validUntil: validUntilFor(item.validDays, new Date()) },
      });
      await syncGameTargets(schoolId, item.id, idArray(item.targetClassGroupIds), idArray(item.targetStudentIds));
      return { ok: true };
    },

    unpublish: async (ctx) => {
      can(ctx, "games:manage");
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!item) throw new Error("Game not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      await prisma.educationalGame.update({ where: { id: ctx.id }, data: { isPublished: false, publishedAt: null, validUntil: null } });
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
      if (isExpired(item)) throw new Error("This game has expired — it is no longer available to play");
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
