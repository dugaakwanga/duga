import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str, bool } from "../helpers";

const VALID_CATEGORIES = ["RECIPES", "PARENTING_TIPS", "CHILD_HEALTH", "STUDY_SUPPORT", "FUN_ACTIVITIES"] as const;

// "Family Corner" — a parent content hub (recipes, parenting tips, child
// health, study support, fun activities). Owner/Admin author and publish;
// parents only ever see published items.
export const familyCornerModule: Module = {
  async list(ctx) {
    can(ctx, "familyCorner:view");
    const schoolId = ctx.session.user.schoolId;
    const isManager = ctx.session.user.role === "OWNER" || ctx.session.user.role === "ADMIN";
    const category = str(ctx.query.get("category"));
    const items = await prisma.familyContent.findMany({
      where: {
        schoolId,
        ...(isManager ? {} : { isPublished: true }),
        ...(category ? { category: category as (typeof VALID_CATEGORIES)[number] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return { role: ctx.session.user.role, items };
  },

  async create(ctx) {
    can(ctx, "familyCorner:manage");
    const schoolId = ctx.session.user.schoolId;
    const category = str(ctx.body.category);
    const title = str(ctx.body.title);
    const body = str(ctx.body.body);
    if (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) throw new Error("Choose a valid category");
    if (!title || !body) throw new Error("title and body are required");
    const item = await prisma.familyContent.create({
      data: {
        schoolId,
        category: category as (typeof VALID_CATEGORIES)[number],
        title,
        body,
        imageUrl: str(ctx.body.imageUrl),
        isPublished: bool(ctx.body.isPublished) ?? true,
        publishedByUserId: ctx.session.user.id,
      },
    });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "familyCorner.created", entityType: "FamilyContent", entityId: item.id, meta: { title, category } });
    return item;
  },

  async update(ctx) {
    can(ctx, "familyCorner:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.familyContent.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Not found");
    const data: Record<string, unknown> = {};
    if (str(ctx.body.title)) data.title = str(ctx.body.title);
    if (str(ctx.body.body)) data.body = str(ctx.body.body);
    if (ctx.body.imageUrl !== undefined) data.imageUrl = str(ctx.body.imageUrl) ?? null;
    if (ctx.body.category !== undefined) {
      const category = str(ctx.body.category);
      if (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) throw new Error("Choose a valid category");
      data.category = category;
    }
    if (typeof ctx.body.isPublished === "boolean") data.isPublished = ctx.body.isPublished;
    const item = await prisma.familyContent.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "familyCorner.updated", entityType: "FamilyContent", entityId: ctx.id });
    return item;
  },

  async remove(ctx) {
    can(ctx, "familyCorner:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.familyContent.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Not found");
    await prisma.familyContent.delete({ where: { id: ctx.id } });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "familyCorner.deleted", entityType: "FamilyContent", entityId: ctx.id });
    return { ok: true };
  },
};
