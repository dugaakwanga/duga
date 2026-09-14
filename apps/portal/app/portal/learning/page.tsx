"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Badge, Button, Modal, Field, Input, Textarea, Alert, Spinner, EmptyState, Tabs, Icon, Select } from "@duga/ui";
import { api } from "@/lib/client/api";
import { groupClassSubjectsBySubject } from "@/lib/client/classSubjectOptions";
import LessonContent from "@/components/LessonContent";

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
  attachments?: string[] | null;
  joinLink?: string;
  classSubject: { subject: { name: string }; classGroup?: { level: { name: string }; name: string } | null; teacher?: { user: { firstName: string; lastName: string } } | null } | null;
  _count?: { questions?: number; attempts?: number; submissions?: number };
}

export default function LearningPage() {
  const [kind, setKind] = useState<Kind>("notes");
  const [items, setItems] = useState<Item[]>([]);
  const [options, setOptions] = useState<Array<{ id: string; subject: { name: string }; classGroup: { level: { name: string }; name: string } | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [role, setRole] = useState<string | null>(null);
  const [isStudent, setIsStudent] = useState(false);
  const [submitItem, setSubmitItem] = useState<Item | null>(null);
  const [submitForm, setSubmitForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [liveBusy, setLiveBusy] = useState<string | null>(null);
  // Cards only ever showed the first 160 characters with no way to read the
  // rest — for a lesson note that's most of the note gone. This opens the
  // full text (and any attachments) in a modal instead.
  const [viewItem, setViewItem] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, opts, me] = await Promise.all([
        api<{ items: Item[] }>(`learning?kind=${kind}`),
        api<Array<{ id: string; subject: { name: string }; classGroup: { level: { name: string }; name: string } | null }>>("teacher").catch(() => []),
        fetch("/api/auth/me")
          .then((r) => r.json())
          .then((j) => (j.ok ? j.user : null))
          .catch(() => null),
      ]);
      setItems(d.items);
      setOptions(opts);
      setIsStudent(me?.role === "STUDENT");
      setRole(me?.role ?? null);
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

  async function saveEdit(item: Item) {
    try {
      const body: Record<string, string> = { ...form };
      const action = kind === "notes" ? "notes" : kind === "assignments" ? "assignments" : kind === "tests" ? "tests" : "live";
      await api(`learning/${item.id}?kind=${action}`, { method: "PATCH", body });
      setOpen(false);
      setForm({});
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function openEdit(item: Item) {
    setForm({
      topic: item.topic ?? "",
      title: item.title ?? "",
      content: item.content ?? "",
      instructions: item.instructions ?? "",
      dueAt: item.dueAt ?? "",
      maxScore: String(item.maxScore ?? ""),
      description: item.description ?? "",
      scheduledAt: item.scheduledAt ?? "",
    });
    setEditItem(item);
    setOpen(true);
  }

  const [editItem, setEditItem] = useState<Item | null>(null);

  async function deleteItem(item: Item) {
    if (!confirm(`Delete this ${kind.slice(0, -1)}? This cannot be undone.`)) return;
    try {
      const action = kind === "notes" ? "deleteNote" : kind === "assignments" ? "deleteAssignment" : kind === "tests" ? "deleteTest" : "deleteLive";
      await api(`learning/${item.id}/${action}`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function submitAssignment() {
    if (!submitItem) return;
    setSubmitting(true);
    try {
      await api(`learning/${submitItem.id}/submitAssignment`, { method: "POST", body: submitForm });
      setSubmitItem(null);
      setSubmitForm({});
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function controlLive(item: Item, action: "startLive" | "endLive") {
    setLiveBusy(item.id);
    try {
      await api(`learning/${item.id}/${action}`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLiveBusy(null);
    }
  }

  async function joinLive(item: Item) {
    setLiveBusy(item.id);
    try {
      const live = await api<{ joinLink?: string | null }>(`learning/${item.id}/joinLive`, { method: "POST", body: {} });
      load();
      if (item.joinLink) window.open(item.joinLink, "_blank");
      else if (live.joinLink) window.open(live.joinLink, "_blank");
      else alert("Live class joined — your attendance has been recorded.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLiveBusy(null);
    }
  }

  // Only teaching staff manage learning content. Parents and students are
  // receivers here — parents view read-only, students get their own actions
  // (join live, submit, take test) — so neither ever sees create/edit/delete.
  const canManage = role === "TEACHER" || role === "ADMIN" || role === "OWNER";
  // Parents must never see, let alone reach, CBT tests or live interactive
  // classes — those are student-only per the RBAC spec. They keep lesson
  // notes and a read-only view of assignments to track their child's work.
  const isParent = role === "PARENT";
  const allTabs = [
    { id: "notes", label: "Lesson notes" },
    { id: "assignments", label: "Assignments" },
    { id: "tests", label: "Tests" },
    { id: "live", label: "Live classes" },
  ];
  const visibleTabs = isParent ? allTabs.filter((t) => t.id === "notes" || t.id === "assignments") : allTabs;
  const kindLabel: Record<Kind, string> = { notes: "lesson notes", assignments: "assignments", tests: "tests", live: "live classes" };

  // If a parent's kind ever lands on a restricted tab (e.g. a stale link),
  // fall back to notes rather than render/fetch restricted content.
  useEffect(() => {
    if (isParent && (kind === "tests" || kind === "live")) setKind("notes");
  }, [isParent, kind]);

  return (
    <div>
      <PageHeader
        title={isParent ? "Assignments & Lesson Notes" : role === "STUDENT" ? "My Learning" : "Learning"}
        subtitle={
          isParent
            ? "Track your child's lesson notes and assignments."
            : role === "STUDENT"
              ? "Your lesson notes, assignments, tests and live classes."
              : "Lesson notes, assignments, tests and live classes."
        }
        actions={
          canManage ? (
            // CBT tests need a question builder this page never had — the old
            // "New test" here left a test permanently stuck at zero questions
            // (its own modal said "managed via the API", which doesn't exist).
            // Teacher/CBT is the real authoring page; link there instead.
            //
            // Same problem for notes: this page's plain modal (just Topic +
            // Content) has none of Lesson Notes' scheme-of-work topic picker,
            // AI drafting, or illustrations — link to the real authoring page
            // there too instead of a second, worse way to create a note.
            kind === "tests" ? (
              <Link href="/portal/teacher/cbt" className="duga-btn duga-btn--primary duga-btn--md" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="plus" size={16} /> New test
              </Link>
            ) : kind === "notes" ? (
              <Link href="/portal/teacher/notes" className="duga-btn duga-btn--primary duga-btn--md" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="plus" size={16} /> New note
              </Link>
            ) : (
              <Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New</Button>
            )
          ) : undefined
        }
      />
      <Tabs
        tabs={visibleTabs}
        value={kind}
        onChange={(k) => setKind(k as Kind)}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title={`No ${kindLabel[kind]} yet`} hint={canManage ? "Use the New button to create one." : `${kindLabel[kind]} shared with you will appear here.`} />
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
              {kind === "notes" && item.attachments && item.attachments.some(Boolean) && (
                <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8 }}>
                  {item.attachments.filter(Boolean).map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt="" style={{ width: 100, height: 76, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                  ))}
                </div>
              )}
              {(() => {
                // Strip the inline-image token here — this is the plain-
                // text snippet; LessonContent (the "Read more" modal below)
                // is where it actually becomes a picture.
                const full = (item.content ?? item.instructions ?? item.description ?? "").replace(/\[\[ILLUSTRATION_HERE\]\]/g, " ").replace(/\s{2,}/g, " ").trim();
                const truncated = full.length > 160;
                return (
                  <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 4px", whiteSpace: "pre-wrap" }}>
                    {truncated ? `${full.slice(0, 160)}…` : full}
                    {truncated && (
                      <>
                        {" "}
                        <button
                          type="button"
                          onClick={() => setViewItem(item)}
                          style={{ background: "none", border: "none", padding: 0, color: "var(--duga-primary)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                        >
                          Read more
                        </button>
                      </>
                    )}
                  </p>
                );
              })()}
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginBottom: 8 }}>
                {kind === "assignments" && item.dueAt && <>Due: {new Date(item.dueAt).toLocaleString()}</>}
                {kind === "tests" && item._count && <> {item._count.questions ?? 0} questions</>}
                {kind === "live" && item.scheduledAt && <>Starts: {new Date(item.scheduledAt).toLocaleString()}</>}
                {kind === "live" && item.status && (
                  <>
                    {" "}· <Badge tone={item.status === "LIVE" ? "success" : item.status === "ENDED" ? "neutral" : "warning"}>{item.status}</Badge>
                  </>
                )}
                {kind === "notes" && item.week ? <>Week {item.week}</> : null}
                {kind === "notes" && canManage && (
                  <>
                    {" "}<Badge tone={item.isPublished ? "success" : "neutral"}>{item.isPublished ? "Published" : "Draft"}</Badge>
                  </>
                )}
              </div>
              {kind === "live" && item.status === "LIVE" && (
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {isStudent ? (
                    <Button size="sm" variant="accent" loading={liveBusy === item.id} onClick={() => joinLive(item)}>Join live class</Button>
                  ) : canManage ? (
                    <>
                      {item.joinLink && (
                        <a href={item.joinLink} target="_blank" rel="noreferrer" className="duga-btn duga-btn--accent duga-btn--sm">Open session</a>
                      )}
                      <Button size="sm" variant="outline" loading={liveBusy === item.id} onClick={() => controlLive(item, "endLive")}>End class</Button>
                    </>
                  ) : null}
                </div>
              )}
              {kind === "live" && item.status !== "LIVE" && canManage && (
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {item.status === "SCHEDULED" && (
                    <Button size="sm" variant="accent" loading={liveBusy === item.id} onClick={() => controlLive(item, "startLive")}>Start class</Button>
                  )}
                  {item.status === "ENDED" && item.joinLink && (
                    <a href={item.joinLink} target="_blank" rel="noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">Replay</a>
                  )}
                </div>
              )}
              {kind === "live" && item.joinLink && isStudent && (
                <a href={item.joinLink} target="_blank" rel="noreferrer" className="duga-btn duga-btn--accent duga-btn--sm" style={{ marginTop: 10, display: "inline-flex" }}>
                  Join live class
                </a>
              )}
              {kind === "assignments" && isStudent && (
                <div style={{ marginTop: 10 }}>
                  <Button size="sm" variant="accent" onClick={() => { setSubmitItem(item); setSubmitForm({}); }}>Submit assignment</Button>
                </div>
              )}
              {kind === "tests" && item.status === "PUBLISHED" && isStudent && (
                <Link href={`/portal/learning/take/${item.id}`} className="duga-btn duga-btn--accent duga-btn--sm" style={{ marginTop: 10, display: "inline-flex" }}>
                  Take this test
                </Link>
              )}
              {canManage && (
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteItem(item)}>Delete</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => { setOpen(false); setEditItem(null); }} title={`${editItem ? "Edit" : "New"} ${kind === "tests" ? "test" : kind === "live" ? "live class" : kind.slice(0, -1)}`} wide>
        {!editItem && (
        <Field label="Class subject" required>
          <Select value={form.classSubjectId ?? ""} onChange={(e) => setForm({ ...form, classSubjectId: e.target.value })}>
            <option value="">Select a class subject…</option>
            {groupClassSubjectsBySubject(options).map((g) => (
              <optgroup key={g.subject} label={g.subject}>
                {g.items.map((o) => (
                  <option key={o.id} value={o.id}>{o.classGroup?.level.name ?? ""} {o.classGroup?.name ?? ""}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        )}
        <Field label={kind === "notes" ? "Topic" : "Title"} required>
          <Input value={form.title ?? form.topic ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value, topic: e.target.value })} />
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
          <Button variant="ghost" onClick={() => { setOpen(false); setEditItem(null); }}>Cancel</Button>
          <Button onClick={() => (editItem ? saveEdit(editItem) : createItem())}>{editItem ? "Save changes" : "Create"}</Button>
        </div>
      </Modal>

      <Modal open={!!submitItem} onClose={() => setSubmitItem(null)} title={submitItem ? `Submit — ${submitItem.title ?? ""}` : "Submit assignment"}>
        <Field label="Your answer" hint="Type or paste your completed work below.">
          <Textarea rows={6} value={submitForm.content ?? ""} onChange={(e) => setSubmitForm({ ...submitForm, content: e.target.value })} />
        </Field>
        <Field label="Attachment link" hint="Optional — paste a link to your file or upload URL (e.g. Google Drive).">
          <Input value={submitForm.attachments ?? ""} onChange={(e) => setSubmitForm({ ...submitForm, attachments: e.target.value })} placeholder="https://…" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setSubmitItem(null)}>Cancel</Button>
          <Button loading={submitting} onClick={submitAssignment}>Submit</Button>
        </div>
      </Modal>

      <Modal open={!!viewItem} onClose={() => setViewItem(null)} title={viewItem?.topic ?? viewItem?.title ?? ""} wide>
        {viewItem && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Badge tone="info">{viewItem.classSubject?.subject?.name ?? "—"}</Badge>
              {viewItem.classSubject?.classGroup && (
                <Badge tone="neutral">{viewItem.classSubject.classGroup.level.name} {viewItem.classSubject.classGroup.name}</Badge>
              )}
              {viewItem.week ? <Badge tone="accent">Week {viewItem.week}</Badge> : null}
            </div>
            {kind === "notes" ? (
              // Renders headings/bullets/paragraphs like a real document and
              // drops each image in exactly where the AI placed it in the
              // text, instead of a flat gallery disconnected from the words
              // that describe it.
              <LessonContent content={viewItem.content ?? ""} images={viewItem.attachments ?? []} />
            ) : (
              <>
                {viewItem.attachments && viewItem.attachments.some(Boolean) && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {viewItem.attachments.filter(Boolean).map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="" style={{ width: 220, height: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--duga-border)" }} />
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--duga-ink-2)", whiteSpace: "pre-wrap", margin: 0 }}>
                  {viewItem.content ?? viewItem.instructions ?? viewItem.description ?? ""}
                </p>
              </>
            )}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setViewItem(null)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}
