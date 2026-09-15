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
export async function sendPush(opts: NotifyOptions): Promise<void> {
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId: opts.userId }, select: { id: true, token: true } });
    if (!tokens.length) return;

    const messaging = await loadMessaging();
    if (!messaging) {
      console.log(`[push:dev] to=${opts.userId} title="${opts.title}" body="${opts.body ?? ""}"`);
      return;
    }

    const res = await messaging.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: opts.title, body: opts.body || "" },
      data: opts.link ? { link: opts.link } : undefined,
      webpush: opts.link ? { fcmOptions: { link: opts.link } } : undefined,
    });

    // Clean up tokens the device/browser no longer recognizes (uninstalled,
    // permission revoked, etc.) so we stop trying to send to them.
    const stale: string[] = [];
    res.responses.forEach((r, i) => {
      const id = tokens[i]?.id;
      if (id && !r.success && r.error?.code === "messaging/registration-token-not-registered") {
        stale.push(id);
      }
    });
    if (stale.length) await prisma.pushToken.deleteMany({ where: { id: { in: stale } } });
  } catch (e) {
    console.error("push send failed:", e);
  }
}
