import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import Photo from "@/components/Photo";
import { Reveal } from "@/components/motion";
import { Shield, ArrowRight, Target, Spark } from "@/components/icons";
import { getPageContent } from "@/lib/site-data";
import { assertSitePage } from "@/lib/site-gate";
import type { PageCard } from "@duga/core";

function cards(value: unknown): PageCard[] {
  return Array.isArray(value) ? (value as PageCard[]) : [];
}

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
  const storyImage = String(page.storyImage ?? "") || "/images/group pupils.png";
  const teamImage = String(page.teamImage ?? "") || "/images/staff.png";
  const values = cards(page.valuesCards);
  const timeline = cards(page.timelineCards);
  const leadership = cards(page.leadershipCards);
  const accreditations = cards(page.accreditCards);

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
              <Photo src={storyImage} alt="Pupils of De Ultimate Glory Academy" ratio="tall" caption="Our campus family" />
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
            {values.map((v, i) => (
              <Reveal key={v.id} delay={i * 80}>
                <div className="mkt-card" style={{ textAlign: "center" }}>
                  <div className="mkt-icon" style={{ margin: "0 auto 16px" }}><Shield size={24} /></div>
                  <h3>{v.title}</h3>
                  <p>{v.text}</p>
                </div>
              </Reveal>
            ))}
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
                  {timeline.map((t) => (
                    <div key={t.id} className="mkt-timeline-item">
                      <h4>
                        {t.meta} — {t.title}
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
                  <Photo src={teamImage} alt="The staff of De Ultimate Glory Academy" ratio="wide" caption="Our dedicated team" />
                </div>
                <div className="mkt-grid mkt-grid--2">
                  {leadership.map((p) => (
                    <div key={p.id} className="mkt-card" style={{ textAlign: "center" }}>
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image}
                          alt=""
                          style={{ width: 62, height: 62, borderRadius: "50%", objectFit: "cover", margin: "0 auto 14px", display: "block" }}
                        />
                      ) : (
                        <div className="duga-avatar" style={{ width: 62, height: 62, fontSize: 22, margin: "0 auto 14px", background: "var(--duga-primary)", color: "#fff" }}>
                          {(p.title ?? "")
                            .split(" ")
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                      )}
                      <h3>{p.title}</h3>
                      <p style={{ fontSize: 13 }}>{p.subtitle}</p>
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
            {accreditations.map((a, i) => (
              <Reveal key={a.id} delay={i * 80}>
                <div className="mkt-card" style={{ textAlign: "center", padding: "24px 18px" }}>
                  {a.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.image} alt="" style={{ height: 40, margin: "0 auto 14px", display: "block" }} />
                  ) : (
                    <div className="mkt-icon" style={{ margin: "0 auto 14px" }}><Shield size={24} /></div>
                  )}
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--duga-primary-ink)", lineHeight: 1.5 }}>{a.title}</p>
                </div>
              </Reveal>
            ))}
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
