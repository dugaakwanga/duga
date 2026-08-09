"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion";
import { ArrowRight } from "@/components/icons";
import { useSiteContent } from "@/lib/use-site";

export default function NewsList() {
  const { news, loading } = useSiteContent();

  if (loading) {
    return <p style={{ textAlign: "center", color: "var(--duga-muted)", padding: "40px 0" }}>Loading news…</p>;
  }

  if (news.length === 0) {
    return (
      <Reveal>
        <div style={{ textAlign: "center", padding: "60px 20px", border: "1px dashed var(--duga-border-strong)", borderRadius: 22, background: "var(--duga-surface)" }}>
          <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640, color: "var(--duga-primary-ink)", marginBottom: 10 }}>
            No news yet
          </h3>
          <p style={{ color: "var(--duga-muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>
            Announcements, achievements and updates from De Ultimate Glory Academy will be posted here
            soon. Check back shortly.
          </p>
        </div>
      </Reveal>
    );
  }

  return (
    <div className="mkt-grid mkt-grid--3">
      {news.map((n, i) => (
        <Reveal key={n.slug} delay={(i % 3) * 90}>
          <Link href={`/news/${n.slug}`} className="mkt-card" style={{ display: "block", minHeight: 220 }}>
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--duga-muted)", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: "var(--duga-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{n.category}</span>
              <span>{n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : ""}</span>
            </div>
            <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 21, fontWeight: 640, color: "var(--duga-primary-ink)", lineHeight: 1.25 }}>{n.title}</h3>
            <p style={{ marginTop: 10 }}>{n.excerpt}</p>
            <span className="mkt-link-arrow">
              Read story <ArrowRight size={15} className="mkt-arrow" />
            </span>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}
