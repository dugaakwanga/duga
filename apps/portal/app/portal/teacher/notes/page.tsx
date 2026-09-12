"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Button, Input, Textarea, Select, Modal, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface ClassSubjectOption {
  id: string;
  subject: { name: string };
  classGroup: { level: { name: string }; name: string };
}

interface Note {
  id: string;
  topic: string;
  content: string;
  week: number | null;
  attachments: string[] | null;
  createdAt: string;
  classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } | null };
}

// Pollinations.ai: a free, no-key, no-signup image generation endpoint — the
// image is generated on request and served directly from this URL, so there
// is nothing to upload or store server-side; the URL itself *is* the image.
function illustrationUrl(prompt: string): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&nologo=true`;
}

export default function TeacherNotesPage() {
  const [options, setOptions] = useState<ClassSubjectOption[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [groundedHint, setGroundedHint] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opts, notesRes] = await Promise.all([
        api<ClassSubjectOption[]>("teacher"),
        api<{ items: Note[] }>("learning?kind=notes"),
      ]);
      setOptions(opts);
      setNotes(notesRes.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generateFromScheme() {
    const cs = options.find((o) => o.id === form.classSubjectId);
    if (!cs) return alert("Choose a class subject first");
    setGenerating(true);
    setGroundedHint(null);
    try {
      const res = await api<{ reply: string; grounded: boolean }>("ai/draftLesson", {
        method: "POST",
        body: {
          subject: cs.subject.name,
          level: cs.classGroup.level.name,
          topic: form.topic || undefined,
          week: form.week || undefined,
        },
      });
      setForm((f) => ({ ...f, content: res.reply }));
      setGroundedHint(
        res.grounded
          ? "Drafted from your uploaded scheme of work."
          : "No matching scheme of work section found — this is a generic draft. Upload one in Settings → Scheme of Work for a curriculum-grounded draft.",
      );
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function generateIllustration() {
    const cs = options.find((o) => o.id === form.classSubjectId);
    if (!form.topic) return alert("Enter a topic first");
    const prompt = `simple educational diagram of ${form.topic} for a ${cs?.classGroup.level.name ?? "school"} ${cs?.subject.name ?? ""} class, labeled, clean line art, no watermark, no text`;
    setImageLoading(true);
    setImageUrl(illustrationUrl(prompt));
  }

  async function create() {
    if (!form.classSubjectId) return alert("Choose a class subject");
    if (!form.topic) return alert("Enter a topic");
    try {
      await api("learning", {
        method: "POST",
        body: { kind: "note", classSubjectId: form.classSubjectId, topic: form.topic, content: form.content ?? "", week: form.week ? Number(form.week) : undefined, attachments: imageUrl ? [imageUrl] : undefined },
      });
      setOpen(false);
      setForm({});
      setGroundedHint(null);
      setImageUrl(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Lesson Notes"
        subtitle="Write and share lesson notes for the classes you teach."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New note</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : notes.length === 0 ? (
        <EmptyState title="No lesson notes yet" hint="Create one using the New note button." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
          {notes.map((n) => (
            <Card key={n.id} title={n.topic}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge tone="info">{n.classSubject.subject.name}</Badge>
                {n.classSubject.classGroup && <Badge tone="neutral">{n.classSubject.classGroup.level.name} {n.classSubject.classGroup.name}</Badge>}
                {n.week ? <Badge tone="accent">Week {n.week}</Badge> : null}
              </div>
              {n.attachments?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.attachments[0]} alt={n.topic} style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
              )}
              <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px" }}>{n.content.slice(0, 200)}</p>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Added {new Date(n.createdAt).toLocaleDateString()}</div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => { setOpen(false); setGroundedHint(null); setImageUrl(null); }} title="New lesson note" wide>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>Class subject</label>
            <Select value={form.classSubjectId ?? ""} onChange={(e) => setForm({ ...form, classSubjectId: e.target.value })}>
              <option value="">Select a class subject…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.subject.name} — {o.classGroup.level.name} {o.classGroup.name}</option>
              ))}
            </Select>
          </div>
          <label style={{ fontSize: 12.5, fontWeight: 600, display: "block" }} htmlFor="topic">Topic</label>
          <Input id="topic" value={form.topic ?? ""} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Fractions and Decimals" />
          <label style={{ fontSize: 12.5, fontWeight: 600, display: "block" }} htmlFor="week">Week</label>
          <Input id="week" type="number" min={1} max={13} value={form.week ?? ""} onChange={(e) => setForm({ ...form, week: e.target.value })} placeholder="1" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }} htmlFor="content">Content</label>
            <Button type="button" variant="outline" size="sm" loading={generating} onClick={generateFromScheme}>
              <Icon name="notes" size={14} /> Generate from scheme of work
            </Button>
          </div>
          {groundedHint && <Alert tone={groundedHint.startsWith("Drafted") ? "success" : "info"}>{groundedHint}</Alert>}
          <Textarea id="content" rows={7} value={form.content ?? ""} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the lesson note (objectives, activities, summary)…, or generate one above" />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Illustration</label>
            <Button type="button" variant="outline" size="sm" onClick={generateIllustration}>
              <Icon name="notes" size={14} /> {imageUrl ? "Regenerate illustration" : "Generate illustration"}
            </Button>
          </div>
          {imageUrl && (
            <div style={{ position: "relative" }}>
              {imageLoading && <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginBottom: 6 }}>Generating…</div>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={form.topic ?? "Illustration"}
                style={{ width: "100%", maxWidth: 420, borderRadius: 10, border: "1px solid var(--duga-border)", display: imageLoading ? "none" : "block" }}
                onLoad={() => setImageLoading(false)}
                onError={() => { setImageLoading(false); alert("Couldn't generate an illustration right now — the free image service may be busy. Try again."); setImageUrl(null); }}
              />
              {!imageLoading && (
                <Button type="button" variant="ghost" size="sm" style={{ marginTop: 6 }} onClick={() => setImageUrl(null)}>Remove illustration</Button>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setOpen(false); setGroundedHint(null); setImageUrl(null); }}>Cancel</Button>
          <Button onClick={create}>Save note</Button>
        </div>
      </Modal>
    </div>
  );
}