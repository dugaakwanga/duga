"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion";
import { ArrowRight } from "@/components/icons";
import { useSiteContent } from "@/lib/use-site";

export default function HomeNewsPreview() {
  const { news, loading } = useSiteContent();
  const latest = news.slice(0, 3);

  return (
    <>
      <div className="mkt-section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, maxWidth: "none" }}>
        <Reveal>
          <span className="mkt-kicker">06 — Latest News</span>
          <h2 className="mkt-h2" style={{ fontSize: "clamp(26px, 3vw, 38px)" }}>What&apos;s happening at DUGA</h2>
        </Reveal>
        <Reveal delay={80}>
          <Link href="/news" className="duga-btn duga-btn--ghost duga-btn--arrow">
            All news <ArrowRight size={15} className="mkt-arrow" />
          </Link>
        </Reveal>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--duga-muted)", padding: "30px 0" }}>Loading news…</p>
      ) : latest.length === 0 ? (
        <Reveal>
          <div style={{ textAlign: "center", padding: "48px 20px", border: "1px dashed var(--duga-border-strong)", borderRadius: 22, background: "#fff" }}>
            <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 22, fontWeight: 640, color: "var(--duga-primary-ink)", marginBottom: 8 }}>
              No news yet
            </h3>
            <p style={{ color: "var(--duga-muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>
              Announcements, achievements and updates from the DUGA family will appear here soon.
            </p>
          </div>
        </Reveal>
      ) : (
        <div className="mkt-grid mkt-grid--3">
          {latest.map((n, i) => (
            <Reveal key={n.slug} delay={i * 100}>
              <Link href={`/news/${n.slug}`} className="mkt-card" style={{ display: "block" }}>
                <div className="mkt-news-meta" style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--duga-muted)", marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, color: "var(--duga-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{n.category}</span>
                  <span>{n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
                </div>
                <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 20, fontWeight: 640, color: "var(--duga-primary-ink)", lineHeight: 1.25 }}>{n.title}</h3>
                <p style={{ marginTop: 8 }}>{n.excerpt}</p>
                <span className="mkt-link-arrow">
                  Read story <ArrowRight size={15} className="mkt-arrow" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
