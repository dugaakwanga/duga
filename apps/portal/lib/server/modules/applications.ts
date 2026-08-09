import { prisma } from "@duga/core/server";
import { logAudit, dispatchNotification } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

export const applicationsModule: Module = {
  async list(ctx) {
    can(ctx, "applications:view");
    const schoolId = ctx.session.user.schoolId;
    const status = ctx.query.get("status");
    const apps = await prisma.application.findMany({
      where: { schoolId, ...(status ? { status: status as never } : {}) },
      orderBy: { submittedAt: "desc" },
      take: 300,
    });
    const counts = await prisma.application.groupBy({ by: ["status"], where: { schoolId }, _count: true });
    return { items: apps, counts };
  },

  async get(ctx) {
    can(ctx, "applications:view");
    return prisma.application.findUnique({ where: { id: ctx.id } });
  },

  actions: {
    updateStatus: async (ctx) => {
      can(ctx, "applications:manage");
      const status = str(ctx.body.status);
      if (!status || !["RECEIVED", "REVIEWING", "APPROVED", "REJECTED", "WAITLISTED"].includes(status)) throw new Error("Invalid status");
      const app = await prisma.application.update({ where: { id: ctx.id }, data: { status: status as never, notes: str(ctx.body.notes) } });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "application.updated", entityType: "Application", entityId: ctx.id, meta: { status } });

      // notify the applicant
      const user = await prisma.user.findFirst({ where: { email: app.email }, select: { id: true } });
      if (user) {
        await dispatchNotification({ schoolId: ctx.session.user.schoolId, userId: user.id, type: "application", title: `Application ${status.toLowerCase()}`, body: `Your application status is now: ${status}.`, link: "/portal/applications" });
      }
      return app;
    },
  },
};
