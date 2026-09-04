"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Badge, Button, Field, Input, Textarea, Select, Modal, Alert, Spinner, EmptyState, Table, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface AdmTest {
  id: string;
  title: string;
  section: string | null;
  instruction: string | null;
  durationMinutes: number;
  passMark: number | null;
  isActive: boolean;
  _count: { questions: number; attempts: number };
}

interface AdmQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  score: number;
  order: number;
}

interface AdmAttempt {
  id: string;
  isSubmitted: boolean;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  submittedAt: string | null;
  application: { applicantName: string; email: string; section: string; status: string } | null;
}

interface QuestionRow {
  question: string;
  options: string[];
  correctIndex: number;
  score: number;
}

const blankQuestion = (): QuestionRow => ({ question: "", options: ["", "", "", ""], correctIndex: 0, score: 1 });

const CSV_TEMPLATE = `question,optionA,optionB,optionC,optionD,correct,score
"What is the capital of Nigeria?","Lagos","Abuja","Kano","Ibadan",B,1
"7 + 5 = ?","10","11","12","13",C,1
`;

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "entrance-test-questions-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Small, dependency-free CSV parser (quoted-field aware) — same shape as the
// one already used for CBT bulk import in teacher/cbt/page.tsx.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

const OPTION_LETTERS = ["A", "B", "C", "D"];

