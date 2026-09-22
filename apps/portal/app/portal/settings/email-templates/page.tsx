"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, Field, Textarea, Button, Badge, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface EmailCopy {
  greeting: string;
  intro: string;
  closing: string;
  signOff: string;
}

interface TemplateItem {
  type: string;
  label: string;
  default: EmailCopy;
  custom: Partial<EmailCopy> | null;
}

interface SmsCopy {
  greeting: string;
  closing: string;
}

const FIELDS: Array<{ key: keyof EmailCopy; label: string; hint: string }> = [
  { key: "greeting", label: "Greeting", hint: "Use {{name}} to insert the recipient's name — falls back to \"Parent/Guardian\" when it isn't known." },
  { key: "intro", label: "Opening line", hint: "The sentence right after the greeting, before the actual fact (amount, admission number, etc.)." },
  { key: "closing", label: "Closing note", hint: "Comes after the fact — reassurance, next steps, an invitation to reach out." },
  { key: "signOff", label: "Sign-off", hint: "Shown after \"Warm regards,\" — e.g. \"De Ultimate Glory Academy\" or \"DUGA Admissions\"." },
];

export default function EmailTemplatesPage() {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [form, setForm] = useState<EmailCopy>({ greeting: "", intro: "", closing: "", signOff: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // The main Settings page is owner-only, but admin can reach this page
  // directly from the sidebar — a "back to Settings" link would 403 for
  // them, so it only shows up for whoever can actually load that page.
  const [canSeeMainSettings, setCanSeeMainSettings] = useState(false);

  const [smsForm, setSmsForm] = useState<SmsCopy>({ greeting: "", closing: "" });
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsSaved, setSmsSaved] = useState(false);
  const [smsPreview, setSmsPreview] = useState<{ text: string; length: number; segments: number } | null>(null);
  const [smsPreviewLoading, setSmsPreviewLoading] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsSentMsg, setSmsSentMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => j.ok && setCanSeeMainSettings(j.user.role === "OWNER"));
  }, []);

  function load() {
    api<{ items: TemplateItem[]; smsFeeReminder: SmsCopy }>("emailTemplates")
      .then((d) => {
        setItems(d.items);
        setSmsForm(d.smsFeeReminder);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  async function saveSms() {
    setSmsSaving(true);
    setSmsSaved(false);
    try {
      await api("emailTemplates/saveSms", { method: "POST", body: smsForm });
      setSmsSaved(true);
      setSmsPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSmsSaving(false);
    }
  }

  async function resetSms() {
    setSmsSaving(true);
    try {
      await api("emailTemplates/resetSms", { method: "POST", body: {} });
      setSmsSaved(true);
      setSmsPreview(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSmsSaving(false);
    }
  }

  async function previewSms() {
    setSmsPreviewLoading(true);
    try {
      const d = await api<{ text: string; length: number; segments: number }>("emailTemplates/previewSms", { method: "POST", body: smsForm, loading: false });
      setSmsPreview(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSmsPreviewLoading(false);
    }
  }

  async function sendSmsNow() {
    if (!confirm("Send this week's school-fee SMS reminder right now, to every parent with an owing child?")) return;
    setSmsSending(true);
    setSmsSentMsg(null);
    try {
      const d = await api<{ sent: number }>("fees/sendSchoolFeeSmsRemindersNow", { method: "POST", body: {} });
      setSmsSentMsg(`Sent to ${d.sent} parent${d.sent === 1 ? "" : "s"}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSmsSending(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openType(item: TemplateItem) {
    setActive(item.type);
    setSaved(false);
    setPreviewHtml(null);
    setForm({
      greeting: item.custom?.greeting ?? item.default.greeting,
      intro: item.custom?.intro ?? item.default.intro,
      closing: item.custom?.closing ?? item.default.closing,
      signOff: item.custom?.signOff ?? item.default.signOff,
    });
  }

  const activeItem = items.find((i) => i.type === active) ?? null;
  const isCustomized = Boolean(activeItem?.custom);

  async function save() {
    if (!active) return;
    setSaving(true);
    setSaved(false);
    try {
      await api("emailTemplates/save", { method: "POST", body: { type: active, ...form } });
      setSaved(true);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!active || !activeItem) return;
    setSaving(true);
    try {
      await api("emailTemplates/reset", { method: "POST", body: { type: active } });
      setForm({ ...activeItem.default });
      setSaved(true);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    if (!active) return;
    setPreviewLoading(true);
    try {
      const d = await api<{ html: string }>("emailTemplates/preview", { method: "POST", body: { type: active, ...form }, loading: false });
      setPreviewHtml(d.html);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading) return <Spinner size={28} />;

  return (
    <div>
      <PageHeader
        title="Email templates"
        subtitle="Edit the wording of the letter-style parts of each notification email — the actual fact (amount, name, admission number) always comes from live data."
        actions={
          canSeeMainSettings ? (
            <Link href="/portal/settings" className="duga-btn duga-btn--ghost duga-btn--sm" style={{ display: "inline-flex" }}>
              ← Settings
            </Link>
          ) : undefined
        }
      />
      <Card title="Weekly school-fee SMS reminder" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 12 }}>
          Sent once a week (Monday mornings) to every parent with at least one child owing on the core school fee — one text per parent, listing all of their owing children together. Use <code>{"{parent}"}</code>, <code>{"{children}"}</code> (auto-generated: e.g. &quot;John owes ₦45,000&quot;) and <code>{"{dueDate}"}</code>. The school&apos;s name isn&apos;t repeated in the body since it already shows as the sender.
        </div>
        <Field label="Greeting + fact" hint="Must include {children} — this is where the owing list goes.">
          <Textarea rows={2} value={smsForm.greeting} onChange={(e) => setSmsForm({ ...smsForm, greeting: e.target.value })} />
        </Field>
        <Field label="Closing">
          <Textarea rows={2} value={smsForm.closing} onChange={(e) => setSmsForm({ ...smsForm, closing: e.target.value })} />
        </Field>
        {smsSaved && <Alert tone="success">Saved.</Alert>}
        {smsSentMsg && <Alert tone="success">{smsSentMsg}</Alert>}
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <Button onClick={saveSms} loading={smsSaving}>Save</Button>
          <Button variant="outline" onClick={previewSms} loading={smsPreviewLoading}>Preview</Button>
          <Button variant="ghost" onClick={resetSms} disabled={smsSaving}>Reset to default</Button>
          <Button variant="danger" onClick={sendSmsNow} loading={smsSending}>Send now (test)</Button>
        </div>
        {smsPreview && (
          <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--duga-border)", borderRadius: 10, background: "var(--duga-surface-2, #f4f6f9)" }}>
            <div style={{ fontSize: 13.5 }}>{smsPreview.text}</div>
            <div style={{ fontSize: 12, color: "var(--duga-muted)", marginTop: 8 }}>
              {smsPreview.length} characters · {smsPreview.segments} SMS segment{smsPreview.segments === 1 ? "" : "s"}
              {smsPreview.segments > 1 && " — this parent's owing-children list didn't fit in one segment, so this costs 2 credits instead of 1."}
            </div>
          </div>
        )}
      </Card>

      <div className="duga-split-2">
        <Card title="Notification types" pad={false}>
          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            {items.map((item) => (
              <button
                key={item.type}
                onClick={() => openType(item)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 16px",
                  border: "none",
                  borderBottom: "1px solid var(--duga-border)",
                  background: active === item.type ? "var(--duga-surface-2)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{item.label}</span>
                {item.custom && <Badge tone="accent">Customized</Badge>}
              </button>
            ))}
          </div>
        </Card>

        <div>
          {!activeItem ? (
            <Card>
              <EmptyState title="Choose a notification type" hint="Pick one on the left to edit its email wording." />
            </Card>
          ) : (
            <Card title={activeItem.label}>
              {isCustomized && (
                <Alert tone="info">
                  This type has custom wording. Clear a field and save to fall back to the built-in default for it.
                </Alert>
              )}
              {FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Textarea
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    rows={f.key === "greeting" || f.key === "signOff" ? 2 : 4}
                  />
                </Field>
              ))}
              {saved && <Alert tone="success">Saved.</Alert>}
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <Button onClick={save} loading={saving}>Save</Button>
                <Button variant="outline" onClick={runPreview} loading={previewLoading}>
                  <Icon name="check" size={16} /> Preview email
                </Button>
                {isCustomized && (
                  <Button variant="ghost" onClick={resetToDefault} disabled={saving}>
                    Reset to default
                  </Button>
                )}
              </div>
            </Card>
          )}

          {previewHtml && (
            <Card title="Preview" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginBottom: 10 }}>
                Rendered with sample data — this is exactly what a real send looks like with your current wording.
              </div>
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                style={{ width: "100%", height: 640, border: "1px solid var(--duga-border)", borderRadius: 10, background: "#eae9e6" }}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
