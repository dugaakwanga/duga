import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import ApplicationForm from "@/components/ApplicationForm";
import { Reveal } from "@/components/motion";
import Photo from "@/components/Photo";
import { admissionRequirements } from "@/lib/content";
import { getPageContent } from "@/lib/site-data";
import { assertSitePage } from "@/lib/site-gate";
import type { PageCard } from "@duga/core";

export const metadata: Metadata = {
  title: "Apply for Admission",
  description:
    "Apply online for admission to De Ultimate Glory Academy, Akwanga, Nasarawa State.",
};

function strList(value: string | string[] | PageCard[] | undefined, fallback: string[]): string[] {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === "string" ? (value as string[]) : fallback;
}

export default async function ApplyPage() {
  await assertSitePage("apply");
  const { page } = await getPageContent("apply");
  const heroTitle = String(page.heroTitle ?? "");
  const heroSubtitle = String(page.heroSubtitle ?? "");
  const formHeading = String(page.formHeading ?? "");
  const prepKicker = String(page.prepKicker ?? "");
  const prepHeading = String(page.prepHeading ?? "");
  const requirements = strList(page.requirements, admissionRequirements);
  const note = String(page.note ?? "");
  const image1 = String(page.image1 ?? "") || "/images/primarypupil.png";
  const image2 = String(page.image2 ?? "") || "/images/single sec girl.png";

  return (
    <>
      <PageHero
        kicker="Apply"
        title={heroTitle}
        subtitle={heroSubtitle}
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--editorial-flip">
            <Reveal variant="right" delay={80}>
              <div>
                <div className="mkt-form-card">
                  <h3 style={{ marginBottom: 18 }}>{formHeading}</h3>
                  <ApplicationForm />
                </div>
              </div>
            </Reveal>
            <Reveal variant="left">
              <div>
                <span className="mkt-kicker">{prepKicker}</span>
                <h2 className="mkt-h2" style={{ fontSize: 30, marginBottom: 22 }}>
                  {prepHeading}
                </h2>
                <div className="mkt-form-card" style={{ boxShadow: "var(--duga-shadow)" }}>
                  <ul className="mkt-check-list">
                    {requirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                {note && (
                  <div className="duga-alert duga-alert--info" style={{ marginTop: 18 }}>
                    <span>{note}</span>
                  </div>
                )}
                <div className="mkt-grid mkt-grid--2" style={{ marginTop: 24, gap: 16 }}>
                  <Photo src={image1} alt="A primary pupil" ratio="wide" caption="Primary" />
                  <Photo src={image2} alt="A secondary student" ratio="wide" caption="Secondary" />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
