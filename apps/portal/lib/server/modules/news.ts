import { prisma, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const newsModule: Module = {
  async list(ctx) {
    can(ctx, "news:manage");
    const schoolId = ctx.session.user.schoolId;
    const items = await prisma.newsPost.findMany({
      where: { schoolId },
      orderBy: { publishedAt: "desc" },
    });
    return { items };
  },

  async get(ctx) {
    can(ctx, "news:manage");
    return prisma.newsPost.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
  },

  async create(ctx) {
    can(ctx, "news:manage");
    const schoolId = ctx.session.user.schoolId;
    const title = str(ctx.body.title);
    const excerpt = str(ctx.body.excerpt) ?? "";
    const body = ctx.body.body;
    if (!title) throw new Error("title is required");
    if (!Array.isArray(body) || body.length === 0) throw new Error("body (array of paragraphs) is required");

    const baseSlug = slugify(str(ctx.body.slug) || title);
    let slug = baseSlug || `post-${Date.now()}`;
    let n = 1;
    while (await prisma.newsPost.findFirst({ where: { schoolId, slug } })) {
      slug = `${baseSlug || "post"}-${n++}`;
    }

    const isPublished = ctx.body.isPublished === true;
    const post = await prisma.newsPost.create({
      data: {
        schoolId,
        slug,
        title,
        category: str(ctx.body.category) ?? "Announcement",
        excerpt,
        body: body as never,
        coverUrl: str(ctx.body.coverUrl),
        authorId: ctx.session.user.id,
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      },
    });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "news.created", entityType: "NewsPost", entityId: post.id, meta: { title, slug, isPublished } });
    return post;
  },

  async update(ctx) {
    can(ctx, "news:manage");
    const schoolId = ctx.session.user.schoolId;
    const existing = await prisma.newsPost.findFirst({ where: { id: ctx.id, schoolId } });
    if (!existing) throw new Error("Post not found");

    const data: Record<string, unknown> = {};
    if (ctx.body.title !== undefined) {
      data.title = String(ctx.body.title);
      const baseSlug = slugify(String(ctx.body.slug ?? ctx.body.title));
      if (baseSlug && baseSlug !== existing.slug) {
        let slug = baseSlug;
        let n = 1;
        while (await prisma.newsPost.findFirst({ where: { schoolId, slug, id: { not: ctx.id } } })) slug = `${baseSlug}-${n++}`;
        data.slug = slug;
      }
    }
    if (ctx.body.category !== undefined) data.category = String(ctx.body.category);
    if (ctx.body.excerpt !== undefined) data.excerpt = String(ctx.body.excerpt);
    if (ctx.body.body !== undefined) data.body = ctx.body.body as never;
    if (ctx.body.coverUrl !== undefined) data.coverUrl = ctx.body.coverUrl ? String(ctx.body.coverUrl) : null;
    if (typeof ctx.body.isPublished === "boolean") {
      data.isPublished = ctx.body.isPublished;
      if (ctx.body.isPublished && !existing.isPublished) data.publishedAt = new Date();
    }

    const post = await prisma.newsPost.update({ where: { id: ctx.id }, data });
    await logAudit({ schoolId, userId: ctx.session.user.id, action: "news.updated", entityType: "NewsPost", entityId: ctx.id });
    return post;
  },

  async remove(ctx) {
    can(ctx, "news:manage");
    const existing = await prisma.newsPost.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
    if (!existing) throw new Error("Post not found");
    await prisma.newsPost.delete({ where: { id: ctx.id } });
    await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "news.deleted", entityType: "NewsPost", entityId: ctx.id });
    return { ok: true };
  },

  actions: {
    publish: async (ctx) => {
      can(ctx, "news:manage");
      const schoolId = ctx.session.user.schoolId;
      const post = await prisma.newsPost.findFirst({ where: { id: ctx.id, schoolId } });
      if (!post) throw new Error("Post not found");
      const updated = await prisma.newsPost.update({ where: { id: ctx.id }, data: { isPublished: true, publishedAt: post.publishedAt ?? new Date() } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "news.published", entityType: "NewsPost", entityId: ctx.id });
      return updated;
    },

    unpublish: async (ctx) => {
      can(ctx, "news:manage");
      const schoolId = ctx.session.user.schoolId;
      const post = await prisma.newsPost.findFirst({ where: { id: ctx.id, schoolId } });
      if (!post) throw new Error("Post not found");
      const updated = await prisma.newsPost.update({ where: { id: ctx.id }, data: { isPublished: false } });
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "news.unpublished", entityType: "NewsPost", entityId: ctx.id });
      return updated;
    },
  },
};
