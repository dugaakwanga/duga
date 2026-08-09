"use client";

import Link from "next/link";
import Photo from "@/components/Photo";
import { Reveal } from "@/components/motion";
import { ArrowRight } from "@/components/icons";
import { useSiteContent } from "@/lib/use-site";

export default function HomeGalleryPreview() {
  const { gallery, loading } = useSiteContent();
  const items = gallery.slice(0, 4);

  return (
    <>
      <div className="mkt-section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, maxWidth: "none" }}>
        <Reveal>
          <span className="mkt-kicker">05 — Inside Our School</span>
          <h2 className="mkt-h2" style={{ fontSize: "clamp(26px, 3vw, 38px)" }}>A glimpse of campus life</h2>
        </Reveal>
        <Reveal delay={80}>
          <Link href="/gallery" className="duga-btn duga-btn--ghost duga-btn--arrow">
            View all <ArrowRight size={15} className="mkt-arrow" />
          </Link>
        </Reveal>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--duga-muted)", padding: "30px 0" }}>Loading photos…</p>
      ) : items.length === 0 ? (
        <Reveal>
          <div style={{ textAlign: "center", padding: "48px 20px", border: "1px dashed var(--duga-border-strong)", borderRadius: 22, background: "#fff" }}>
            <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 22, fontWeight: 640, color: "var(--duga-primary-ink)", marginBottom: 8 }}>
              Photos coming soon
            </h3>
            <p style={{ color: "var(--duga-muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>
              We are capturing moments from campus life — classes, events and everyday joy at DUGA.
              They will appear here shortly.
            </p>
          </div>
        </Reveal>
      ) : (
        <div className="mkt-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: "200px", gap: 18 }}>
          {items.map((g, i) => (
            <Reveal key={g.id} delay={i * 70} style={{ gridColumn: i === 0 ? "span 2" : undefined, gridRow: i === 1 ? "span 2" : undefined }} variant="zoom">
              <Photo src={g.url} alt={g.alt ?? g.title} ratio="wide" caption={g.title} className="mkt-photo--hover-caption" />
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
