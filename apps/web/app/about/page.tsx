import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import Photo from "@/components/Photo";
import { Reveal } from "@/components/motion";
import { Book, Shield, Heart, Globe, ArrowRight, Target, Spark, Users, Cap } from "@/components/icons";
import { getPageContent } from "@/lib/site-data";
import { assertSitePage } from "@/lib/site-gate";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "The history, mission, vision, leadership and accreditation of De Ultimate Glory Academy, Akwanga, Nasarawa State.",
};

const VALUES = [
  { icon: Book, title: "Academic Excellence", text: "We set high standards and support every learner to meet them." },
  { icon: Shield, title: "Integrity", text: "We teach honesty, fairness and accountability in all things." },
  { icon: Heart, title: "Character", text: "Discipline, respect and godly values shape our daily life." },
  { icon: Globe, title: "Service", text: "We raise leaders who serve their communities and nation." },
];

const TIMELINE = [
  { year: "2006", title: "Foundation", text: "De Ultimate Glory Academy opens its gates with a small nursery/primary class." },
  { year: "2013", title: "Secondary Section Launched", text: "The JSS arm begins, expanding the school into full primary and secondary education." },
  { year: "2018", title: "Boarding & Laboratories", text: "Hostel facilities and an integrated science laboratory are commissioned." },
  { year: "2024", title: "Digital Transformation", text: "Launch of the school portal with online results, fees and communication." },
  { year: "Today", title: "1,200+ Students", text: "A growing family of students, staff and alumni whose results speak for themselves." },
];

