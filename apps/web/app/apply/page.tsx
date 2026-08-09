import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import ApplicationForm from "@/components/ApplicationForm";
import { Reveal } from "@/components/motion";
import Photo from "@/components/Photo";
import { admissionRequirements } from "@/lib/content";

export const metadata: Metadata = {
  title: "Apply for Admission",
  description:
    "Apply online for admission to De Ultimate Glory Academy, Akwanga, Nasarawa State.",
};

export default function ApplyPage() {
  return (
    <>
      <PageHero
        kicker="Apply"
        title="Begin your child's journey today"
        subtitle="Complete the application form below. Our admissions team will contact you within 48 hours."
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--editorial-flip">
            <Reveal variant="right" delay={80}>
              <div>
                <div className="mkt-form-card">
                  <h3 style={{ marginBottom: 18 }}>Student Application Form</h3>
                  <ApplicationForm />
                </div>
              </div>
            </Reveal>
            <Reveal variant="left">
              <div>
                <span className="mkt-kicker">Before you begin</span>
                <h2 className="mkt-h2" style={{ fontSize: 30, marginBottom: 22 }}>
                  Have these <em>handy</em>
                </h2>
                <div className="mkt-form-card" style={{ boxShadow: "var(--duga-shadow)" }}>
                  <ul className="mkt-check-list">
                    {admissionRequirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div className="duga-alert duga-alert--info" style={{ marginTop: 18 }}>
                  <span>
                    After submitting, you will receive a confirmation reference. Keep it safe — you&apos;ll
                    need it to track your application.
                  </span>
                </div>
                <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Photo src="/images/primarypupil.png" alt="A primary pupil" ratio="wide" caption="Primary" />
                  <Photo src="/images/single sec girl.png" alt="A secondary student" ratio="wide" caption="Secondary" />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
