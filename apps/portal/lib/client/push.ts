import { api } from "./api";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

// True once the portal is running as an installed app rather than a plain
// browser tab — the only context browsers reliably deliver push to
// (Safari/iOS in particular ignores web push entirely from a regular tab).
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function pushConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && vapidKey);
}

type MessagingSdk = typeof import("firebase/messaging");

interface Loaded {
  messaging: import("firebase/messaging").Messaging;
  registration: ServiceWorkerRegistration;
  sdk: MessagingSdk;
}

let loaderPromise: Promise<Loaded | null> | null = null;

// Downloads the Firebase SDK chunk and registers the service worker ahead of
// time, cached so it only ever happens once. Call this as early as possible
// (as soon as the install gate is showing, well before "Turn on alerts" is
// actually tapped) so that button only has to wait on the permission prompt
// + token exchange, not a cold network fetch of the SDK on top of it.
function loadMessaging(): Promise<Loaded | null> {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      if (!pushConfigured() || typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
      const [{ initializeApp, getApps }, sdk, registration] = await Promise.all([
        import("firebase/app"),
        import("firebase/messaging"),
        navigator.serviceWorker.register("/firebase-messaging-sw.js"),
      ]);
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      return { messaging: sdk.getMessaging(app), registration, sdk };
    })();
  }
  return loaderPromise;
}

// Fire-and-forget — call as soon as it's known push will likely be needed
// (the install gate mounting) so loadMessaging()'s work is already done, or
// well underway, by the time the user actually taps "Turn on alerts".
export function preloadMessaging(): void {
  void loadMessaging();
}

// Requests notification permission (if not already decided), then reuses
// the preloaded SDK/service worker to fetch a device token and hand it to
// the backend. Returns "granted" | "denied" | "unsupported".
export async function requestPermissionAndRegister(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  if (!pushConfigured()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  try {
    const loaded = await loadMessaging();
    if (!loaded) return "denied";
    const token = await loaded.sdk.getToken(loaded.messaging, { vapidKey, serviceWorkerRegistration: loaded.registration });
    if (!token) return "denied";
    await api("push/register", { method: "POST", body: { token, userAgent: navigator.userAgent }, loading: false });
    return "granted";
  } catch (e) {
    console.error("push registration failed:", e);
    return "denied";
  }
}

// FCM only routes a push through the service worker's background handler
// when the app/tab is NOT focused — a message that arrives while the portal
// is actively open and in the foreground is delivered straight to the page
// instead, and nothing shows it unless something here listens for it. Call
// once permission is already granted, e.g. right after the install gate
// finishes — matches the same title/body/link shape and icon the background
// handler in firebase-messaging-sw.js uses, so a clock-in alert looks and
// behaves the same regardless of whether the app happened to be open.
export async function startForegroundPushListener(): Promise<void> {
  const loaded = await loadMessaging();
  if (!loaded || Notification.permission !== "granted") return;
  loaded.sdk.onMessage(loaded.messaging, (payload) => {
    const title = payload.notification?.title || "DUGA Portal";
    const body = payload.notification?.body || "";
    const link = payload.fcmOptions?.link || (payload.data as Record<string, string> | undefined)?.link || "/portal";
    // vibrate on the Notification options only takes effect on platforms
    // that support it (mainly Android Chrome); navigator.vibrate() is the
    // direct fallback, and only works because the tab is in the foreground
    // here (background tabs can't trigger it).
    const n = new Notification(title, { body, icon: "/icons/icon-192.png", data: { link }, vibrate: [200, 100, 200] } as NotificationOptions);
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // Vibration API not available — nothing to do.
    }
    n.onclick = () => {
      window.focus();
      window.location.href = link;
      n.close();
    };
  });
}
