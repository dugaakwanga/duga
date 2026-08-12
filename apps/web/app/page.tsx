import Link from "next/link";
import type { ComponentType } from "react";
import Photo from "@/components/Photo";
import { school as fallbackSchool, portalUrl } from "@/lib/content";
import { getSiteData, mergeContent } from "@/lib/site-data";
import { WEB_FEATURE_IDS } from "@duga/core";
import { Reveal, Counter, HeroHeadline } from "@/components/motion";
import HomeGalleryPreview from "@/components/HomeGalleryPreview";
import HomeNewsPreview from "@/components/HomeNewsPreview";
import TestimonialCarousel from "@/components/TestimonialCarousel";
import NewsletterSignup from "@/components/NewsletterSignup";
import WaveDivider from "@/components/WaveDivider";
import HeroIntro from "@/components/HeroIntro";
import HeroVideoCarousel from "@/components/HeroVideoCarousel";
import {
  ArrowRight,
  Cap,
  Beaker,
  Home,
  Bus,
  Users,
  Monitor,
  Spark,
  Heart,
  Target,
  Globe,
  Book,
  Leaf,
  Clock,
} from "@/components/icons";

const HIGHLIGHT_ICONS: ComponentType<{ size?: number }>[] = [Cap, Beaker, Home, Bus, Users, Monitor];
const OFFER_ICONS: ComponentType<{ size?: number }>[] = [Book, Cap, Home, Leaf, Spark, Users];
const PROGRAMME_IMG_FALLBACK = ["/images/primarypupil.png", "/images/group pupils.png", "/images/sec group 2.png"];
const SECTION_IMG_FALLBACK = ["/images/group pupils.png", "/images/sec group 2.png"];

