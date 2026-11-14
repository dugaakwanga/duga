"use client";

import { useEffect, useState } from "react";
import { subscribeLoading, isAnyLoading } from "@/lib/client/loading";

export function LoadingVideo({ slow = false }: { slow?: boolean }) {
  return (
    <div className="duga-global-loader" role="status" aria-live="polite">
      <div className="duga-global-loader__box">
        <video src="/videos/animate_school_crest_logo.mp4" autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
        <span className="duga-global-loader__label">{slow ? "Still working…" : "Loading…"}</span>
      </div>
    </div>
  );
}

export function LoadingOverlay() {
  const [active, setActive] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const update = () => setActive(isAnyLoading());
    update();
    return subscribeLoading(update);
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setSlow(true), 3000);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [active]);

  return active ? <LoadingVideo slow={slow} /> : null;
}
