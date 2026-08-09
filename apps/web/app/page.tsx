import Link from "next/link";
import Photo from "@/components/Photo";
import { school } from "@/lib/content";
import { Reveal, Counter, Tilt, HeroHeadline } from "@/components/motion";
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

const HIGHLIGHTS = [
  { icon: Cap, title: "Nursery to SSS 3", text: "One campus, one family — primary and secondary education under the same roof, from first letters to final national exams." },
  { icon: Beaker, title: "Modern Facilities", text: "A new integrated science laboratory, computer studies, a growing library and bright, spacious classrooms." },
  { icon: Home, title: "Boarding & Day", text: "Safe, well-supervised hostels with night study, mentorship and 24/7 care from dedicated housemasters." },
  { icon: Bus, title: "School Transport", text: "Comfortable buses with clearly defined routes across Akwanga and its environs, morning and evening." },
  { icon: Users, title: "Experienced Teachers", text: "Qualified, caring staff who know every child by name and take each one's success personally." },
  { icon: Monitor, title: "Digital Learning", text: "Online classes, digital results and a parent portal for full transparency on fees, results and attendance." },
];

const STATS = [
  { value: 20, suffix: "+", label: "Years of excellence" },
  { value: 1200, suffix: "+", label: "Students enrolled" },
  { value: 98, suffix: "%", label: "BECE pass rate" },
  { value: 80, suffix: "+", label: "Dedicated staff" },
];

const FEATURED_PROGRAMMES = [
  {
    img: "/images/primarypupil.png",
    tag: "Pre-School & Foundation",
    title: "Nursery to Primary 1",
    schedule: "Mon – Fri · 8:00am – 1:00pm",
    ages: "Ages 2 – 6",
    text: "A gentle, play-based start with phonics, early numeracy and strong character formation.",
    href: "/academics#primary",
    cta: "Explore Primary",
  },
  {
    img: "/images/group pupils.png",
    tag: "Primary Section",
    title: "Primary 1 – 6",
    schedule: "Mon – Fri · 8:00am – 2:30pm",
    ages: "Ages 6 – 12",
    text: "A rigorous foundation in literacy, numeracy and the sciences, with ICT and creative arts from day one.",
    href: "/academics#primary",
    cta: "Explore Primary",
  },
  {
    img: "/images/sec group 2.png",
    tag: "Secondary Section",
    title: "JSS 1 – SSS 3",
    schedule: "Mon – Fri · 8:00am – 3:30pm",
    ages: "Ages 12 – 18",
    text: "Fully prepared for BECE, WAEC, NECO and JAMB (sat at accredited centres) — with science labs, boarding and career guidance.",
    href: "/academics#secondary",
    cta: "Explore Secondary",
  },
];

const OFFERINGS = [
  { icon: Book, title: "Academics", sub: "by Subject >", href: "/academics" },
  { icon: Cap, title: "Admissions", sub: "How to apply >", href: "/admissions" },
  { icon: Home, title: "Boarding & Day", sub: "Hostel life >", href: "/academics#secondary" },
  { icon: Leaf, title: "News & Events", sub: "Latest updates >", href: "/news" },
  { icon: Spark, title: "Parent Portal", sub: "Results & fees >", href: "" },
  { icon: Users, title: "Our School", sub: "Meet the family >", href: "/about" },
];

