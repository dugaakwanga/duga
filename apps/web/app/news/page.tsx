import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import NewsList from "@/components/NewsList";

export const metadata: Metadata = {
  title: "News & Announcements",
  description:
    "Latest news, announcements, achievements and updates from De Ultimate Glory Academy.",
};

export default function NewsPage() {
  return (
    <>
      <PageHero
        kicker="News & Announcements"
        title="The latest from our campus"
        subtitle="Announcements, achievements and updates from De Ultimate Glory Academy."
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <NewsList />
        </div>
      </section>
    </>
  );
}
