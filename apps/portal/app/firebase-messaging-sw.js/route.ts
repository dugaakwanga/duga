// Served as a plain script at /firebase-messaging-sw.js (the root scope FCM
// requires for its service worker). A route handler rather than a static
// file under public/ because it needs the NEXT_PUBLIC_FIREBASE_* values
// interpolated in — a static file has no access to server-side env vars.
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  const body = `
importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

// Fires when a push arrives while the app isn't in the foreground — shows a
// system notification and stashes the deep link for the click handler below.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "DUGA Portal";
  const body = payload.notification?.body || "";
  const link = payload.fcmOptions?.link || payload.data?.link || "/portal";
  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { link },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/portal";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(link) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    }),
  );
});
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache",
    },
  });
}
