import { prisma } from "./prisma";
import { sendPush } from "./push";
import { renderEmailHtml } from "./emailTemplate";

export interface NotifyOptions {
  schoolId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  channels?: Array<"IN_APP" | "EMAIL" | "SMS" | "PUSH">;
}

// Unified notification service. Always persists an in-app notification; sends
// email/SMS via adapters when providers are configured, otherwise logs to the
// server console (development fallback).
export async function dispatchNotification(opts: NotifyOptions): Promise<void> {
  // PUSH is on by default alongside IN_APP — sendPush() silently no-ops for
  // any user with no registered device token, so this costs nothing for
  // users who haven't installed the app, and gets every notification type
  // onto a phone (as a real beep/vibrate alert) for those who have, without
  // every call site needing to remember to opt in.
  const channels = opts.channels?.length ? opts.channels : ["IN_APP", "PUSH"];

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

  if (channels.includes("PUSH")) {
    await sendPush(opts);
  }
}

// Admissions mail (application status, "you're admitted") comes from the
// admissions inbox; every other notification type comes from the general
// info inbox — two separate verified senders on the same domain.
function fromAddressFor(type: string): string {
  if (type === "application") {
    return process.env.MAIL_FROM_ADMISSIONS || process.env.MAIL_FROM || "no-reply@deultimateglory.com";
  }
  return process.env.MAIL_FROM || "no-reply@deultimateglory.com";
}

function fromNameFor(type: string): string {
  return type === "application" ? "De Ultimate Glory Academy — Admissions" : "De Ultimate Glory Academy";
}

// Resend's free tier caps at 100 emails/day — this stays under that with a
// safety margin, then fails over to SendPulse (12,000/month, no comparable
// daily wall) for the rest of the day. Combined that's roughly 15,000/month
// of free capacity, split so a single burst (e.g. every parent with an
// unpaid invoice, reminded in one run) doesn't get throttled mid-send.
const RESEND_DAILY_SAFE_LIMIT = 90;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function usageToday(provider: string): Promise<number> {
  const row = await prisma.emailProviderUsage.findUnique({ where: { provider_day: { provider, day: todayKey() } } });
  return row?.count ?? 0;
}

async function recordUsage(provider: string): Promise<void> {
  const day = todayKey();
  await prisma.emailProviderUsage
    .upsert({ where: { provider_day: { provider, day } }, update: { count: { increment: 1 } }, create: { provider, day, count: 1 } })
    .catch(() => undefined);
}

async function sendViaResend(from: string, to: string, subject: string, text: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
  await recordUsage("resend");
}

// SendPulse's transactional endpoint requires the html body base64-encoded
// and wants { name, email } objects for from/to rather than plain strings —
// see https://api.sendpulse.com/.well-known/openapi/smtp.yaml.
async function sendViaSendPulse(fromEmail: string, fromName: string, to: string, subject: string, text: string, html: string): Promise<void> {
  const apiKey = process.env.SENDPULSE_API_KEY;
  if (!apiKey) throw new Error("SendPulse not configured");
  const res = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: {
        subject,
        from: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        html: Buffer.from(html, "utf-8").toString("base64"),
        text,
      },
    }),
  });
  if (!res.ok) throw new Error(`sendpulse ${res.status} ${await res.text().catch(() => "")}`);
  await recordUsage("sendpulse");
}

// Picks Resend while it's under today's safe limit, SendPulse once that's
// used up, and falls back to whichever provider isn't the one that just
// failed — so a single provider outage doesn't drop the email entirely.
async function sendViaProvider(from: string, fromName: string, to: string, subject: string, text: string, link?: string): Promise<void> {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSendPulse = Boolean(process.env.SENDPULSE_API_KEY);
  if (!hasResend && !hasSendPulse) {
    console.log(`[email:dev] to=${to} subject="${subject}" body="${text}"`);
    return;
  }
  const html = renderEmailHtml({ title: subject, body: text, link });
  const preferResend = hasResend && (!hasSendPulse || (await usageToday("resend")) < RESEND_DAILY_SAFE_LIMIT);
  const primary = preferResend ? "resend" : "sendpulse";
  try {
    if (primary === "resend") await sendViaResend(from, to, subject, text, html);
    else await sendViaSendPulse(from, fromName, to, subject, text, html);
  } catch (e) {
    const fallback = primary === "resend" ? (hasSendPulse ? "sendpulse" : null) : hasResend ? "resend" : null;
    if (!fallback) throw e;
    console.error(`email via ${primary} failed, falling back to ${fallback}:`, e);
    if (fallback === "resend") await sendViaResend(from, to, subject, text, html);
    else await sendViaSendPulse(from, fromName, to, subject, text, html);
  }
}

async function sendEmail(opts: NotifyOptions) {
  const from = fromAddressFor(opts.type);
  const fromName = fromNameFor(opts.type);
  try {
    const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { email: true } });
    if (!user?.email) return;
    await sendViaProvider(from, fromName, user.email, opts.title, opts.body || "", opts.link);
  } catch (e) {
    console.error("email send failed:", e);
  }
}

// Send an email to an arbitrary address that isn't (yet) tied to a User row
// — e.g. an admissions applicant who hasn't been admitted, so has no portal
// account for dispatchNotification's user-scoped lookups to find. Only ever
// called for admissions flows, so it always sends from the admissions inbox.
export async function sendRawEmail(to: string, subject: string, body: string): Promise<void> {
  if (!to) return;
  try {
    await sendViaProvider(fromAddressFor("application"), fromNameFor("application"), to, subject, body);
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
  const channels = opts.channels?.length ? opts.channels : ["IN_APP", "PUSH"];

  if (channels.includes("IN_APP") && userIds.length) {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        schoolId: opts.schoolId,
        userId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        link: opts.link,
        channel: "IN_APP" as const,
        status: "SENT" as const,
      })),
    });
  }

  const outOfBandChannels = channels.filter((c) => c !== "IN_APP");
  if (outOfBandChannels.length) {
    await Promise.all(
      userIds.map((userId) =>
        dispatchNotification({ ...opts, userId, channels: outOfBandChannels as NotifyOptions["channels"] }).catch(() => undefined),
      ),
    );
  }
}