function parseQuestionsCsv(text: string): { questions: QuestionRow[]; errors: string[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { questions: [], errors: ["The file is empty."] };
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const looksLikeHeader = header[0] === "question";
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  const questions: QuestionRow[] = [];
  const errors: string[] = [];
  dataRows.forEach((row, i) => {
    const lineNo = i + (looksLikeHeader ? 2 : 1);
    const [question, optA, optB, optC, optD, correctRaw, scoreRaw] = row.map((f) => f.trim());
    if (!question) { errors.push(`Row ${lineNo}: missing question text.`); return; }
    const options = [optA, optB, optC, optD].filter((o): o is string => !!o && o.length > 0);
    if (options.length < 2) { errors.push(`Row ${lineNo}: needs at least 2 non-empty options.`); return; }
    const letter = (correctRaw ?? "").toUpperCase();
    const correctIndex = OPTION_LETTERS.indexOf(letter);
    if (correctIndex < 0 || correctIndex >= options.length) {
      errors.push(`Row ${lineNo}: "correct" must be a letter (A-D) matching one of the filled-in options.`);
      return;
    }
    const score = Number(scoreRaw);
    questions.push({ question, options, correctIndex, score: Number.isFinite(score) && score > 0 ? score : 1 });
  });
  return { questions, errors };
}

export default function AdmissionsTestBankPage() {
  const [tests, setTests] = useState<AdmTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", section: "", durationMinutes: "30", passMark: "" });

  const [active, setActive] = useState<AdmTest | null>(null);
  const [questions, setQuestions] = useState<AdmQuestion[]>([]);
  const [attempts, setAttempts] = useState<AdmAttempt[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newQ, setNewQ] = useState<QuestionRow>(blankQuestion());
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<AdmTest[]>("admissionsTest");
      setTests(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openTest(t: AdmTest) {
    setActive(t);
    setDetailLoading(true);
    try {
      const d = await api<AdmTest & { questions: AdmQuestion[]; attempts: AdmAttempt[] }>(`admissionsTest/${t.id}`);
      setQuestions(d.questions);
      setAttempts(d.attempts);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function createTest() {
    if (!createForm.title.trim()) return alert("Title is required");
    setSaving(true);
    try {
      await api("admissionsTest", {
        method: "POST",
        body: {
          title: createForm.title,
          section: createForm.section || undefined,
          durationMinutes: Number(createForm.durationMinutes) || 30,
          passMark: createForm.passMark ? Number(createForm.passMark) : undefined,
        },
      });
      setCreating(false);
      setCreateForm({ title: "", section: "", durationMinutes: "30", passMark: "" });
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: AdmTest) {
    try {
      await api(`admissionsTest/${t.id}`, { method: "PATCH", body: { isActive: !t.isActive } });
      await refresh();
      if (active?.id === t.id) setActive({ ...active, isActive: !t.isActive });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function deleteTest(t: AdmTest) {
    if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
    try {
      await api(`admissionsTest/${t.id}`, { method: "DELETE" });
      if (active?.id === t.id) setActive(null);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function addQuestion() {
    if (!active) return;
    if (!newQ.question.trim() || newQ.options.filter((o) => o.trim()).length < 2) {
      return alert("A question and at least two options are required");
    }
    setSaving(true);
    try {
      await api(`admissionsTest/${active.id}/addQuestion`, {
        method: "POST",
        body: { question: newQ.question, options: newQ.options.filter((o) => o.trim()), correctIndex: newQ.correctIndex, score: newQ.score },
      });
      setNewQ(blankQuestion());
      setAddOpen(false);
      await openTest(active);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !active) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const { questions: imported, errors } = parseQuestionsCsv(String(reader.result ?? ""));
      setImportErrors(errors);
      if (imported.length === 0) return;
      setSaving(true);
      try {
        const d = await api<{ count: number }>(`admissionsTest/${active.id}/bulkAddQuestions`, { method: "POST", body: { questions: imported } });
        await openTest(active);
        await refresh();
        alert(`Imported ${d.count} question(s).${errors.length ? ` ${errors.length} row(s) skipped — see below.` : ""}`);
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setSaving(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function deleteQuestion(q: AdmQuestion) {
    if (!active || !confirm("Delete this question?")) return;
    try {
      await api(`admissionsTest/${active.id}/deleteQuestion`, { method: "POST", body: { questionId: q.id } });
      await openTest(active);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Entrance test bank"
        subtitle="The CBT applicants take online as part of admissions — no portal account needed."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/portal/applications"><Button variant="ghost"><Icon name="applications" size={14} /> Back to applications</Button></Link>
            <Button variant="accent" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New test</Button>
          </div>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : tests.length === 0 ? (
        <EmptyState title="No entrance tests yet" hint="Create one so applicants can take it right after they apply." />
      ) : (
        <Card>
          <Table headers={["Title", "Section", "Questions", "Attempts", "Active", "Actions"]}>
            {tests.map((t) => (
              <tr key={t.id}>
                <td>
                  <button style={{ textAlign: "left", background: "none", border: "none", padding: 0, fontWeight: 600, cursor: "pointer", color: "var(--duga-primary)" }} onClick={() => openTest(t)}>
                    {t.title}
                  </button>
                </td>
                <td>{t.section ? <Badge tone={t.section === "PRIMARY" ? "info" : "accent"}>{t.section.toLowerCase()}</Badge> : <Badge tone="neutral">all sections</Badge>}</td>
                <td>{t._count.questions}</td>
                <td>{t._count.attempts}</td>
                <td><Badge tone={t.isActive ? "success" : "neutral"}>{t.isActive ? "Active" : "Inactive"}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button size="sm" variant="outline" onClick={() => openTest(t)}>Manage</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(t)}>{t.isActive ? "Deactivate" : "Activate"}</Button>
                    <Button size="sm" variant="danger" onClick={() => deleteTest(t)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Create test modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New entrance test">
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Title" required>
            <Input value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} placeholder="e.g. Junior Secondary Entrance Test" />
          </Field>
          <Field label="Applies to" hint="Leave as 'All sections' to use it for every applicant">
            <Select value={createForm.section} onChange={(e) => setCreateForm({ ...createForm, section: e.target.value })}>
              <option value="">All sections</option>
              <option value="PRIMARY">Primary</option>
              <option value="SECONDARY">Secondary</option>
            </Select>
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" value={createForm.durationMinutes} onChange={(e) => setCreateForm({ ...createForm, durationMinutes: e.target.value })} />
          </Field>
          <Field label="Pass mark (%)" hint="Optional — shown to the applicant as pass/not-yet">
            <Input type="number" value={createForm.passMark} onChange={(e) => setCreateForm({ ...createForm, passMark: e.target.value })} placeholder="e.g. 50" />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={createTest} loading={saving}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Manage test modal */}
      <Modal open={!!active} onClose={() => setActive(null)} title={active ? active.title : ""}>
        {active && (
          <div style={{ display: "grid", gap: 16 }}>
            {detailLoading ? (
              <Spinner size={22} />
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button size="sm" variant="accent" onClick={() => setAddOpen(true)}><Icon name="plus" size={14} /> Add question</Button>
                  <Button size="sm" variant="ghost" onClick={downloadCsvTemplate}><Icon name="reports" size={14} /> Download CSV template</Button>
                  <label className="duga-btn duga-btn--sm duga-btn--outline" style={{ cursor: "pointer" }}>
                    <Icon name="plus" size={14} /> Import CSV
                    <input type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: "none" }} />
                  </label>
                </div>
                {importErrors.length > 0 && (
                  <Alert tone="warning">
                    {importErrors.length} row(s) in the CSV couldn&apos;t be imported and were skipped:
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {importErrors.slice(0, 8).map((err, i) => <li key={i} style={{ fontSize: 12.5 }}>{err}</li>)}
                      {importErrors.length > 8 && <li style={{ fontSize: 12.5 }}>…and {importErrors.length - 8} more.</li>}
                    </ul>
                  </Alert>
                )}

                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Questions ({questions.length})</div>
                  {questions.length === 0 ? (
                    <p style={{ color: "var(--duga-muted)", fontSize: 13.5 }}>No questions yet — add one or import a CSV.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {questions.map((q, qi) => (
                        <div key={q.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{qi + 1}. {q.question}</div>
                            <Button size="sm" variant="ghost" onClick={() => deleteQuestion(q)}>Delete</Button>
                          </div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 12.5 }}>
                            {q.options.map((o, oi) => (
                              <span key={oi} style={{ color: oi === q.correctIndex ? "var(--duga-success, #1a7f37)" : "var(--duga-muted)", fontWeight: oi === q.correctIndex ? 700 : 400 }}>
                                {OPTION_LETTERS[oi]}. {o}{oi === q.correctIndex ? " ✓" : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Applicant attempts ({attempts.length})</div>
                  {attempts.length === 0 ? (
                    <p style={{ color: "var(--duga-muted)", fontSize: 13.5 }}>No one has taken this test yet.</p>
                  ) : (
                    <Table headers={["Applicant", "Score", "Submitted"]}>
                      {attempts.map((a) => (
                        <tr key={a.id}>
                          <td>{a.application?.applicantName ?? "—"}</td>
                          <td>{a.isSubmitted ? <Badge tone={a.percentage != null && a.percentage >= 50 ? "success" : "warning"}>{a.percentage}%</Badge> : <Badge tone="neutral">In progress</Badge>}</td>
                          <td>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Add single question modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add question">
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Question" required>
            <Textarea value={newQ.question} onChange={(e) => setNewQ({ ...newQ, question: e.target.value })} rows={3} />
          </Field>
          {newQ.options.map((opt, oi) => (
            <Field key={oi} label={`Option ${OPTION_LETTERS[oi]}`}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Input
                  value={opt}
                  onChange={(e) => {
                    const options = [...newQ.options];
                    options[oi] = e.target.value;
                    setNewQ({ ...newQ, options });
                  }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, whiteSpace: "nowrap" }}>
                  <input type="radio" checked={newQ.correctIndex === oi} onChange={() => setNewQ({ ...newQ, correctIndex: oi })} /> Correct
                </label>
              </div>
            </Field>
          ))}
          <Field label="Score" hint="Points this question is worth">
            <Input type="number" value={newQ.score} onChange={(e) => setNewQ({ ...newQ, score: Number(e.target.value) || 1 })} />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addQuestion} loading={saving}>Add question</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
