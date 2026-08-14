"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setActiveSection } from "@/lib/client/api";
import type { Section } from "@/lib/sections";

interface SectionScope {
  section: Section | null;
  available: Section[];
  canSwitch: boolean;
  setSection: (s: Section) => void;
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
  const [section, setSection] = useState<Section | null>(() => available[0] ?? null);

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
    () => ({ section, available, canSwitch, setSection }),
    [section, available, canSwitch],
  );

  return <SectionCtx.Provider value={value}>{children}</SectionCtx.Provider>;
}