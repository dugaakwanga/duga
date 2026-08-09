import { Reveal } from "@/components/motion";

export default function PageHero({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="mkt-page-hero">
      <div className="mkt-container" style={{ position: "relative" }}>
        <Reveal>
          <div className="mkt-breadcrumb">{kicker}</div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </Reveal>
      </div>
    </section>
  );
}
