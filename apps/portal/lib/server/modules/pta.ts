import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str, num } from "../helpers";

export const ptaModule: Module = {
  async list(ctx) {
    can(ctx, "pta:view");
    const schoolId = ctx.session.user.schoolId;
    const [executives, meetings, contributions] = await Promise.all([
      prisma.ptaExecutive.findMany({ where: { schoolId }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
      prisma.ptaMeeting.findMany({
        where: { schoolId },
        include: { recordedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { date: "desc" },
      }),
      prisma.ptaContribution.findMany({ where: { schoolId }, orderBy: { date: "desc" }, take: 200 }),
    ]);
    const totalContribution = contributions.reduce((a, c) => a + Number(c.amount), 0);
    return { role: ctx.session.user.role, executives, meetings, contributions, totalContribution };
  },

  actions: {
    // ---- Executives -----------------------------------------------------
    addExecutive: async (ctx) => {
      can(ctx, "pta:manage");
      const name = str(ctx.body.name);
      const role = str(ctx.body.role);
      if (!name || !role) throw new Error("name and role are required");
      const exec = await prisma.ptaExecutive.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          name,
          role,
          phone: str(ctx.body.phone),
          email: str(ctx.body.email),
          photoUrl: str(ctx.body.photoUrl),
          isActive: ctx.body.isActive !== false,
          order: num(ctx.body.order) ?? 0,
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "pta.executiveCreated", entityType: "PtaExecutive", entityId: exec.id, meta: { name, role } });
      return exec;
    },

    updateExecutive: async (ctx) => {
      can(ctx, "pta:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ptaExecutive.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Executive not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.name)) data.name = str(ctx.body.name);
      if (str(ctx.body.role)) data.role = str(ctx.body.role);
      if (ctx.body.phone !== undefined) data.phone = str(ctx.body.phone) ?? null;
      if (ctx.body.email !== undefined) data.email = str(ctx.body.email) ?? null;
      if (ctx.body.photoUrl !== undefined) data.photoUrl = str(ctx.body.photoUrl) ?? null;
      if (typeof ctx.body.isActive === "boolean") data.isActive = ctx.body.isActive;
      if (ctx.body.order !== undefined) data.order = num(ctx.body.order) ?? existing.order;
      const exec = await prisma.ptaExecutive.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "pta.executiveUpdated", entityType: "PtaExecutive", entityId: ctx.id });
      return exec;
    },

    deleteExecutive: async (ctx) => {
      can(ctx, "pta:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ptaExecutive.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Executive not found");
      await prisma.ptaExecutive.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "pta.executiveDeleted", entityType: "PtaExecutive", entityId: ctx.id });
      return { ok: true };
    },

    // ---- Meetings -------------------------------------------------------
    addMeeting: async (ctx) => {
      can(ctx, "pta:manage");
      const title = str(ctx.body.title);
      const date = str(ctx.body.date);
      if (!title) throw new Error("title is required");
      const meeting = await prisma.ptaMeeting.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          title,
          date: date ? new Date(date) : new Date(),
          venue: str(ctx.body.venue),
          agenda: str(ctx.body.agenda),
          minutes: str(ctx.body.minutes),
          recordedByUserId: ctx.session.user.id,
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "pta.meetingCreated", entityType: "PtaMeeting", entityId: meeting.id, meta: { title } });
      return meeting;
    },

    updateMeeting: async (ctx) => {
      can(ctx, "pta:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ptaMeeting.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Meeting not found");
      const data: Record<string, unknown> = {};
      if (str(ctx.body.title)) data.title = str(ctx.body.title);
      if (str(ctx.body.date)) data.date = new Date(String(ctx.body.date));
      if (ctx.body.venue !== undefined) data.venue = str(ctx.body.venue) ?? null;
      if (ctx.body.agenda !== undefined) data.agenda = str(ctx.body.agenda) ?? null;
      if (ctx.body.minutes !== undefined) data.minutes = str(ctx.body.minutes) ?? null;
      const meeting = await prisma.ptaMeeting.update({ where: { id: ctx.id }, data });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "pta.meetingUpdated", entityType: "PtaMeeting", entityId: ctx.id });
      return meeting;
    },

    deleteMeeting: async (ctx) => {
      can(ctx, "pta:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ptaMeeting.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Meeting not found");
      await prisma.ptaMeeting.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "pta.meetingDeleted", entityType: "PtaMeeting", entityId: ctx.id });
      return { ok: true };
    },

    // ---- Contributions --------------------------------------------------
    addContribution: async (ctx) => {
      can(ctx, "pta:manage");
      const memberName = str(ctx.body.memberName);
      const amount = num(ctx.body.amount);
      if (!memberName || amount === undefined) throw new Error("memberName and amount are required");
      const contribution = await prisma.ptaContribution.create({
        data: {
          schoolId: ctx.session.user.schoolId,
          memberName,
          amount,
          method: str(ctx.body.method) ?? "CASH",
          date: str(ctx.body.date) ? new Date(String(ctx.body.date)) : new Date(),
          note: str(ctx.body.note),
          recordedByUserId: ctx.session.user.id,
        },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "pta.contributionCreated", entityType: "PtaContribution", entityId: contribution.id, meta: { memberName, amount } });
      return contribution;
    },

    deleteContribution: async (ctx) => {
      can(ctx, "pta:manage");
      const schoolId = ctx.session.user.schoolId;
      const existing = await prisma.ptaContribution.findFirst({ where: { id: ctx.id, schoolId } });
      if (!existing) throw new Error("Contribution not found");
      await prisma.ptaContribution.delete({ where: { id: ctx.id } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "pta.contributionDeleted", entityType: "PtaContribution", entityId: ctx.id });
      return { ok: true };
    },
  },
};
