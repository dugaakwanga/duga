"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Card, Badge, Button, Input, Textarea, Select, Modal, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { groupClassSubjectsBySubject } from "@/lib/client/classSubjectOptions";

interface ClassSubjectOption {
  id: string;
  subject: { name: string };
  classGroup: { level: { name: string }; name: string };
}

interface Note {
  id: string;
  classSubjectId: string;
  topic: string;
  content: string;
  week: number | null;
  attachments: string[] | null;
  isPublished: boolean;
  createdAt: string;
  classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } | null };
}

// Pollinations.ai: a free, no-key, no-signup image generation endpoint — the
// image is generated on request and served directly from this URL, so there
// is nothing to upload or store server-side; the URL itself *is* the image.
function illustrationUrl(prompt: string): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&nologo=true`;
}

const emptyForm = (): Record<string, string> => ({});

export default function TeacherNotesPage() {
  const [options, setOptions] = useState<ClassSubjectOption[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm());
  const [generating, setGenerating] = useState(false);
  const [groundedHint, setGroundedHint] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Topic picker: real weeks/topics from the scheme of work for whichever
  // class subject is selected, so a teacher chooses a topic the school
  // actually assigned instead of typing one freehand — "Custom topic" stays
  // available for subjects with nothing uploaded, or off-scheme notes.
  const [schemeTopics, setSchemeTopics] = useState<Array<{ week: string | null; topic: string; term: string | null }>>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [customTopic, setCustomTopic] = useState(false);

  useEffect(() => {
    const cs = options.find((o) => o.id === form.classSubjectId);
    setCustomTopic(false);
    if (!cs) {
      setSchemeTopics([]);
      return;
    }
    setTopicsLoading(true);
    api<{ topics: Array<{ week: string | null; topic: string; term: string | null }> }>("scheme/topics", {
      query: { subjectName: cs.subject.name, levelName: cs.classGroup.level.name },
    })
      .then((d) => setSchemeTopics(d.topics))
      .catch(() => setSchemeTopics([]))
      .finally(() => setTopicsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.classSubjectId]);

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

  function resetModal() {
    setOpen(false);
    setEditId(null);
    setForm(emptyForm());
    setGroundedHint(null);
    setImages([]);
  }

  function openNew() {
    setEditId(null);
    setForm(emptyForm());
    setGroundedHint(null);
    setImages([]);
    setOpen(true);
  }

  function openEdit(n: Note) {
    setEditId(n.id);
    setForm({
      classSubjectId: n.classSubjectId,
      topic: n.topic,
      content: n.content,
      week: n.week ? String(n.week) : "",
    });
    setGroundedHint(null);
    setImages(n.attachments ?? []);
    setOpen(true);
  }

  // Loads an image and resolves its URL once ready, or rejects — same probe
  // technique as generateIllustration, wrapped as a promise so it can be
  // awaited inline while a draft is being assembled.
  function loadIllustration(prompt: string): Promise<string> {
    const url = illustrationUrl(prompt);
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve(url);
      probe.onerror = () => reject(new Error("image failed"));
      probe.src = url;
    });
  }

  async function generateFromScheme() {
    const cs = options.find((o) => o.id === form.classSubjectId);
    if (!cs) return alert("Choose a class subject first");
    setGenerating(true);
    setGroundedHint(null);
    try {
      const res = await api<{ reply: string; grounded: boolean; illustrations?: string[] }>("ai/draftLesson", {
        method: "POST",
        body: {
          subject: cs.subject.name,
          level: cs.classGroup.level.name,
          topic: form.topic || undefined,
          week: form.week || undefined,
        },
      });
      setForm((f) => ({ ...f, content: res.reply }));
      const base = res.grounded
        ? "Drafted from your uploaded scheme of work."
        : "No matching scheme of work section found — this is a generic draft. Upload one in Settings → Scheme of Work for a curriculum-grounded draft.";
      setGroundedHint(base);

      // The AI can mark more than one point in the note where a diagram
      // genuinely helps — generate one image per description and add each
      // to the gallery below as it lands, rather than waiting for all of
      // them (a slow one shouldn't hold up the others).
      const illustrations = res.illustrations ?? [];
      if (illustrations.length > 0) {
        setGeneratingImage(true);
        let addedCount = 0;
        await Promise.all(
          illustrations.map(async (desc) => {
            try {
              const prompt = `simple educational diagram: ${desc}, for a ${cs.classGroup.level.name} ${cs.subject.name} class, labeled, clean line art, no watermark, no text`;
              const url = await loadIllustration(prompt);
              setImages((prev) => [...prev, url]);
              addedCount += 1;
            } catch {
              // The AI still identified a good illustration idea — the note
              // text itself is unaffected either way, so just skip this one.
            }
          }),
        );
        setGeneratingImage(false);
        if (addedCount > 0) {
          setGroundedHint(`${base} Added ${addedCount} matching illustration${addedCount === 1 ? "" : "s"} to the images below.`);
        }
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function generateIllustration() {
    const cs = options.find((o) => o.id === form.classSubjectId);
    if (!form.topic) return alert("Enter a topic first");
    setGeneratingImage(true);
    const prompt = `simple educational diagram of ${form.topic} for a ${cs?.classGroup.level.name ?? "school"} ${cs?.subject.name ?? ""} class, labeled, clean line art, no watermark, no text`;
    const url = illustrationUrl(prompt);
    const probe = new Image();
    probe.onload = () => { setImages((prev) => [...prev, url]); setGeneratingImage(false); };
    probe.onerror = () => { setGeneratingImage(false); alert("Couldn't generate an illustration right now — the free image service may be busy. Try again."); };
    probe.src = url;
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=gallery", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      setImages((prev) => [...prev, json.data.url]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploadingImage(false);
    }
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  async function saveDraft() {
    if (!form.classSubjectId) return alert("Choose a class subject");
    if (!form.topic) return alert("Enter a topic");
    setSaving(true);
    try {
      const body = { classSubjectId: form.classSubjectId, topic: form.topic, content: form.content ?? "", week: form.week ? Number(form.week) : undefined, attachments: images };
      if (editId) {
        await api(`learning/${editId}?kind=notes`, { method: "PATCH", body });
      } else {
        await api("learning", { method: "POST", body: { ...body, kind: "note", isPublished: false } });
      }
      resetModal();
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function publish(n: Note) {
    if (!confirm(`Publish "${n.topic}"? Students in this class will be able to see it.`)) return;
    try {
      await api(`learning/${n.id}?kind=notes`, { method: "PATCH", body: { isPublished: true } });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function unpublish(n: Note) {
    try {
      await api(`learning/${n.id}?kind=notes`, { method: "PATCH", body: { isPublished: false } });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function deleteNote(n: Note) {
    if (!confirm(`Delete "${n.topic}"? This cannot be undone.`)) return;
    try {
      await api(`learning/${n.id}/deleteNote`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Lesson Notes"
        subtitle="Write and share lesson notes for the classes you teach. New notes save as a draft — review, illustrate, then publish."
        actions={<Button onClick={openNew}><Icon name="plus" size={16} /> New note</Button>}
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
                <Badge tone={n.isPublished ? "success" : "neutral"}>{n.isPublished ? "Published" : "Draft"}</Badge>
              </div>
              {n.attachments && n.attachments.length > 0 && (
                <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8 }}>
                  {n.attachments.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt={n.topic} style={{ width: 90, height: 70, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                  ))}
                </div>
              )}
              <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
                {n.content.length > 200 ? `${n.content.slice(0, 200)}…` : n.content}
              </p>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginBottom: 10 }}>Added {new Date(n.createdAt).toLocaleDateString()}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button size="sm" variant="outline" onClick={() => openEdit(n)}>Edit</Button>
                {n.isPublished ? (
                  <Button size="sm" variant="ghost" onClick={() => unpublish(n)}>Unpublish</Button>
                ) : (
                  <Button size="sm" variant="accent" onClick={() => publish(n)}>Publish</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => deleteNote(n)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={resetModal} title={editId ? "Edit lesson note" : "New lesson note"} wide>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>Class subject</label>
            <Select value={form.classSubjectId ?? ""} onChange={(e) => setForm({ ...form, classSubjectId: e.target.value })} disabled={!!editId}>
              <option value="">Select a class subject…</option>
              {groupClassSubjectsBySubject(options).map((g) => (
                <optgroup key={g.subject} label={g.subject}>
                  {g.items.map((o) => (
                    <option key={o.id} value={o.id}>{o.classGroup.level.name} {o.classGroup.name}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }} htmlFor="topic">Topic</label>
            {topicsLoading && <span style={{ fontSize: 11.5, color: "var(--duga-muted)" }}>Loading topics from the scheme of work…</span>}
          </div>
          {schemeTopics.length > 0 && !customTopic ? (
            <Select
              id="topic"
              value={form.topic ?? ""}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomTopic(true);
                  setForm({ ...form, topic: "" });
                  return;
                }
                const picked = schemeTopics.find((t) => t.topic === e.target.value);
                setForm({ ...form, topic: e.target.value, week: picked?.week ?? form.week ?? "" });
              }}
            >
              <option value="">Select a topic from the scheme of work…</option>
              {schemeTopics.map((t, i) => (
                <option key={i} value={t.topic}>
                  {t.week ? `Week ${t.week} — ` : ""}
                  {t.topic}
                  {t.term ? ` (${t.term} Term)` : ""}
                </option>
              ))}
              <option value="__custom__">✎ Type a custom topic…</option>
            </Select>
          ) : (
            <>
              <Input id="topic" value={form.topic ?? ""} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Fractions and Decimals" />
              {schemeTopics.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCustomTopic(false)} style={{ justifySelf: "start" }}>
                  ← Pick from scheme of work instead
                </Button>
              )}
            </>
          )}
          <label style={{ fontSize: 12.5, fontWeight: 600, display: "block" }} htmlFor="week">Week</label>
          <Input id="week" type="number" min={1} max={13} value={form.week ?? ""} onChange={(e) => setForm({ ...form, week: e.target.value })} placeholder="1" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }} htmlFor="content">Content</label>
            <Button type="button" variant="outline" size="sm" loading={generating} onClick={generateFromScheme}>
              <Icon name="notes" size={14} /> Generate from scheme of work
            </Button>
          </div>
          {groundedHint && <Alert tone={groundedHint.startsWith("Drafted") ? "success" : "info"}>{groundedHint}</Alert>}
          <Textarea id="content" rows={7} value={form.content ?? ""} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the lesson note (objectives, activities, summary)…, or generate one above. You can always come back and edit this before publishing." />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Images</label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="button" variant="outline" size="sm" loading={generatingImage} onClick={generateIllustration}>
                <Icon name="notes" size={14} /> Generate illustration
              </Button>
              <Button type="button" variant="outline" size="sm" loading={uploadingImage} onClick={() => fileRef.current?.click()}>
                <Icon name="plus" size={14} /> Upload image
              </Button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadImage(e.target.files?.[0])} />
            </div>
          </div>
          {images.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {images.map((url, i) => (
                <div key={i} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid var(--duga-border)" }} />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    aria-label="Remove image"
                    style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: "50%", border: "none", background: "var(--duga-danger, #c0392b)", color: "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={resetModal}>Cancel</Button>
          <Button loading={saving} onClick={saveDraft}>{editId ? "Save changes" : "Save as draft"}</Button>
        </div>
      </Modal>
    </div>
  );
}
