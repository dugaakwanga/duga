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

interface RosterStudent {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
}

interface Submission {
  id: string;
  content: string | null;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  student: { id: string; user: { firstName: string; lastName: string } };
}

interface Assignment {
  id: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  maxScore: number;
  isPublished: boolean;
  targetStudentIds: unknown;
  createdAt: string;
  classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } | null };
  submissions: Submission[];
  _count: { submissions: number };
}

interface AssignmentDetail extends Assignment {
  classSubject: { id: string; subject: { name: string }; classGroup: { id: string; level: { name: string }; name: string } | null };
}

export default function TeacherAssignmentsPage() {
  const [options, setOptions] = useState<ClassSubjectOption[]>([]);
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [targetStudents, setTargetStudents] = useState<string[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [grading, setGrading] = useState<{ assignment: AssignmentDetail; roster: RosterStudent[]; scores: Record<string, { score: string; feedback: string }> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opts, res] = await Promise.all([
        api<ClassSubjectOption[]>("teacher"),
        api<{ items: Assignment[] }>("learning?kind=assignments"),
      ]);
      setOptions(opts);
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadRoster(classSubjectId: string) {
    const cs = options.find((o) => o.id === classSubjectId);
    if (!cs) return;
    const res = await api<{ roster: RosterStudent[] }>("teacher/roster", { method: "POST", body: { classGroupId: cs.classGroupId } });
    setRoster(res.roster);
  }

  async function create() {
    if (!form.classSubjectId) return alert("Choose a class subject");
    if (!form.title) return alert("Enter a title");
    try {
      await api("learning", {
        method: "POST",
        body: {
          kind: "assignment",
          classSubjectId: form.classSubjectId,
          title: form.title,
          instructions: form.instructions ?? "",
          dueAt: form.dueAt || undefined,
          maxScore: form.maxScore ? Number(form.maxScore) : 100,
          isPublished: form.isPublished === "1",
          targetStudentIds: targetStudents,
        },
      });
      setOpen(false);
      setForm({});
      setTargetStudents([]);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function openGrading(a: Assignment) {
    const detail = await api<AssignmentDetail>(`learning/${a.id}?kind=assignments`);
    const cs = options.find((o) => o.id === detail.classSubject?.id);
    let r: RosterStudent[] = [];
    if (cs) {
      const res = await api<{ roster: RosterStudent[] }>("teacher/roster", { method: "POST", body: { classGroupId: cs.classGroupId } });
      r = res.roster;
    } else {
      r = detail.submissions.map((s) => ({ id: s.student.id, admissionNumber: "", firstName: s.student.user.firstName, lastName: s.student.user.lastName }));
    }
    const scores: Record<string, { score: string; feedback: string }> = {};
    detail.submissions.forEach((s) => {
      scores[s.id] = { score: s.score != null ? String(s.score) : "", feedback: s.feedback ?? "" };
    });
    setGrading({ assignment: detail, roster: r, scores });
  }

  async function saveGrade(sub: Submission) {
    const row = grading?.scores[sub.id];
    if (!row || row.score === "") return;
    try {
      await api(`learning/${sub.id}/gradeAssignment`, { method: "POST", body: { score: Number(row.score), feedback: row.feedback || undefined } });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function togglePublish(a: Assignment) {
    try {
      if (!a.isPublished) {
        await api(`learning/${a.id}/publishAssignment`, { method: "POST" });
      } else {
        await api(`learning/${a.id}?kind=assignments`, { method: "PATCH", body: { isPublished: false } });
      }
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Assignments"
        subtitle="Set assignments for a whole class or specific students, control the submission time and grade submissions."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New assignment</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No assignments yet" hint="Create one using the New assignment button." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
          {items.map((a) => {
            const targeted = Array.isArray(a.targetStudentIds) ? (a.targetStudentIds as string[]) : [];
            return (
              <Card
                key={a.id}
                title={a.title}
                actions={<Button size="sm" variant="outline" onClick={() => openGrading(a)}>Grade</Button>}
              >
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <Badge tone="info">{a.classSubject.subject.name}</Badge>
                  {a.classSubject.classGroup && <Badge tone="neutral">{a.classSubject.classGroup.level.name} {a.classSubject.classGroup.name}</Badge>}
                  <Badge tone={a.isPublished ? "success" : "neutral"}>{a.isPublished ? "Published" : "Draft"}</Badge>
                  {targeted.length > 0 && <Badge tone="accent">{targeted.length} student(s)</Badge>}
                </div>
                <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px" }}>{a.instructions.slice(0, 160)}</p>
                <div style={{ fontSize: 12.5, color: "var(--duga-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
                  {a.dueAt && <span><strong>Submit by:</strong> {new Date(a.dueAt).toLocaleString()}</span>}
                  <span><strong>Max score:</strong> {a.maxScore}</span>
                  <span><strong>Submissions:</strong> {a._count.submissions}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button size="sm" variant={a.isPublished ? "ghost" : "accent"} onClick={() => togglePublish(a)}>
                    {a.isPublished ? "Unpublish" : "Publish"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openGrading(a)}>View submissions</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="New assignment" wide>
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Class subject" required>
            <Select value={form.classSubjectId ?? ""} onChange={(e) => { setForm({ ...form, classSubjectId: e.target.value }); loadRoster(e.target.value); }}>
              <option value="">Select a class subject…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.subject.name} — {o.classGroup.level.name} {o.classGroup.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required>
            <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Instructions">
            <Textarea rows={4} value={form.instructions ?? ""} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </Field>
          <div className="duga-form-grid">
            <Field label="Submission time" hint="When it must be submitted by">
              <Input type="datetime-local" value={form.dueAt ?? ""} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
            </Field>
            <Field label="Max score">
              <Input type="number" value={form.maxScore ?? ""} onChange={(e) => setForm({ ...form, maxScore: e.target.value })} placeholder="100" />
            </Field>
          </div>
          <Field label="Assign to" required>
            <Select value={targetStudents.length ? "students" : "class"} onChange={(e) => setTargetStudents(e.target.value === "students" ? roster.map((s) => s.id) : [])}>
              <option value="class">Whole class</option>
              <option value="students">Specific students</option>
            </Select>
          </Field>
          {targetStudents.length > 0 && roster.length > 0 && (
            <div style={{ border: "1px solid var(--duga-border)", borderRadius: 8, padding: 10, maxHeight: 180, overflowY: "auto" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Select students:</div>
              {roster.map((s) => (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={targetStudents.includes(s.id)}
                    onChange={(e) =>
                      setTargetStudents((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
                    }
                  />
                  {s.firstName} {s.lastName} <span style={{ color: "var(--duga-muted)" }}>({s.admissionNumber})</span>
                </label>
              ))}
            </div>
          )}
          <Field label="Publish immediately">
            <Select value={form.isPublished ?? "1"} onChange={(e) => setForm({ ...form, isPublished: e.target.value })}>
              <option value="1">Yes — publish and notify</option>
              <option value="0">No — save as draft</option>
            </Select>
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create}>Create assignment</Button>
        </div>
      </Modal>

      {/* Grading modal */}
      <Modal open={!!grading} onClose={() => setGrading(null)} title={grading ? `Grade: ${grading.assignment.title}` : ""} wide>
        {grading && (
          <div>
            <Alert tone="info">
              {grading.assignment.maxScore} max score · {grading.assignment.submissions.length} submitted · {grading.roster.length} assigned student(s).
            </Alert>
            <div className="duga-table-wrap" style={{ marginTop: 12 }}>
              <table className="duga-table">
                <thead>
                  <tr><th>Student</th><th>Status</th><th>Score</th><th>Feedback</th><th></th></tr>
                </thead>
                <tbody>
                  {grading.roster.map((s) => {
                    const sub = grading.assignment.submissions.find((x) => x.student.id === s.id);
                    const row = grading.scores[sub?.id ?? ""];
                    return (
                      <tr key={s.id}>
                        <td>{s.firstName} {s.lastName}</td>
                        <td>
                          {!sub ? <Badge tone="danger">Not submitted</Badge> : sub.score != null ? <Badge tone="success">{sub.score}/{grading.assignment.maxScore}</Badge> : <Badge tone="warning">Submitted</Badge>}
                        </td>
                        <td>
                          {sub && (
                            <Input type="number" style={{ width: 80 }} min={0} max={grading.assignment.maxScore} value={row?.score ?? ""} onChange={(e) => setGrading({ ...grading, scores: { ...grading.scores, [sub.id]: { score: e.target.value, feedback: row?.feedback ?? "" } } })} />
                          )}
                        </td>
                        <td>
                          {sub && (
                            <Input value={row?.feedback ?? ""} placeholder="Feedback" onChange={(e) => setGrading({ ...grading, scores: { ...grading.scores, [sub.id]: { score: row?.score ?? "", feedback: e.target.value } } })} />
                          )}
                        </td>
                        <td>{sub && <Button size="sm" variant="accent" onClick={() => saveGrade(sub)}>Save</Button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}