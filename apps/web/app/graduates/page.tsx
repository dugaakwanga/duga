import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import { Reveal } from "@/components/motion";
import { graduates, graduateStats, alumniVoices } from "@/lib/content";

export const metadata: Metadata = {
  title: "Our Graduates",
  description:
    "Celebrating the graduates of De Ultimate Glory Academy — their results, their stories and their next chapters.",
};

export default function GraduatesPage() {
  return (
    <>
      <PageHero
        kicker="Our Graduates"
        title="Proud of every single one"
        subtitle="Two decades of young people who passed through DUGA and went on to great things. This is their story."
      />

      {/* ============ STATS ============ */}
      <section className="mkt-section mkt-section--dark">
        <div className="mkt-container">
          <div className="mkt-stat-band">
            {graduateStats.map((s) => (
              <div className="mkt-stat" key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ RECENT GRADUATES ============ */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <div className="mkt-eyebrow">Recent Graduates</div>
            <h2 className="mkt-h2">
              Class of excellence, <em>year after year</em>
            </h2>
            <p>
              A selection of our recent Senior Secondary graduates and the universities they have gone on to.
            </p>
          </div>

          <div className="mkt-grid mkt-grid--3" style={{ rowGap: 20 }}>
            {graduates.map((g, i) => (
              <Reveal key={g.id} delay={i * 60}>
                <div className="mkt-card mkt-graduate">
                  <div className="mkt-graduate-avatar" aria-hidden="true">
                    {g.name
                      .split(" ")
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div className="mkt-graduate-body">
                    <h3 className="mkt-graduate-name">{g.name}</h3>
                    <div className="mkt-graduate-meta">
                      {g.class} · {g.year}
                    </div>
                    <p className="mkt-graduate-ach">{g.achievement}</p>
                    {g.university && <div className="mkt-graduate-uni">→ {g.university}</div>}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ ALUMNI VOICES ============ */}
      <section className="mkt-section mkt-section--soft">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-section-head--center">
            <div className="mkt-eyebrow">Alumni Voices</div>
            <h2 className="mkt-h2">
              What our alumni <em>say</em>
            </h2>
          </div>
          <div className="mkt-grid mkt-grid--3">
            {alumniVoices.map((v, i) => (
              <Reveal key={v.name} delay={i * 80}>
                <figure className="mkt-card mkt-quote">
                  <blockquote>&ldquo;{v.text}&rdquo;</blockquote>
                  <footer>
                    <strong>{v.name}</strong>
                    <span>{v.role}</span>
                  </footer>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
