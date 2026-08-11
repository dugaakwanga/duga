import { prisma } from "@duga/core/server";
import { dispatchNotification, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

export const messagingModule: Module = {
  // Conversations for the current user
  async list(ctx) {
    can(ctx, "messaging:use");
    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId: ctx.session.user.id } } },
      include: {
        participants: { include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } } },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });
    return {
      items: conversations.map((c) => {
        const lastMessage = c.messages[0] ?? null;
        return {
          id: c.id,
          title: c.title,
          type: c.type,
          updatedAt: c.updatedAt,
          lastMessage,
          others: c.participants.filter((p) => p.userId !== ctx.session.user.id).map((p) => p.user),
        };
      }),
    };
  },

  async get(ctx) {
    can(ctx, "messaging:use");
    const conversation = await prisma.conversation.findFirst({
      where: { id: ctx.id, participants: { some: { userId: ctx.session.user.id } } },
      include: {
        participants: { include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } } },
        messages: {
          include: { sender: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { sentAt: "asc" },
          take: 200,
        },
      },
    });
    if (!conversation) throw new Error("Conversation not found");
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: conversation.id, userId: ctx.session.user.id },
      data: { lastReadAt: new Date() },
    });
    return conversation;
  },

  // Start a direct conversation
  async create(ctx) {
    can(ctx, "messaging:use");
    const otherUserId = str(ctx.body.userId);
    if (!otherUserId) throw new Error("userId required");
    const other = await prisma.user.findFirst({ where: { id: otherUserId, schoolId: ctx.session.user.schoolId } });
    if (!other) throw new Error("User not found");

    // find existing direct conversation
    const existing = await prisma.conversation.findFirst({
      where: {
        type: "DIRECT",
        AND: [
          { participants: { some: { userId: ctx.session.user.id } } },
          { participants: { some: { userId: otherUserId } } },
        ],
      },
    });
    if (existing) return existing;

    const conversation = await prisma.conversation.create({
      data: {
        schoolId: ctx.session.user.schoolId,
        type: "DIRECT",
        participants: {
          create: [{ userId: ctx.session.user.id }, { userId: otherUserId }],
        },
      },
    });
    return conversation;
  },

  actions: {
    // Send a message
    send: async (ctx) => {
      can(ctx, "messaging:use");
      const conversationId = ctx.id ?? str(ctx.body.conversationId);
      const body = str(ctx.body.body);
      if (!conversationId || !body) throw new Error("conversationId and body required");
      const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId: ctx.session.user.id } },
      });
      if (!participant) throw new Error("Not part of this conversation");
      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: ctx.session.user.id,
          body,
          attachments: ctx.body.attachments ? ctx.body.attachments : undefined,
        },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      // Notify other participants
      const others = await prisma.conversationParticipant.findMany({ where: { conversationId, userId: { not: ctx.session.user.id } } });
      for (const o of others) {
        await dispatchNotification({ schoolId: ctx.session.user.schoolId, userId: o.userId, type: "message", title: "New message", body: body.slice(0, 120), link: `/portal/messages/${conversationId}` });
      }
      return message;
    },

    // Announcements
    announcements: async (ctx) => {
      can(ctx, "announcements:view");
      const where: Record<string, unknown> = { schoolId: ctx.session.user.schoolId };
      const role = ctx.session.user.role;
      if (role === "STUDENT") {
        const student = ctx.session.user.student;
        where.OR = [{ audience: "EVERYONE" }, { audience: "SECTION", targetSection: student?.section }, { audience: "CLASS", targetClassGroupId: student?.currentClassGroupId }];
      }
      if (role === "PARENT") {
        where.audience = { in: ["EVERYONE", "SECTION", "CLASS", "LEVEL", "ROLE"] };
      }
      const announcements = await prisma.announcement.findMany({
        where,
        include: {
          author: { select: { firstName: true, lastName: true, role: true } },
          reads: { where: { userId: ctx.session.user.id }, select: { id: true } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: 100,
      });
      return {
        items: announcements.map((a) => ({
          ...a,
          isRead: a.reads.length > 0,
          reads: undefined,
        })),
      };
    },

    postAnnouncement: async (ctx) => {
      can(ctx, "announcements:manage");
      const schoolId = ctx.session.user.schoolId;
      const title = str(ctx.body.title);
      const body = str(ctx.body.body);
      if (!title || !body) throw new Error("title and body required");
      const announcement = await prisma.announcement.create({
        data: {
          schoolId,
          authorId: ctx.session.user.id,
          title,
          body,
          audience: str(ctx.body.audience) as "EVERYONE" ?? "EVERYONE",
          targetClassGroupId: str(ctx.body.targetClassGroupId),
          targetLevelId: str(ctx.body.targetLevelId),
          targetSection: str(ctx.body.targetSection) as "PRIMARY" | "SECONDARY" | undefined,
          targetRole: str(ctx.body.targetRole) as "STUDENT" | "PARENT" | undefined,
          isPinned: ctx.body.isPinned === true,
          attachments: ctx.body.attachments ? ctx.body.attachments : undefined,
        },
      });

      // Notify relevant users (everyone active at the school for now;
      // audience-specific targeting can be extended per-role)
      const users = await prisma.user.findMany({
        where: { schoolId, status: "ACTIVE", id: { not: ctx.session.user.id } },
        select: { id: true },
      });
      for (const u of users) {
        await dispatchNotification({ schoolId, userId: u.id, type: "announcement", title, body: body.slice(0, 160), link: "/portal/announcements" });
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "announcement.created", entityType: "Announcement", entityId: announcement.id });
      return announcement;
    },

    markAnnouncementRead: async (ctx) => {
      can(ctx, "announcements:view");
      await prisma.announcementRead.upsert({
        where: { announcementId_userId: { announcementId: ctx.id!, userId: ctx.session.user.id } },
        update: {},
        create: { announcementId: ctx.id!, userId: ctx.session.user.id },
      });
      return { ok: true };
    },

    // Notifications for current user
    notifications: async (ctx) => {
      const notifications = await prisma.notification.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { createdAt: "desc" },
        take: 60,
      });
      const unread = notifications.filter((n) => !n.isRead).length;
      return { items: notifications, unread };
    },

    notificationsRead: async (ctx) => {
      await prisma.notification.updateMany({ where: { userId: ctx.session.user.id, isRead: false }, data: { isRead: true } });
      return { ok: true };
    },
  },
};
