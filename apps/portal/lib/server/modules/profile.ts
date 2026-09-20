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
    // Students keep the photo the school (admin) assigns them — everyone
    // else, including parents, may set their own.
    if (b.avatarUrl && ctx.session.user.role !== "STUDENT") {
      data.avatarUrl = String(b.avatarUrl);
    }
    const user = await prisma.user.update({ where: { id: ctx.session.user.id }, data });

    // Self-service signature, uploaded once and auto-attached wherever this
    // person signs a report card (class teacher / principal) — see
    // resolveSignatories in results.ts.
    const role = ctx.session.user.role;
    if (role === "TEACHER" && (typeof b.signatureUrl === "string" || typeof b.designation === "string")) {
      const teacherData: Record<string, unknown> = {};
      if (typeof b.signatureUrl === "string") teacherData.signatureUrl = b.signatureUrl || null;
      if (typeof b.designation === "string") teacherData.designation = b.designation || null;
      await prisma.teacher.update({ where: { userId: ctx.session.user.id }, data: teacherData });
    }
    if ((role === "ADMIN" || role === "OWNER") && (typeof b.signatureUrl === "string" || typeof b.designation === "string")) {
      const adminData: Record<string, unknown> = {};
      if (typeof b.signatureUrl === "string") adminData.signatureUrl = b.signatureUrl || null;
      if (typeof b.designation === "string") adminData.designation = b.designation || null;
      await prisma.admin.upsert({
        where: { userId: ctx.session.user.id },
        update: adminData,
        create: { userId: ctx.session.user.id, schoolId: ctx.session.user.schoolId, ...adminData },
      });
    }
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
        data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false, passwordChangedAt: new Date() },
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
        data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false, passwordChangedAt: new Date() },
      });
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "user.passwordChanged", entityType: "User", entityId: ctx.session.user.id });
      return { ok: true };
    },
  },
};
