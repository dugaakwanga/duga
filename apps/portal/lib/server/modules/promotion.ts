import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { requireOwnerOrAdmin, str } from "../helpers";

// End-of-session class promotion. Deliberately two-step: `plan` only reads
// and suggests targets (never writes), `apply` takes back exactly the moves
// an admin confirmed (optionally edited — e.g. marking a student to repeat).
// Nothing here deletes a student, a class, or any historical record; a
// promotion only changes Student.currentClassGroupId going forward and logs
// a PlacementHistory row per student so the move is traceable and reversible.

interface PlanClass {
  id: string;
  name: string;
  levelId: string;
  levelName: string;
  order: number;
  section: string;
  students: { id: string; name: string; admissionNumber: string }[];
  nextLevelId: string | null;
  nextLevelName: string | null;
  suggestedTargetClassGroupId: string | null;
  suggestedTargetName: string;
  topLevel: boolean;
}

export const promotionModule: Module = {
  actions: {
    plan: async (ctx) => {
      requireOwnerOrAdmin(ctx);
      const schoolId = ctx.session.user.schoolId;
      const fromSessionId = str(ctx.body.fromSessionId);
      const toSessionId = str(ctx.body.toSessionId);
      const section = str(ctx.body.section);
      if (!fromSessionId || !toSessionId) throw new Error("fromSessionId and toSessionId are required");
      if (fromSessionId === toSessionId) throw new Error("Choose two different sessions");

      const [fromSession, toSession] = await Promise.all([
        prisma.academicSession.findFirst({ where: { id: fromSessionId, schoolId } }),
        prisma.academicSession.findFirst({ where: { id: toSessionId, schoolId } }),
      ]);
      if (!fromSession) throw new Error("Source session not found");
      if (!toSession) throw new Error("Target session not found");

      const [classGroups, allLevels, existingTargetClasses] = await Promise.all([
        prisma.classGroup.findMany({
          where: { schoolId, sessionId: fromSessionId, ...(section ? { level: { section } } : {}) },
          include: {
            level: true,
            students: { where: { user: { status: "ACTIVE" } }, include: { user: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: [{ level: { order: "asc" } }, { name: "asc" }],
        }),
        prisma.classLevel.findMany({ where: { schoolId }, orderBy: { order: "asc" } }),
        prisma.classGroup.findMany({ where: { schoolId, sessionId: toSessionId }, select: { id: true, name: true, levelId: true } }),
      ]);

      const levelsBySection = new Map<string, typeof allLevels>();
      for (const level of allLevels) {
        const list = levelsBySection.get(level.section) ?? [];
        list.push(level);
        levelsBySection.set(level.section, list);
      }

      const classes: PlanClass[] = classGroups.map((cls) => {
        const sectionLevels = (levelsBySection.get(cls.level.section) ?? []).slice().sort((a, b) => a.order - b.order);
        const next = sectionLevels.find((l) => l.order > cls.level.order) ?? null;
        const suggestedTarget = next
          ? existingTargetClasses.find((t) => t.levelId === next.id && t.name.toLowerCase() === cls.name.toLowerCase())
          : undefined;
        return {
          id: cls.id,
          name: cls.name,
          levelId: cls.levelId,
          levelName: cls.level.name,
          order: cls.level.order,
          section: cls.level.section,
          students: cls.students.map((s) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}`, admissionNumber: s.admissionNumber })),
          nextLevelId: next?.id ?? null,
          nextLevelName: next?.name ?? null,
          suggestedTargetClassGroupId: suggestedTarget?.id ?? null,
          suggestedTargetName: cls.name,
          topLevel: !next,
        };
      });

      return { fromSession: { id: fromSession.id, name: fromSession.name }, toSession: { id: toSession.id, name: toSession.name }, classes };
    },

    // Commit an explicit, admin-reviewed set of moves. Each move can send a
    // class's students to different targets (e.g. most promote, a few
    // repeat), which is why student ids are grouped per target rather than
    // promoting a whole class in one shot.
    apply: async (ctx) => {
      requireOwnerOrAdmin(ctx);
      const schoolId = ctx.session.user.schoolId;
      const toSessionId = str(ctx.body.toSessionId);
      const reason = str(ctx.body.reason) ?? "Promotion";
      const rawMoves = Array.isArray(ctx.body.moves) ? ctx.body.moves : [];
      if (!toSessionId) throw new Error("toSessionId is required");
      if (rawMoves.length === 0) throw new Error("No moves to apply");

      const toSession = await prisma.academicSession.findFirst({ where: { id: toSessionId, schoolId } });
      if (!toSession) throw new Error("Target session not found");

      interface Move {
        targetLevelId: string;
        targetClassName: string;
        studentIds: string[];
      }
      const moves: Move[] = rawMoves.map((m: unknown) => {
        const row = m as Record<string, unknown>;
        const targetLevelId = str(row.targetLevelId);
        const targetClassName = str(row.targetClassName);
        const studentIds = Array.isArray(row.studentIds) ? row.studentIds.filter((s): s is string => typeof s === "string") : [];
        if (!targetLevelId || !targetClassName || studentIds.length === 0) {
          throw new Error("Each move needs targetLevelId, targetClassName and at least one studentId");
        }
        return { targetLevelId, targetClassName, studentIds };
      });

      const levelIds = [...new Set(moves.map((m) => m.targetLevelId))];
      const levels = await prisma.classLevel.findMany({ where: { id: { in: levelIds }, schoolId } });
      if (levels.length !== levelIds.length) throw new Error("One or more target levels not found");

      let totalMoved = 0;
      let totalSkipped = 0;

      await prisma.$transaction(async (tx) => {
        for (const move of moves) {
          const classGroup = await tx.classGroup.upsert({
            where: { schoolId_sessionId_levelId_name: { schoolId, sessionId: toSessionId, levelId: move.targetLevelId, name: move.targetClassName } },
            update: {},
            create: { schoolId, sessionId: toSessionId, levelId: move.targetLevelId, name: move.targetClassName },
          });

          // Re-check each student still belongs to this school before moving
          // them — guards against a plan going stale between preview and
          // confirm (e.g. someone already transferred or withdrew a student).
          const students = await tx.student.findMany({
            where: { id: { in: move.studentIds }, schoolId },
            select: { id: true, currentClassGroupId: true },
          });
          totalSkipped += move.studentIds.length - students.length;
          if (students.length === 0) continue;

          await tx.student.updateMany({
            where: { id: { in: students.map((s) => s.id) } },
            data: { currentClassGroupId: classGroup.id },
          });
          await tx.placementHistory.createMany({
            data: students.map((s) => ({
              schoolId,
              studentId: s.id,
              fromClassGroupId: s.currentClassGroupId,
              toClassGroupId: classGroup.id,
              sessionId: toSessionId,
              reason,
              changedBy: ctx.session.user.id,
            })),
          });
          totalMoved += students.length;
        }
      });

      await logAudit({
        schoolId,
        userId: ctx.session.user.id,
        action: "students.promoted",
        entityType: "AcademicSession",
        entityId: toSessionId,
        meta: { toSessionId, classCount: moves.length, studentsMoved: totalMoved, studentsSkipped: totalSkipped },
      });

      return { studentsMoved: totalMoved, studentsSkipped: totalSkipped };
    },
  },
};
