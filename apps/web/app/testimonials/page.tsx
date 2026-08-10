import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import { Reveal } from "@/components/motion";
import { getSiteData, mergeContent } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Testimonials",
  description:
    "What parents and alumni say about De Ultimate Glory Academy — real words from the DUGA family.",
};

export default async function TestimonialsPage() {
  const { content: raw } = await getSiteData();
  const content = mergeContent(raw);

  return (
    <>
      <PageHero
        kicker="Testimonials"
        title="Words from our school family"
        subtitle="Parents, pupils and alumni share what De Ultimate Glory Academy means to them."
      />

      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-grid mkt-grid--2" style={{ rowGap: 24 }}>
            {content.testimonials.map((t, i) => (
              <Reveal key={t.name || i} delay={(i % 2) * 90}>
                <figure className="mkt-card mkt-quote">
                  <span className="mkt-quote-mark" aria-hidden="true">
                    “
                  </span>
                  <blockquote>{t.quote}</blockquote>
                  <footer>
                    <span className="mkt-avatar">
                      {t.name
                        .split(" ")
                        .map((w) => w[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div>
                      <strong>{t.name}</strong>
                      <span>{t.role}</span>
                    </div>
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
