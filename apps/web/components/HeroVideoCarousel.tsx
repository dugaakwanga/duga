"use client";

import { useEffect, useRef, useState } from "react";

type Slide = { kind: "video"; src: string; label: string } | { kind: "img"; src: string; label: string };

const SLIDES: Slide[] = [
  { kind: "video", src: "/videos/pupils group video.mp4", label: "Primary" },
  { kind: "img", src: "/images/pupil hands up.png", label: "Hands up" },
  { kind: "video", src: "/videos/sec video.mp4", label: "Secondary" },
  { kind: "img", src: "/images/sec reading.png", label: "Reading" },
  { kind: "img", src: "/images/group pupils.png", label: "Campus life" },
];

// Auto-playing background carousel for the hero section. Cycles through the two
// campus videos and a few photos, cross-fading each slide. Videos play muted.
export default function HeroVideoCarousel() {
  const [active, setActive] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const slideDuration = 12000; // ms per slide

  // Videos only play while active; photos need no handling.
  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (SLIDES[i]?.kind === "video" && i === active) {
        v.playbackRate = 0.9;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active]);

  useEffect(() => {
    const tick = (now: number) => {
      if (!startedAt.current) startedAt.current = now;
      if (now - startedAt.current >= slideDuration) {
        startedAt.current = now;
        setActive((a) => (a + 1) % SLIDES.length);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="mkt-hero-video" aria-hidden="true">
      <div className="mkt-hero-video-stage">
        {SLIDES.map((s, i) =>
          s.kind === "video" ? (
            <video
              key={s.src}
              ref={(el) => {
                videos.current[i] = el;
              }}
              src={s.src}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className={i === active ? "active" : ""}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s.src} src={s.src} alt="" className={i === active ? "active" : ""} />
          ),
        )}
      </div>
      <div className="mkt-hero-video-overlay" />
      <div className="mkt-hero-video-indicators">
        {SLIDES.map((s, i) => (
          <span key={s.label} className={i === active ? "active" : ""} title={s.label} />
        ))}
      </div>
    </div>
  );
}
