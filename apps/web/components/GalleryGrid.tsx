"use client";

import { useState } from "react";
import Photo from "@/components/Photo";
import { Reveal } from "@/components/motion";
import { useSiteContent, type SiteGalleryItem } from "@/lib/use-site";

const CATEGORIES = ["All", "Students", "Campus", "Facilities", "Events", "Hostel"];

// Local fallback photos so the gallery is never empty, even before any
// images are uploaded through the portal admin. These live in /public/images.
const FALLBACK_IMAGES: Array<{ src: string; title: string; category: string; alt: string }> = [
  { src: "/images/primarypupil.png", title: "Primary pupil", category: "Students", alt: "A primary pupil of De Ultimate Glory Academy" },
  { src: "/images/group pupils.png", title: "Primary pupils", category: "Students", alt: "Primary pupils of De Ultimate Glory Academy" },
  { src: "/images/group 1 sec.png", title: "Secondary students", category: "Students", alt: "Secondary students of De Ultimate Glory Academy" },
  { src: "/images/sec group 2.png", title: "Secondary class", category: "Students", alt: "Secondary students of De Ultimate Glory Academy" },
  { src: "/images/single pupil.png", title: "Pupil life", category: "Students", alt: "A happy primary pupil" },
  { src: "/images/single sec girl.png", title: "Student life", category: "Students", alt: "A secondary school student" },
  { src: "/images/single sec boy.png", title: "Character, always", category: "Students", alt: "A secondary school boy in uniform" },
];

export default function GalleryGrid() {
  const { gallery, loading } = useSiteContent();
  const [cat, setCat] = useState("All");

  const items: SiteGalleryItem[] =
    gallery.length > 0
      ? cat === "All"
        ? gallery
        : gallery.filter((g) => g.category === cat)
      : cat === "All"
        ? (FALLBACK_IMAGES.map((f, i) => ({ id: `local-${i}`, title: f.title, category: f.category, url: f.src, alt: f.alt, createdAt: "" })))
        : FALLBACK_IMAGES.filter((f) => f.category === cat).map((f, i) => ({ id: `local-${i}`, title: f.title, category: f.category, url: f.src, alt: f.alt, createdAt: "" }));

  return (
    <>
      <Reveal>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                background: cat === c ? "var(--duga-primary)" : "#fff",
                color: cat === c ? "#fff" : "var(--duga-ink-2)",
                border: "1px solid var(--duga-border)",
                borderRadius: 999,
                padding: "9px 18px",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s ease, color 0.2s ease, transform 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (cat !== c) e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </Reveal>

      {loading && gallery.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--duga-ink-2)", padding: "40px 0" }}>
          Loading photos…
        </p>
      ) : items.length === 0 ? (
        <Reveal>
          <div style={{ textAlign: "center", padding: "60px 20px", border: "1px dashed var(--duga-border-strong)", borderRadius: 22, background: "var(--duga-surface)" }}>
            <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640, color: "var(--duga-primary-ink)", marginBottom: 10 }}>
              Photos coming soon
            </h3>
            <p style={{ color: "var(--duga-ink-2)", maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>
              We are busy capturing school life at De Ultimate Glory Academy. Photos from campus,
              events and classrooms will appear here as soon as they are ready.
            </p>
          </div>
        </Reveal>
      ) : (
        <div className="mkt-grid mkt-gallery-grid">
          {items.map((g, i) => (
            <Reveal key={g.id} delay={(i % 3) * 80} style={{ gridRow: i % 3 === 1 ? "span 2" : undefined }} variant="zoom">
              <Photo src={g.url} alt={g.alt ?? g.title} ratio="wide" caption={g.title} className="mkt-photo--hover-caption" />
            </Reveal>
          ))}
        </div>
      )}

      <Reveal>
        <p style={{ color: "var(--duga-ink-2)", fontSize: 13, textAlign: "center", marginTop: 32 }}>
          New photos are added regularly. Follow us on social media for the latest.
        </p>
      </Reveal>
    </>
  );
}
