import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import NewsDetail from "@/components/NewsDetail";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${portalUrl}/api/public/site`, { cache: "no-store" });
    const json = await res.json();
    const news: Array<{ slug: string; title: string; excerpt: string; category: string }> =
      Array.isArray(json.data?.news) ? json.data.news : [];
    const item = news.find((n) => n.slug === slug);
    if (item) {
      return {
        title: item.title,
        description: item.excerpt,
        openGraph: { title: item.title, description: item.excerpt, type: "article" },
      };
    }
  } catch {
    /* portal offline — fall back to generic title */
  }
  return { title: "News story" };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <PageHero kicker="News" title="Story" subtitle="From the newsroom of De Ultimate Glory Academy." />
      <section className="mkt-section">
        <NewsDetail slug={slug} />
      </section>
    </>
  );
}