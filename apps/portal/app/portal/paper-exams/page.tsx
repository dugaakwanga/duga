"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Card, Badge, Button, Modal, Field, Input, Select, Textarea, Alert, Spinner, EmptyState, Tabs, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { groupClassSubjectsBySubject } from "@/lib/client/classSubjectOptions";

interface QuestionBreakdown {
  questionId: string;
  question: string;
  maxScore: number;
  score: number;
  feedback: string;
}

interface Submission {
  id: string;
  component: string;
  maxScore: number;
  imageUrls: string[];
  answerKey: string | null;
  aiScore: number | null;
  aiFeedback: string | null;
  aiBreakdown: QuestionBreakdown[] | null;
  status: "PENDING" | "AI_GRADED" | "APPROVED" | "REJECTED";
  teacherScore: number | null;
  createdAt: string;
  student: { user: { firstName: string; lastName: string } };
  classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } | null };
  paperExam: { id: string; title: string } | null;
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

interface ExamQuestion {
  id?: string;
  question: string;
  maxScore: string;
  markingNotes: string;
}

interface Exam {
  id: string;
  title: string;
  instructions: string | null;
  component: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  classSubjectId: string;
  classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } | null };
  _count: { questions: number; submissions: number };
  questions?: Array<{ id: string; question: string; maxScore: number; markingNotes: string }>;
}

function statusTone(s: Submission["status"]): "neutral" | "info" | "success" | "danger" {
  return s === "PENDING" ? "neutral" : s === "AI_GRADED" ? "info" : s === "APPROVED" ? "success" : "danger";
}

const emptyQuestion = (): ExamQuestion => ({ question: "", maxScore: "", markingNotes: "" });
const emptyExamForm = () => ({ id: "", classSubjectId: "", title: "", component: "Exam", instructions: "", status: "DRAFT" as Exam["status"], questions: [emptyQuestion()] });

