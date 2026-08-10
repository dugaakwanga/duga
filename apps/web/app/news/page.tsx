import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import NewsList from "@/components/NewsList";
import { getPageContent } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "News & Announcements",
  description:
    "Latest news, announcements, achievements and updates from De Ultimate Glory Academy.",
};

export default async function NewsPage() {
  const { page } = await getPageContent("news");
  const heroTitle = String(page.heroTitle ?? "");
  const heroSubtitle = String(page.heroSubtitle ?? "");

  return (
    <>
      <PageHero
        kicker="News & Announcements"
        title={heroTitle}
        subtitle={heroSubtitle}
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <NewsList />
        </div>
      </section>
    </>
  );
}
