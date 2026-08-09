"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Badge, Button, Modal, Field, Input, Textarea, Alert, Spinner, EmptyState, Tabs, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

type Kind = "notes" | "assignments" | "tests" | "live";

interface Item {
  id: string;
  topic?: string;
  title?: string;
  content?: string;
  instructions?: string;
  description?: string;
  dueAt?: string;
  scheduledAt?: string;
  week?: number | null;
  status?: string;
  maxScore?: number;
  isPublished?: boolean;
  joinLink?: string;
  classSubject: { subject: { name: string }; classGroup?: { level: { name: string }; name: string } | null; teacher?: { user: { firstName: string; lastName: string } } | null } | null;
  _count?: { questions?: number; attempts?: number; submissions?: number };
}

export default function LearningPage() {
  const [kind, setKind] = useState<Kind>("notes");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [isStudent, setIsStudent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ items: Item[] }>(`learning?kind=${kind}`);
      setItems(d.items);
      const me = await api<{ role: string }>("auth/me").catch(() => null);
      setIsStudent(me?.role === "STUDENT");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  async function createItem() {
    try {
      await api("learning", { method: "POST", body: { ...form, kind: kind === "tests" ? "test" : kind === "assignments" ? "assignment" : kind === "live" ? "live" : "note" } });
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
        title="Learning"
        subtitle="Lesson notes, assignments, tests and live classes."
        actions={!isStudent ? <Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New</Button> : undefined}
      />
      <Tabs
        tabs={[
          { id: "notes", label: "Lesson notes" },
          { id: "assignments", label: "Assignments" },
          { id: "tests", label: "Tests" },
          { id: "live", label: "Live classes" },
        ]}
        value={kind}
        onChange={(k) => setKind(k as Kind)}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title={`No ${kind} yet`} hint="Use the New button to create one." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
          {items.map((item) => (
            <Card key={item.id} title={item.topic ?? item.title ?? "Untitled"}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge tone="info">{item.classSubject?.subject?.name ?? "—"}</Badge>
                {item.classSubject?.classGroup && (
                  <Badge tone="neutral">{item.classSubject.classGroup.level.name} {item.classSubject.classGroup.name}</Badge>
                )}
              </div>
              <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px" }}>
                {(item.content ?? item.instructions ?? item.description ?? "").slice(0, 160)}
              </p>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>
                {kind === "assignments" && item.dueAt && <>Due: {new Date(item.dueAt).toLocaleString()}</>}
                {kind === "tests" && item._count && <> {item._count.questions ?? 0} questions</>}
                {kind === "live" && item.scheduledAt && <>Starts: {new Date(item.scheduledAt).toLocaleString()}</>}
                {kind === "notes" && item.week ? <>Week {item.week}</> : null}
              </div>
              {kind === "live" && item.joinLink && (
                <a href={item.joinLink} target="_blank" rel="noreferrer" className="duga-btn duga-btn--accent duga-btn--sm" style={{ marginTop: 10, display: "inline-flex" }}>
                  Join live class
                </a>
              )}
              {kind === "tests" && item.status === "PUBLISHED" && isStudent && (
                <Link href={`/portal/learning/take/${item.id}`} className="duga-btn duga-btn--accent duga-btn--sm" style={{ marginTop: 10, display: "inline-flex" }}>
                  Take this test
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={`New ${kind === "tests" ? "test" : kind === "live" ? "live class" : kind.slice(0, -1)}`} wide>
        <Field label={kind === "notes" ? "Topic" : "Title"} required>
          <Input value={form.title ?? form.topic ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value, topic: e.target.value })} />
        </Field>
        <Field label="Class subject ID" required>
          <Input value={form.classSubjectId ?? ""} onChange={(e) => setForm({ ...form, classSubjectId: e.target.value })} placeholder="ClassSubject ID" />
        </Field>
        {kind === "notes" && (
          <Field label="Content">
            <Textarea rows={6} value={form.content ?? ""} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
        )}
        {kind === "assignments" && (
          <>
            <Field label="Instructions">
              <Textarea rows={4} value={form.instructions ?? ""} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </Field>
            <Field label="Due at">
              <Input type="datetime-local" value={form.dueAt ?? ""} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
            </Field>
            <Field label="Max score">
              <Input value={form.maxScore ?? ""} onChange={(e) => setForm({ ...form, maxScore: e.target.value })} placeholder="100" />
            </Field>
          </>
        )}
        {kind === "tests" && (
          <>
            <Field label="Description">
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Duration (minutes)">
              <Input value={form.durationMinutes ?? ""} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} placeholder="30" />
            </Field>
            <Alert tone="info">Questions are managed by editing the test after creation (API).</Alert>
          </>
        )}
        {kind === "live" && (
          <>
            <Field label="Scheduled at" required>
              <Input type="datetime-local" value={form.scheduledAt ?? ""} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={createItem}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}
