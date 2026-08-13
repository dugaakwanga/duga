import bcrypt from "bcryptjs";
import { prisma } from "@duga/core/server";
import { logAudit } from "@duga/core/server";
import type { Module } from ".";
import { str } from "../helpers";

export const profileModule: Module = {
  async get(ctx) {
    return ctx.session.user;
  },

  async update(ctx) {
    const b = ctx.body;
    const data: Record<string, unknown> = {};
    if (b.phone) data.phone = String(b.phone);
    if (b.firstName) data.firstName = String(b.firstName);
    if (b.lastName) data.lastName = String(b.lastName);
    // Students and parents cannot change their photo — the school assigns it.
    if (b.avatarUrl && ctx.session.user.role !== "STUDENT" && ctx.session.user.role !== "PARENT") {
      data.avatarUrl = String(b.avatarUrl);
    }
    const user = await prisma.user.update({ where: { id: ctx.session.user.id }, data });
    return user;
  },

  actions: {
    // First-login: no current password required; only allowed while mustChangePassword is set.
    setPassword: async (ctx) => {
      const next = str(ctx.body.newPassword);
      if (!next) throw new Error("newPassword required");
      if (next.length < 8) throw new Error("Password must be at least 8 characters");
      const user = await prisma.user.findUnique({ where: { id: ctx.session.user.id } });
      if (!user) throw new Error("User not found");
      if (!user.mustChangePassword) {
        const e = new Error("Password already set") as Error & { status?: number };
        e.status = 400;
        throw e;
      }
      await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "user.initialPasswordSet", entityType: "User", entityId: ctx.session.user.id });
      return { ok: true };
    },

    changePassword: async (ctx) => {
      const current = str(ctx.body.currentPassword);
      const next = str(ctx.body.newPassword);
      if (!current || !next) throw new Error("currentPassword and newPassword required");
      if (next.length < 8) throw new Error("New password must be at least 8 characters");
      const user = await prisma.user.findUnique({ where: { id: ctx.session.user.id } });
      if (!user) throw new Error("User not found");
      const ok = await bcrypt.compare(current, user.passwordHash);
      if (!ok) throw new Error("Current password is incorrect");
      await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "user.passwordChanged", entityType: "User", entityId: ctx.session.user.id });
      return { ok: true };
    },
  },
};
