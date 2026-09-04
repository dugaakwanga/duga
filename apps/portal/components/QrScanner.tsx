"use client";

// In-app camera QR scanner — grabs frames from the device camera, decodes
// them client-side with jsQR, and reports each newly-seen code to the
// caller. Nothing leaves the app; there is no external scanner integration.
// A short cooldown per code prevents one steady frame from firing the same
// scan repeatedly while the badge is still in view.

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export function QrScanner({ active, onDecode, cooldownMs = 2500 }: { active: boolean; onDecode: (text: string) => void; cooldownMs?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const cooldownRef = useRef(cooldownMs);
  cooldownRef.current = cooldownMs;
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf: number;
    const lastSeen = { text: "", at: 0 };

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(frame.data, frame.width, frame.height);
          if (code?.data) {
            const now = Date.now();
            if (code.data !== lastSeen.text || now - lastSeen.at > cooldownRef.current) {
              lastSeen.text = code.data;
              lastSeen.at = now;
              onDecodeRef.current(code.data);
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    setCameraError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          video.play().catch(() => undefined);
        }
        raf = requestAnimationFrame(tick);
      })
      .catch((e) => setCameraError((e as Error).message || "Could not access the camera"));

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  if (!active) return null;

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 420, margin: "0 auto", borderRadius: 12, overflow: "hidden", background: "#111827", aspectRatio: "4 / 3" }}>
      <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div style={{ position: "absolute", inset: 24, border: "3px solid rgba(255,255,255,0.55)", borderRadius: 12, pointerEvents: "none" }} />
      {cameraError && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(17,24,39,0.92)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontSize: 13, textAlign: "center" }}>
          Camera error: {cameraError}. You can still use the admission number field below.
        </div>
      )}
    </div>
  );
}
