import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import Photo from "@/components/Photo";
import { Reveal } from "@/components/motion";
import { admissionSteps, admissionRequirements } from "@/lib/content";
import { ArrowRight, Spark, Leaf, Cap } from "@/components/icons";

export const metadata: Metadata = {
  title: "Admissions",
  description:
    "How to apply to De Ultimate Glory Academy — online application, requirements, assessment and resumption.",
};

export default function AdmissionsPage() {
  return (
    <>
      <PageHero
        kicker="Admissions"
        title="Joining our family is simple"
        subtitle="Applications are open for the 2025/2026 academic session. Follow the steps below to begin."
      />

      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--editorial">
            <Reveal variant="left">
              <div>
                <span className="mkt-kicker">How to Apply</span>
                <h2 className="mkt-h2" style={{ marginBottom: 34 }}>Five steps to <em>admission</em></h2>
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
                <span className="mkt-kicker">Requirements</span>
                <h2 className="mkt-h2" style={{ marginBottom: 30 }}>
                  Please have these <em>ready</em>
                </h2>
                <div className="mkt-form-card">
                  <ul className="mkt-check-list">
                    {admissionRequirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div className="mkt-card" style={{ marginTop: 24, background: "var(--duga-primary)", border: "none", color: "#fff" }}>
                  <h3 style={{ color: "#fff", display: "flex", gap: 10, alignItems: "center" }}>
                    <Spark size={18} /> Ready to apply?
                  </h3>
                  <p style={{ color: "rgba(255,255,255,0.8)", margin: "8px 0 18px" }}>
                    Start your application online now. It takes less than five minutes.
                  </p>
                  <Link href="/apply" className="duga-btn mkt-btn--light duga-btn--arrow" style={{ display: "inline-flex" }}>
                    Start Online Application <ArrowRight size={16} className="mkt-arrow" />
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
              <span className="mkt-kicker">Fees &amp; Payment</span>
              <h2 className="mkt-h2">Simple, transparent <em>payment options</em></h2>
              <p>Transparent fee schedules are shared after acceptance.</p>
            </Reveal>
          </div>
          <div className="mkt-grid mkt-grid--3">
            <Reveal>
              <div className="mkt-card">
                <div className="mkt-icon"><Leaf size={23} /></div>
                <h3>Flexible Payment Plans</h3>
                <p>Fees can be paid in installments with approval from the school office.</p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="mkt-card">
                <div className="mkt-icon"><Spark size={23} /></div>
                <h3>Online Payments</h3>
                <p>Pay tuition, hostel and transport fees securely via Paystack — card, transfer or USSD.</p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="mkt-card">
                <div className="mkt-icon"><Cap size={23} /></div>
                <h3>Scholarships</h3>
                <p>Outstanding students and siblings may qualify for discounts and scholarships.</p>
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
