"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Card, Badge, Button, Modal, Field, Input, Select, Alert, Spinner, EmptyState } from "@duga/ui";
import { api } from "@/lib/client/api";
import { groupClassSubjectsBySubject } from "@/lib/client/classSubjectOptions";

interface Submission {
  id: string;
  component: string;
  maxScore: number;
  imageUrls: string[];
  answerKey: string | null;
  aiScore: number | null;
  aiFeedback: string | null;
  status: "PENDING" | "AI_GRADED" | "APPROVED" | "REJECTED";
  teacherScore: number | null;
  createdAt: string;
  student: { user: { firstName: string; lastName: string } };
  classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } | null };
}

interface ClassSubjectOption {
  id: string;
  subject: { name: string };
  classGroup: { level: { name: string }; name: string };
}

interface RosterStudent {
  id: string;
  name: string;
  admissionNumber: string | null;
}

function statusTone(s: Submission["status"]): "neutral" | "info" | "success" | "danger" {
  return s === "PENDING" ? "neutral" : s === "AI_GRADED" ? "info" : s === "APPROVED" ? "success" : "danger";
}

export default function PaperExamsPage() {
  const [role, setRole] = useState("");
  const [items, setItems] = useState<Submission[]>([]);
  const [options, setOptions] = useState<ClassSubjectOption[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ classSubjectId: string; studentId: string; component: string; maxScore: string }>({ classSubjectId: "", studentId: "", component: "Exam", maxScore: "" });
  const [rosterLoading, setRosterLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [answerKeyDraft, setAnswerKeyDraft] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const isStaff = role === "TEACHER" || role === "ADMIN" || role === "OWNER";
  const canSubmit = role === "TEACHER" || role === "ADMIN" || role === "OWNER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ role: string; items: Submission[] }>("paperExam");
      setRole(d.role);
      setItems(d.items);
      if (d.role === "TEACHER" || d.role === "ADMIN" || d.role === "OWNER") {
        const opts = await api<ClassSubjectOption[]>("teacher");
        setOptions(opts);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!form.classSubjectId) { setRoster([]); return; }
    setRosterLoading(true);
    api<{ items: RosterStudent[] }>("paperExam/roster", { query: { classSubjectId: form.classSubjectId } })
      .then((d) => setRoster(d.items))
      .catch((e) => setError((e as Error).message))
      .finally(() => setRosterLoading(false));
  }, [form.classSubjectId]);

  async function submit() {
    if (!form.classSubjectId || !form.studentId || !form.component || !form.maxScore) return alert("Fill in every field");
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return alert("Choose at least one photo of the answer script");
    setUploading(true);
    setError(null);
    try {
      const imageUrls: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload?purpose=paper-exam", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
        imageUrls.push(json.data.url);
      }
      await api("paperExam/submit", { method: "POST", body: { classSubjectId: form.classSubjectId, studentId: form.studentId, component: form.component, maxScore: Number(form.maxScore), imageUrls } });
      setOpen(false);
      setForm({ classSubjectId: "", studentId: "", component: "Exam", maxScore: "" });
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function gradeWithAi(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api(`paperExam/${id}/grade`, { method: "POST", body: { answerKey: answerKeyDraft[id] || undefined } });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function review(id: string, decision: "APPROVE" | "REJECT") {
    setBusyId(id);
    setError(null);
    try {
      const scoreStr = scoreDraft[id];
      await api(`paperExam/${id}/review`, { method: "POST", body: { decision, score: scoreStr ? Number(scoreStr) : undefined } });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Paper Exams"
        subtitle={canSubmit ? "Upload a photo of a student's completed answer script for AI-assisted grading — every score is only ever a suggestion until you approve it." : "Your photographed paper exam scripts and their scores."}
        actions={canSubmit ? <Button onClick={() => setOpen(true)}>Upload script</Button> : undefined}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing here yet" hint={canSubmit ? "Upload a photo of a student's script to get started." : "Nothing has been uploaded for you yet."} />
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {items.map((s) => (
            <Card key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {s.classSubject.subject.name}
                    {s.classSubject.classGroup ? ` — ${s.classSubject.classGroup.level.name} ${s.classSubject.classGroup.name}` : ""}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>
                    {s.student.user.firstName} {s.student.user.lastName} · {s.component} · out of {s.maxScore} · {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Badge tone={statusTone(s.status)}>{s.status.replace("_", " ")}</Badge>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {s.imageUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Page ${i + 1}`} style={{ width: 90, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--duga-border)" }} />
                  </a>
                ))}
              </div>

              {s.aiFeedback && (
                <div style={{ marginTop: 10 }}>
                  <Alert tone="info">
                    <strong>AI suggested {s.aiScore}/{s.maxScore}.</strong> {s.aiFeedback}
                  </Alert>
                </div>
              )}
              {s.status === "APPROVED" && (
                <div style={{ marginTop: 10 }}>
                  <Alert tone="success">Approved — {s.teacherScore}/{s.maxScore} recorded against &quot;{s.component}&quot;.</Alert>
                </div>
              )}

              {isStaff && role !== "ADMIN" && s.status === "PENDING" && (
                <div style={{ marginTop: 12 }}>
                  <Field label="Answer key / marking scheme (optional)" hint="More accurate grading if you provide one.">
                    <Input value={answerKeyDraft[s.id] ?? ""} onChange={(e) => setAnswerKeyDraft((d) => ({ ...d, [s.id]: e.target.value }))} placeholder="e.g. 1) Lagos 2) 1960 3) ..." />
                  </Field>
                  <Button size="sm" loading={busyId === s.id} onClick={() => gradeWithAi(s.id)}>Grade with AI</Button>
                </div>
              )}

              {isStaff && role !== "ADMIN" && s.status === "AI_GRADED" && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
                  <Field label="Final score">
                    <Input type="number" min={0} max={s.maxScore} style={{ width: 100 }} value={scoreDraft[s.id] ?? String(s.aiScore ?? "")} onChange={(e) => setScoreDraft((d) => ({ ...d, [s.id]: e.target.value }))} />
                  </Field>
                  <Button size="sm" variant="accent" loading={busyId === s.id} onClick={() => review(s.id, "APPROVE")}>Approve</Button>
                  <Button size="sm" variant="ghost" loading={busyId === s.id} onClick={() => review(s.id, "REJECT")}>Reject</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Upload a student's paper exam script">
        <Field label="Subject" required>
          <Select value={form.classSubjectId} onChange={(e) => setForm({ ...form, classSubjectId: e.target.value, studentId: "" })}>
            <option value="">Select a subject…</option>
            {groupClassSubjectsBySubject(options).map((g) => (
              <optgroup key={g.subject} label={g.subject}>
                {g.items.map((o) => (
                  <option key={o.id} value={o.id}>{o.classGroup.level.name} {o.classGroup.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Student" required>
          <Select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} disabled={!form.classSubjectId || rosterLoading}>
            <option value="">{rosterLoading ? "Loading…" : "Select a student…"}</option>
            {roster.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.admissionNumber ? ` (${s.admissionNumber})` : ""}</option>
            ))}
          </Select>
        </Field>
        <Field label="Which component is this?" hint='e.g. "Exam", "Test", "Assignment" — must match a component your school uses.'>
          <Input value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })} />
        </Field>
        <Field label="Maximum score" required>
          <Input type="number" min={1} value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: e.target.value })} />
        </Field>
        <Field label="Photo(s) of the answer script" required hint="You can select multiple pages at once.">
          <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={uploading} onClick={submit}>Upload</Button>
        </div>
      </Modal>
    </div>
  );
}
