import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import GalleryGrid from "@/components/GalleryGrid";
import { getPageContent } from "@/lib/site-data";
import { assertSitePage } from "@/lib/site-gate";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Photos of campus life, events and students at De Ultimate Glory Academy, Akwanga.",
};

export default async function GalleryPage() {
  await assertSitePage("gallery");
  const { page } = await getPageContent("gallery");
  const heroTitle = String(page.heroTitle ?? "");
  const heroSubtitle = String(page.heroSubtitle ?? "");

  return (
    <>
      <PageHero
        kicker="Gallery"
        title={heroTitle}
        subtitle={heroSubtitle}
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <GalleryGrid />
        </div>
      </section>
    </>
  );
}
