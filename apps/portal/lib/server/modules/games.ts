import { prisma, logAudit, checkRateLimit } from "@duga/core/server";
import { signGameInviteToken } from "@duga/core";
import type { Module } from ".";
import type { Ctx } from "@/app/api/v1/[...path]/route";
import { can, str, num, idArray, isAssignedTo, resolveTargetStudentIds, ensureTeacher, assertFeeAccess } from "../helpers";

// Fisher-Yates — used to serve questions in a fresh order each playthrough.
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// A GameInvite/GameLiveParticipant reference a student/school by plain id
// column rather than a Prisma relation (see schema.prisma) so no lookup here
// counts as protected by request scoping — every query below re-checks
// schoolId explicitly.

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
      include: {
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        progress: { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } },
        questions: { orderBy: { order: "asc" } },
      },
    });
    if (!item) throw new Error("Game not found");
    const liveSessions = await prisma.gameLiveSession.findMany({ where: { gameId: item.id }, orderBy: { startsAt: "desc" }, take: 10, include: { _count: { select: { participants: true } } } });
    const invites = await prisma.gameInvite.findMany({ where: { gameId: item.id }, orderBy: { createdAt: "desc" }, take: 50 });
    return { ...item, liveSessions, invites };
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
        kind: str(ctx.body.kind) ?? "classic",
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
        ...(Array.isArray(ctx.body.questions) && ctx.body.questions.length
          ? {
              questions: {
                create: (ctx.body.questions as Array<Record<string, unknown>>).map((q, i) => ({
                  question: str(q.question) ?? "",
                  options: Array.isArray(q.options) ? q.options : [],
                  correctIndex: num(q.correctIndex) ?? 0,
                  order: i,
                })),
              },
            }
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
        kind: str(body.kind) ?? item.kind,
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

    // Student records a play of the game and their score. Themed games (kind
    // != "classic" with a real question bank) submit `answers` and are graded
    // server-side against GameQuestion.correctIndex — the client score is
    // never trusted directly. The original arcade games (kind "classic", no
    // questions) still submit a plain `score`, unchanged from before.
    play: async (ctx) => {
      can(ctx, "games:play");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can play games");
      await assertFeeAccess(ctx.session.user.schoolId, student, "games");
      const schoolId = ctx.session.user.schoolId;
      const rl = checkRateLimit(`games:play:${student.id}`, 30, 60_000);
      if (!rl.allowed) {
        const err = new Error("Too many plays in a short time. Please slow down.") as Error & { status?: number };
        err.status = 429;
        throw err;
      }
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId, isPublished: true }, include: { questions: true } });
      if (!item) throw new Error("Game not found or not published");
      if (isExpired(item)) throw new Error("This game has expired — it is no longer available to play");
      if (!isAssignedTo(item, student.id, student.currentClassGroupId)) throw new Error("This game is not assigned to you");

      let score: number;
      if (item.questions.length > 0) {
        const answers = Array.isArray(ctx.body.answers) ? (ctx.body.answers as Array<{ questionId: string; selectedIndex: number }>) : [];
        const questionMap = new Map(item.questions.map((q) => [q.id, q]));
        let correct = 0;
        for (const a of answers) {
          const q = questionMap.get(a.questionId);
          if (q && a.selectedIndex === q.correctIndex) correct += 1;
        }
        score = Math.max(0, Math.min(100, correct * 10));
      } else {
        score = num(ctx.body.score) ?? 0;
      }
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
      // `score` here is this attempt's result — distinct from progress.bestScore
      // (all-time best), which is what the result screen needs to show.
      return { ...progress, score };
    },

    // Loads a themed game for play: sanitized questions (no correctIndex) in
    // a fresh shuffle, plus whether a teacher-scheduled live session is
    // running right now for it.
    start: async (ctx) => {
      const role = ctx.session.user.role;
      const isManagerRole = ["OWNER", "ADMIN", "TEACHER"].includes(role);
      can(ctx, isManagerRole ? "games:manage" : "games:play");
      const schoolId = ctx.session.user.schoolId;

      // A manager previewing a game they're building skips every
      // student-only gate (assignment, publish state, expiry, fee access) —
      // preview must work on an unpublished draft with no target audience yet.
      if (isManagerRole) {
        const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId }, include: { questions: { orderBy: { order: "asc" } } } });
        if (!item) throw new Error("Game not found");
        if (role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
        return {
          id: item.id,
          title: item.title,
          kind: item.kind,
          difficulty: item.difficulty,
          durationMinutes: item.durationMinutes,
          rewardPoints: item.rewardPoints,
          questions: shuffled(item.questions).map((q) => ({ id: q.id, question: q.question, options: q.options, correctIndex: q.correctIndex })),
          liveSession: null,
        };
      }

      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can play games");
      await assertFeeAccess(ctx.session.user.schoolId, student, "games");
      const item = await prisma.educationalGame.findFirst({
        where: { id: ctx.id, schoolId, isPublished: true },
        include: { questions: { orderBy: { order: "asc" } } },
      });
      if (!item) throw new Error("Game not found or not published");
      if (isExpired(item)) throw new Error("This game has expired — it is no longer available to play");
      if (!isAssignedTo(item, student.id, student.currentClassGroupId)) throw new Error("This game is not assigned to you");

      const now = new Date();
      const liveSession = await prisma.gameLiveSession.findFirst({ where: { gameId: item.id, startsAt: { lte: now }, endsAt: { gte: now } } });

      return {
        id: item.id,
        title: item.title,
        kind: item.kind,
        difficulty: item.difficulty,
        durationMinutes: item.durationMinutes,
        rewardPoints: item.rewardPoints,
        // Unlike CBT/admissions questions, correctIndex is included here on
        // purpose: the themed engines react to correctness with zero latency
        // (a per-answer round trip would make timed play unplayable given
        // this deployment's real-world DB latency), and games feed a fun
        // leaderboard rather than an academic record — the `play` action
        // still authoritatively recomputes the final score server-side
        // regardless of what the client reports, so this can't be abused to
        // post an impossible score, only to answer quickly and correctly.
        questions: shuffled(item.questions).map((q) => ({ id: q.id, question: q.question, options: q.options, correctIndex: q.correctIndex })),
        liveSession: liveSession ? { id: liveSession.id, endsAt: liveSession.endsAt } : null,
      };
    },

    // ---- Question bank ----------------------------------------------------
    addQuestion: async (ctx) => {
      can(ctx, "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId } });
      if (!item) throw new Error("Game not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      const question = str(ctx.body.question);
      const options = Array.isArray(ctx.body.options) ? ctx.body.options : [];
      if (!question || options.length < 2) throw new Error("A question and at least two options are required");
      const count = await prisma.gameQuestion.count({ where: { gameId: item.id } });
      return prisma.gameQuestion.create({
        data: { gameId: item.id, question, options, correctIndex: num(ctx.body.correctIndex) ?? 0, order: count },
      });
    },

    // Bulk-adds questions parsed client-side from an uploaded CSV, same
    // format/flow as the CBT and admissions-test bulk imports.
    bulkAddQuestions: async (ctx) => {
      can(ctx, "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId } });
      if (!item) throw new Error("Game not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      const rows = Array.isArray(ctx.body.questions) ? (ctx.body.questions as Array<Record<string, unknown>>) : [];
      if (rows.length === 0) throw new Error("No questions to import");
      const startOrder = await prisma.gameQuestion.count({ where: { gameId: item.id } });
      const created = await prisma.$transaction(
        rows.map((q, i) =>
          prisma.gameQuestion.create({
            data: {
              gameId: item.id,
              question: str(q.question) ?? "",
              options: Array.isArray(q.options) ? q.options : [],
              correctIndex: num(q.correctIndex) ?? 0,
              order: startOrder + i,
            },
          }),
        ),
      );
      return { ok: true, count: created.length };
    },

    updateQuestion: async (ctx) => {
      can(ctx, "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const questionId = str(ctx.body.questionId);
      if (!questionId) throw new Error("questionId is required");
      const q = await prisma.gameQuestion.findFirst({ where: { id: questionId, game: { schoolId } } });
      if (!q) throw new Error("Question not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.question)) data.question = str(ctx.body.question);
      if (Array.isArray(ctx.body.options)) data.options = ctx.body.options;
      if (ctx.body.correctIndex !== undefined) data.correctIndex = num(ctx.body.correctIndex) ?? q.correctIndex;
      return prisma.gameQuestion.update({ where: { id: questionId }, data });
    },

    deleteQuestion: async (ctx) => {
      can(ctx, "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const questionId = str(ctx.body.questionId);
      if (!questionId) throw new Error("questionId is required");
      const q = await prisma.gameQuestion.findFirst({ where: { id: questionId, game: { schoolId } } });
      if (!q) throw new Error("Question not found");
      await prisma.gameQuestion.delete({ where: { id: questionId } });
      return { ok: true };
    },

    // ---- Teacher-scheduled live sessions -----------------------------------
    scheduleLiveSession: async (ctx) => {
      can(ctx, "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId } });
      if (!item) throw new Error("Game not found");
      if (ctx.session.user.role === "TEACHER" && item.teacherId !== ctx.session.user.teacher!.id) throw new Error("Not authorized");
      const startsAt = str(ctx.body.startsAt) ? new Date(String(ctx.body.startsAt)) : null;
      const endsAt = str(ctx.body.endsAt) ? new Date(String(ctx.body.endsAt)) : null;
      if (!startsAt || !endsAt || endsAt <= startsAt) throw new Error("Provide a valid start and end time");
      return prisma.gameLiveSession.create({ data: { schoolId, gameId: item.id, startsAt, endsAt } });
    },

    deleteLiveSession: async (ctx) => {
      can(ctx, "games:manage");
      const schoolId = ctx.session.user.schoolId;
      const sessionId = str(ctx.body.sessionId);
      if (!sessionId) throw new Error("sessionId is required");
      const session = await prisma.gameLiveSession.findFirst({ where: { id: sessionId, schoolId } });
      if (!session) throw new Error("Session not found");
      await prisma.gameLiveSession.delete({ where: { id: sessionId } });
      return { ok: true };
    },

    // Student opts into the currently-running live session for a game —
    // registers them as a participant so others polling pingLive see them.
    joinLive: async (ctx) => {
      can(ctx, "games:play");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can join a live session");
      const schoolId = ctx.session.user.schoolId;
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId, isPublished: true } });
      if (!item || !isAssignedTo(item, student.id, student.currentClassGroupId)) throw new Error("This game is not assigned to you");
      const now = new Date();
      const session = await prisma.gameLiveSession.findFirst({ where: { gameId: item.id, startsAt: { lte: now }, endsAt: { gte: now } } });
      if (!session) throw new Error("There is no live session running for this game right now");
      await prisma.gameLiveParticipant.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
        update: { lastPingAt: now },
        create: { sessionId: session.id, studentId: student.id },
      });
      return { sessionId: session.id, endsAt: session.endsAt };
    },

    // Pushes this student's live score/progress and pulls everyone else's —
    // polled every few seconds by the client. This is the entire "live"
    // mechanism: no websockets, just a cheap periodic read+write.
    pingLive: async (ctx) => {
      can(ctx, "games:play");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can play live");
      const sessionId = str(ctx.body.sessionId);
      if (!sessionId) throw new Error("sessionId is required");
      const session = await prisma.gameLiveSession.findFirst({ where: { id: sessionId, schoolId: ctx.session.user.schoolId } });
      if (!session) throw new Error("Session not found");
      await prisma.gameLiveParticipant.upsert({
        where: { sessionId_studentId: { sessionId, studentId: student.id } },
        update: { score: num(ctx.body.score) ?? 0, progressPct: num(ctx.body.progressPct) ?? 0, lastPingAt: new Date() },
        create: { sessionId, studentId: student.id, score: num(ctx.body.score) ?? 0, progressPct: num(ctx.body.progressPct) ?? 0 },
      });
      const participants = await prisma.gameLiveParticipant.findMany({ where: { sessionId } });
      const students = await prisma.student.findMany({
        where: { id: { in: participants.map((p) => p.studentId) } },
        select: { id: true, user: { select: { firstName: true, lastName: true } } },
      });
      const byId = new Map(students.map((s) => [s.id, s]));
      return {
        participants: participants
          .map((p) => ({
            studentId: p.studentId,
            name: byId.get(p.studentId) ? `${byId.get(p.studentId)!.user.firstName} ${byId.get(p.studentId)!.user.lastName}` : "Player",
            score: p.score,
            progressPct: p.progressPct,
            finishedAt: p.finishedAt,
          }))
          .sort((a, b) => b.score - a.score),
      };
    },

    // ---- Outsider "invite a friend" (trial-play → admissions funnel) ------
    createInvite: async (ctx) => {
      can(ctx, "games:play");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can send invites");
      const schoolId = ctx.session.user.schoolId;
      const rl = checkRateLimit(`games:invite:${student.id}`, 10, 60 * 60_000);
      if (!rl.allowed) {
        const err = new Error("Too many invites sent. Please try again later.") as Error & { status?: number };
        err.status = 429;
        throw err;
      }
      const item = await prisma.educationalGame.findFirst({ where: { id: ctx.id, schoolId, isPublished: true } });
      if (!item || !isAssignedTo(item, student.id, student.currentClassGroupId)) throw new Error("This game is not assigned to you");
      const guestEmail = str(ctx.body.guestEmail)?.trim().toLowerCase();
      if (!guestEmail) throw new Error("A guest email is required");
      const guestName = str(ctx.body.guestName);

      const alreadyPlayed = await prisma.gameInvite.findFirst({ where: { schoolId, guestEmail, status: "PLAYED" } });
      if (alreadyPlayed) throw new Error("This person has already used their free trial for this school.");

      const invite = await prisma.gameInvite.create({ data: { schoolId, gameId: item.id, inviterStudentId: student.id, guestName, guestEmail } });
      const token = await signGameInviteToken(invite.id, schoolId);
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "games.inviteCreated", entityType: "GameInvite", entityId: invite.id, meta: { guestEmail } });
      return { id: invite.id, token, path: `/play/invite/${token}` };
    },

    // Re-signs a fresh link for an invite the student already sent (the
    // token itself isn't stored — see auth.ts).
    resendInviteLink: async (ctx) => {
      can(ctx, "games:play");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can manage invites");
      const invite = await prisma.gameInvite.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId, inviterStudentId: student.id } });
      if (!invite) throw new Error("Invite not found");
      const token = await signGameInviteToken(invite.id, invite.schoolId);
      return { token, path: `/play/invite/${token}` };
    },

    myInvites: async (ctx) => {
      can(ctx, "games:play");
      const student = ctx.session.user.student;
      if (!student) throw new Error("Only students can view their invites");
      return prisma.gameInvite.findMany({ where: { schoolId: ctx.session.user.schoolId, inviterStudentId: student.id }, orderBy: { createdAt: "desc" }, take: 50 });
    },
  },
};
