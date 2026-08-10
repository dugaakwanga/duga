import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import Photo from "@/components/Photo";
import { Reveal } from "@/components/motion";
import { admissionSteps, admissionRequirements } from "@/lib/content";
import { getPageContent } from "@/lib/site-data";
import { ArrowRight, Spark, Leaf, Cap } from "@/components/icons";

export const metadata: Metadata = {
  title: "Admissions",
  description:
    "How to apply to De Ultimate Glory Academy — online application, requirements, assessment and resumption.",
};

function strList(value: string | string[] | undefined, fallback: string[]): string[] {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

export default async function AdmissionsPage() {
  const { page } = await getPageContent("admissions");
  const heroTitle = String(page.heroTitle ?? "");
  const heroSubtitle = String(page.heroSubtitle ?? "");
  const stepsKicker = String(page.stepsKicker ?? "");
  const stepsHeading = String(page.stepsHeading ?? "");
  const reqsKicker = String(page.reqsKicker ?? "");
  const reqsHeading = String(page.reqsHeading ?? "");
  const requirements = strList(page.requirements, admissionRequirements);
  const ctaTitle = String(page.ctaTitle ?? "");
  const ctaText = String(page.ctaText ?? "");
  const ctaLabel = String(page.ctaLabel ?? "");
  const feesKicker = String(page.feesKicker ?? "");
  const feesHeading = String(page.feesHeading ?? "");
  const feesText = String(page.feesText ?? "");
  const plan1Title = String(page.plan1Title ?? "");
  const plan1Text = String(page.plan1Text ?? "");
  const plan2Title = String(page.plan2Title ?? "");
  const plan2Text = String(page.plan2Text ?? "");
  const plan3Title = String(page.plan3Title ?? "");
  const plan3Text = String(page.plan3Text ?? "");

  return (
    <>
      <PageHero
        kicker="Admissions"
        title={heroTitle}
        subtitle={heroSubtitle}
      />

      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--editorial">
            <Reveal variant="left">
              <div>
                <span className="mkt-kicker">{stepsKicker}</span>
                <h2 className="mkt-h2" style={{ marginBottom: 34 }}>{stepsHeading}</h2>
                <div className="mkt-timeline">
                  {admissionSteps.map((s) => (
                    <div key={s.step} className="mkt-timeline-item">
                      <h4>
                        {String(s.step).padStart(2, "0")}. {s.title}
                      </h4>
                      <p>{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <div>
                <span className="mkt-kicker">{reqsKicker}</span>
                <h2 className="mkt-h2" style={{ marginBottom: 30 }}>
                  {reqsHeading}
                </h2>
                <div className="mkt-form-card">
                  <ul className="mkt-check-list">
                    {requirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div className="mkt-card" style={{ marginTop: 24, background: "var(--duga-primary)", border: "none", color: "#fff" }}>
                  <h3 style={{ color: "#fff", display: "flex", gap: 10, alignItems: "center" }}>
                    <Spark size={18} /> {ctaTitle}
                  </h3>
                  <p style={{ color: "rgba(255,255,255,0.8)", margin: "8px 0 18px" }}>
                    {ctaText}
                  </p>
                  <Link href="/apply" className="duga-btn mkt-btn--light duga-btn--arrow" style={{ display: "inline-flex" }}>
                    {ctaLabel} <ArrowRight size={16} className="mkt-arrow" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Fees */}
      <section className="mkt-section mkt-section--soft">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <Reveal>
              <span className="mkt-kicker">{feesKicker}</span>
              <h2 className="mkt-h2">{feesHeading}</h2>
              <p>{feesText}</p>
            </Reveal>
          </div>
          <div className="mkt-grid mkt-grid--3">
            <Reveal>
              <div className="mkt-card">
                <div className="mkt-icon"><Leaf size={23} /></div>
                <h3>{plan1Title}</h3>
                <p>{plan1Text}</p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="mkt-card">
                <div className="mkt-icon"><Spark size={23} /></div>
                <h3>{plan2Title}</h3>
                <p>{plan2Text}</p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="mkt-card">
                <div className="mkt-icon"><Cap size={23} /></div>
                <h3>{plan3Title}</h3>
                <p>{plan3Text}</p>
              </div>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <div className="mkt-grid mkt-grid--editorial" style={{ marginTop: 44 }}>
              <Photo src="/images/group pupils.png" alt="Primary pupils smiling" ratio="wide" caption="Primary applicants welcome" />
              <Photo src="/images/group 1 sec.png" alt="Secondary students together" ratio="wide" caption="Secondary applicants welcome" />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
