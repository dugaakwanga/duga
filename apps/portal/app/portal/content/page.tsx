"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Field, Input, Textarea, Button, Alert, Spinner, Badge } from "@duga/ui";
import { api } from "@/lib/client/api";

interface StatItem {
  value: number;
  suffix: string;
  label: string;
}

interface RowFields {
  fields: Array<{ key: string; label: string; type?: "text" | "area" | "number" }>;
}

function RowList<T extends Record<string, unknown>>({ rows, fields, onChange, addLabel, newRow }: {
  rows: T[];
  fields: RowFields["fields"];
  onChange: (rows: T[]) => void;
  addLabel: string;
  newRow: () => T;
}) {
  const set = (i: number, patch: Partial<T>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ border: "1px solid var(--duga-border)", borderRadius: 12, padding: 12, display: "grid", gap: 8, background: "var(--duga-surface)" }}>
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "area" ? (
                <Textarea rows={2} value={String(r[f.key] ?? "")} onChange={(e) => set(i, { [f.key]: e.target.value } as Partial<T>)} />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={String(r[f.key] ?? "")}
                  onChange={(e) => set(i, { [f.key]: f.type === "number" ? Number(e.target.value) || 0 : e.target.value } as Partial<T>)}
                />
              )}
            </Field>
          ))}
          <div>
            <Button variant="danger" size="sm" onClick={() => remove(i)}>Remove</Button>
          </div>
        </div>
      ))}
      <Button size="sm" onClick={() => onChange([...rows, newRow()])}>{addLabel}</Button>
    </div>
  );
}

interface SiteContent {
  tickerEnabled: boolean;
  ticker: string[];
  values: string[];
  hero: { eyebrow: string; lead: string };
  stats: StatItem[];
  highlights: Array<{ title: string; text: string }>;
  programmes: Array<{ img: string; tag: string; title: string; schedule: string; ages: string; text: string; href: string; cta: string }>;
  offers: Array<{ title: string; sub: string; href: string }>;
  sections: Array<{ kicker: string; title: string; text: string; href: string; link: string; img: string; alt: string; caption: string }>;
  testimonials: Array<{ quote: string; name: string; role: string }>;
  footer: { about: string; tagline: string };
  contact: { motto: string; founded: number; hours: string };
}

