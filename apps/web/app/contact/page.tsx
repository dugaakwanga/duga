import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import ContactForm from "@/components/ContactForm";
import { Reveal } from "@/components/motion";
import { Pin, Phone, Mail, Clock } from "@/components/icons";
import { school } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact De Ultimate Glory Academy, Akwanga, Nasarawa State. Call, email or visit our campus.",
};

const DETAILS = [
  { icon: Pin, title: "Visit us", value: school.address },
  { icon: Phone, title: "Call us", value: school.phone },
  { icon: Mail, title: "Email us", value: school.email },
  { icon: Clock, title: "Office hours", value: "Monday – Friday · 7:30am – 4:00pm" },
];

export default function ContactPage() {
  const lat = process.env.NEXT_PUBLIC_SCHOOL_LAT ?? "8.9123";
  const lng = process.env.NEXT_PUBLIC_SCHOOL_LNG ?? "8.4066";

  return (
    <>
      <PageHero
        kicker="Contact"
        title="We would love to hear from you"
        subtitle="Reach out to our admissions office for any enquiries — we respond within one working day."
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-contact-grid">
            <Reveal variant="left">
              <div className="mkt-form-card">
                <h3 style={{ marginBottom: 18 }}>Send us a message</h3>
                <ContactForm />
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <div>
                <div className="mkt-form-card" style={{ marginBottom: 24 }}>
                  <h3 style={{ marginBottom: 6 }}>Contact details</h3>
                  {DETAILS.map((d) => {
                    const Icon = d.icon;
                    return (
                      <div key={d.title} className="mkt-contact-item">
                        <span className="mkt-contact-icon"><Icon size={19} /></span>
                        <div>
                          <strong>{d.title}</strong>
                          <span>{d.value}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <iframe
                  className="mkt-map"
                  title="De Ultimate Glory Academy location map"
                  loading="lazy"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng) - 0.01}%2C${Number(lat) - 0.01}%2C${Number(lng) + 0.01}%2C${Number(lat) + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`}
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
