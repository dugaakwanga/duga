import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { can } from "../helpers";

export const auditModule: Module = {
  async list(ctx) {
    can(ctx, "audit:view");
    const schoolId = ctx.session.user.schoolId;
    const action = ctx.query.get("action");
    const logs = await prisma.auditLog.findMany({
      where: { schoolId, ...(action ? { action } : {}) },
      include: { user: { select: { firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const actions = await prisma.auditLog.groupBy({ by: ["action"], where: { schoolId }, _count: true });
    return { items: logs, actions };
  },
};
