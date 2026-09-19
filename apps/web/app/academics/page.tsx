import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import Photo from "@/components/Photo";
import { Reveal } from "@/components/motion";
import { getPageContent } from "@/lib/site-data";
import { assertSitePage } from "@/lib/site-gate";
import { ArrowRight, Beaker } from "@/components/icons";
import type { PageCard } from "@duga/core";

export const metadata: Metadata = {
  title: "Academics",
  description:
    "Overview of the Primary and Secondary academic programmes at De Ultimate Glory Academy, Akwanga.",
};

function cards(value: unknown): PageCard[] {
  return Array.isArray(value) ? (value as PageCard[]) : [];
}

const SUBJECTS_PRIMARY = [
  "English Studies", "Mathematics", "Basic Science & Technology", "Computer Studies",
  "Social Studies", "Civic Education", "Christian Religious Studies", "Quantitative & Verbal Reasoning",
  "Creative Arts", "Physical & Health Education", "Hausa / Arabic (optional)",
];

const SUBJECTS_JSS = [
  "English Language", "Mathematics", "Basic Science", "Basic Technology", "Computer Studies",
  "Social Studies", "Civic Education", "CRS", "Business Studies", "Fine Arts", "Physical & Health Education",
];

const SUBJECTS_SSS = [
  "English Language", "Mathematics", "Biology", "Physics", "Chemistry", "Further Mathematics",
  "Economics", "Commerce", "Literature-in-English", "Government", "CRS", "Geography", "Computer Studies",
];

function strList(value: string | string[] | PageCard[] | undefined, fallback: string[]): string[] {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === "string" ? (value as string[]) : fallback;
}

