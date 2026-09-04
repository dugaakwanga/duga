"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Field, Select, Input } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface ResultComponent {
  name: string;
  category: "CA" | "EXAM";
  max: number;
  order: number;
}

interface ResultConfig {
  id?: string;
  caCap: number;
  examCap: number;
  components: ResultComponent[];
}

interface ReportCard {
  id: string;
  termId?: string;
  classGroupId?: string | null;
  status: string;
  isPublished: boolean;
  average: number | null;
  position: number | null;
  gpa?: number | null;
  classSize?: number | null;
  subjectCount?: number | null;
  term: { name: string } | null;
  student: { id: string; photoUrl?: string | null; user: { firstName: string; lastName: string } };
  classGroup: { level: { name: string }; name: string } | null;
  access?: "granted" | "locked";
  gatedReason?: string | null;
  items?: Array<{ id: string; subject: { name: string }; ca: number | null; exam: number | null; total: number | null; grade: string | null }> | null;
  psychomotor?: Record<string, string> | null;
  coCurricular?: Record<string, string> | null;
  attendanceRemark?: string | null;
  remark?: string | null;
}

interface TeacherClassSubject {
  id: string;
  subject: { name: string };
  classGroup: { id: string; level: { name: string }; name: string; students: Array<{ id: string; user: { firstName: string; lastName: string } }> };
}

interface TermOption { id: string; name: string; termNumber: number; status: string; session: { name: string } }

interface SubStatus {
  entered: number;
  submitted: number;
  total: number;
  allSubmitted: boolean;
}

interface SubmissionRow {
  classSubjectId: string;
  subjectName: string;
  className: string;
  status: SubStatus;
}

interface EntryRow {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  scores: Record<string, number | null>;
  caTotal?: number | null;
  examTotal?: number | null;
  total?: number | null;
  submitted?: boolean;
}

interface EntrySheet {
  classSubject: { id: string; subject: string; class: string };
  config: ResultConfig;
  submitted: boolean;
  rows: EntryRow[];
}

function computeTotals(r: EntryRow, config: ResultConfig) {
  let ca = 0;
  let exam = 0;
  for (const c of config.components) {
    const raw = r.scores[c.name];
    const v = raw == null ? 0 : Math.max(0, Math.min(raw, c.max));
    if (c.category === "EXAM") exam += v;
    else ca += v;
  }
  ca = Math.min(ca, config.caCap);
  exam = Math.min(exam, config.examCap);
  return { ca, exam, total: ca + exam };
}

function gradeOf(score: number): string {
  if (score >= 75) return "A1";
  if (score >= 70) return "B2";
  if (score >= 65) return "B3";
  if (score >= 60) return "C4";
  if (score >= 55) return "C5";
  if (score >= 50) return "C6";
  if (score >= 45) return "D7";
  if (score >= 40) return "E8";
  return "F9";
}

