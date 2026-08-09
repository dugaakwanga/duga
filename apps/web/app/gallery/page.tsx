import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import GalleryGrid from "@/components/GalleryGrid";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Photos of campus life, events and students at De Ultimate Glory Academy, Akwanga.",
};

export default function GalleryPage() {
  return (
    <>
      <PageHero
        kicker="Gallery"
        title="School life, in pictures"
        subtitle="A look at campus life, events, students and facilities at De Ultimate Glory Academy."
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <GalleryGrid />
        </div>
      </section>
    </>
  );
}
