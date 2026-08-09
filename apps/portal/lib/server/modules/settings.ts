import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can } from "../helpers";

export const settingsModule: Module = {
  async list(ctx) {
    can(ctx, "settings:manage");
    const school = await prisma.school.findUnique({ where: { id: ctx.session.user.schoolId } });
    const settings = await prisma.schoolSetting.findMany({ where: { schoolId: ctx.session.user.schoolId } });
    const subscription = await prisma.subscription.findUnique({ where: { schoolId: ctx.session.user.schoolId } });
    const terms = await prisma.term.findMany({ where: { schoolId: ctx.session.user.schoolId }, include: { session: true }, orderBy: [{ session: { createdAt: "desc" } }, { termNumber: "asc" }] });
    const gradingSchemes = await prisma.gradingScheme.findMany({ where: { schoolId: ctx.session.user.schoolId } });
    const financeAccess = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: ctx.session.user.schoolId, key: "adminFinanceAccess" } },
    });
    return {
      school,
      settings,
      subscription,
      terms,
      gradingSchemes,
      role: ctx.session.user.role,
      financeAccess: financeAccess?.value === true || financeAccess?.value === "true",
    };
  },

  async update(ctx) {
    can(ctx, "settings:manage");
    const schoolId = ctx.session.user.schoolId;
    const data: Record<string, unknown> = {};
    const b = ctx.body;
    if (b.name) data.name = String(b.name);
    if (b.phone) data.phone = String(b.phone);
    if (b.email) data.email = String(b.email);
    if (b.address) data.address = String(b.address);
    if (b.logoUrl) data.logoUrl = String(b.logoUrl);
    if (b.gpsLat) data.gpsLat = Number(b.gpsLat);
    if (b.gpsLng) data.gpsLng = Number(b.gpsLng);
    const school = await prisma.school.update({ where: { id: schoolId }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "settings.updated", entityType: "School", entityId: schoolId, meta: data });
    return school;
  },

  actions: {
    setSetting: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const key = String(ctx.body.key ?? "");
      const value = ctx.body.value;
      if (!key || value === undefined) throw new Error("key and value required");
      const row = await prisma.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key } },
        update: { value: value as never },
        create: { schoolId, key, value: value as never },
      });
      return row;
    },

    activateTerm: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const termId = String(ctx.body.termId ?? "");
      if (!termId) throw new Error("termId required");
      await prisma.term.updateMany({ where: { schoolId }, data: { status: "CLOSED" } });
      await prisma.term.update({ where: { id: termId }, data: { status: "ACTIVE" } });
      return { ok: true };
    },

    // Owner-only: grant or revoke the admin's access to the finance dashboard.
    setFinanceAccess: async (ctx) => {
      if (ctx.session.user.role !== "OWNER") {
        const err = new Error("Only the school owner can grant finance access") as Error & { status?: number };
        err.status = 403;
        throw err;
      }
      const schoolId = ctx.session.user.schoolId;
      const value = ctx.body.value === true || ctx.body.value === "true";
      await prisma.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key: "adminFinanceAccess" } },
        update: { value: value as never },
        create: { schoolId, key: "adminFinanceAccess", value: value as never },
      });
      return { granted: value };
    },

    addTerm: async (ctx) => {
      can(ctx, "settings:manage");
      const schoolId = ctx.session.user.schoolId;
      const sessionId = String(ctx.body.sessionId ?? "");
      const termNumber = Number(ctx.body.termNumber);
      if (!sessionId || !termNumber) throw new Error("sessionId and termNumber required");
      const name = String(ctx.body.name ?? `${["", "First", "Second", "Third"][termNumber] ?? termNumber} Term`);
      return prisma.term.create({ data: { schoolId, sessionId, termNumber, name } });
    },
  },
};
