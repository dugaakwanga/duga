"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Reveal — scroll-triggered entrance                                   */
/* ------------------------------------------------------------------ */
type RevealVariant = "up" | "left" | "right" | "zoom" | "blur";

const VARIANT_CLASS: Record<RevealVariant, string> = {
  up: "",
  left: " reveal--left",
  right: " reveal--right",
  zoom: " reveal--zoom",
  blur: " reveal--blur",
};

export function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
  style,
  as: Tag = "div",
}: {
  children: ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  as?: keyof HTMLElementTagNameMap;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const El = Tag as ElementType;
  return (
    <El
      ref={ref}
      className={`reveal${VARIANT_CLASS[variant]}${inView ? " is-in" : ""} ${className}`}
      style={{ ...style, transitionDelay: `${delay}ms` }}
    >
      {children}
    </El>
  );
}

/* ------------------------------------------------------------------ */
/* Counter — count up when in view                                     */
/* ------------------------------------------------------------------ */
export function Counter({
  to,
  suffix = "",
  prefix = "",
  duration = 1600,
  className = "",
  style,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            const t0 = performance.now();
            const tick = (now: number) => {
              const p = Math.min((now - t0) / duration, 1);
              const eased = 1 - Math.pow(1 - p, 4);
              setValue(Math.round(to * eased));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref} className={className} style={style}>
      {prefix}
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tilt — gentle 3D mouse tilt                                         */
/* ------------------------------------------------------------------ */
export function Tilt({
  children,
  max = 6,
  className = "",
}: {
  children: ReactNode;
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
  }
  function onLeave() {
    const el = ref.current;
    if (el) el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  }

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={className} style={{ transition: "transform 0.25s ease", transformStyle: "preserve-3d" }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HeroHeadline — word-by-word masked reveal (lines of words)          */
/* ------------------------------------------------------------------ */
export function HeroHeadline({ lines, accent }: { lines: string[]; accent?: string }) {
  return (
    <>
      {lines.map((line, li) => {
        const words = line.split(" ").filter(Boolean);
        return (
          <span key={li} className="hero-line">
            {words.map((word, wi) => {
              const clean = word.replace(/[.,]/g, "").toLowerCase();
              const isAccent = accent ? clean === accent.toLowerCase() || clean.startsWith(accent.toLowerCase()) : false;
              return (
                <span key={wi}>
                  <span className={`hero-word${isAccent ? " is-accent" : ""}`}>{word}</span>
                  {wi < words.length - 1 ? "\u00A0" : ""}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Parallax — translateY based on scroll position (subtle depth)       */
/* ------------------------------------------------------------------ */
export function Parallax({
  children,
  speed = 0.12,
  className = "",
  style,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh) return;
        const center = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = `translate3d(0, ${(-center * speed * 100).toFixed(2)}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [speed]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform", ...style }}>
      {children}
    </div>
  );
}