export default async function AboutPage() {
  await assertSitePage("about");
  const { page } = await getPageContent("about");
  const heroTitle = String(page.heroTitle ?? "");
  const heroSubtitle = String(page.heroSubtitle ?? "");
  const storyKicker = String(page.storyKicker ?? "");
  const storyHeading = String(page.storyHeading ?? "");
  const storyPara1 = String(page.storyPara1 ?? "");
  const storyPara2 = String(page.storyPara2 ?? "");
  const missionHeading = String(page.missionHeading ?? "");
  const missionText = String(page.missionText ?? "");
  const visionHeading = String(page.visionHeading ?? "");
  const visionText = String(page.visionText ?? "");
  const valuesKicker = String(page.valuesKicker ?? "");
  const valuesHeading = String(page.valuesHeading ?? "");
  const timelineKicker = String(page.timelineKicker ?? "");
  const timelineHeading = String(page.timelineHeading ?? "");
  const leadershipKicker = String(page.leadershipKicker ?? "");
  const leadershipHeading = String(page.leadershipHeading ?? "");
  const accreditKicker = String(page.accreditKicker ?? "");
  const accreditHeading = String(page.accreditHeading ?? "");
  const ctaLabel = String(page.ctaLabel ?? "");

  return (
    <>
      <PageHero
        kicker="About · De Ultimate Glory Academy"
        title={heroTitle}
        subtitle={heroSubtitle}
      />

      {/* Story */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--editorial">
            <Reveal variant="left">
              <div>
                <span className="mkt-kicker">{storyKicker}</span>
                <h2 className="mkt-h2">{storyHeading}</h2>
                <p style={{ color: "var(--duga-ink-2)", marginTop: 18, lineHeight: 1.8 }}>
                  {storyPara1}
                </p>
                <p style={{ color: "var(--duga-ink-2)", marginTop: 14, lineHeight: 1.8 }}>
                  {storyPara2}
                </p>
                <Link href="/apply" className="duga-btn duga-btn--primary duga-btn--arrow" style={{ marginTop: 26 }}>
                  {ctaLabel} <ArrowRight size={16} className="mkt-arrow" />
                </Link>
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <Photo src="/images/group pupils.png" alt="Pupils of De Ultimate Glory Academy" ratio="tall" caption="Our campus family" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Mission / Vision */}
      <section className="mkt-section mkt-section--soft">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--2">
            <Reveal>
              <div className="mkt-card" style={{ padding: 34 }}>
                <div className="mkt-icon"><Target size={24} /></div>
                <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640 }}>{missionHeading}</h3>
                <p style={{ marginTop: 10 }}>{missionText}</p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="mkt-card" style={{ padding: 34 }}>
                <div className="mkt-icon"><Spark size={24} /></div>
                <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640 }}>{visionHeading}</h3>
                <p style={{ marginTop: 10 }}>{visionText}</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <Reveal>
              <span className="mkt-kicker">{valuesKicker}</span>
              <h2 className="mkt-h2">{valuesHeading}</h2>
            </Reveal>
          </div>
          <div className="mkt-grid mkt-grid--4">
            {VALUES.map((v, i) => {
              const Icon = v.icon;
              return (
                <Reveal key={v.title} delay={i * 80}>
                  <div className="mkt-card" style={{ textAlign: "center" }}>
                    <div className="mkt-icon" style={{ margin: "0 auto 16px" }}><Icon size={24} /></div>
                    <h3>{v.title}</h3>
                    <p>{v.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Timeline + Leadership */}
      <section className="mkt-section mkt-section--soft">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--2" style={{ alignItems: "start" }}>
            <Reveal variant="left">
              <div>
                <span className="mkt-kicker">{timelineKicker}</span>
                <h2 className="mkt-h2" style={{ marginBottom: 30 }}>{timelineHeading}</h2>
                <div className="mkt-timeline">
                  {TIMELINE.map((t) => (
                    <div key={t.year} className="mkt-timeline-item">
                      <h4>
                        {t.year} — {t.title}
                      </h4>
                      <p>{t.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <div>
                <span className="mkt-kicker">{leadershipKicker}</span>
                <h2 className="mkt-h2" style={{ marginBottom: 30 }}>{leadershipHeading}</h2>
                <div style={{ marginBottom: 30 }}>
                  <Photo src="/images/staff.png" alt="The staff of De Ultimate Glory Academy" ratio="wide" caption="Our dedicated team" />
                </div>
                <div className="mkt-grid mkt-grid--2">
                  {[
                    { initials: "PD", title: "Proprietor", role: "Founder & Owner" },
                    { initials: "PR", title: "Principal", role: "Head of School" },
                    { initials: "RG", title: "Registrar", role: "Admissions & Records" },
                    { initials: "IT", title: "ICT Officer", role: "Digital & e-learning" },
                  ].map((p) => (
                    <div key={p.title} className="mkt-card" style={{ textAlign: "center" }}>
                      <div className="duga-avatar" style={{ width: 62, height: 62, fontSize: 22, margin: "0 auto 14px", background: "var(--duga-primary)", color: "#fff" }}>
                        {p.initials}
                      </div>
                      <h3>{p.title}</h3>
                      <p style={{ fontSize: 13 }}>{p.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Accreditation */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <Reveal>
              <span className="mkt-kicker">{accreditKicker}</span>
              <h2 className="mkt-h2">{accreditHeading}</h2>
            </Reveal>
          </div>
          <div className="mkt-grid mkt-grid--4">
            {[
              { icon: Shield, label: "Ministry of Education — Nasarawa State" },
              { icon: Book, label: "Nigerian Basic Education Curriculum (BEC)" },
              { icon: Users, label: "Accredited NECO & WAEC Candidate School" },
              { icon: Cap, label: "National Examinations Registration" },
            ].map((a, i) => {
              const Icon = a.icon;
              return (
                <Reveal key={a.label} delay={i * 80}>
                  <div className="mkt-card" style={{ textAlign: "center", padding: "24px 18px" }}>
                    <div className="mkt-icon" style={{ margin: "0 auto 14px" }}><Icon size={24} /></div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--duga-primary-ink)", lineHeight: 1.5 }}>{a.label}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <Reveal>
            <div style={{ textAlign: "center", marginTop: 44 }}>
              <Link href="/apply" className="duga-btn duga-btn--primary duga-btn--lg duga-btn--arrow">
                {ctaLabel} <ArrowRight size={17} className="mkt-arrow" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
