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

// Requests notification permission (if not already decided), registers the
// FCM service worker, retrieves a device token, and hands it to the backend.
// Returns "granted" | "denied" | "unsupported" so the caller can react.
export async function requestPermissionAndRegister(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  if (!pushConfigured()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  try {
    const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ]);
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return "denied";
    await api("push/register", { method: "POST", body: { token, userAgent: navigator.userAgent }, loading: false });
    return "granted";
  } catch (e) {
    console.error("push registration failed:", e);
    return "denied";
  }
}
