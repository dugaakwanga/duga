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
  createdAt: string;
  classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } | null };
}

export default function TeacherNotesPage() {
  const [options, setOptions] = useState<ClassSubjectOption[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

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

  async function create() {
    if (!form.classSubjectId) return alert("Choose a class subject");
    if (!form.topic) return alert("Enter a topic");
    try {
      await api("learning", {
        method: "POST",
        body: { kind: "note", classSubjectId: form.classSubjectId, topic: form.topic, content: form.content ?? "", week: form.week ? Number(form.week) : undefined },
      });
      setOpen(false);
      setForm({});
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
              <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px" }}>{n.content.slice(0, 200)}</p>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>Added {new Date(n.createdAt).toLocaleDateString()}</div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New lesson note" wide>
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
          <label style={{ fontSize: 12.5, fontWeight: 600, display: "block" }} htmlFor="content">Content</label>
          <Textarea id="content" rows={7} value={form.content ?? ""} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the lesson note (objectives, activities, summary)…" />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create}>Save note</Button>
        </div>
      </Modal>
    </div>
  );
}