"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion";
import { ArrowLeft, ArrowRight } from "@/components/icons";
import { useSiteContent } from "@/lib/use-site";

export default function NewsDetail({ slug }: { slug: string }) {
  const { news, loading } = useSiteContent();

  if (loading) {
    return <p style={{ textAlign: "center", color: "var(--duga-muted)", padding: "40px 0" }}>Loading story…</p>;
  }

  const post = news.find((n) => n.slug === slug);
  if (!post) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, color: "var(--duga-primary-ink)", marginBottom: 10 }}>
          Story not found
        </h3>
        <p style={{ color: "var(--duga-muted)" }}>This news item may have been unpublished or removed.</p>
        <div style={{ marginTop: 22 }}>
          <Link href="/news" className="duga-btn duga-btn--outline duga-btn--arrow" style={{ display: "inline-flex" }}>
            <ArrowLeft size={16} className="mkt-arrow" style={{ transform: "rotate(180deg)" }} /> All News
          </Link>
        </div>
      </div>
    );
  }

  const related = news.filter((n) => n.slug !== slug).slice(0, 2);

  return (
    <>
      <div className="mkt-container mkt-container--narrow">
        <Reveal>
          {post.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverUrl}
              alt={post.title}
              style={{ width: "100%", aspectRatio: "16 / 8", objectFit: "cover", borderRadius: 20, boxShadow: "var(--duga-shadow-lg)", marginBottom: 26 }}
            />
          )}
          <p style={{ fontSize: 18, color: "var(--duga-ink-2)", lineHeight: 1.7, fontWeight: 500 }}>{post.excerpt}</p>
          {Array.isArray(post.body) &&
            post.body.map((para, i) => (
              <p key={i} style={{ marginTop: 18, color: "var(--duga-ink-2)", lineHeight: 1.85, fontSize: 15.5 }}>
                {para}
              </p>
            ))}
          <div style={{ marginTop: 34 }}>
            <Link href="/news" className="duga-btn duga-btn--outline duga-btn--arrow" style={{ display: "inline-flex" }}>
              <ArrowLeft size={16} className="mkt-arrow" style={{ transform: "rotate(180deg)" }} /> All News
            </Link>
          </div>
        </Reveal>
      </div>

      {related.length > 0 && (
        <div className="mkt-container" style={{ marginTop: 64 }}>
          <Reveal>
            <h2 className="mkt-h2" style={{ fontSize: 26, marginBottom: 24 }}>More <em>news</em></h2>
          </Reveal>
          <div className="mkt-grid mkt-grid--2">
            {related.map((n, i) => (
              <Reveal key={n.slug} delay={i * 90}>
                <Link href={`/news/${n.slug}`} className="mkt-card" style={{ display: "block" }}>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--duga-muted)", marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, color: "var(--duga-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{n.category}</span>
                    <span>{n.publishedAt ? new Date(n.publishedAt).toLocaleDateString("en-NG", { month: "long", year: "numeric" }) : ""}</span>
                  </div>
                  <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 20, fontWeight: 640, color: "var(--duga-primary-ink)" }}>{n.title}</h3>
                  <p style={{ marginTop: 8 }}>{n.excerpt}</p>
                  <span className="mkt-link-arrow">
                    Read story <ArrowRight size={15} className="mkt-arrow" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