export default async function HomePage() {
  const { school, content: raw, website } = await getSiteData();
  const content = mergeContent(raw);
  const features = new Set(website.features.length ? website.features : WEB_FEATURE_IDS);
  const on = (id: string) => features.has(id);

  const contact = {
    name: school?.name ?? fallbackSchool.name,
    motto: content.contact.motto || fallbackSchool.motto,
    address: school?.address ?? fallbackSchool.address,
    phone: school?.phone ?? fallbackSchool.phone,
    email: school?.email ?? fallbackSchool.email,
  };
  return (
    <>
      {/* ============ HERO ============ */}
      {on("hero") && (
      <section className="mkt-hero">
        <HeroVideoCarousel />
        <div className="mkt-blob mkt-blob--1" aria-hidden="true" />
        <div className="mkt-blob mkt-blob--2" aria-hidden="true" />
        <div className="mkt-container">
          <div className="mkt-hero-copy">
            <HeroIntro eyebrow={content.hero.eyebrow} show="eyebrow" />
            <h1>
              <HeroHeadline lines={["De  Ultimate  Glory", "Academy"]} accent="Academy" />
            </h1>
            <HeroIntro lead={content.hero.lead} stats={content.stats} show="details" />
            <div className="mkt-hero-cta mkt-fade-in mkt-fade-in--3">
              <Link href="/apply" className="duga-btn duga-btn--primary duga-btn--lg duga-btn--arrow">
                Apply for Admission <ArrowRight size={17} className="mkt-arrow" />
              </Link>
              <Link href="/academics" className="duga-btn duga-btn--outline duga-btn--lg duga-btn--arrow">
                Explore Academics <ArrowRight size={17} className="mkt-arrow" />
              </Link>
            </div>
          </div>
          <div className="mkt-hero-photos mkt-fade-in mkt-fade-in--5" aria-label="Life at De Ultimate Glory Academy">
            <Photo src="/images/primarypupil.png" alt="A primary pupil of De Ultimate Glory Academy" ratio="portrait" caption="Primary · Nursery to P6" className="mkt-hero-main-photo" />
            <Photo src="/images/group 1 sec.png" alt="Secondary students of De Ultimate Glory Academy" ratio="wide" caption="Secondary · JSS1 to SSS3" className="mkt-hero-photo-2" />
          </div>
        </div>
      </section>
      )}

      {/* ============ TICKER ============ */}
      {on("ticker") && (
      <div className="mkt-ticker" aria-hidden="true">
        <div className="mkt-ticker-track">
          {content.values.map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
        <div className="mkt-ticker-track" aria-hidden="true">
          {content.values.map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
      </div>
      )}

      {/* ============ FEATURED PROGRAMMES ============ */}
      {on("programmes") && (
      <section className="mkt-section mkt-section--paper">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <Reveal>
              <span className="mkt-kicker">Featured Programmes</span>
              <h2 className="mkt-h2">Classes for every <em>stage</em></h2>
              <p>From first letters to final exams — click a programme to see details, schedules and how to apply.</p>
            </Reveal>
          </div>
          <div className="mkt-feature-grid">
            {content.programmes.map((p, i) => (
              <Reveal key={p.title || i} delay={i * 90}>
                <div className="mkt-feature">
                  <div className="mkt-feature-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.img || PROGRAMME_IMG_FALLBACK[i % PROGRAMME_IMG_FALLBACK.length] || "/images/primarypupil.png"} alt={p.title} loading="lazy" />
                    {p.tag && <span className="mkt-feature-tag">{p.tag}</span>}
                  </div>
                  <div className="mkt-feature-body">
                    <h3>{p.title}</h3>
                    <div className="mkt-feature-meta">
                      <span><Clock size={14} /> {p.schedule}</span>
                      <span><Users size={14} /> {p.ages}</span>
                    </div>
                    <p>{p.text}</p>
                    <div className="mkt-feature-cta">
                      <Link href={p.href || "/academics"} className="duga-btn duga-btn--primary duga-btn--sm duga-btn--arrow">
                        {p.cta || "Learn more"} <ArrowRight size={15} className="mkt-arrow" />
                      </Link>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      )}

      <WaveDivider tone="white" />

      {/* ============ WHY DUGA ============ */}
      {on("highlights") && (
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <Reveal>
              <span className="mkt-kicker">01 — Why DUGA</span>
              <h2 className="mkt-h2">Everything a young learner needs to <em>thrive</em></h2>
              <p>
                We pair a demanding academic programme with the warmth and care a child deserves —
                academically, socially and spiritually.
              </p>
            </Reveal>
          </div>
          <div className="mkt-grid mkt-grid--3">
            {content.highlights.map((h, i) => {
              const Icon = HIGHLIGHT_ICONS[i % HIGHLIGHT_ICONS.length] ?? Cap;
              return (
                <Reveal key={h.title || i} delay={(i % 3) * 90}>
                  <div className="mkt-card mkt-card--numbered">
                    <span className="mkt-card-num">{String(i + 1).padStart(2, "0")}</span>
                    <div className="mkt-icon"><Icon size={23} /></div>
                    <h3>{h.title}</h3>
                    <p>{h.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* ============ PRIMARY & SECONDARY ============ */}
      {on("sections") && (
      <section className="mkt-section mkt-section--soft">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <Reveal>
              <span className="mkt-kicker">02 — Two Great Sections</span>
              <h2 className="mkt-h2">One school. One family. <em>Two journeys.</em></h2>
              <p>From the very first letters to final national exams, your child grows with us — step by step.</p>
            </Reveal>
          </div>

          <div className="mkt-grid mkt-grid--2">
            {content.sections.map((s, i) => (
              <Reveal key={s.title || i} variant={i % 2 === 0 ? "left" : "right"} delay={i % 2 === 0 ? 0 : 120}>
                <div className="mkt-card mkt-card--photo">
                  <div className="mkt-card-photo">
                    <Photo
                      src={s.img || SECTION_IMG_FALLBACK[i % SECTION_IMG_FALLBACK.length] || "/images/group pupils.png"}
                      alt={s.alt || s.title}
                      ratio="wide"
                      caption={s.caption}
                    />
                  </div>
                  <div className="mkt-card--photo-body">
                    <span className="mkt-kicker">{s.kicker}</span>
                    <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640, marginBottom: 8 }}>
                      {s.title}
                    </h3>
                    <p>{s.text}</p>
                    <Link href={s.href || "/academics"} className="mkt-link-arrow">
                      {s.link || "Explore"} <ArrowRight size={15} className="mkt-arrow" />
                    </Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ============ OUR OFFERINGS ============ */}
      {on("offers") && (
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <Reveal>
              <span className="mkt-kicker">Our Offerings</span>
              <h2 className="mkt-h2">Everything under <em>one roof</em></h2>
              <p>Browse by programme, age, location or activity — and find your child&rsquo;s next adventure.</p>
            </Reveal>
          </div>
          <div className="mkt-offers-grid">
            {content.offers.map((o, i) => {
              const Icon = OFFER_ICONS[i % OFFER_ICONS.length] ?? Book;
              const href = o.href || portalUrl;
              return (
                <Reveal key={o.title || i} delay={(i % 3) * 90}>
                  <Link href={href} className="mkt-offer">
                    <span className="mkt-offer-icon"><Icon size={23} /></span>
                    <div>
                      <div className="mkt-offer-title">{o.title}</div>
                      <span className="mkt-offer-sub">{o.sub} <ArrowRight size={13} className="mkt-arrow" /></span>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>
      )}

      <WaveDivider tone="navy" />

      {/* ============ STAT BAND ============ */}
      {on("statBand") && (
      <section className="mkt-section mkt-section--dark">
        <div className="mkt-container">
          <div className="mkt-stat-band">
            {content.stats.map((s, i) => (
              <Reveal key={s.label || i} delay={i * 90}>
                <div className="mkt-stat">
                  <strong><Counter to={s.value} suffix={s.suffix} /></strong>
                  <span>{s.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      )}

      <WaveDivider tone="white" />

      {/* ============ PORTAL ACCESS ============ */}
      {on("portalPromo") && (
      <section className="mkt-section mkt-section--paper">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--editorial">
            <Reveal variant="left">
              <div>
                <span className="mkt-kicker">03 — Stay Connected</span>
                <h2 className="mkt-h2">A portal built for <em>parents &amp; pupils</em></h2>
                <p style={{ color: "var(--duga-ink-2)", margin: "18px 0 0", lineHeight: 1.75 }}>
                  Results, fees, attendance, timetables, assignments and school messages — everything
                  in one secure place, for every member of the school family.
                </p>
                <div className="mkt-grid mkt-grid--2" style={{ marginTop: 34, gap: 16 }}>
                  {[
                    { t: "Digital results", d: "Publish & view term results in real time." },
                    { t: "Fee transparency", d: "Track payments and balances online." },
                    { t: "Two-way messaging", d: "Parents and teachers, in one inbox." },
                    { t: "Attendance & more", d: "Hostel, transport and timetable tools." },
                  ].map((f) => (
                    <div key={f.t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span className="mkt-contact-icon" style={{ width: 34, height: 34, flexShrink: 0 }}><Spark size={16} /></span>
                      <div>
                        <strong style={{ fontSize: 14, color: "var(--duga-primary-ink)" }}>{f.t}</strong>
                        <p style={{ fontSize: 13, color: "var(--duga-ink-2)" }}>{f.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <div className="mkt-grid mkt-grid--2" style={{ gap: 24, alignItems: "center" }}>
                <Photo src="/images/single pupil.png" alt="A happy primary pupil" ratio="portrait" caption="Pupil life" />
                <div style={{ display: "grid", gap: 24 }}>
                  <Photo src="/images/single sec girl.png" alt="A secondary student" ratio="portrait" caption="Student life" />
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <div style={{ marginTop: 48, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Link href={portalUrl} className="duga-btn duga-btn--primary duga-btn--lg duga-btn--arrow">
                Open the Portal <ArrowRight size={17} className="mkt-arrow" />
              </Link>
              <Link href="/apply" className="duga-btn duga-btn--outline duga-btn--lg duga-btn--arrow">
                New Student Application <ArrowRight size={17} className="mkt-arrow" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
      )}

      {/* ============ TESTIMONIALS ============ */}
      {on("testimonials") && (
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--2" style={{ alignItems: "center", gap: 60 }}>
            <Reveal variant="left">
              <Photo src="/images/single sec boy.png" alt="A secondary school boy in uniform" ratio="portrait" caption="Character, always" />
            </Reveal>
            <Reveal variant="right" delay={100}>
              <span className="mkt-kicker">04 — From Our Family</span>
              <h2 className="mkt-h2" style={{ fontSize: "clamp(26px, 3vw, 38px)", marginBottom: 22 }}>
                Parents who <em>trust us</em>
              </h2>
              <TestimonialCarousel items={content.testimonials} />
            </Reveal>
          </div>
        </div>
      </section>
      )}

      <WaveDivider tone="surface" />

      {/* ============ GALLERY PREVIEW ============ */}
      {on("gallery") && (
      <section className="mkt-section mkt-section--soft">
        <div className="mkt-container">
          <HomeGalleryPreview />
        </div>
      </section>
      )}

      <WaveDivider tone="white" />

      {/* ============ NEWS PREVIEW ============ */}
      {on("news") && (
      <section className="mkt-section">
        <div className="mkt-container">
          <HomeNewsPreview />
        </div>
      </section>
      )}

      <WaveDivider tone="white" />

      {/* ============ NEWSLETTER ============ */}
      {on("newsletter") && (
      <section className="mkt-section mkt-section--paper">
        <div className="mkt-container mkt-container--narrow">
          <Reveal>
            <NewsletterSignup />
          </Reveal>
        </div>
      </section>
      )}

      <WaveDivider tone="navy" />

      {/* ============ CTA ============ */}
      {on("finalCta") && (
      <section className="mkt-section mkt-section--dark">
        <div className="mkt-container" style={{ textAlign: "center" }}>
          <Reveal>
            <div style={{ display: "flex", justifyContent: "center", gap: 26, marginBottom: 26, flexWrap: "wrap" }}>
              <span className="mkt-stat-band__deco" style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                <Heart size={16} style={{ color: "#fff" }} /> Character first
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                <Target size={16} style={{ color: "#fff" }} /> Excellence always
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                <Globe size={16} style={{ color: "#fff" }} /> Rooted in Akwanga
              </span>
            </div>
            <h2 className="mkt-h2" style={{ fontSize: "clamp(30px, 4vw, 52px)" }}>
              Give your child a <em>glorious start</em>
            </h2>
            <p style={{ color: "rgba(255,255,255,0.78)", maxWidth: 560, margin: "18px auto 0", lineHeight: 1.75 }}>
              Applications for the 2025/2026 academic session are open. Join us and watch your child
              grow into a confident, disciplined and successful leader.
            </p>
            <div style={{ marginTop: 32, display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/apply" className="duga-btn mkt-btn--light duga-btn--lg duga-btn--arrow">
                Start Application <ArrowRight size={17} className="mkt-arrow" />
              </Link>
              <Link href="/contact" className="duga-btn mkt-btn--glass duga-btn--lg duga-btn--arrow">
                Talk to Us <ArrowRight size={17} className="mkt-arrow" />
              </Link>
            </div>
            <p style={{ marginTop: 22, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
              {contact.phone} · {contact.email}
            </p>
          </Reveal>
        </div>
      </section>
      )}
    </>
  );
}
