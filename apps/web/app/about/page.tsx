import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import Photo from "@/components/Photo";
import { Reveal } from "@/components/motion";
import { Book, Shield, Heart, Globe, ArrowRight, Target, Spark, Users, Cap } from "@/components/icons";
import { school } from "@/lib/content";

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

export default function AboutPage() {
  return (
    <>
      <PageHero
        kicker="About · De Ultimate Glory Academy"
        title="Our story, told with pride"
        subtitle="Over twenty years of raising leaders in Akwanga, Nasarawa State — with a mission that has never changed."
      />

      {/* Story */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--editorial">
            <Reveal variant="left">
              <div>
                <span className="mkt-kicker">Our Story</span>
                <h2 className="mkt-h2">It began with a simple <em>vision</em></h2>
                <p style={{ color: "var(--duga-ink-2)", marginTop: 18, lineHeight: 1.8 }}>
                  Founded in {school.founded}, De Ultimate Glory Academy began with a simple conviction —
                  to give the children of Akwanga and Nasarawa State a school where academic rigour,
                  discipline and strong moral values are taken seriously.
                </p>
                <p style={{ color: "var(--duga-ink-2)", marginTop: 14, lineHeight: 1.8 }}>
                  Today, we run both a full Primary and Secondary section on one campus, with modern
                  classrooms, a science laboratory, computer studies, a library, boarding facilities
                  and school transport. Our graduates have progressed to leading secondary schools
                  and universities across Nigeria.
                </p>
                <Link href="/apply" className="duga-btn duga-btn--primary duga-btn--arrow" style={{ marginTop: 26 }}>
                  Begin your child&apos;s journey <ArrowRight size={16} className="mkt-arrow" />
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
                <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640 }}>Our Mission</h3>
                <p style={{ marginTop: 10 }}>
                  To provide a holistic, affordable and high-quality education that nurtures the
                  intellectual, moral and physical potential of every child — preparing them to excel
                  in national examinations and in life.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="mkt-card" style={{ padding: 34 }}>
                <div className="mkt-icon"><Spark size={24} /></div>
                <h3 style={{ fontFamily: "var(--duga-font-display)", fontSize: 24, fontWeight: 640 }}>Our Vision</h3>
                <p style={{ marginTop: 10 }}>
                  To be the leading citadel of learning in Nasarawa State — producing disciplined,
                  creative and God-fearing leaders who transform their communities and the nation.
                </p>
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
              <span className="mkt-kicker">Core Values</span>
              <h2 className="mkt-h2">The principles we instil, <em>every day</em></h2>
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
                <span className="mkt-kicker">Milestones</span>
                <h2 className="mkt-h2" style={{ marginBottom: 30 }}>A journey of <em>growth</em></h2>
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
                <span className="mkt-kicker">Leadership</span>
                <h2 className="mkt-h2" style={{ marginBottom: 30 }}>The people behind <em>our success</em></h2>
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
              <span className="mkt-kicker">Accreditation</span>
              <h2 className="mkt-h2">Recognised &amp; <em>accredited</em></h2>
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
                Begin Your Child&apos;s Journey <ArrowRight size={17} className="mkt-arrow" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