function ProgramCards({ programs, delayBase }: { programs: PageCard[]; delayBase: number }) {
  return (
    <div className="mkt-grid mkt-grid--3">
      {programs.map((p, i) => (
        <Reveal key={p.id} delay={delayBase + i * 90}>
          <div className="mkt-card">
            <span className="mkt-kicker" style={{ marginBottom: 10, display: "inline-flex" }}>
              {p.subtitle}
            </span>
            <h3 style={{ fontSize: 19 }}>{p.title}</h3>
            <ul className="mkt-check-list" style={{ marginTop: 14 }}>
              {(p.list ?? []).map((pt) => (
                <li key={pt}>{pt}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

export default async function AcademicsPage() {
  await assertSitePage("academics");
  const { page } = await getPageContent("academics");
  const heroTitle = String(page.heroTitle ?? "");
  const heroSubtitle = String(page.heroSubtitle ?? "");
  const primaryKicker = String(page.primaryKicker ?? "");
  const primaryHeading = String(page.primaryHeading ?? "");
  const primaryText = String(page.primaryText ?? "");
  const secondaryKicker = String(page.secondaryKicker ?? "");
  const secondaryHeading = String(page.secondaryHeading ?? "");
  const secondaryText = String(page.secondaryText ?? "");
  const subjectsKicker = String(page.subjectsKicker ?? "");
  const subjectsHeading = String(page.subjectsHeading ?? "");
  const subjectsPrimary = strList(page.subjectsPrimary, SUBJECTS_PRIMARY);
  const subjectsJss = strList(page.subjectsJss, SUBJECTS_JSS);
  const subjectsSss = strList(page.subjectsSss, SUBJECTS_SSS);
  const extraKicker = String(page.extraKicker ?? "");
  const extraHeading = String(page.extraHeading ?? "");
  const extraText = String(page.extraText ?? "");
  const ctaKicker = String(page.ctaKicker ?? "");
  const ctaHeading = String(page.ctaHeading ?? "");
  const ctaLabel = String(page.ctaLabel ?? "");
  const primaryPrograms = cards(page.primaryProgramCards);
  const secondaryPrograms = cards(page.secondaryProgramCards);
  const extraCards = cards(page.extraCards);
  const primaryImage1 = String(page.primaryImage1 ?? "") || "/images/pupil hands up.png";
  const primaryImage2 = String(page.primaryImage2 ?? "") || "/images/single pupil.png";
  const secondaryImage1 = String(page.secondaryImage1 ?? "") || "/images/sec reading.png";
  const secondaryImage2 = String(page.secondaryImage2 ?? "") || "/images/single sec girl.png";
  const extraImage1 = String(page.extraImage1 ?? "") || "/images/single sec boy.png";
  const extraImage2 = String(page.extraImage2 ?? "") || "/images/sec reading.png";

  return (
    <>
      <PageHero
        kicker="Academics"
        title={heroTitle}
        subtitle={heroSubtitle}
      />

      {/* Primary */}
      <section className="mkt-section" id="primary">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <Reveal>
              <span className="mkt-kicker">{primaryKicker}</span>
              <h2 className="mkt-h2">{primaryHeading}</h2>
              <p>{primaryText}</p>
            </Reveal>
          </div>
          <ProgramCards programs={primaryPrograms} delayBase={0} />
          <Reveal delay={80}>
            <div className="mkt-grid mkt-grid--editorial" style={{ marginTop: 40 }}>
              <Photo src={primaryImage1} alt="Primary pupils raising their hands" ratio="wide" caption="Engaged, eager learners" fit />
              <Photo src={primaryImage2} alt="A primary pupil concentrating" ratio="wide" caption="Focused learning" fit />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Secondary */}
      <section className="mkt-section mkt-section--soft" id="secondary">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <Reveal>
              <span className="mkt-kicker">{secondaryKicker}</span>
              <h2 className="mkt-h2">{secondaryHeading}</h2>
              <p>{secondaryText}</p>
            </Reveal>
          </div>
          <ProgramCards programs={secondaryPrograms} delayBase={0} />
          <Reveal delay={80}>
            <div className="mkt-grid mkt-grid--editorial" style={{ marginTop: 40 }}>
              <Photo src={secondaryImage1} alt="A secondary student reading" ratio="wide" caption="Independent study" fit />
              <Photo src={secondaryImage2} alt="A secondary school girl" ratio="wide" caption="Ambition, daily" fit />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Subjects offered */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <Reveal>
              <span className="mkt-kicker">{subjectsKicker}</span>
              <h2 className="mkt-h2">{subjectsHeading}</h2>
            </Reveal>
          </div>
          <div className="mkt-grid mkt-grid--3">
            {[
              { title: "Primary (1 – 6)", items: subjectsPrimary },
              { title: "Junior Secondary (JSS)", items: subjectsJss },
              { title: "Senior Secondary (SSS)", items: subjectsSss },
            ].map((s, i) => (
              <Reveal key={s.title} delay={i * 100}>
                <div className="mkt-card">
                  <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 21, fontWeight: 640 }}>{s.title}</h3>
                  <ul className="mkt-check-list" style={{ marginTop: 16 }}>
                    {s.items.map((sub) => (
                      <li key={sub}>{sub}</li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Beyond the classroom */}
      <section className="mkt-section mkt-section--soft">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <Reveal>
              <span className="mkt-kicker">{extraKicker}</span>
              <h2 className="mkt-h2">{extraHeading}</h2>
              <p>{extraText}</p>
            </Reveal>
          </div>
          <div className="mkt-grid mkt-grid--3">
            {extraCards.map((e, i) => (
              <Reveal key={e.id} delay={(i % 3) * 90}>
                <div className="mkt-card">
                  <div className="mkt-icon"><Beaker size={23} /></div>
                  <h3>{e.title}</h3>
                  <p>{e.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={100}>
            <div className="mkt-grid mkt-grid--editorial" style={{ marginTop: 44 }}>
              <Photo src={extraImage1} alt="A secondary school boy in uniform" ratio="wide" caption="Pride in uniform" fit />
              <Photo src={extraImage2} alt="A secondary student reading" ratio="wide" caption="The joy of learning" fit />
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="mkt-section mkt-section--dark">
        <div className="mkt-container" style={{ textAlign: "center" }}>
          <Reveal>
            <span className="mkt-kicker mkt-kicker--light" style={{ justifyContent: "center" }}>{ctaKicker}</span>
            <h2 className="mkt-h2" style={{ marginTop: 14 }}>
              {ctaHeading}
            </h2>
            <div style={{ marginTop: 28 }}>
              <Link href="/apply" className="duga-btn mkt-btn--light duga-btn--lg duga-btn--arrow">
                {ctaLabel} <ArrowRight size={17} className="mkt-arrow" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
