import { prisma } from "./prisma";
import type { NotifyOptions } from "./notify";

// Lazily initialized so a school running without Firebase configured never
// pays the cost (or risk of a startup crash) of loading firebase-admin.
let messagingPromise: Promise<import("firebase-admin/messaging").Messaging | null> | null = null;

function loadMessaging(): Promise<import("firebase-admin/messaging").Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!json) return null;
      const { initializeApp, getApps, cert } = await import("firebase-admin/app");
      const { getMessaging } = await import("firebase-admin/messaging");
      const serviceAccount = JSON.parse(json);
      const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
      return getMessaging(app);
    })();
  }
  return messagingPromise;
}

// Sends a web push via Firebase Cloud Messaging to every device a user has
// registered. Unlike email/SMS this channel has no free-tier volume or rate
// ceiling, so it's the right choice for high-frequency, time-sensitive
// events (e.g. gate clock-in/out) — see notifyParents() in security.ts.
// Token error codes that mean the device/browser itself is gone
// (uninstalled, permission revoked, token rotated out) — worth deleting so
// we stop trying. Anything else (quota, transient network) is not a
// reason to give up on the token, just this one send.
const STALE_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

export async function sendPush(opts: NotifyOptions): Promise<void> {
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId: opts.userId }, select: { id: true, token: true } });
    if (!tokens.length) return;

    const messaging = await loadMessaging();
    if (!messaging) {
      console.log(`[push:dev] to=${opts.userId} title="${opts.title}" body="${opts.body ?? ""}"`);
      return;
    }

    // Deliberately a DATA-ONLY message (no top-level `notification` field) —
    // when a push has one, Firebase's own SDK auto-displays it inside the
    // service worker and never invokes our onBackgroundMessage handler at
    // all, which is a well-documented reason a push can come back
    // successful from the Admin SDK yet never actually show on Android
    // Chrome (whatever that internal auto-display path does differently
    // there silently fails). A data-only message guarantees our own
    // handler — and its showNotification() call — runs every time, on
    // every platform.
    const payload = {
      tokens: tokens.map((t: { id: string; token: string }) => t.token),
      data: {
        title: opts.title,
        body: opts.body || "",
        ...(opts.link ? { link: opts.link } : {}),
      },
    };

    // A momentary FCM/network blip shouldn't silently drop a time-sensitive
    // alert (e.g. a gate clock-in) — retry once before giving up.
    let res;
    try {
      res = await messaging.sendEachForMulticast(payload);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
      res = await messaging.sendEachForMulticast(payload);
    }

    const stale: string[] = [];
    res.responses.forEach((r: { success: boolean; error?: { code?: string } }, i: number) => {
      const id = tokens[i]?.id;
      if (id && !r.success && r.error?.code && STALE_TOKEN_CODES.has(r.error.code)) {
        stale.push(id);
      }
    });
    if (stale.length) await prisma.pushToken.deleteMany({ where: { id: { in: stale } } });
  } catch (e) {
    console.error("push send failed:", e);
  }
}
