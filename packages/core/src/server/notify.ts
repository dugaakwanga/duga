import { prisma } from "./prisma";

export interface NotifyOptions {
  schoolId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  channels?: Array<"IN_APP" | "EMAIL" | "SMS">;
}

// Unified notification service. Always persists an in-app notification; sends
// email/SMS via adapters when providers are configured, otherwise logs to the
// server console (development fallback).
export async function dispatchNotification(opts: NotifyOptions): Promise<void> {
  const channels = opts.channels?.length ? opts.channels : ["IN_APP"];

  if (channels.includes("IN_APP")) {
    await prisma.notification.create({
      data: {
        schoolId: opts.schoolId,
        userId: opts.userId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        link: opts.link,
        channel: "IN_APP",
        status: "SENT",
      },
    });
  }

  if (channels.includes("EMAIL")) {
    await sendEmail(opts);
  }

  if (channels.includes("SMS")) {
    await sendSms(opts);
  }
}

async function sendEmail(opts: NotifyOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "no-reply@deultimateglory.com";
  try {
    const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { email: true } });
    if (!user?.email) return;
    if (apiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: user.email, subject: opts.title, text: opts.body || "" }),
      });
      if (!res.ok) throw new Error(`email ${res.status}`);
    } else {
      console.log(`[email:dev] to=${user.email} subject="${opts.title}" body="${opts.body ?? ""}"`);
    }
  } catch (e) {
    console.error("email send failed:", e);
  }
}

async function sendSms(opts: NotifyOptions) {
  const apiKey = process.env.SMS_API_KEY;
  const provider = process.env.SMS_PROVIDER;
  try {
    const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { phone: true } });
    if (!user?.phone) return;
    if (apiKey && provider === "TERMII") {
      const res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          to: user.phone,
          from: process.env.SMS_SENDER_ID || "DUGA",
          sms: opts.body || opts.title,
          type: "plain",
          channel: "generic",
        }),
      });
      if (!res.ok) throw new Error(`sms ${res.status}`);
    } else {
      console.log(`[sms:dev] to=${user.phone} body="${(opts.body || opts.title).slice(0, 160)}"`);
    }
  } catch (e) {
    console.error("sms send failed:", e);
  }
}

// Convenience: notify every user id in a list.
export async function dispatchToMany(
  userIds: string[],
  opts: Omit<NotifyOptions, "userId">,
): Promise<void> {
  await Promise.all(
    userIds.map((userId) =>
      dispatchNotification({ ...opts, userId }).catch(() => undefined),
    ),
  );
}
