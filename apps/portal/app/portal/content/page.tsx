"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Field, Input, Textarea, Button, Alert, Spinner, Badge } from "@duga/ui";
import { api } from "@/lib/client/api";

interface StatItem {
  value: number;
  suffix: string;
  label: string;
}

interface SiteContent {
  ticker: string[];
  hero: { eyebrow: string; lead: string };
  stats: StatItem[];
  footer: { about: string; tagline: string };
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
          ticker: content.ticker.join("\n"),
          heroEyebrow: content.hero.eyebrow,
          heroLead: content.hero.lead,
          stats: content.stats,
          footerAbout: content.footer.about,
          footerTagline: content.footer.tagline,
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
        subtitle="Edit the text shown on the public DUGA website — announcements, hero and footer copy."
        actions={<Button variant="danger" size="sm" onClick={reset}>Reset to defaults</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
        <Card title="Announcement ticker">
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
