"use client";

import { Counter } from "@/components/motion";
import { useSiteContent } from "@/lib/use-site";
import type { SiteStat } from "@/lib/site-data";

const FALLBACK = {
  eyebrow: "Admissions Open · 2025/2026 Session",
  lead: "Imparting the Winning Wisdom. A co-educational Primary and Secondary school in Akwanga, Nasarawa State — where academic rigour, modern technology and strong moral values come together to shape the next generation of Nigerian leaders.",
  stats: [
    { value: 20, suffix: "+", label: "Years" },
    { value: 1200, suffix: "+", label: "Students" },
    { value: 98, suffix: "%", label: "BECE Pass" },
  ],
};

export default function HeroIntro({
  eyebrow,
  lead,
  stats,
}: {
  eyebrow?: string;
  lead?: string;
  stats?: SiteStat[];
}) {
  const { content } = useSiteContent();
  const hero = content?.hero;
  const showEyebrow = eyebrow || hero?.eyebrow || FALLBACK.eyebrow;
  const showLead = lead || hero?.lead || FALLBACK.lead;
  const showStats =
    (stats && stats.length > 0 ? stats : null) ||
    (content?.stats && content.stats.length > 0 ? content.stats.slice(0, 3) : null) ||
    FALLBACK.stats;

  return (
    <>
      <span className="mkt-eyebrow mkt-fade-in">{showEyebrow}</span>
      <p className="lead mkt-fade-in mkt-fade-in--2">{showLead}</p>
      <div className="mkt-hero-stats mkt-fade-in mkt-fade-in--4">
        {showStats.map((s) => (
          <div key={s.label}>
            <strong>
              <Counter to={s.value} suffix={s.suffix} />
            </strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
