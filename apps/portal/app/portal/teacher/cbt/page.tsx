"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Button, Field, Input, Textarea, Select, Modal, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface ClassSubjectOption {
  id: string;
  classGroupId: string;
  subject: { name: string };
  classGroup: { level: { name: string }; name: string; _count: { students: number } };
}

interface Cbt {
  id: string;
  title: string;
  description: string | null;
  instruction: string | null;
  passMark: number | null;
  durationMinutes: number;
  status: string;
  isExam?: boolean;
  showResults: boolean;
  targetStudentIds: unknown;
  classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } | null };
  _count: { questions: number; attempts: number };
}

interface CbtResultRow {
  id: string;
  studentName: string;
  email: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  submittedAt: string | null;
}

interface QuestionRow {
  question: string;
  options: string[];
  correctIndex: number;
  score: number;
}

const blankQuestion = (): QuestionRow => ({ question: "", options: ["", "", "", ""], correctIndex: 0, score: 1 });

export default function TeacherCbtPage() {
  const [options, setOptions] = useState<ClassSubjectOption[]>([]);
  const [items, setItems] = useState<Cbt[]>([]);
  const [roster, setRoster] = useState<Array<{ id: string; firstName: string; lastName: string; admissionNumber: string }>>([]);
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [results, setResults] = useState<{ id: string; title: string; attempts: CbtResultRow[] } | null>(null);
  const [role, setRole] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opts, res, me] = await Promise.all([
        api<ClassSubjectOption[]>("teacher"),
        api<{ items: Cbt[] }>("learning?kind=tests"),
        api<{ user: { role: string } }>("auth/me").catch(() => null),
      ]);
      setOptions(opts);
      setItems(res.items);
      setRole(me?.user?.role ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const isAdmin = role === "OWNER" || role === "ADMIN";

  useEffect(() => {
    load();
  }, [load]);

  async function loadTargets(classSubjectId: string) {
    const cs = options.find((o) => o.id === classSubjectId);
    if (!cs) return;
    const res = await api<{ roster: Array<{ id: string; firstName: string; lastName: string; admissionNumber: string }> }>("teacher/roster", { method: "POST", body: { classGroupId: cs.classGroupId } });
    setRoster(res.roster);
    setTargetStudentIds([]);
  }

  function openCreate() {
    setForm({});
    setQuestions([blankQuestion()]);
    setTargetStudentIds([]);
    setOpen(true);
  }

  async function create() {
    if (!form.classSubjectId) return alert("Choose a class subject");
    if (!form.title) return alert("Enter a title");
    const qs = questions.filter((q) => q.question.trim() !== "");
    if (qs.length === 0) return alert("Add at least one question");
    try {
      await api("learning", {
        method: "POST",
        body: {
          kind: "test",
          classSubjectId: form.classSubjectId,
          title: form.title,
          description: form.description ?? undefined,
          instruction: form.instruction ?? undefined,
          passMark: form.passMark ? Number(form.passMark) : undefined,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : 30,
          startsAt: form.startsAt || undefined,
          endsAt: form.endsAt || undefined,
          isExam: form.isExam === "1",
          status: form.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
          shuffleQuestions: form.shuffle === "1",
          targetStudentIds,
          questions: qs.map((q) => ({ type: "MULTIPLE_CHOICE", question: q.question, options: q.options, correctIndex: q.correctIndex, score: q.score })),
        },
      });
      setOpen(false);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function publish(c: Cbt) {
    if (c.isExam && !isAdmin) return alert("Only the school owner or admin can publish exams");
    try {
      if (c.status !== "PUBLISHED") {
        await api(`learning/${c.id}/publishTest`, { method: "POST" });
      } else {
        await api(`learning/${c.id}?kind=tests`, { method: "PATCH", body: { status: "DRAFT" } });
      }
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

async function openResults(c: Cbt) {
    try {
      const res = await api<{ attempts: CbtResultRow[] }>(`learning/${c.id}/testResults`, { method: "POST" });
      setResults({ id: c.id, title: c.title, attempts: res.attempts });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function shareResults(c: Cbt) {
    if (!confirm(`Share results of "${c.title}" with all students who attempted it?`)) return;
    try {
      await api(`learning/${c.id}/shareResults`, { method: "POST" });
      alert("Results shared — students have been notified.");
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const editQ = (i: number, patch: Partial<QuestionRow>) => setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  return (
    <div>
      <PageHeader
        title="CBT Exams"
        subtitle="Build computer-based tests, assign them to classes or students, then publish, review and share results."
        actions={<Button onClick={openCreate}><Icon name="plus" size={16} /> New CBT</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No CBT exams yet" hint="Create one using the New CBT button." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
          {items.map((c) => {
            const targeted = Array.isArray(c.targetStudentIds) ? (c.targetStudentIds as string[]) : [];
            return (
              <Card key={c.id} title={c.title} actions={<Badge tone={c.status === "PUBLISHED" ? "success" : "neutral"}>{c.status}</Badge>}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {c.isExam && <Badge tone="danger">Exam</Badge>}
                  <Badge tone="info">{c.classSubject.subject.name}</Badge>
                  {c.classSubject.classGroup && <Badge tone="neutral">{c.classSubject.classGroup.level.name} {c.classSubject.classGroup.name}</Badge>}
                  {targeted.length > 0 && <Badge tone="accent">{targeted.length} student(s)</Badge>}
                  {c.showResults && <Badge tone="success">Results shared</Badge>}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px" }}>
                  {(c.description ?? c.instruction ?? "").slice(0, 180)}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--duga-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>{c._count.questions} questions · {c.durationMinutes} minutes · Pass mark {c.passMark ?? 0}%</span>
                  <span>{c._count.attempts} attempt(s)</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {c.isExam ? (
                    isAdmin ? (
                      <Button size="sm" variant={c.status === "PUBLISHED" ? "ghost" : "accent"} onClick={() => publish(c)}>{c.status === "PUBLISHED" ? "Unpublish" : "Publish"}</Button>
                    ) : (
                      <Badge tone="warning">{c.status === "PUBLISHED" ? "Published by admin" : "Awaiting admin publish"}</Badge>
                    )
                  ) : (
                    <Button size="sm" variant={c.status === "PUBLISHED" ? "ghost" : "accent"} onClick={() => publish(c)}>{c.status === "PUBLISHED" ? "Unpublish" : "Publish"}</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openResults(c)}>Results</Button>
                  <Button size="sm" variant="outline" onClick={() => shareResults(c)}>Share results</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New CBT exam" wide>
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Class subject" required>
            <Select value={form.classSubjectId ?? ""} onChange={(e) => { setForm({ ...form, classSubjectId: e.target.value }); loadTargets(e.target.value); }}>
              <option value="">Select a class subject…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.subject.name} — {o.classGroup.level.name} {o.classGroup.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required>
            <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Instructions (shown to students)">
            <Textarea rows={2} value={form.instruction ?? ""} onChange={(e) => setForm({ ...form, instruction: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
            <Field label="Duration (min)">
              <Input type="number" value={form.durationMinutes ?? ""} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} placeholder="30" />
            </Field>
            <Field label="Pass mark %">
              <Input type="number" min={0} max={100} value={form.passMark ?? ""} onChange={(e) => setForm({ ...form, passMark: e.target.value })} placeholder="50" />
            </Field>
            <Field label="Opens at">
              <Input type="datetime-local" value={form.startsAt ?? ""} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </Field>
            <Field label="Closes at">
              <Input type="datetime-local" value={form.endsAt ?? ""} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Type">
              <Select value={form.isExam ?? "0"} onChange={(e) => setForm({ ...form, isExam: e.target.value })}>
                <option value="0">Class test (teacher publishes)</option>
                <option value="1">Official exam (admin publishes)</option>
              </Select>
            </Field>
            <Field label="Shuffle questions">
              <Select value={form.shuffle ?? "0"} onChange={(e) => setForm({ ...form, shuffle: e.target.value })}>
                <option value="0">No</option>
                <option value="1">Yes</option>
              </Select>
            </Field>
          </div>
          {form.isExam === "1" && (
            <Alert tone="info">Exams are created by teachers but published by the school admin. A teacher cannot publish an exam directly.</Alert>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Status">
              <Select value={form.status ?? "DRAFT"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published (assign now)</option>
              </Select>
            </Field>
          </div>
          <Field label="Assign to" required>
            <Select value={targetStudentIds.length ? "students" : "class"} onChange={(e) => setTargetStudentIds(e.target.value === "students" ? roster.map((s) => s.id) : [])}>
              <option value="class">Whole class (all students)</option>
              <option value="students">Specific students</option>
            </Select>
          </Field>
          {targetStudentIds.length > 0 && roster.length > 0 && (
            <div style={{ border: "1px solid var(--duga-border)", borderRadius: 8, padding: 10, maxHeight: 180, overflowY: "auto" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Select students:</div>
              {roster.map((s) => (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13.5 }}>
                  <input type="checkbox" checked={targetStudentIds.includes(s.id)}
                    onChange={(e) => setTargetStudentIds((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))} />
                  {s.firstName} {s.lastName} <span style={{ color: "var(--duga-muted)" }}>({s.admissionNumber})</span>
                </label>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--duga-border)", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>Questions ({questions.length})</strong>
              <Button size="sm" variant="outline" onClick={() => setQuestions((prev) => [...prev, blankQuestion()])}><Icon name="plus" size={14} /> Add question</Button>
            </div>
            {questions.map((q, qi) => (
              <div key={qi} style={{ border: "1px solid var(--duga-border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Question {qi + 1}</span>
                  {questions.length > 1 && <Button size="sm" variant="ghost" onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qi))}>Remove</Button>}
                </div>
                <Textarea rows={2} value={q.question} placeholder="Type the question…" onChange={(e) => editQ(qi, { question: e.target.value })} />
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 0.4fr", gap: 8, marginTop: 8 }}>
                  {q.options.map((opt, oi) => (
                    <div key={oi} style={{ display: "flex", gap: 6 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                        <input type="radio" name={`correct-${qi}`} checked={q.correctIndex === oi} onChange={() => editQ(qi, { correctIndex: oi })} />
                        ✓
                      </label>
                      <Input value={opt} placeholder={`Option ${String.fromCharCode(65 + oi)}`} onChange={(e) => editQ(qi, { options: q.options.map((o, i) => (i === oi ? e.target.value : o)) })} />
                    </div>
                  ))}
                  <Field label="Score">
                    <Input type="number" value={String(q.score)} onChange={(e) => editQ(qi, { score: Number(e.target.value) || 0 })} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create}>Create CBT</Button>
        </div>
      </Modal>

      <Modal open={!!results} onClose={() => setResults(null)} title={results ? `Results — ${results.title}` : ""} wide>
        {results && (
          <div>
            <Alert tone="info">{results.attempts.length} attempt(s) in total.</Alert>
            <div className="duga-table-wrap" style={{ marginTop: 12 }}>
              <table className="duga-table">
                <thead>
                  <tr><th>Student</th><th>Score</th><th>%</th><th>Status</th><th>Submitted</th></tr>
                </thead>
                <tbody>
                  {results.attempts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.studentName}</td>
                      <td>{a.score}/{a.maxScore}</td>
                      <td>{a.percentage}%</td>
                      <td><Badge tone={a.passed ? "success" : "danger"}>{a.passed ? "Pass" : "Fail"}</Badge></td>
                      <td>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {results.attempts.length === 0 && (
                    <tr><td colSpan={5} style={{ color: "var(--duga-muted)", textAlign: "center" }}>No attempts yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <Button variant="accent" onClick={() => shareResults({ id: results.id, title: results.title } as Cbt)}>Share results now</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}