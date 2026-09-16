"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { subscribeLoading, isAnyLoading, beginLoading, endLoading } from "@/lib/client/loading";

// Full-screen animated loading overlay driven by the global loading counter.
// Mounted once in the root layout so it covers every page — including login —
// and blocks all interaction (pointer events) until loading finishes.
export function LoadingOverlay() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = () => setActive(isAnyLoading());
    update();
    return subscribeLoading(update);
  }, []);

  if (!active) return null;

  return (
    <div className="duga-global-loader" role="status" aria-live="polite" aria-label="Loading">
      <div className="duga-global-loader__box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <video src="/videos/animate_school_crest_logo.mp4" autoPlay muted loop playsInline aria-hidden="true" />
      </div>
    </div>
  );
}

// Briefly shows the overlay right after a client-side route change starts, as
// a flash guard for the gap before the new page's own content (or its own
// loading state) paints. Any in-flight API call the new page kicks off keeps
// the overlay up on its own via the shared counter — this timeout used to be
// a fixed 700ms *minimum* on every single navigation, which is what made
// every click across the app feel slow even when the destination page had
// nothing left to load. 150ms is enough to prevent a flash of empty content
// without being felt as a deliberate delay.
export function RouteLoader() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    beginLoading();
    const t = window.setTimeout(endLoading, 150);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}