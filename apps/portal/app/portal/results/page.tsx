"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Field, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface ReportCard {
  id: string;
  status: string;
  isPublished: boolean;
  gradeAverage: number | null;
  position: number | null;
  term: { name: string } | null;
  student: { user: { firstName: string; lastName: string } };
  classGroup: { level: { name: string }; name: string } | null;
  access?: "granted" | "locked";
  gatedReason?: string | null;
  items?: Array<{ id: string; subject: { name: string }; caScore: number; examScore: number; total: number; grade: string }> | null;
}

interface TeacherClassSubject {
  id: string;
  subject: { name: string };
  classGroup: { level: { name: string }; name: string; students: Array<{ id: string; user: { firstName: string; lastName: string } }> };
}

interface TermOption { id: string; name: string; termNumber: number; status: string; session: { name: string } }

interface EntryRow {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  ca1: number | null;
  ca2: number | null;
  ca3: number | null;
  test: number | null;
  assignment: number | null;
  exam: number | null;
}

interface EntrySheet {
  classSubject: { id: string; subject: string; class: string };
  rows: EntryRow[];
}

export default function ResultsPage() {
  const [role, setRole] = useState<string>("");
  const [cards, setCards] = useState<ReportCard[]>([]);
  const [classSubjects, setClassSubjects] = useState<TeacherClassSubject[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string; termNumber: number; status: string; session: { name: string } }[]>([]);
  const [activeTermId, setActiveTermId] = useState<string>("");
  const [sheet, setSheet] = useState<EntrySheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rankMsg, setRankMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ role: string; reportCards?: ReportCard[]; classSubjects?: TeacherClassSubject[]; terms?: TermOption[]; activeTermId?: string }>("results")
      .then((d) => {
        setRole(d.role);
        setCards(d.reportCards ?? []);
        setClassSubjects(d.classSubjects ?? []);
        setTerms(d.terms ?? []);
        setActiveTermId(d.activeTermId ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function openSheet(csId: string) {
    if (!activeTermId) {
      setRankMsg("No active term selected. Ask an admin to set the term in Settings.");
      return;
    }
    setSheetLoading(true);
    setError(null);
    setRankMsg("");
    try {
      const data = await api<EntrySheet>("results/entrySheet", {
        method: "POST",
        body: { classSubjectId: csId, termId: activeTermId },
      });
      setSheet({ ...data, rows: data.rows.map((r) => ({ ...r })) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSheetLoading(false);
    }
  }

  function setRow(r: EntryRow, key: keyof EntryRow, val: string) {
    if (!sheet) return;
    const v = val === "" ? null : Number(val);
    setSheet({
      ...sheet,
      rows: sheet.rows.map((row) => (row.studentId === r.studentId ? { ...row, [key]: v } : row)),
    });
  }

  async function saveSheet() {
    if (!sheet) return;
    setSaving(true);
    setError(null);
    setRankMsg("");
    try {
      const rows = sheet.rows.map((r) => ({
        studentId: r.studentId,
        ca1: r.ca1 ?? 0,
        ca2: r.ca2 ?? 0,
        ca3: r.ca3 ?? 0,
        test: r.test ?? 0,
        assignment: r.assignment ?? 0,
        exam: r.exam ?? 0,
      }));
      await api("results/saveScores", { method: "POST", body: { classSubjectId: sheet.classSubject.id, termId: activeTermId, rows } });
      setRankMsg("Scores saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading) return <Spinner size={28} />;

  const activeTerm = terms.find((t) => t.id === activeTermId);

  return (
    <div>
      <PageHeader title="Results" subtitle="Report cards and score entry." />

      {role === "TEACHER" && sheet && (
        <Card title={`${sheet.classSubject.subject} — ${sheet.classSubject.class}`}
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button variant="outline" size="sm" onClick={() => setSheet(null)}>Close</Button>
              <Button size="sm" onClick={saveSheet} disabled={saving || sheetLoading}>
                {saving ? "Saving…" : "Save scores"}
              </Button>
            </div>
          }
          style={{ marginBottom: 24 }}>
          {rankMsg && <Alert tone={rankMsg === "Scores saved." ? "success" : "info"}>{rankMsg}</Alert>}
          {sheetLoading ? (
            <Spinner size={24} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="duga-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th style={{ width: 70 }}>CA1</th>
                    <th style={{ width: 70 }}>CA2</th>
                    <th style={{ width: 70 }}>CA3</th>
                    <th style={{ width: 70 }}>Test</th>
                    <th style={{ width: 70 }}>Assign</th>
                    <th style={{ width: 70 }}>Exam (60)</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((r, i) => {
                    const caTotal = Math.min((r.ca1 ?? 0) + (r.ca2 ?? 0) + (r.ca3 ?? 0) + (r.test ?? 0) + (r.assignment ?? 0), 40);
                    const total = caTotal + (r.exam ?? 0);
                    return (
                      <tr key={r.studentId}>
                        <td>{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{r.admissionNumber ?? ""}</div>
                        </td>
                        {(["ca1", "ca2", "ca3", "test", "assignment"] as const).map((k) => (
                          <td key={k}>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--duga-border)", borderRadius: 8, fontSize: 14 }}
                              value={r[k] ?? ""}
                              onChange={(e) => setRow(r, k, String(e.target.valueAsNumber ?? ""))}
                            />
                          </td>
                        ))}
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={60}
                            style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--duga-border)", borderRadius: 8, fontSize: 14 }}
                            value={r.exam ?? ""}
                            onChange={(e) => setRow(r, "exam", String(e.target.valueAsNumber ?? ""))}
                          />
                        </td>
                        <td style={{ fontWeight: 700 }}>{total || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {role === "TEACHER" && (
        <div style={{ marginBottom: 20 }}>
          <Field label="Active term" hint="Entered scores are recorded against this term.">
            <Select value={activeTermId} onChange={(e) => setActiveTermId(e.target.value)}>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.session.name}{t.status === "ACTIVE" ? " (active)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {role === "TEACHER" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16, marginBottom: 24 }}>
          {classSubjects.map((cs) => (
            <Card key={cs.id} title={cs.subject.name}>
              <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 10 }}>
                {cs.classGroup.level.name} {cs.classGroup.name} · {cs.classGroup.students.length} students
              </div>
              <Button variant="outline" size="sm" disabled={sheetLoading} onClick={() => openSheet(cs.id)}>
                Enter scores
              </Button>
            </Card>
          ))}
        </div>
      )}

      {role === "STUDENT" || role === "PARENT" ? (
        cards.length === 0 ? (
          <EmptyState title="No report cards yet" hint="Published report cards will appear here." />
        ) : (
          cards.map((rc) => (
            <Card key={rc.id} title={`${rc.student.user.firstName} ${rc.student.user.lastName}`} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Badge tone="info">{rc.term?.name}</Badge>
                <Badge tone={rc.access === "granted" ? "success" : "warning"}>
                  {rc.access === "granted" ? "Unlocked" : "Locked"}
                </Badge>
                {rc.gradeAverage !== null && <Badge tone="accent">Average: {Number(rc.gradeAverage).toFixed(1)}</Badge>}
                {rc.position !== null && <Badge tone="neutral">Position: {rc.position}</Badge>}
              </div>
              {rc.access === "locked" ? (
                <Alert tone="warning">{rc.gatedReason ?? "Results are locked until fees are cleared."}</Alert>
              ) : (
                <Table headers={["Subject", "CA", "Exam", "Total", "Grade"]}>
                  {(rc.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td>{i.subject.name}</td>
                      <td>{i.caScore}</td>
                      <td>{i.examScore}</td>
                      <td>{i.total}</td>
                      <td><Badge tone="neutral">{i.grade}</Badge></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          ))
        )
      ) : cards.length === 0 ? (
        <EmptyState title="No report cards published yet" />
      ) : (
        <Card>
          <Table headers={["Student", "Class", "Term", "Average", "Position", "Status"]}>
            {cards.map((rc) => (
              <tr key={rc.id}>
                <td>{rc.student.user.firstName} {rc.student.user.lastName}</td>
                <td>{rc.classGroup ? `${rc.classGroup.level.name} ${rc.classGroup.name}` : "—"}</td>
                <td>{rc.term?.name}</td>
                <td>{rc.gradeAverage !== null ? Number(rc.gradeAverage).toFixed(1) : "—"}</td>
                <td>{rc.position ?? "—"}</td>
                <td><Badge tone={rc.isPublished ? "success" : "neutral"}>{rc.isPublished ? "Published" : "Draft"}</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
