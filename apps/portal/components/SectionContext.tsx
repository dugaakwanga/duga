"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setActiveSection } from "@/lib/client/api";
import { beginLoading, endLoading } from "@/lib/client/loading";
import type { Section } from "@/lib/sections";

interface SectionScope {
  section: Section | null;
  available: Section[];
  canSwitch: boolean;
  setSection: (s: Section | null) => void;
}

const SectionCtx = createContext<SectionScope>({
  section: null,
  available: [],
  canSwitch: false,
  setSection: () => {},
});

export function useSection(): SectionScope {
  return useContext(SectionCtx);
}

// Wraps the whole portal. Admins/bursars get a Primary|Secondary switcher;
// teachers are auto-scoped to the sections of the classes assigned to them.
export function SectionProvider({
  available,
  canSwitch,
  children,
}: {
  available: Section[];
  canSwitch: boolean;
  children: React.ReactNode;
}) {
  // Owners/admins/bursars can switch between sections; they start on "All
  // sections" so nothing is hidden behind a default section. Teachers are
  // auto-scoped to the first of their assigned sections.
  const [section, setSection] = useState<Section | null>(() => (canSwitch ? null : available[0] ?? null));

  // Switching section changes every scoped query in the portal, so show the
  // global loading overlay. The timed end is a minimum: in-flight API calls
  // keep the overlay up until the new section's data has actually loaded.
  function changeSection(next: Section | null) {
    setActiveSection(next);
    setSection(next);
    beginLoading();
    window.setTimeout(endLoading, 700);
  }

  // Keep the api() layer in sync even before effects run.
  setActiveSection(section);

  const key = available.join(",");
  useEffect(() => {
    setSection((prev) => (prev && available.includes(prev) ? prev : available[0] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    setActiveSection(section);
  }, [section]);

  const value = useMemo<SectionScope>(
    () => ({ section, available, canSwitch, setSection: changeSection }),
    [section, available, canSwitch],
  );

  return <SectionCtx.Provider value={value}>{children}</SectionCtx.Provider>;
}