export default function ContentPage() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<SiteContent>("content")
      .then((d) => setContent(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!content) return;
    setError(null);
    setSaved(false);
    try {
      const d = await api<SiteContent>("content/save", {
        method: "POST",
        body: {
          tickerEnabled: content.tickerEnabled,
          ticker: content.ticker.join("\n"),
          values: content.values.join("\n"),
          heroEyebrow: content.hero.eyebrow,
          heroLead: content.hero.lead,
          stats: content.stats,
          highlights: content.highlights,
          programmes: content.programmes,
          offers: content.offers,
          sections: content.sections,
          testimonials: content.testimonials,
          footerAbout: content.footer.about,
          footerTagline: content.footer.tagline,
          contactMotto: content.contact.motto,
          contactFounded: content.contact.founded,
          contactHours: content.contact.hours,
        },
      });
      setContent(d);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reset() {
    if (!confirm("Reset website content to the default values?")) return;
    setError(null);
    try {
      const d = await api<SiteContent>("content/reset", { method: "POST" });
      setContent(d);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !content) return <Spinner size={28} />;

  const set = (patch: Partial<SiteContent>) => setContent((c) => (c ? { ...c, ...patch } : c));

  return (
    <div>
      <PageHeader
        title="Website content"
        subtitle="Edit everything shown on the public DUGA website — announcements, hero, sections, programmes, testimonials and contact info. Changes reflect on the website immediately."
        actions={<Button variant="danger" size="sm" onClick={reset}>Reset to defaults</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
        <Card title="Scrolling ticker (top banner)">
          <Field label="Show the scrolling banner" hint="Turn the top announcement banner off or on.">
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={content.tickerEnabled}
                onChange={(e) => set({ tickerEnabled: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              <span>{content.tickerEnabled ? "Visible (scrolling)" : "Hidden (stopped)"}</span>
            </label>
          </Field>
          <Field
            label="Ticker items"
            hint="One announcement per line. These scroll across the top of the website."
          >
            <Textarea
              rows={7}
              value={content.ticker.join("\n")}
              onChange={(e) => set({ ticker: e.target.value.split("\n") })}
            />
          </Field>
        </Card>

        <Card title="Values marquee (homepage)">
          <Field label="Marquee values" hint="One word per line. These scroll through the middle of the homepage.">
            <Textarea
              rows={7}
              value={content.values.join("\n")}
              onChange={(e) => set({ values: e.target.value.split("\n") })}
            />
          </Field>
        </Card>

        <Card title="Hero (homepage)">
          <Field label="Eyebrow line">
            <Input
              value={content.hero.eyebrow}
              onChange={(e) => set({ hero: { ...content.hero, eyebrow: e.target.value } })}
            />
          </Field>
          <Field label="Hero intro paragraph" hint="Shown under the school name on the homepage.">
            <Textarea
              rows={4}
              value={content.hero.lead}
              onChange={(e) => set({ hero: { ...content.hero, lead: e.target.value } })}
            />
          </Field>
        </Card>

        <Card title="Hero stats" pad={false}>
          <div style={{ padding: 16 }}>
            {content.stats.map((s, i) => (
              <div key={i} className="duga-hero-stat-row">
                <Input
                  value={String(s.value)}
                  placeholder="Value"
                  onChange={(e) => {
                    const stats = [...content.stats];
                    stats[i] = { ...s, value: Number(e.target.value) || 0 };
                    set({ stats });
                  }}
                />
                <Input
                  value={s.suffix}
                  placeholder="+"
                  onChange={(e) => {
                    const stats = [...content.stats];
                    stats[i] = { ...s, suffix: e.target.value };
                    set({ stats });
                  }}
                />
                <Input
                  value={s.label}
                  placeholder="Label"
                  onChange={(e) => {
                    const stats = [...content.stats];
                    stats[i] = { ...s, label: e.target.value };
                    set({ stats });
                  }}
                />
              </div>
            ))}
            <Badge tone="neutral">Shown on the homepage hero &amp; stat band.</Badge>
          </div>
        </Card>

        <Card title="Why DUGA (highlights)">
          <RowList
            rows={content.highlights}
            fields={[
              { key: "title", label: "Title" },
              { key: "text", label: "Text", type: "area" },
            ]}
            onChange={(highlights) => set({ highlights })}
            addLabel="Add highlight"
            newRow={() => ({ title: "", text: "" })}
          />
        </Card>

        <Card title="Featured programmes">
          <RowList
            rows={content.programmes}
            fields={[
              { key: "title", label: "Card title" },
              { key: "tag", label: "Tag badge" },
              { key: "schedule", label: "Schedule" },
              { key: "ages", label: "Ages" },
              { key: "text", label: "Text", type: "area" },
              { key: "href", label: "Link (e.g. /academics#primary)" },
              { key: "cta", label: "Button label" },
              { key: "img", label: "Image URL (leave empty for default)" },
            ]}
            onChange={(programmes) => set({ programmes })}
            addLabel="Add programme"
            newRow={() => ({ img: "", tag: "", title: "", schedule: "", ages: "", text: "", href: "", cta: "" })}
          />
        </Card>

        <Card title="Our Offerings (tiles)">
          <RowList
            rows={content.offers}
            fields={[
              { key: "title", label: "Title" },
              { key: "sub", label: "Subtitle" },
              { key: "href", label: "Link (leave empty for the portal)" },
            ]}
            onChange={(offers) => set({ offers })}
            addLabel="Add offering"
            newRow={() => ({ title: "", sub: "", href: "" })}
          />
        </Card>

        <Card title="Primary &amp; Secondary sections">
          <RowList
            rows={content.sections}
            fields={[
              { key: "kicker", label: "Kicker (e.g. Nursery · Primary 1–6)" },
              { key: "title", label: "Heading" },
              { key: "text", label: "Body text", type: "area" },
              { key: "href", label: "Link" },
              { key: "link", label: "Link label" },
              { key: "img", label: "Image URL (leave empty for default)" },
              { key: "alt", label: "Image alt text" },
              { key: "caption", label: "Image caption" },
            ]}
            onChange={(sections) => set({ sections })}
            addLabel="Add section"
            newRow={() => ({ kicker: "", title: "", text: "", href: "", link: "", img: "", alt: "", caption: "" })}
          />
        </Card>

        <Card title="Testimonials">
          <RowList
            rows={content.testimonials}
            fields={[
              { key: "quote", label: "Quote", type: "area" },
              { key: "name", label: "Name" },
              { key: "role", label: "Role" },
            ]}
            onChange={(testimonials) => set({ testimonials })}
            addLabel="Add testimonial"
            newRow={() => ({ quote: "", name: "", role: "" })}
          />
        </Card>

        <Card title="Contact &amp; school info">
          <Field label="Motto">
            <Input
              value={content.contact.motto}
              onChange={(e) => set({ contact: { ...content.contact, motto: e.target.value } })}
            />
          </Field>
          <Field label="Year founded">
            <Input
              type="number"
              value={String(content.contact.founded)}
              onChange={(e) => set({ contact: { ...content.contact, founded: Number(e.target.value) || 2006 } })}
            />
          </Field>
          <Field label="Opening hours" hint="Shown in the footer and on the contact page.">
            <Input
              value={content.contact.hours}
              onChange={(e) => set({ contact: { ...content.contact, hours: e.target.value } })}
            />
          </Field>
          <Badge tone="neutral">Phone, email &amp; address are managed in School settings.</Badge>
        </Card>

        <Card title="Footer">
          <Field label="About blurb">
            <Textarea
              rows={3}
              value={content.footer.about}
              onChange={(e) => set({ footer: { ...content.footer, about: e.target.value } })}
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={content.footer.tagline}
              onChange={(e) => set({ footer: { ...content.footer, tagline: e.target.value } })}
            />
          </Field>
        </Card>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20 }}>
        <Button onClick={save}>Save content</Button>
        {saved && <Alert tone="success">Saved.</Alert>}
      </div>
    </div>
  );
}