export default function HomePage() {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

  return (
    <>
      {/* ============ HERO ============ */}
      <section className="mkt-hero">
        <HeroVideoCarousel />
        <div className="mkt-blob mkt-blob--1" aria-hidden="true" />
        <div className="mkt-blob mkt-blob--2" aria-hidden="true" />
        <div className="mkt-container">
          <div>
            <HeroIntro />
            <h1>
              <HeroHeadline lines={["De Ultimate Glory", "Academy"]} accent="Academy" />
            </h1>
            <div className="mkt-hero-cta mkt-fade-in mkt-fade-in--3">
              <Link href="/apply" className="duga-btn duga-btn--primary duga-btn--lg duga-btn--arrow">
                Apply for Admission <ArrowRight size={17} className="mkt-arrow" />
              </Link>
              <Link href="/academics" className="duga-btn duga-btn--outline duga-btn--lg duga-btn--arrow">
                Explore Academics <ArrowRight size={17} className="mkt-arrow" />
              </Link>
            </div>
          </div>

          <div className="mkt-hero-media mkt-fade-in mkt-fade-in--5">
            <Tilt max={5}>
              <Photo src="/images/primarypupil.png" alt="A primary pupil of De Ultimate Glory Academy" ratio="portrait" caption="Primary · Nursery to P6" className="mkt-hero-main-photo" />
              <Photo src="/images/group 1 sec.png" alt="Secondary students of De Ultimate Glory Academy" ratio="wide" caption="Secondary · JSS1 to SSS3" className="mkt-hero-photo-2" />
            </Tilt>

            <div className="mkt-float-chip mkt-float-chip--tl">
              <span className="mkt-chip-dot"><Spark size={18} /></span>
              <div>
                <strong>98% BECE pass</strong>
                <span>2025 results</span>
              </div>
            </div>
              <div className="mkt-float-chip mkt-float-chip--bl">
              <span className="mkt-chip-dot"><Cap size={18} /></span>
              <div>
                <strong>Since 2006</strong>
                <span>20 years of excellence</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mkt-scroll-cue">Scroll</div>
      </section>

      {/* ============ TICKER ============ */}
      <div className="mkt-ticker" aria-hidden="true">
        <div className="mkt-ticker-track">
          <span>Academic Excellence</span>
          <span>Discipline</span>
          <span>Character</span>
          <span>Innovation</span>
          <span>Service</span>
          <span>Integrity</span>
        </div>
        <div className="mkt-ticker-track" aria-hidden="true">
          <span>Academic Excellence</span>
          <span>Discipline</span>
          <span>Character</span>
          <span>Innovation</span>
          <span>Service</span>
          <span>Integrity</span>
        </div>
      </div>

      {/* ============ FEATURED PROGRAMMES ============ */}
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
            {FEATURED_PROGRAMMES.map((p, i) => (
              <Reveal key={p.title} delay={i * 90}>
                <div className="mkt-feature">
                  <div className="mkt-feature-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.img} alt={p.title} loading="lazy" />
                    <span className="mkt-feature-tag">{p.tag}</span>
                  </div>
                  <div className="mkt-feature-body">
                    <h3>{p.title}</h3>
                    <div className="mkt-feature-meta">
                      <span><Clock size={14} /> {p.schedule}</span>
                      <span><Users size={14} /> {p.ages}</span>
                    </div>
                    <p>{p.text}</p>
                    <div className="mkt-feature-cta">
                      <Link href={p.href} className="duga-btn duga-btn--primary duga-btn--sm duga-btn--arrow">
                        {p.cta} <ArrowRight size={15} className="mkt-arrow" />
                      </Link>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <WaveDivider tone="white" />

      {/* ============ WHY DUGA ============ */}
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
            {HIGHLIGHTS.map((h, i) => {
              const Icon = h.icon;
              return (
                <Reveal key={h.title} delay={(i % 3) * 90}>
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

      {/* ============ PRIMARY & SECONDARY ============ */}
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
            <Reveal variant="left">
              <div className="mkt-card mkt-card--photo">
                <div className="mkt-card-photo">
                  <Photo src="/images/group pupils.png" alt="Primary pupils of De Ultimate Glory Academy" ratio="wide" caption="Primary Section" />
                </div>
                <div className="mkt-card--photo-body">
                  <span className="mkt-kicker">Nursery · Primary 1–6</span>
                  <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640, marginBottom: 8 }}>
                    The Primary Years
                  </h3>
                  <p>
                    A nurturing, hands-on foundation built on phonics, numeracy and good character.
                    Our pupils are prepared for the common entrance — and for life.
                  </p>
                  <Link href="/academics#primary" className="mkt-link-arrow">
                    Explore primary <ArrowRight size={15} className="mkt-arrow" />
                  </Link>
                </div>
              </div>
            </Reveal>

            <Reveal variant="right" delay={120}>
              <div className="mkt-card mkt-card--photo">
                <div className="mkt-card-photo">
                  <Photo src="/images/sec group 2.png" alt="Secondary students of De Ultimate Glory Academy" ratio="wide" caption="Secondary Section" />
                </div>
                <div className="mkt-card--photo-body">
                  <span className="mkt-kicker">JSS 1 · SSS 3</span>
                  <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640, marginBottom: 8 }}>
                    The Secondary Years
                  </h3>
                  <p>
                    From JSS 1 to SSS 3 we prepare students for BECE, WAEC, NECO and JAMB — sat at accredited
                    examination centres — with strong teaching, science labs, ICT and career guidance.
                  </p>
                  <Link href="/academics#secondary" className="mkt-link-arrow">
                    Explore secondary <ArrowRight size={15} className="mkt-arrow" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ OUR OFFERINGS ============ */}
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
            {OFFERINGS.map((o, i) => {
              const Icon = o.icon;
              const href = o.href || portalUrl;
              return (
                <Reveal key={o.title} delay={(i % 3) * 90}>
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

      <WaveDivider tone="navy" />

      {/* ============ STAT BAND ============ */}
      <section className="mkt-section mkt-section--dark">
        <div className="mkt-container">
          <div className="mkt-stat-band">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 90}>
                <div className="mkt-stat">
                  <strong><Counter to={s.value} suffix={s.suffix} /></strong>
                  <span>{s.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <WaveDivider tone="white" />

      {/* ============ PORTAL ACCESS ============ */}
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

      {/* ============ TESTIMONIALS ============ */}
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
              <TestimonialCarousel />
            </Reveal>
          </div>
        </div>
      </section>

      <WaveDivider tone="surface" />

      {/* ============ GALLERY PREVIEW ============ */}
      <section className="mkt-section mkt-section--soft">
        <div className="mkt-container">
          <HomeGalleryPreview />
        </div>
      </section>

      <WaveDivider tone="white" />

      {/* ============ NEWS PREVIEW ============ */}
      <section className="mkt-section">
        <div className="mkt-container">
          <HomeNewsPreview />
        </div>
      </section>

      <WaveDivider tone="white" />

      {/* ============ NEWSLETTER ============ */}
      <section className="mkt-section mkt-section--paper">
        <div className="mkt-container mkt-container--narrow">
          <Reveal>
            <NewsletterSignup />
          </Reveal>
        </div>
      </section>

      <WaveDivider tone="navy" />

      {/* ============ CTA ============ */}
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
              {school.phone} · {school.email}
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