export default function ResultsPage() {
  const [role, setRole] = useState<string>("");
  const [cards, setCards] = useState<ReportCard[]>([]);
  const [classSubjects, setClassSubjects] = useState<TeacherClassSubject[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [activeTermId, setActiveTermId] = useState<string>("");
  const [submissions, setSubmissions] = useState<Record<string, SubStatus>>({});
  const [config, setConfig] = useState<ResultConfig | null>(null);
  const [sheet, setSheet] = useState<EntrySheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rankMsg, setRankMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printClassId, setPrintClassId] = useState("");
  const [printTermId, setPrintTermId] = useState("");
  const { section } = useSection();

  // Admin: mark all draft report cards ready (flag to show publish buttons)
  const [configOpen, setConfigOpen] = useState(false);
  const [draft, setDraft] = useState<{ caCap: number; examCap: number; components: ResultComponent[] }>({ caCap: 40, examCap: 60, components: [] });

  function esc(value: unknown) {
    return String(value ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
  }

  function printableCard(rc: ReportCard) {
    const student = `${rc.student.user.firstName} ${rc.student.user.lastName}`;
    const rows = (rc.items ?? []).map((item) => `<tr><td>${esc(item.subject.name)}</td><td>${esc(item.ca)}</td><td>${esc(item.exam)}</td><td>${esc(item.total)}</td><td>${esc(item.grade)}</td></tr>`).join("");
    const ratings = (title: string, values?: Record<string, string> | null) => values && Object.keys(values).length
      ? `<section><h3>${esc(title)}</h3><table class="ratings"><tbody>${Object.entries(values).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table></section>` : "";
    const scaleRows = [
      ["A1", "75 – 100"], ["B2", "70 – 74"], ["B3", "65 – 69"], ["C4", "60 – 64"], ["C5", "55 – 59"],
      ["C6", "50 – 54"], ["D7", "45 – 49"], ["E8", "40 – 44"], ["F9", "0 – 39"],
    ].map(([g, r]) => `<tr><td class="c">${g}</td><td class="c">${r}</td></tr>`).join("");
    const photo = rc.student.photoUrl
      ? `<img src="${esc(rc.student.photoUrl)}" alt="Passport" style="width:76px;height:76px;border-radius:50%;object-fit:cover;border:2px solid #9aa4b2;display:block;margin:0 auto 8px" />`
      : "";
    const className = rc.classGroup ? `${esc(rc.classGroup.level.name)} ${esc(rc.classGroup.name)}` : "—";
    return `<article class="report">
  <header class="report-head">
    <div class="report-school">De Ultimate Glory Academy</div>
    <div class="report-sub">AKWANGA · NIGERIA</div>
    <h1>STUDENT REPORT CARD</h1>
    <div class="report-term">${esc(rc.term?.name ?? "")} · ${className}</div>
  </header>
  <div class="report-body">
    <div class="report-student">${photo}<div class="report-student-name">${esc(student)}</div></div>
    <table class="summary"><tbody>
      <tr><th>Class</th><td>${className}</td><th>Average</th><td>${rc.average == null ? "—" : esc(Number(rc.average).toFixed(1))}%</td></tr>
      <tr><th>Term</th><td>${esc(rc.term?.name ?? "—")}</td><th>Position</th><td>${rc.position == null ? "—" : esc(String(rc.position))} of ${rc.classSize ?? "—"}</td></tr>
      <tr><th>Subjects</th><td>${esc(String(rc.subjectCount ?? (rc.items ?? []).length))}</td><th>GPA</th><td>${rc.gpa == null ? "—" : esc(Number(rc.gpa).toFixed(2))}</td></tr>
    </tbody></table>
    <table class="grades"><thead><tr><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table>
    <section><h3>Grading scale</h3><table class="scale"><tbody>${scaleRows}</tbody></table></section>
    ${ratings("Psychomotor development", rc.psychomotor)}
    ${ratings("Co-curricular activities", rc.coCurricular)}
    <section>
      <h3>Teacher's remark</h3>
      <p class="remark">${esc(rc.remark ?? "—")}</p>
      <h3>Attendance / conduct</h3>
      <p class="remark">${esc(rc.attendanceRemark ?? "—")}</p>
    </section>
    <div class="report-signs">
      <div><div class="sign-line"></div><span>Class Teacher</span></div>
      <div><div class="sign-line"></div><span>Principal</span></div>
    </div>
  </div>
  <footer class="report-foot">Grading scale — A1: 75–100 · B2: 70–74 · B3: 65–69 · C4–C6: 50–64 · D7–E8: 40–49 · F9: below 40</footer>
</article>`;
  }

  function printCards(selected: ReportCard[]) {
    if (!selected.length) return alert("There are no report cards to print for this selection.");
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return alert("Please allow pop-ups to print report cards.");
    popup.document.write(`<!doctype html><html><head><title>Report cards</title><style>
body{font-family:'Segoe UI',Arial,sans-serif;color:#18202a;margin:0;background:#eef1f6}
.report{max-width:820px;margin:28px auto;background:#fff;padding:0 0 28px;box-shadow:0 2px 14px rgba(0,0,0,.08)}
.report-head{background:linear-gradient(135deg,#1e3a8a,#0b1f4b);color:#fff;text-align:center;padding:22px 18px 16px}
.report-school{font-size:22px;font-weight:800;letter-spacing:.4px}
.report-sub{font-size:11px;letter-spacing:3px;opacity:.85;margin-top:2px}
.report-head h1{font-size:17px;letter-spacing:2px;margin:12px 0 4px;font-weight:800}
.report-term{font-size:13px;opacity:.9}
.report-body{padding:22px 26px}
.report-student{text-align:center;margin-bottom:14px}
.report-student-name{font-size:19px;font-weight:800;color:#1e3a8a}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13.5px}
table.grades th,table.grades td,table.ratings td,table.summary th,table.summary td,table.scale td{border:1px solid #c3cbda;padding:7px 9px;text-align:left}
table.grades thead th,table.summary th{background:#edf2f7;color:#1e3a8a}
table.summary th{width:96px}
table.summary td{font-weight:600}
td.c{text-align:center}
table.scale{width:64%;margin-left:auto;margin-right:auto}
table.scale td{text-align:center;padding:4px 9px}
section h3{margin:16px 0 6px;font-size:14px;color:#1e3a8a;text-transform:uppercase;letter-spacing:.6px}
.remark{padding:8px 12px;background:#f7f9fc;border-radius:6px;min-height:26px;margin:0}
.report-signs{display:flex;gap:40px;margin-top:40px;justify-content:space-between}
.report-signs>div{flex:1;text-align:center;font-size:12.5px;color:#39475b}
.sign-line{border-top:1.5px solid #39475b;margin-bottom:6px;height:26px}
.report-foot{text-align:center;font-size:11px;color:#6b7a90;padding:14px;border-top:1px solid #dfe5ee}
@media print{body{background:#fff}.report{margin:0 auto;box-shadow:none;page-break-after:always}.report:last-child{page-break-after:auto}}
</style></head><body>${selected.map(printableCard).join("")}<script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  async function editDetails(rc: ReportCard) {
    const psychomotorText = window.prompt("Psychomotor ratings (one per line: Skill: Rating)", Object.entries(rc.psychomotor ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"));
    if (psychomotorText === null) return;
    const activitiesText = window.prompt("Co-curricular activities (one per line: Activity: Rating)", Object.entries(rc.coCurricular ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"));
    if (activitiesText === null) return;
    const toRatings = (text: string) => Object.fromEntries(text.split("\n").map((line) => line.split(":")).flatMap(([k, v]) => k?.trim() && v?.trim() ? [[k.trim(), v.trim()] as [string, string]] : []));
    try {
      await api(`results/${rc.id}/updateDetails`, { method: "POST", body: { psychomotor: toRatings(psychomotorText), coCurricular: toRatings(activitiesText), attendanceRemark: window.prompt("Attendance / conduct remark", rc.attendanceRemark ?? "") ?? "", remark: window.prompt("Teacher's remark", rc.remark ?? "") ?? "" } });
      setCards((old) => old.map((card) => card.id === rc.id ? { ...card, psychomotor: toRatings(psychomotorText), coCurricular: toRatings(activitiesText) } : card));
    } catch (e) { alert((e as Error).message); }
  }

  async function draftRemark(rc: ReportCard) {
    try {
      const d = await api<{ reply: string }>("ai/remark", {
        method: "POST",
        body: {
          studentName: `${rc.student.user.firstName} ${rc.student.user.lastName}`,
          className: rc.classGroup ? `${rc.classGroup.level.name} ${rc.classGroup.name}` : undefined,
          average: rc.average != null ? String(Number(rc.average).toFixed(1)) : undefined,
          grade: rc.average != null ? gradeOf(Number(rc.average)) : undefined,
        },
      });
      const remark = window.prompt("AI-drafted remark — edit or press OK to keep:", d.reply);
      if (remark === null) return;
      await api(`results/${rc.id}/updateDetails`, {
        method: "POST",
        body: { psychomotor: rc.psychomotor ?? {}, coCurricular: rc.coCurricular ?? {}, attendanceRemark: rc.attendanceRemark ?? "", remark },
      });
      setCards((old) => old.map((card) => (card.id === rc.id ? { ...card, remark } : card)));
      setRankMsg("Remark saved.");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  useEffect(() => {
    void section;
    api<{ role: string; reportCards?: ReportCard[]; classSubjects?: TeacherClassSubject[]; terms?: TermOption[]; activeTermId?: string; config?: ResultConfig; submissions?: Record<string, SubStatus> }>("results")
      .then((d) => {
        setRole(d.role);
        setCards(d.reportCards ?? []);
        setClassSubjects(d.classSubjects ?? []);
        setTerms(d.terms ?? []);
        setActiveTermId(d.activeTermId ?? "");
        setConfig(d.config ?? null);
        setSubmissions(d.submissions ?? {});
        const focus = new URLSearchParams(window.location.search).get("classSubject");
        if (focus && d.role === "TEACHER" && d.activeTermId) openSheet(focus, d.activeTermId);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [section]);

  async function openSheet(csId: string, termIdOverride?: string) {
    const termId = termIdOverride ?? activeTermId;
    if (!termId) {
      setRankMsg("No active term selected. Ask an admin to set the term in Settings.");
      return;
    }
    setSheetLoading(true);
    setError(null);
    setRankMsg("");
    try {
      const data = await api<EntrySheet>("results/entrySheet", {
        method: "POST",
        body: { classSubjectId: csId, termId },
      });
      setSheet(data);
      setConfig(data.config);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSheetLoading(false);
    }
  }

  function setRow(r: EntryRow, comp: string, val: string) {
    if (!sheet) return;
    const v = val === "" ? null : Math.max(0, Number(val));
    setSheet({
      ...sheet,
      rows: sheet.rows.map((row) => (row.studentId === r.studentId ? { ...row, scores: { ...row.scores, [comp]: v } } : row)),
    });
  }

  async function submitSheet() {
    if (!sheet) return;
    setSaving(true);
    setError(null);
    setRankMsg("");
    try {
      await api("results/submitScores", { method: "POST", body: { classSubjectId: sheet.classSubject.id, termId: activeTermId } });
      setSheet((s) => (s ? { ...s, submitted: true, rows: s.rows.map((r) => ({ ...r, submitted: true })) } : s));
      setRankMsg("Submitted to the admin. Scores for this subject are now locked.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Admin: config editor ----
  function openConfig() {
    if (!config) return;
    setDraft({ caCap: config.caCap, examCap: config.examCap, components: config.components.map((c) => ({ ...c })) });
    setConfigOpen(true);
  }

  async function saveConfig() {
    setSaving(true);
    setError(null);
    try {
      await api("results/saveConfig", {
        method: "POST",
        body: { section: section ?? "", caCap: draft.caCap, examCap: draft.examCap, components: draft.components.map((c, i) => ({ ...c, order: i })) },
      });
      setConfigOpen(false);
      const d = await api<{ config: ResultConfig }>("results");
      setConfig(d.config);
      setRankMsg("Result contents updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reopenSubject(csId: string) {
    if (!activeTermId && terms.length) setActiveTermId(terms.find((t) => t.status === "ACTIVE")?.id ?? terms[0]?.id ?? "");
    const termId = activeTermId || terms[0]?.id || "";
    if (!termId) return alert("No term selected.");
    try {
      await api("results/reopenScores", { method: "POST", body: { classSubjectId: csId, termId } });
      setSubmissions((prev) => ({ ...prev, [csId]: { entered: prev[csId]?.entered ?? 0, total: prev[csId]?.total ?? 0, submitted: 0, allSubmitted: false } }));
      setRankMsg("Subject reopened — teachers can edit scores again.");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function publishStudent(rc: ReportCard) {
    if (!rc.termId) return;
    if (!confirm(`Publish the report card for ${rc.student.user.firstName} ${rc.student.user.lastName}?`)) return;
    try {
      await api("results/publishStudent", { method: "POST", body: { studentId: rc.student.id, termId: rc.termId } });
      loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function loadData() {
    try {
      const d = await api<{ reportCards?: ReportCard[]; config?: ResultConfig; submissions?: Record<string, SubStatus> }>("results");
      setCards(d.reportCards ?? []);
      setConfig(d.config ?? null);
      setSubmissions(d.submissions ?? {});
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading) return <Spinner size={28} />;

  const displayedCards = cards.filter((rc) => (!printClassId || rc.classGroupId === printClassId) && (!printTermId || rc.termId === printTermId));
  const printClasses = Array.from(new Map(cards.filter((rc) => rc.classGroupId && rc.classGroup).map((rc) => [rc.classGroupId!, rc.classGroup!])).entries());
  const printTerms = Array.from(new Map(cards.filter((rc) => rc.termId && rc.term).map((rc) => [rc.termId!, rc.term!])).entries());

  const submissionRows: SubmissionRow[] = [];
  for (const cs of classSubjects) {
    const status = submissions[cs.id] ?? { entered: 0, submitted: 0, total: cs.classGroup.students.length, allSubmitted: false };
    submissionRows.push({ classSubjectId: cs.id, subjectName: cs.subject.name, className: `${cs.classGroup.level.name} ${cs.classGroup.name}`, status });
  }

  return (
    <div>
      <PageHeader
        title="Results"
        subtitle="Educators enter subject scores, submit them to the administration, and the admin publishes report cards per student."
        actions={
          role === "ADMIN" || role === "OWNER" ? (
            <Button variant="outline" onClick={openConfig}>
              Configure result contents
            </Button>
          ) : undefined
        }
      />

      {/* Teacher entry sheet */}
      {role === "TEACHER" && sheet && (
        <Card
          title={`${sheet.classSubject.subject} — ${sheet.classSubject.class}`}
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {sheet.submitted ? (
                <Badge tone="success">Submitted to admin</Badge>
              ) : (
                <>
                  <Button variant="accent" size="sm" onClick={submitSheet} disabled={saving || sheetLoading}>
                    {saving ? "Saving…" : "Submit to admin"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSheet(null)}>Close</Button>
                </>
              )}
            </div>
          }
          style={{ marginBottom: 24 }}
        >
          {rankMsg && <Alert tone={rankMsg.includes("Saved") || rankMsg.includes("Submitted") || rankMsg.includes("updated") ? "success" : "info"}>{rankMsg}</Alert>}
          {sheetLoading ? (
            <Spinner size={24} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="duga-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    {sheet.config.components.map((c) => (
                      <th key={c.name} style={{ width: 76 }} title={`Max ${c.max}`}>
                        {c.name} {c.category === "EXAM" ? `(${c.max})` : ""}
                      </th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((r, i) => {
                    const totals = computeTotals(r, sheet.config);
                    return (
                      <tr key={r.studentId}>
                        <td>{i + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{r.admissionNumber ?? ""}</div>
                        </td>
                        {sheet.config.components.map((c) => (
                          <td key={c.name}>
                            <input
                              type="number"
                              min={0}
                              max={c.max}
                              disabled={sheet.submitted || r.submitted}
                              style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--duga-border)", borderRadius: 8, fontSize: 14 }}
                              value={r.scores[c.name] ?? ""}
                              onChange={(e) => setRow(r, c.name, String(e.target.valueAsNumber ?? ""))}
                            />
                          </td>
                        ))}
                        <td style={{ fontWeight: 700 }}>{totals.total || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--duga-muted)" }}>
                CA ties at {sheet.config.caCap} across its components; Exam at {sheet.config.examCap}. Once submitted, scores lock until an admin reopens them.
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Teacher subjects + term */}
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
        <div style={{ display: "grid", gap: 20, marginBottom: 24 }}>
          {Array.from(new Map(classSubjects.map((cs) => [cs.classGroup.id, cs.classGroup])).entries()).map(([classId, cls]) => (
            <section key={classId} className="classes-section">
              <h2 style={{ fontSize: 16, margin: "0 0 10px", color: "var(--duga-primary-ink)" }}>
                {cls.level.name} {cls.name}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
                {classSubjects.filter((cs) => cs.classGroup.id === classId).map((cs) => {
                  const status = submissions[cs.id] ?? { entered: 0, submitted: 0, total: cs.classGroup.students.length, allSubmitted: false };
                  return (
                    <Card key={cs.id} title={cs.subject.name}>
                      <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 10 }}>
                        {cs.classGroup.level.name} {cs.classGroup.name} · {cs.classGroup.students.length} students
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                        {status.allSubmitted ? (
                          <Badge tone="success">Submitted</Badge>
                        ) : status.submitted > 0 ? (
                          <Badge tone="warning">{status.submitted}/{status.total} submitted</Badge>
                        ) : (
                          <Badge tone="neutral">{status.entered}/{status.total} entered</Badge>
                        )}
                      </div>
                      <Button variant="outline" size="sm" disabled={sheetLoading} onClick={() => openSheet(cs.id)}>
                        {status.allSubmitted ? "View results" : "Enter scores"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Admin submissions overview */}
      {(role === "ADMIN" || role === "OWNER") && submissionRows.length > 0 && (
        <Card title="Subject submissions" style={{ marginBottom: 24 }}>
          <Table headers={["Class", "Subject", "Entered", "Submitted", ""]}>
            {submissionRows.map((row) => (
              <tr key={row.classSubjectId}>
                <td>{row.className}</td>
                <td>{row.subjectName}</td>
                <td>{row.status.entered}/{row.status.total}</td>
                <td>
                  <Badge tone={row.status.allSubmitted ? "success" : row.status.submitted > 0 ? "warning" : "neutral"}>
                    {row.status.allSubmitted ? "All submitted" : `${row.status.submitted}/${row.status.total} submitted`}
                  </Badge>
                </td>
                <td>
                  {row.status.submitted > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => reopenSubject(row.classSubjectId)}>Reopen</Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Students / parents */}
      {role === "STUDENT" || role === "PARENT" ? (
        cards.length === 0 ? (
          <EmptyState title="No report cards yet" hint="Published report cards will appear here." />
        ) : (
          cards.map((rc) => (
            <Card key={rc.id} title={`${rc.student.user.firstName} ${rc.student.user.lastName}`} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                {rc.student.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rc.student.photoUrl} alt={`${rc.student.user.firstName} ${rc.student.user.lastName}`} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--duga-border)", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, var(--duga-primary), var(--duga-gold))", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>
                    {`${(rc.student.user.firstName[0] ?? "")}${(rc.student.user.lastName[0] ?? "")}`.toUpperCase()}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge tone="info">{rc.term?.name}</Badge>
                  <Badge tone={rc.access === "granted" ? "success" : "warning"}>
                    {rc.access === "granted" ? "Unlocked" : "Locked"}
                  </Badge>
                  {rc.average !== null && <Badge tone="accent">Average: {Number(rc.average).toFixed(1)}</Badge>}
                  {rc.position !== null && <Badge tone="neutral">Position: {rc.position}</Badge>}
                </div>
              </div>
              {rc.access === "locked" ? (
                <Alert tone="warning">{rc.gatedReason ?? "Results are locked until fees are cleared."}</Alert>
              ) : (
                <Table headers={["Subject", "CA", "Exam", "Total", "Grade"]}>
                  {(rc.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td>{i.subject.name}</td>
                      <td>{i.ca ?? "—"}</td>
                      <td>{i.exam ?? "—"}</td>
                      <td>{i.total ?? "—"}</td>
                      <td><Badge tone="neutral">{i.grade ?? "—"}</Badge></td>
                    </tr>
                  ))}
                </Table>
              )}
              {rc.access === "granted" && <div style={{ marginTop: 12 }}><Button size="sm" variant="outline" onClick={() => printCards([rc])}>Print result</Button></div>}
            </Card>
          ))
        )
      ) : cards.length === 0 ? (
        <EmptyState title="No report cards published yet" hint="Teachers enter and submit subject scores; then use the Publish button per student once the class is ready." />
      ) : (
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) minmax(180px,1fr) auto", gap: 10, alignItems: "end", marginBottom: 12 }}>
            <Field label="Class to print"><Select value={printClassId} onChange={(e) => setPrintClassId(e.target.value)}><option value="">All classes</option>{printClasses.map(([id, group]) => <option key={id} value={id}>{group.level.name} {group.name}</option>)}</Select></Field>
            <Field label="Term to print"><Select value={printTermId} onChange={(e) => setPrintTermId(e.target.value)}><option value="">All terms</option>{printTerms.map(([id, term]) => <option key={id} value={id}>{term.name}</option>)}</Select></Field>
            <Button variant="outline" onClick={() => printCards(displayedCards)}>Print selected results</Button>
          </div>
          <Table headers={["Student", "Class", "Term", "Average", "Position", "Status", ""]}>
            {displayedCards.map((rc) => (
              <tr key={rc.id}>
                <td>{rc.student.user.firstName} {rc.student.user.lastName}</td>
                <td>{rc.classGroup ? `${rc.classGroup.level.name} ${rc.classGroup.name}` : "—"}</td>
                <td>{rc.term?.name}</td>
                <td>{rc.average !== null ? Number(rc.average).toFixed(1) : "—"}</td>
                <td>{rc.position ?? "—"}</td>
                <td><Badge tone={rc.isPublished ? "success" : "neutral"}>{rc.isPublished ? "Published" : "Draft"}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" variant="outline" onClick={() => printCards([rc])}>Print</Button>
                    {!rc.isPublished && (role === "ADMIN" || role === "OWNER") && rc.termId && (
                      <Button size="sm" variant="accent" onClick={() => publishStudent(rc)}>Publish</Button>
                    )}
                    {(role === "TEACHER" || role === "ADMIN" || role === "OWNER") && <Button size="sm" variant="ghost" onClick={() => editDetails(rc)}>Rate extras</Button>}
                    {(role === "TEACHER" || role === "ADMIN" || role === "OWNER") && <Button size="sm" variant="outline" onClick={() => draftRemark(rc)}>Draft remark</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Admin: configure result contents */}
      {configOpen && config && (
        <Card
          title="Configure result contents"
          style={{ marginTop: 20 }}
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => setConfigOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={saveConfig} loading={saving}>Save configuration</Button>
            </div>
          }
        >
          <Alert tone="info">
            {section
              ? `Editing the result configuration for ${section} only — other sections keep their own settings (or the school-wide default) unaffected.`
              : "Editing the school-wide default configuration, used by any section without its own override. Switch to a specific section above to configure it independently."}
          </Alert>
          <Alert tone="info">
            These are the score columns teachers enter and the maximums allowed. The totals are capped at the CA and Exam ceilings below.
          </Alert>
          <div className="duga-form-grid" style={{ marginTop: 14 }}>
            <Field label="CA ceiling (max)" hint={`Sum of all CA components is capped here (default 40).`}>
              <Input type="number" min={0} value={String(draft.caCap)} onChange={(e) => setDraft({ ...draft, caCap: Number(e.target.valueAsNumber ?? 0) })} />
            </Field>
            <Field label="Exam ceiling (max)" hint={`Sum of all Exam components is capped here (default 60).`}>
              <Input type="number" min={0} value={String(draft.examCap)} onChange={(e) => setDraft({ ...draft, examCap: Number(e.target.valueAsNumber ?? 0) })} />
            </Field>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginTop: 16, marginBottom: 8 }}>
            Components
          </div>
          {draft.components.map((c, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <Input value={c.name} placeholder="Name (e.g. CA2)" onChange={(e) => setDraft({ ...draft, components: draft.components.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)) })} />
              <Select value={c.category} onChange={(e) => setDraft({ ...draft, components: draft.components.map((x, i) => (i === idx ? { ...x, category: e.target.value as "CA" | "EXAM" } : x)) })}>
                <option value="CA">CA</option>
                <option value="EXAM">Exam</option>
              </Select>
              <Input type="number" min={0} value={String(c.max)} onChange={(e) => setDraft({ ...draft, components: draft.components.map((x, i) => (i === idx ? { ...x, max: Number(e.target.valueAsNumber ?? 0) } : x)) })} />
              <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, components: draft.components.filter((_, i) => i !== idx) })}>Remove</Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraft({ ...draft, components: [...draft.components, { name: "", category: "CA", max: 10, order: draft.components.length }] })}
          >
            Add component
          </Button>
          {draft.components.some((c) => !c.name) && <Alert tone="warning">Name every component before saving.</Alert>}
        </Card>
      )}
    </div>
  );
}