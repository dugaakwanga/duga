import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import ContactForm from "@/components/ContactForm";
import { Reveal } from "@/components/motion";
import { Pin, Phone, Mail, Clock } from "@/components/icons";
import { school as fallbackSchool } from "@/lib/content";
import { getSiteData, mergeContent } from "@/lib/site-data";
import { normalizePages } from "@duga/core";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact De Ultimate Glory Academy, Akwanga, Nasarawa State. Call, email or visit our campus.",
};

export default async function ContactPage() {
  const lat = process.env.NEXT_PUBLIC_SCHOOL_LAT ?? "8.9123";
  const lng = process.env.NEXT_PUBLIC_SCHOOL_LNG ?? "8.4066";

  const { school, content: raw } = await getSiteData();
  const content = mergeContent(raw);
  const pages = normalizePages(content.pages);
  const p = pages.contact ?? {};
  const heroTitle = String(p.heroTitle ?? "");
  const heroSubtitle = String(p.heroSubtitle ?? "");
  const formHeading = String(p.formHeading ?? "");
  const detailsHeading = String(p.detailsHeading ?? "");
  const info = {
    address: school?.address ?? fallbackSchool.address,
    phone: school?.phone ?? fallbackSchool.phone,
    email: school?.email ?? fallbackSchool.email,
    hours: content.contact.hours || "Monday – Friday · 7:30am – 4:00pm",
  };

  const DETAILS = [
    { icon: Pin, title: "Visit us", value: info.address },
    { icon: Phone, title: "Call us", value: info.phone },
    { icon: Mail, title: "Email us", value: info.email },
    { icon: Clock, title: "Office hours", value: info.hours },
  ];

  return (
    <>
      <PageHero
        kicker="Contact"
        title={heroTitle}
        subtitle={heroSubtitle}
      />
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-contact-grid">
            <Reveal variant="left">
              <div className="mkt-form-card">
                <h3 style={{ marginBottom: 18 }}>{formHeading}</h3>
                <ContactForm />
              </div>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <div>
                <div className="mkt-form-card" style={{ marginBottom: 24 }}>
                  <h3 style={{ marginBottom: 6 }}>{detailsHeading}</h3>
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
