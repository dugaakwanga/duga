import { prisma } from "@duga/core/server";
import type { Module } from ".";
import { str } from "../helpers";

export const pushModule: Module = {
  actions: {
    // Registers (or refreshes) this browser/device's FCM token against the
    // logged-in user. Idempotent — called every time the install gate
    // confirms permission is granted, not just once, so `lastSeenAt` stays
    // current and a token that outlives a reinstall keeps working.
    register: async (ctx) => {
      const token = str(ctx.body.token);
      if (!token) throw new Error("token required");
      const userAgent = str(ctx.body.userAgent);
      await prisma.pushToken.upsert({
        where: { token },
        update: { userId: ctx.session.user.id, userAgent },
        create: { userId: ctx.session.user.id, token, userAgent },
      });
      return { ok: true };
    },

    unregister: async (ctx) => {
      const token = str(ctx.body.token);
      if (!token) throw new Error("token required");
      await prisma.pushToken.deleteMany({ where: { token, userId: ctx.session.user.id } });
      return { ok: true };
    },
  },
};
