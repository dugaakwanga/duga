"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Card, Button, Alert, Icon } from "@duga/ui";
import { isStandalone, isIos, pushConfigured, requestPermissionAndRegister, preloadMessaging, startForegroundPushListener } from "@/lib/client/push";

interface InstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Roles forced through "install to Home Screen" + "turn on notifications" —
// parents (gate clock-in/out alerts, the original reason push exists — see
// notifyParents() in security.ts) and teachers. Students and staff who
// manage the school (owner/admin/bursar) are exempt.
const FORCED_ROLES = ["PARENT", "TEACHER"];

// Re-checks on every mount/focus, so if the icon gets deleted, the next open
// (necessarily back in a plain browser tab) fails the standalone check and
// this reappears on its own — no separate "detect uninstall" logic needed.
export function PushInstallGate({ role }: { role: string }) {
  const pathname = usePathname();
  const [standalone, setStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const registeredRef = useRef(false);
  const foregroundListenerRef = useRef(false);

  // Don't gate: anyone not in FORCED_ROLES, the set-password form itself (so
  // it isn't blocked before they can even set a password), or a school that
  // hasn't configured Firebase yet — nothing here would work anyway.
  const skip = !FORCED_ROLES.includes(role) || pathname.startsWith("/portal/set-password") || !pushConfigured();

  const check = useCallback(() => {
    setStandalone(isStandalone());
    setPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  }, []);

  useEffect(() => {
    if (skip) return;
    check();
    // Start downloading the Firebase SDK + registering the service worker
    // right away, in the background — by the time the parent actually
    // reaches "Turn on alerts" (after doing Step 1), that work is already
    // done instead of adding a cold-fetch delay on top of the permission
    // prompt + token exchange.
    preloadMessaging();
    const onVisible = () => check();
    const onInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => {
      window.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    };
  }, [skip, check]);

  // Once both conditions are already met, keep the token fresh silently —
  // no need to re-prompt someone who already has everything turned on.
  useEffect(() => {
    if (skip || !standalone || permission !== "granted" || registeredRef.current) return;
    registeredRef.current = true;
    requestPermissionAndRegister();
  }, [skip, standalone, permission]);

  // FCM's service worker only shows a push while the app is in the
  // background — a message that arrives while a parent has the portal
  // actively open needs this listener instead, or it's silently dropped.
  useEffect(() => {
    if (skip || !standalone || permission !== "granted" || foregroundListenerRef.current) return;
    foregroundListenerRef.current = true;
    startForegroundPushListener();
  }, [skip, standalone, permission]);

  if (skip) return null;
  if (standalone && permission === "granted") return null;
  // iOS Safari doesn't expose the Notification API at all until the site is
  // actually running standalone (added to the Home Screen) — so "unsupported"
  // before that point just means "not installed yet," not "never possible."
  // Only bail once they're ALREADY standalone and STILL have no Notification
  // API — that's a genuine dead end (very old iOS, or a browser with no push
  // support at all) where forcing further gets a parent nowhere.
  if (standalone && permission === "unsupported") return null;

  async function install() {
    if (!installEvent) return;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") setInstalled(true);
    check();
  }

  async function turnOnAlerts() {
    setBusy(true);
    setError(null);
    try {
      const result = await requestPermissionAndRegister();
      // Claim the "already registered" guard here too — otherwise, once
      // check() below flips `permission` to "granted", the auto-registration
      // effect above (meant only for a return visit where permission was
      // already granted) sees the same transition and calls
      // requestPermissionAndRegister() a SECOND time moments later. Two
      // getToken() calls in quick succession on the same device were minting
      // two different FCM tokens back to back — and on Android, that left
      // both dead (NotRegistered) rather than one clean live subscription.
      registeredRef.current = true;
      if (result === "denied") {
        setError("Notifications are blocked for this app. Open your phone's Settings → Notifications → DUGA Portal, and turn them on.");
      }
      check();
    } finally {
      setBusy(false);
    }
  }

  const ios = isIos();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, minWidth: 0 }}>
        <Card title="One more step — instant alerts">
          {/* gridTemplateColumns: "minmax(0,1fr)" (not just "grid") on every
          grid wrapper below — without it, a long line of text can size the
          column to its full unwrapped width instead of shrinking to fit a
          phone screen, and gets clipped instead of wrapping. Same fix as
          the lesson-content overflow bug. */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 14 }}>
            <div style={{ fontSize: 13.5, color: "var(--duga-muted)" }}>
              {role === "PARENT"
                ? "Install this app on your phone so you get instant alerts when your child arrives at or leaves school."
                : "Install this app on your phone so you get instant alerts from the school."}{" "}
              Takes a minute, only needs doing once.
            </div>

            {!standalone && (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="attendance" size={16} /> Step 1: Add to Home Screen
                </div>
                {ios ? (
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--duga-muted)", display: "grid", gap: 4 }}>
                    <li>
                      Tap the <strong>Share</strong> icon in Safari&apos;s toolbar (a square with an arrow pointing up).
                    </li>
                    <li>
                      Scroll down and tap <strong>Add to Home Screen</strong>.
                    </li>
                    <li>
                      Tap <strong>Add</strong> in the top corner.
                    </li>
                    <li>Close this browser tab, then open the app from the new icon on your Home Screen.</li>
                  </ol>
                ) : installEvent ? (
                  <Button variant="accent" onClick={install}>
                    <Icon name="check" size={16} /> Install now
                  </Button>
                ) : (
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--duga-muted)", display: "grid", gap: 4 }}>
                    <li>
                      Open your browser menu (⋮) and tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.
                    </li>
                    <li>Then open the app from the new icon on your Home Screen.</li>
                  </ol>
                )}
                {installed && (
                  <Alert tone="success">Installed. Now open the app from your Home Screen icon to continue.</Alert>
                )}
                {checkedOnce && !standalone && (
                  <Alert tone="warning">
                    {/* Alert renders its children in a flex row (icon + text
                    side by side) — a bare mix of text and a <strong> here
                    would split into separate flex items instead of flowing
                    as one paragraph, so it all needs to be ONE child. */}
                    <span>
                      Still not detected. Close this tab, then open the app from the <strong>DUGA Portal icon</strong> on your Home Screen.
                    </span>
                  </Alert>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCheckedOnce(true);
                    check();
                  }}
                >
                  I&apos;ve added it — check again
                </Button>
              </div>
            )}

            {standalone && permission !== "granted" && (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="attendance" size={16} /> Step 2: Turn on alerts
                </div>
                {error && <Alert tone="danger">{error}</Alert>}
                <Button variant="accent" onClick={turnOnAlerts} loading={busy}>
                  {busy ? "Setting up alerts…" : "Turn on alerts"}
                </Button>
                {busy && (
                  <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>
                    This can take a few seconds the first time — hang tight.
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
