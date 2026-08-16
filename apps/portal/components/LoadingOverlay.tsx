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

// Shows the overlay while a client-side route change is in flight. The timeout
// guarantees a visible minimum; any in-flight API call keeps the overlay up
// until it actually finishes.
export function RouteLoader() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    beginLoading();
    const t = window.setTimeout(endLoading, 700);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}