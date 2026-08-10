import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import PtaList from "@/components/PtaList";
import { getPageContent } from "@/lib/site-data";
import { assertSitePage } from "@/lib/site-gate";

export const metadata: Metadata = {
  title: "Parent-Teacher Association",
  description:
    "Meet the PTA executive and follow the meetings of the De Ultimate Glory Academy Parent-Teacher Association.",
};

export default async function PtaPage() {
  await assertSitePage("pta");
  const { page } = await getPageContent("pta");
  const heroTitle = String(page.heroTitle ?? "");
  const heroSubtitle = String(page.heroSubtitle ?? "");
  const executivesKicker = String(page.executivesKicker ?? "Our Executive");
  const executivesHeading = String(page.executivesHeading ?? "Meet the PTA executive");
  const joinText = String(page.joinText ?? "");

  return (
    <>
      <PageHero
        kicker="PTA"
        title={heroTitle}
        subtitle={heroSubtitle}
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <div className="mkt-breadcrumb">{executivesKicker}</div>
            <h2>{executivesHeading}</h2>
          </div>
          <PtaList />
          {joinText && (
            <div
              style={{
                marginTop: 32,
                padding: "24px 28px",
                borderRadius: 18,
                background: "var(--duga-surface)",
                border: "1px solid var(--duga-border-strong)",
                color: "var(--duga-muted)",
                lineHeight: 1.7,
              }}
            >
              {joinText}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