export default function PaperExamsPage() {
  const [role, setRole] = useState("");
  const [tab, setTab] = useState("submissions");
  const [items, setItems] = useState<Submission[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [options, setOptions] = useState<ClassSubjectOption[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ classSubjectId: "", paperExamId: "", studentId: "" });
  const [rosterLoading, setRosterLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  // Per-submission, per-question score overrides — keyed so a teacher can
  // adjust the AI's suggestion question-by-question before approving,
  // instead of only being able to override the overall total.
  const [breakdownDraft, setBreakdownDraft] = useState<Record<string, Record<string, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const [examModal, setExamModal] = useState(false);
  const [examForm, setExamForm] = useState(emptyExamForm());
  const [examSaving, setExamSaving] = useState(false);
  const [examBusyId, setExamBusyId] = useState<string | null>(null);

  const isStaff = role === "TEACHER" || role === "ADMIN" || role === "OWNER";
  const canAuthor = role === "TEACHER" || role === "OWNER";
  const canSubmit = role === "TEACHER" || role === "ADMIN" || role === "OWNER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ role: string; items: Submission[] }>("paperExam");
      setRole(d.role);
      setItems(d.items);
      if (d.role === "TEACHER" || d.role === "ADMIN" || d.role === "OWNER") {
        const [opts, examsRes] = await Promise.all([
          api<ClassSubjectOption[]>("teacher"),
          api<{ items: Exam[] }>("paperExam/examList"),
        ]);
        setOptions(opts);
        setExams(examsRes.items);
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

  const examsForSubject = exams.filter((e) => e.classSubjectId === form.classSubjectId && e.status === "PUBLISHED");

  async function submit() {
    if (!form.classSubjectId || !form.paperExamId || !form.studentId) return alert("Fill in every field");
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
      await api("paperExam/submit", { method: "POST", body: { paperExamId: form.paperExamId, studentId: form.studentId, imageUrls } });
      setOpen(false);
      setForm({ classSubjectId: "", paperExamId: "", studentId: "" });
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
      await api(`paperExam/${id}/grade`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function questionScore(s: Submission, questionId: string, fallback: number): string {
    return breakdownDraft[s.id]?.[questionId] ?? String(fallback);
  }
  function setQuestionScore(submissionId: string, questionId: string, value: string) {
    setBreakdownDraft((d) => ({ ...d, [submissionId]: { ...(d[submissionId] ?? {}), [questionId]: value } }));
  }

  async function review(s: Submission, decision: "APPROVE" | "REJECT") {
    setBusyId(s.id);
    setError(null);
    try {
      const body: Record<string, unknown> = { decision };
      if (decision === "APPROVE") {
        if (s.aiBreakdown && s.aiBreakdown.length > 0) {
          body.breakdown = s.aiBreakdown.map((b) => ({ questionId: b.questionId, score: Number(questionScore(s, b.questionId, b.score)) }));
        } else {
          const scoreStr = scoreDraft[s.id];
          if (scoreStr) body.score = Number(scoreStr);
        }
      }
      await api(`paperExam/${s.id}/review`, { method: "POST", body });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function openNewExam() {
    setExamForm(emptyExamForm());
    setExamModal(true);
  }

  async function openEditExam(e: Exam) {
    try {
      const full = await api<Exam>(`paperExam/${e.id}/examGet`);
      setExamForm({
        id: full.id,
        classSubjectId: full.classSubjectId,
        title: full.title,
        component: full.component,
        instructions: full.instructions ?? "",
        status: full.status,
        questions: (full.questions ?? []).map((q) => ({ id: q.id, question: q.question, maxScore: String(q.maxScore), markingNotes: q.markingNotes })),
      });
      setExamModal(true);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function updateQuestion(i: number, patch: Partial<ExamQuestion>) {
    setExamForm((f) => ({ ...f, questions: f.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) }));
  }
  function addQuestion() {
    setExamForm((f) => ({ ...f, questions: [...f.questions, emptyQuestion()] }));
  }
  function removeQuestion(i: number) {
    setExamForm((f) => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));
  }

  async function saveExam() {
    if (!examForm.id && !examForm.classSubjectId) return alert("Choose a subject");
    if (!examForm.title || !examForm.component) return alert("Title and component are required");
    if (examForm.questions.length === 0) return alert("Add at least one question");
    setExamSaving(true);
    try {
      await api("paperExam/examSave", {
        method: "POST",
        body: {
          id: examForm.id || undefined,
          classSubjectId: examForm.classSubjectId || undefined,
          title: examForm.title,
          component: examForm.component,
          instructions: examForm.instructions || undefined,
          status: examForm.status,
          questions: examForm.questions.map((q) => ({ question: q.question, maxScore: Number(q.maxScore), markingNotes: q.markingNotes })),
        },
      });
      setExamModal(false);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setExamSaving(false);
    }
  }

  async function deleteExam(e: Exam) {
    if (!confirm(`Delete "${e.title}"? This cannot be undone.`)) return;
    setExamBusyId(e.id);
    try {
      await api(`paperExam/${e.id}/examDelete`, { method: "POST", body: {} });
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExamBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Paper Exams"
        subtitle={canSubmit ? "Build an exam with a marking scheme, then upload photographed scripts for AI-assisted grading against it — every score is only ever a suggestion until you approve it." : "Your photographed paper exam scripts and their scores."}
        actions={
          canSubmit
            ? tab === "submissions"
              ? <Button onClick={() => setOpen(true)}>Upload script</Button>
              : canAuthor
                ? <Button onClick={openNewExam}><Icon name="plus" size={16} /> New exam</Button>
                : undefined
            : undefined
        }
      />
      {canAuthor && (
        <Tabs
          tabs={[
            { id: "submissions", label: "Submissions" },
            { id: "exams", label: "Manage Exams" },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <Spinner size={28} />
      ) : tab === "exams" && canAuthor ? (
        exams.length === 0 ? (
          <EmptyState title="No exams built yet" hint='Use "New exam" to create one with a question-by-question marking scheme.' />
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {exams.map((e) => (
              <Card key={e.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{e.title}</div>
                    <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>
                      {e.classSubject.subject.name}
                      {e.classSubject.classGroup ? ` — ${e.classSubject.classGroup.level.name} ${e.classSubject.classGroup.name}` : ""} · {e.component} · {e._count.questions} question{e._count.questions === 1 ? "" : "s"} · {e._count.submissions} submission{e._count.submissions === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Badge tone={e.status === "PUBLISHED" ? "success" : "neutral"}>{e.status}</Badge>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button size="sm" variant="outline" onClick={() => openEditExam(e)}>Edit</Button>
                  <Button size="sm" variant="ghost" loading={examBusyId === e.id} onClick={() => deleteExam(e)}>Delete</Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState title="Nothing here yet" hint={canSubmit ? "Build an exam under Manage Exams, then upload a photo of a student's script." : "Nothing has been uploaded for you yet."} />
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
                    {s.student.user.firstName} {s.student.user.lastName} · {s.paperExam ? s.paperExam.title : s.component} · out of {s.maxScore} · {new Date(s.createdAt).toLocaleDateString()}
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

              {s.aiBreakdown && s.aiBreakdown.length > 0 ? (
                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  <Alert tone="info">
                    <strong>AI suggested {s.aiScore}/{s.maxScore} overall.</strong>{" "}
                    {s.status === "AI_GRADED" ? "Adjust any question below before approving." : "Per-question breakdown below."}
                  </Alert>
                  {s.aiBreakdown.map((b, i) => (
                    <div key={b.questionId || i} style={{ border: "1px solid var(--duga-border)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 13, flexWrap: "wrap" }}>
                        <span>Q{i + 1}. {b.question}</span>
                        {s.status === "AI_GRADED" ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            <Input
                              type="number"
                              min={0}
                              max={b.maxScore}
                              style={{ width: 70 }}
                              value={questionScore(s, b.questionId, b.score)}
                              onChange={(e) => setQuestionScore(s.id, b.questionId, e.target.value)}
                            />
                            <span style={{ fontWeight: 400 }}>/ {b.maxScore}</span>
                          </span>
                        ) : (
                          <span style={{ flexShrink: 0 }}>{b.score}/{b.maxScore}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 2 }}>{b.feedback}</div>
                    </div>
                  ))}
                  {s.status === "AI_GRADED" && (
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                      Total: {s.aiBreakdown.reduce((a, b) => a + (Number(questionScore(s, b.questionId, b.score)) || 0), 0)}/{s.maxScore}
                    </div>
                  )}
                </div>
              ) : s.aiFeedback ? (
                <div style={{ marginTop: 10 }}>
                  <Alert tone="info">
                    <strong>AI suggested {s.aiScore}/{s.maxScore}.</strong> {s.aiFeedback}
                  </Alert>
                </div>
              ) : null}
              {s.status === "APPROVED" && (
                <div style={{ marginTop: 10 }}>
                  <Alert tone="success">Approved — {s.teacherScore}/{s.maxScore} recorded against &quot;{s.component}&quot;.</Alert>
                </div>
              )}

              {isStaff && role !== "ADMIN" && s.status === "PENDING" && (
                <div style={{ marginTop: 12 }}>
                  <Button size="sm" loading={busyId === s.id} onClick={() => gradeWithAi(s.id)}>Grade with AI</Button>
                </div>
              )}

              {isStaff && role !== "ADMIN" && s.status === "AI_GRADED" && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
                  {!(s.aiBreakdown && s.aiBreakdown.length > 0) && (
                    <Field label="Final score">
                      <Input type="number" min={0} max={s.maxScore} style={{ width: 100 }} value={scoreDraft[s.id] ?? String(s.aiScore ?? "")} onChange={(e) => setScoreDraft((d) => ({ ...d, [s.id]: e.target.value }))} />
                    </Field>
                  )}
                  <Button size="sm" variant="accent" loading={busyId === s.id} onClick={() => review(s, "APPROVE")}>Approve</Button>
                  <Button size="sm" variant="ghost" loading={busyId === s.id} onClick={() => review(s, "REJECT")}>Reject</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Upload a student's paper exam script">
        <Field label="Subject" required>
          <Select value={form.classSubjectId} onChange={(e) => setForm({ ...form, classSubjectId: e.target.value, paperExamId: "", studentId: "" })}>
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
        <Field label="Exam" required hint={form.classSubjectId && examsForSubject.length === 0 ? "No published exam yet for this subject — build one under Manage Exams first." : undefined}>
          <Select value={form.paperExamId} onChange={(e) => setForm({ ...form, paperExamId: e.target.value })} disabled={!form.classSubjectId}>
            <option value="">Select an exam…</option>
            {examsForSubject.map((e) => (
              <option key={e.id} value={e.id}>{e.title} ({e._count.questions} question{e._count.questions === 1 ? "" : "s"})</option>
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
        <Field label="Photo(s) of the answer script" required hint="You can select multiple pages at once.">
          <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={uploading} onClick={submit}>Upload</Button>
        </div>
      </Modal>

      <Modal open={examModal} onClose={() => setExamModal(false)} title={examForm.id ? "Edit exam" : "New exam"} wide>
        <div style={{ display: "grid", gap: 14 }}>
          {!examForm.id && (
            <Field label="Subject" required>
              <Select value={examForm.classSubjectId} onChange={(e) => setExamForm({ ...examForm, classSubjectId: e.target.value })}>
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
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <Field label="Title" required><Input value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} placeholder="e.g. First Term Exam" /></Field>
            <Field label="Component" required hint='Must match a component your school uses, e.g. "Exam".'>
              <Input value={examForm.component} onChange={(e) => setExamForm({ ...examForm, component: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={examForm.status} onChange={(e) => setExamForm({ ...examForm, status: e.target.value as Exam["status"] })}>
                <option value="DRAFT">Draft (not ready for scripts yet)</option>
                <option value="PUBLISHED">Published (ready — appears in the upload picker)</option>
              </Select>
            </Field>
          </div>
          <Field label="Instructions (optional)" hint="Shown to the AI as context, e.g. 'Answer any 4 of 6 questions'.">
            <Textarea rows={2} value={examForm.instructions} onChange={(e) => setExamForm({ ...examForm, instructions: e.target.value })} />
          </Field>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Questions &amp; marking scheme</label>
            <Button type="button" size="sm" variant="outline" onClick={addQuestion}><Icon name="plus" size={14} /> Add question</Button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {examForm.questions.map((q, i) => (
              <div key={i} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>Question {i + 1}</strong>
                  {examForm.questions.length > 1 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeQuestion(i)}>Remove</Button>
                  )}
                </div>
                <Field label="Question text" required>
                  <Textarea rows={2} value={q.question} onChange={(e) => updateQuestion(i, { question: e.target.value })} />
                </Field>
                <Field label="Max score" required>
                  <Input type="number" min={1} style={{ maxWidth: 120 }} value={q.maxScore} onChange={(e) => updateQuestion(i, { maxScore: e.target.value })} />
                </Field>
                <Field label="Marking notes / model answer" required hint="The key points the AI should check for — be specific, this is what genuinely drives fair grading.">
                  <Textarea rows={3} value={q.markingNotes} onChange={(e) => updateQuestion(i, { markingNotes: e.target.value })} />
                </Field>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setExamModal(false)}>Cancel</Button>
          <Button loading={examSaving} onClick={saveExam}>Save exam</Button>
        </div>
      </Modal>
    </div>
  );
}
