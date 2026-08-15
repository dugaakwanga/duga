import { prisma } from "@duga/core/server";
import { dispatchNotification, logAudit } from "@duga/core/server";
import type { Module } from ".";
import { can, str } from "../helpers";

function mayDirectMessage(senderRole: string, recipientRole: string): boolean {
  if (senderRole === "OWNER" || senderRole === "ADMIN") return true;
  if (senderRole === "STUDENT") return recipientRole === "TEACHER" || recipientRole === "ADMIN";
  if (senderRole === "TEACHER") return recipientRole === "ADMIN" || recipientRole === "STUDENT" || recipientRole === "PARENT";
  if (senderRole === "PARENT") return recipientRole === "TEACHER" || recipientRole === "ADMIN";
  return false;
}

function assertDirectMessageAllowed(senderRole: string, recipientRole: string) {
  if (!mayDirectMessage(senderRole, recipientRole)) {
    const err = new Error("This role is not available for direct messages") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

// Number of active users an announcement targets, given its audience.
async function audienceSize(schoolId: string, a: { audience: string; targetSection?: string | null; targetClassGroupId?: string | null; targetLevelId?: string | null; targetRole?: string | null }): Promise<number> {
  const activeStudents = { status: "ACTIVE" as const };
  const activeUsers = { status: "ACTIVE" as const };
  switch (a.audience) {
    case "SECTION": {
      const students = await prisma.student.count({ where: { schoolId, section: a.targetSection as "PRIMARY" | "SECONDARY" | undefined, ...activeStudents } });
      const links = await prisma.studentParent.count({ where: { student: { schoolId, section: a.targetSection as "PRIMARY" | "SECONDARY" | undefined, status: "ACTIVE" } } });
      return students + links;
    }
    case "CLASS": {
      if (!a.targetClassGroupId) return 0;
      const students = await prisma.student.count({ where: { schoolId, currentClassGroupId: a.targetClassGroupId, ...activeStudents } });
      const links = await prisma.studentParent.count({ where: { student: { schoolId, currentClassGroupId: a.targetClassGroupId, status: "ACTIVE" } } });
      return students + links;
    }
    case "LEVEL": {
      if (!a.targetLevelId) return 0;
      const students = await prisma.student.count({ where: { schoolId, classGroup: { levelId: a.targetLevelId }, ...activeStudents } });
      const links = await prisma.studentParent.count({ where: { student: { schoolId, classGroup: { levelId: a.targetLevelId }, status: "ACTIVE" } } });
      return students + links;
    }
    case "ROLE":
      return prisma.user.count({ where: { schoolId, role: a.targetRole as never, ...activeUsers } });
    default:
      return prisma.user.count({ where: { schoolId, ...activeUsers } });
  }
}

// Active user ids an announcement should be pushed to.
async function targetUserIds(schoolId: string, a: { audience: string; targetSection?: string | null; targetClassGroupId?: string | null; targetLevelId?: string | null; targetRole?: string | null }): Promise<string[]> {
  const activeStudents = { status: "ACTIVE" as const };
  let students: Array<{ userId: string | null; parentLinks: Array<{ parent: { userId: string | null } }> }> = [];
  let roleUsers: Array<{ id: string }> = [];
  switch (a.audience) {
    case "SECTION":
      students = await prisma.student.findMany({ where: { schoolId, section: a.targetSection as "PRIMARY" | "SECONDARY" | undefined, ...activeStudents }, select: { userId: true, parentLinks: { select: { parent: { select: { userId: true } } } } } });
      break;
    case "CLASS":
      students = a.targetClassGroupId
        ? await prisma.student.findMany({ where: { schoolId, currentClassGroupId: a.targetClassGroupId, ...activeStudents }, select: { userId: true, parentLinks: { select: { parent: { select: { userId: true } } } } } })
        : [];
      break;
    case "LEVEL":
      students = a.targetLevelId
        ? await prisma.student.findMany({ where: { schoolId, classGroup: { levelId: a.targetLevelId }, ...activeStudents }, select: { userId: true, parentLinks: { select: { parent: { select: { userId: true } } } } } })
        : [];
      break;
    case "ROLE":
      roleUsers = await prisma.user.findMany({ where: { schoolId, role: a.targetRole as never, ...activeStudents }, select: { id: true } });
      break;
    default:
      roleUsers = await prisma.user.findMany({ where: { schoolId, ...activeStudents }, select: { id: true } });
      break;
  }
  const ids = new Set<string>();
  students.forEach((s) => {
    if (s.userId) ids.add(s.userId);
    s.parentLinks.forEach((l) => l.parent.userId && ids.add(l.parent.userId));
  });
  roleUsers.forEach((u) => ids.add(u.id));
  return [...ids];
}

export const messagingModule: Module = {
  // Conversations for the current user
  async list(ctx) {
    can(ctx, "messaging:use");
    const conversations = await prisma.conversation.findMany({
      where: { schoolId: ctx.session.user.schoolId, participants: { some: { userId: ctx.session.user.id } } },
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
      where: { id: ctx.id, schoolId: ctx.session.user.schoolId, participants: { some: { userId: ctx.session.user.id } } },
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
    if (otherUserId === ctx.session.user.id) throw new Error("You cannot start a conversation with yourself");
    const other = await prisma.user.findFirst({ where: { id: otherUserId, schoolId: ctx.session.user.schoolId, status: "ACTIVE" } });
    if (!other) throw new Error("User not found");
    assertDirectMessageAllowed(ctx.session.user.role, other.role);

    // find existing direct conversation
    const existing = await prisma.conversation.findFirst({
      where: {
        schoolId: ctx.session.user.schoolId,
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
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, schoolId: ctx.session.user.schoolId },
        include: { participants: { include: { user: { select: { role: true, status: true } } } } },
      });
      if (!conversation) throw new Error("Conversation not found");
      if (conversation.type === "DIRECT") {
        const other = conversation.participants.find((entry) => entry.userId !== ctx.session.user.id)?.user;
        if (!other || other.status !== "ACTIVE") throw new Error("Recipient is unavailable");
        assertDirectMessageAllowed(ctx.session.user.role, other.role);
      }
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
      const schoolId = ctx.session.user.schoolId;
      const role = ctx.session.user.role;
      const where: Record<string, unknown> = { schoolId };
      if (role === "STUDENT") {
        const student = ctx.session.user.student;
        where.OR = [{ audience: "EVERYONE" }, { audience: "ROLE", targetRole: "STUDENT" }, { audience: "SECTION", targetSection: student?.section }, { audience: "CLASS", targetClassGroupId: student?.currentClassGroupId }];
      }
      if (role === "PARENT") {
        const links = await prisma.studentParent.findMany({
          where: { parentId: ctx.session.user.parent!.id },
          select: { student: { select: { section: true, currentClassGroupId: true, classGroup: { select: { levelId: true } } } } },
        });
        const sections = [...new Set(links.map((link) => link.student.section))];
        const classIds = [...new Set(links.map((link) => link.student.currentClassGroupId).filter(Boolean))];
        const levelIds = [...new Set(links.map((link) => link.student.classGroup?.levelId).filter(Boolean))];
        where.OR = [
          { audience: "EVERYONE" },
          { audience: "ROLE", targetRole: "PARENT" },
          ...(sections.length ? [{ audience: "SECTION", targetSection: { in: sections } }] : []),
          ...(classIds.length ? [{ audience: "CLASS", targetClassGroupId: { in: classIds } }] : []),
          ...(levelIds.length ? [{ audience: "LEVEL", targetLevelId: { in: levelIds } }] : []),
        ];
      }
      const announcements = await prisma.announcement.findMany({
        where,
        include: {
          author: { select: { firstName: true, lastName: true, role: true } },
          reads: { where: { userId: ctx.session.user.id }, select: { id: true } },
          _count: { select: { reads: true } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: 100,
      });
      return {
        items: announcements.map((a) => ({
          ...a,
          isRead: a.reads.length > 0,
          reads: undefined,
          readCount: a._count.reads,
          readBy: null,
        })),
      };
    },

    // Read receipts for staff: who has seen each announcement.
    announcementReads: async (ctx) => {
      can(ctx, "announcements:view");
      const role = ctx.session.user.role;
      if (!(role === "OWNER" || role === "ADMIN" || role === "BURSAR" || role === "TEACHER")) throw new Error("Only staff can view read receipts");
      const announcement = await prisma.announcement.findFirst({ where: { id: ctx.id, schoolId: ctx.session.user.schoolId } });
      if (!announcement) throw new Error("Announcement not found");
      const [reads, audience] = await Promise.all([
        prisma.announcementRead.findMany({
          where: { announcementId: ctx.id! },
          include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
          orderBy: { readAt: "desc" },
          take: 100,
        }),
        audienceSize(ctx.session.user.schoolId, announcement),
      ]);
      return { reads: reads.map((r) => ({ id: r.id, readAt: r.readAt, user: r.user })), readCount: reads.length, audienceSize: audience };
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
          audience: (str(ctx.body.audience) as "EVERYONE") ?? "EVERYONE",
          targetClassGroupId: str(ctx.body.targetClassGroupId),
          targetLevelId: str(ctx.body.targetLevelId),
          targetSection: str(ctx.body.targetSection) as "PRIMARY" | "SECONDARY" | undefined,
          targetRole: str(ctx.body.targetRole) as "STUDENT" | "PARENT" | undefined,
          isPinned: ctx.body.isPinned === true,
          attachments: ctx.body.attachments ? ctx.body.attachments : undefined,
        },
      });

      // Push notifications only to the intended audience.
      const userIds = await targetUserIds(schoolId, announcement);
      for (const userId of userIds) {
        if (userId === ctx.session.user.id) continue;
        await dispatchNotification({ schoolId, userId, type: "announcement", title, body: body.slice(0, 160), link: "/portal/announcements" });
      }
      await logAudit({ schoolId, userId: ctx.session.user.id, action: "announcement.created", entityType: "Announcement", entityId: announcement.id });
      return announcement;
    },

    deleteAnnouncement: async (ctx) => {
      can(ctx, "announcements:manage");
      const deleted = await prisma.announcement.deleteMany({
        where: { id: ctx.id, schoolId: ctx.session.user.schoolId },
      });
      if (deleted.count === 0) throw new Error("Announcement not found");
      await logAudit({ schoolId: ctx.session.user.schoolId, userId: ctx.session.user.id, action: "announcement.deleted", entityType: "Announcement", entityId: ctx.id! });
      return { ok: true };
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
