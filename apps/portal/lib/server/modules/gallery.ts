import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

export const galleryModule: Module = {
  async list(ctx) {
    can(ctx, "gallery:manage");
    const schoolId = ctx.session.user.schoolId;
    const items = await prisma.galleryImage.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
    });
    return { items };
  },

  async create(ctx) {
    can(ctx, "gallery:manage");
    const schoolId = ctx.session.user.schoolId;
    const url = str(ctx.body.url);
    const title = str(ctx.body.title) ?? "Untitled";
    const category = str(ctx.body.category) ?? "Students";
    const alt = str(ctx.body.alt);
    if (!url) throw new Error("url is required");

    const item = await prisma.galleryImage.create({
      data: { schoolId, url, title, category, alt, uploadedByUserId: ctx.session.user.id },
    });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "gallery.created", entityType: "GalleryImage", entityId: item.id, meta: { title, category } });
    return item;
  },

  async update(ctx) {
    can(ctx, "gallery:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.galleryImage.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Image not found");
    const data: Record<string, unknown> = {};
    if (ctx.body.title !== undefined) data.title = String(ctx.body.title);
    if (ctx.body.category !== undefined) data.category = String(ctx.body.category);
    if (ctx.body.alt !== undefined) data.alt = ctx.body.alt ? String(ctx.body.alt) : null;
    if (ctx.body.url !== undefined && typeof ctx.body.url === "string" && ctx.body.url) data.url = ctx.body.url;
    const item = await prisma.galleryImage.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "gallery.updated", entityType: "GalleryImage", entityId: ctx.id });
    return item;
  },

  async remove(ctx) {
    can(ctx, "gallery:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.galleryImage.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Image not found");
    await prisma.galleryImage.delete({ where: { id: ctx.id } });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "gallery.deleted", entityType: "GalleryImage", entityId: ctx.id });
    return { ok: true };
  },
};
