"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Card, Button, Select, Field, Alert, Spinner, Badge, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface StaffTarget {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  teacher?: { staffNumber: string | null } | null;
  admin?: { designation: string | null } | null;
}

interface TodayRecord {
  checkInAt: string | null;
  checkInDistanceM: number | null;
  checkInWithinRadius: boolean | null;
  checkInPhotoUrl: string | null;
  checkOutAt: string | null;
  checkOutDistanceM: number | null;
  checkOutWithinRadius: boolean | null;
  checkOutPhotoUrl: string | null;
}

interface ClockStatus {
  userId: string;
  radius: number;
  schoolLat: number;
  schoolLng: number;
  today: TodayRecord | null;
}

interface Loc {
  lat: number | null;
  lng: number | null;
  error: string | null;
  supported: boolean;
}

// A small square capture is plenty to verify a face is present and keeps the
// upload tiny — this is a live snapshot for admin review, not a portrait.
const CAPTURE_SIZE = 240;

export default function StaffClockPage() {
  const [targets, setTargets] = useState<StaffTarget[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [loc, setLoc] = useState<Loc>({ lat: null, lng: null, error: null, supported: true });
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLoc({ lat: null, lng: null, error: "Geolocation is not supported by this browser. Use a phone or a browser with location access.", supported: false });
      return;
    }
    setLocating(true);
    setLoc({ lat: null, lng: null, error: null, supported: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: null, supported: true });
        setLocating(false);
      },
      (err) => {
        setLoc({ lat: null, lng: null, error: `Location unavailable: ${err.message}. Allow location access and try again.`, supported: true });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  // The camera starts live as soon as the page opens (like location) so a
  // fresh frame is always available the instant Clock In/Out is pressed —
  // there is deliberately no "upload a photo" fallback anywhere in this flow.
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access isn't supported by this browser. Use a phone or a browser with camera access.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (e) {
      setCameraError(`Camera unavailable: ${(e as Error).message}. Allow camera access and reload this page.`);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = { targetUserId: targetUserId || undefined };
      const [t, s] = await Promise.all([
        api<{ items: StaffTarget[] }>("attendance/staffClockTargets", { method: "POST", body }),
        api<ClockStatus>("attendance/staffStatus", { method: "POST", body }),
      ]);
      setTargets(t.items);
      setStatus(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    locate();
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snaps the current live video frame — never a file picker — compresses it
  // to a small JPEG, and uploads it. Returns null (with cameraError set) if
  // the camera isn't actually live, so the caller can refuse to clock in/out.
  async function captureAndUploadPhoto(): Promise<{ url: string; key: string } | null> {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady || video.readyState < 2) {
      setCameraError("Camera isn't ready yet — wait a moment for the live preview, then try again.");
      return null;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = CAPTURE_SIZE;
    canvas.height = CAPTURE_SIZE;
    // Center-crop the video frame to a square so the capture matches the
    // preview regardless of the camera's native aspect ratio.
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.6));
    if (!blob) return null;
    const fd = new FormData();
    fd.append("file", blob, "clock.jpg");
    const res = await fetch("/api/upload?purpose=clock-photo", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Photo upload failed");
    return { url: json.data.url as string, key: json.data.key as string };
  }

  async function clock(kind: "in" | "out") {
    if (loc.lat === null || loc.lng === null) {
      setMessage(null);
      setError("Get your current location first (use the \"Get my location\" button).");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const photo = await captureAndUploadPhoto();
      if (!photo) {
        setError(cameraError ?? "Couldn't capture a live photo — check camera access and try again.");
        return;
      }
      const action = kind === "in" ? "staffClockIn" : "staffClockOut";
      const res = await api<{ withinRadius: boolean; distanceMeters: number; proxyByUserId: string | null }>(
        `attendance/${action}`,
        { method: "POST", body: { lat: loc.lat, lng: loc.lng, photoUrl: photo.url, photoKey: photo.key, targetUserId: targetUserId || undefined, deviceInfo: navigator.userAgent } },
      );
      const who = targetUserId && targetUserId !== status?.userId ? " that staff member" : "";
      setMessage(`Clocked ${kind}${who} successfully (${res.distanceMeters} m from school).`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const time = (v: string | null) => (v ? new Date(v).toLocaleTimeString() : "—");

  return (
    <div>
      <PageHeader title="Staff Clock In / Out" subtitle="Geofenced staff attendance with a live photo check — clock in when you arrive, clock out when you leave." />

      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      {loading ? (
        <Spinner size={28} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
          <Card title="Clock in / out">
            <div style={{ display: "grid", gap: 14 }}>
              <Field label="Clock for">
                <Select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                  <option value="">Myself</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName} ({t.role.toLowerCase()})
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Live camera check</div>
                <div style={{ position: "relative", width: "100%", maxWidth: 280, aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: "#111", border: "1px solid var(--duga-border)" }}>
                  <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                  {!cameraReady && !cameraError && (
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 12.5 }}>Starting camera…</div>
                  )}
                </div>
                <canvas ref={canvasRef} style={{ display: "none" }} />
                {cameraError && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12.5, color: "var(--duga-danger)" }}>{cameraError}</div>
                    <Button variant="outline" size="sm" style={{ marginTop: 6 }} onClick={startCamera}>Retry camera</Button>
                  </div>
                )}
                {cameraReady && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--duga-muted)" }}>
                    A fresh photo is captured automatically the moment you clock in or out — this is never an uploaded file.
                  </div>
                )}
              </div>

              <div>
                <Button variant="outline" onClick={locate} loading={locating}>
                  <Icon name="attendance" size={16} /> Get my location
                </Button>
                {loc.lat !== null && loc.lng !== null && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--duga-muted)" }}>
                    Current: {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                  </div>
                )}
                {loc.error && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--duga-danger)" }}>{loc.error}</div>}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="accent" onClick={() => clock("in")} loading={busy} disabled={!cameraReady || loc.lat === null}>
                  <Icon name="check" size={16} /> Clock in
                </Button>
                <Button variant="danger" onClick={() => clock("out")} loading={busy} disabled={!cameraReady || loc.lat === null}>
                  <Icon name="logout" size={16} /> Clock out
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Today's status">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5 }}>Geofence radius</span>
                <Badge tone="info">{status?.radius ?? 150} m</Badge>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5 }}>School location</span>
                <Badge tone="neutral">
                  {status?.schoolLat.toFixed(4)}, {status?.schoolLng.toFixed(4)}
                </Badge>
              </div>
              <hr style={{ border: "none", borderTop: "1px solid var(--duga-border)", margin: "4px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5 }}>Clock in</span>
                <span style={{ fontWeight: 600 }}>{time(status?.today?.checkInAt ?? null)}</span>
              </div>
              {status?.today?.checkInDistanceM != null && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Distance at check-in</span>
                  <Badge tone={status.today.checkInWithinRadius ? "success" : "danger"}>{status.today.checkInDistanceM} m</Badge>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5 }}>Clock out</span>
                <span style={{ fontWeight: 600 }}>{time(status?.today?.checkOutAt ?? null)}</span>
              </div>
              {status?.today?.checkOutDistanceM != null && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Distance at check-out</span>
                  <Badge tone={status.today.checkOutWithinRadius ? "success" : "danger"}>{status.today.checkOutDistanceM} m</Badge>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
