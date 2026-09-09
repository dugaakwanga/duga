"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Field, Select, Input, Textarea, Modal, ProgressBar, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";
import {
  downloadReportCardPdf,
  renderReportCardPreviewUrl,
  type ReportCardPdfConfig,
  type ReportCardPdfSchool,
  type ReportCardPdfGradeBand,
} from "@/lib/client/reportCardPdf";

// The seven traits on the school's printed behavioral-assessment grid,
// graded A-E — mirrors packages/core/src/server/reportCard.ts's
// DEFAULT_BEHAVIORAL_TRAITS (kept as a local copy since that module also
// pulls in Prisma, which client code can't import).
const DEFAULT_BEHAVIORAL_TRAITS = ["Neatness", "Punctuality", "Honesty", "Self Control", "Obedience", "Politeness", "Relationship with Others"];

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
  term: { name: string; startDate?: string | null; endDate?: string | null; session?: { name: string } | null } | null;
  student: { id: string; photoUrl?: string | null; admissionNumber?: string; user: { firstName: string; lastName: string } };
  classGroup: { level: { name: string }; name: string } | null;
  access?: "granted" | "locked";
  gatedReason?: string | null;
  items?: Array<{
    id: string;
    subject: { name: string };
    ca: number | null;
    exam: number | null;
    total: number | null;
    grade: string | null;
    remark?: string | null;
    position?: number | null;
    classAverage?: number | null;
    componentScores?: Record<string, number> | null;
  }> | null;
  // Behavioral assessment: fixed trait name -> single-letter grade (A-E).
  psychomotor?: Record<string, string> | null;
  attendanceRemark?: string | null;
  remark?: string | null;
  studentAge?: number | null;
  schoolDaysOpened?: number | null;
  daysPresent?: number | null;
  feesOwed?: number | string | null;
  nextTermFees?: number | string | null;
  feesPayableBy?: string | null;
  formMasterName?: string | null;
  principalComment?: string | null;
  principalName?: string | null;
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

// Orders class names like "Primary 1 A", "Primary 10 A" the way a human
// would (numerically), rather than the lexicographic sort that would put
// "Primary 10" before "Primary 2".
function classNameCompare(a: string, b: string): number {
  const parts = (s: string) => s.match(/\d+|\D+/g) ?? [s];
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== "" && y !== "") {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x.localeCompare(y);
    }
  }
  return 0;
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
  const [gradingScale, setGradingScale] = useState<ReportCardPdfGradeBand[]>([]);
  const [sheet, setSheet] = useState<EntrySheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rankMsg, setRankMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printClassId, setPrintClassId] = useState("");
  const [printTermId, setPrintTermId] = useState("");
  const { section } = useSection();

  // Report card details editor: behavioral grades, Form Master's/Principal's
  // comments and names, and the auto-computed (but overridable) fees fields.
  const [detailsTarget, setDetailsTarget] = useState<ReportCard | null>(null);
  const [detailsForm, setDetailsForm] = useState<{
    psychomotor: Record<string, string>;
    remark: string;
    formMasterName: string;
    principalComment: string;
    principalName: string;
    feesOwed: string;
    nextTermFees: string;
    feesPayableBy: string;
  }>({ psychomotor: {}, remark: "", formMasterName: "", principalComment: "", principalName: "", feesOwed: "", nextTermFees: "", feesPayableBy: "" });
  const [detailsSaving, setDetailsSaving] = useState(false);

  // Admin: mark all draft report cards ready (flag to show publish buttons)
  const [configOpen, setConfigOpen] = useState(false);
  const [draft, setDraft] = useState<{ caCap: number; examCap: number; components: ResultComponent[] }>({ caCap: 40, examCap: 60, components: [] });

  // Report card builder: which sections render on the downloaded PDF, plus
  // the school letterhead needed to render it.
  const [school, setSchool] = useState<ReportCardPdfSchool | null>(null);
  const [reportCardConfig, setReportCardConfig] = useState<ReportCardPdfConfig | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderDraft, setBuilderDraft] = useState<ReportCardPdfConfig | null>(null);
  const [builderSaving, setBuilderSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Auto-save drafts while a teacher is entering scores — the entry grid
  // previously only held edits in local state with no save path at all
  // until "Submit to admin" (which just flips a lock flag on rows that,
  // without this, were never created). A short debounce after the last
  // keystroke persists the draft via the same saveScores action, independent
  // of the explicit submit step.
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoSave = useRef(false);

  async function downloadPdf(rc: ReportCard) {
    if (!school || !reportCardConfig) return alert("Report card settings are still loading — try again in a moment.");
    setDownloadingId(rc.id);
    try {
      await downloadReportCardPdf(
        school,
        reportCardConfig,
        {
          student: { ...rc.student.user, admissionNumber: rc.student.admissionNumber },
          className: rc.classGroup ? `${rc.classGroup.level.name} ${rc.classGroup.name}` : null,
          term: rc.term,
          sessionName: rc.term?.session?.name ?? null,
          average: rc.average,
          position: rc.position,
          classSize: rc.classSize ?? null,
          gpa: rc.gpa ?? null,
          items: rc.items ? rc.items.map((i) => ({ ...i, remark: i.remark ?? null, position: i.position ?? null })) : null,
          psychomotor: rc.psychomotor ?? null,
          attendanceRemark: rc.attendanceRemark ?? null,
          studentAge: rc.studentAge ?? null,
          schoolDaysOpened: rc.schoolDaysOpened ?? null,
          daysPresent: rc.daysPresent ?? null,
          feesOwed: rc.feesOwed !== undefined && rc.feesOwed !== null ? Number(rc.feesOwed) : null,
          nextTermFees: rc.nextTermFees !== undefined && rc.nextTermFees !== null ? Number(rc.nextTermFees) : null,
          feesPayableBy: rc.feesPayableBy ?? null,
          remark: rc.remark ?? null,
          formMasterName: rc.formMasterName ?? null,
          principalComment: rc.principalComment ?? null,
          principalName: rc.principalName ?? null,
        },
        config?.components,
        gradingScale.length ? gradingScale : undefined,
      );
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  function openBuilder() {
    setBuilderDraft(
      reportCardConfig ?? {
        showCognitive: true,
        showPsychomotor: true,
        showAttendance: true,
        showFees: true,
        showLogo: true,
        showWatermark: false,
        motto: null,
        town: null,
        state: null,
        sectionLabel: null,
        signatureLabels: ["Class Teacher", "Principal"],
      },
    );
    closePreview();
    setBuilderOpen(true);
  }

  async function saveBuilder() {
    if (!builderDraft) return;
    setBuilderSaving(true);
    try {
      await api("results/saveReportCardConfig", { method: "POST", body: builderDraft });
      setReportCardConfig(builderDraft);
      setBuilderOpen(false);
      closePreview();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBuilderSaving(false);
    }
  }

  // Preview the current (possibly unsaved) toggle state on a sample report
  // card, rendered inline in the panel rather than a new tab/window — a
  // popup opened after the async PDF build loses the browser's "user
  // gesture" and gets silently blocked by most browsers regardless of how
  // it's opened, so an embedded <iframe> is the reliable option here.
  async function previewBuilder() {
    if (!builderDraft || !school) return;
    setPreviewing(true);
    try {
      const url = await renderReportCardPreviewUrl(school, builderDraft);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  const BEHAVIORAL_GRADES = ["A", "B", "C", "D", "E"];

  function detailsFormFrom(rc: ReportCard, remarkOverride?: string) {
    const storedTraits = rc.psychomotor && Object.keys(rc.psychomotor).length ? rc.psychomotor : {};
    const traitNames = Object.keys(storedTraits).length ? Object.keys(storedTraits) : DEFAULT_BEHAVIORAL_TRAITS;
    const psychomotor = Object.fromEntries(
      traitNames.map((t) => [t, BEHAVIORAL_GRADES.includes(storedTraits[t] ?? "") ? storedTraits[t]! : ""]),
    );
    return {
      psychomotor,
      remark: remarkOverride ?? rc.remark ?? "",
      formMasterName: rc.formMasterName ?? "",
      principalComment: rc.principalComment ?? "",
      principalName: rc.principalName ?? "",
      feesOwed: rc.feesOwed !== undefined && rc.feesOwed !== null ? String(rc.feesOwed) : "",
      nextTermFees: rc.nextTermFees !== undefined && rc.nextTermFees !== null ? String(rc.nextTermFees) : "",
      feesPayableBy: rc.feesPayableBy ? rc.feesPayableBy.slice(0, 10) : "",
    };
  }

  function openDetails(rc: ReportCard) {
    setDetailsForm(detailsFormFrom(rc));
    setDetailsTarget(rc);
  }

  async function saveDetails() {
    if (!detailsTarget) return;
    setDetailsSaving(true);
    try {
      const body = {
        psychomotor: detailsForm.psychomotor,
        remark: detailsForm.remark,
        formMasterName: detailsForm.formMasterName,
        principalComment: detailsForm.principalComment,
        principalName: detailsForm.principalName,
        feesOwed: detailsForm.feesOwed === "" ? undefined : Number(detailsForm.feesOwed),
        nextTermFees: detailsForm.nextTermFees === "" ? undefined : Number(detailsForm.nextTermFees),
        feesPayableBy: detailsForm.feesPayableBy || undefined,
      };
      await api(`results/${detailsTarget.id}/updateDetails`, { method: "POST", body });
      setCards((old) => old.map((card) => (card.id === detailsTarget.id ? { ...card, ...body } : card)));
      setDetailsTarget(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDetailsSaving(false);
    }
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
      // Open the same details editor pre-filled with the AI draft so the
      // reviewer can read/edit it (and everything else) before saving,
      // instead of a blind window.prompt.
      setDetailsForm(detailsFormFrom(rc, d.reply));
      setDetailsTarget(rc);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  useEffect(() => {
    void section;
    api<{
      role: string;
      reportCards?: ReportCard[];
      classSubjects?: TeacherClassSubject[];
      terms?: TermOption[];
      activeTermId?: string;
      config?: ResultConfig;
      submissions?: Record<string, SubStatus>;
      school?: ReportCardPdfSchool;
      reportCardConfig?: ReportCardPdfConfig;
      gradingScale?: ReportCardPdfGradeBand[];
    }>("results")
      .then((d) => {
        setRole(d.role);
        setCards(d.reportCards ?? []);
        setClassSubjects(d.classSubjects ?? []);
        setTerms(d.terms ?? []);
        setActiveTermId(d.activeTermId ?? "");
        setConfig(d.config ?? null);
        setSubmissions(d.submissions ?? {});
        setSchool(d.school ?? null);
        setReportCardConfig(d.reportCardConfig ?? null);
        setGradingScale(d.gradingScale ?? []);
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
      skipNextAutoSave.current = true;
      setAutoSaveStatus("idle");
      setSheet(data);
      setConfig(data.config);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSheetLoading(false);
    }
  }

  // Debounced auto-save: 1.5s after the last edit, persist every row's
  // current scores as a draft (submitted stays false — only the explicit
  // "Submit to admin" button locks them). Skipped for the load that just
  // populated the sheet, and once it's already submitted/locked.
  useEffect(() => {
    if (!sheet || sheet.submitted) return;
    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        await api("results/saveScores", {
          method: "POST",
          loading: false,
          body: {
            classSubjectId: sheet.classSubject.id,
            termId: activeTermId,
            rows: sheet.rows.map((r) => ({ studentId: r.studentId, scores: r.scores })),
          },
        });
        setAutoSaveStatus("saved");
      } catch {
        setAutoSaveStatus("error");
      }
    }, 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.rows]);

  function setRow(r: EntryRow, comp: string, val: string) {
    if (!sheet) return;
    // Clamp to the component's admin-set maximum so what's stored always
    // matches what's displayed — previously only the computed CA/Exam
    // totals were capped server-side, while the raw per-component value
    // (e.g. typing 999 into a 10-mark component) was stored as-is.
    const max = sheet.config.components.find((c) => c.name === comp)?.max;
    const v = val === "" ? null : Math.max(0, Math.min(Number(val), max ?? Number(val)));
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
      // Flush the latest edits first — submitting shouldn't race the
      // debounced auto-save and lock in stale (or no) scores.
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      await api("results/saveScores", {
        method: "POST",
        loading: false,
        body: { classSubjectId: sheet.classSubject.id, termId: activeTermId, rows: sheet.rows.map((r) => ({ studentId: r.studentId, scores: r.scores })) },
      });
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
  const cardsByClass = Array.from(
    displayedCards.reduce((map, rc) => {
      const className = rc.classGroup ? `${rc.classGroup.level.name} ${rc.classGroup.name}` : "Unassigned";
      const list = map.get(className) ?? [];
      list.push(rc);
      map.set(className, list);
      return map;
    }, new Map<string, ReportCard[]>()),
  ).sort(([a], [b]) => classNameCompare(a, b));

  const submissionRows: SubmissionRow[] = [];
  for (const cs of classSubjects) {
    const status = submissions[cs.id] ?? { entered: 0, submitted: 0, total: cs.classGroup.students.length, allSubmitted: false };
    submissionRows.push({ classSubjectId: cs.id, subjectName: cs.subject.name, className: `${cs.classGroup.level.name} ${cs.classGroup.name}`, status });
  }
  const submissionsByClass = Array.from(
    submissionRows.reduce((map, row) => {
      const list = map.get(row.className) ?? [];
      list.push(row);
      map.set(row.className, list);
      return map;
    }, new Map<string, SubmissionRow[]>()),
  ).sort(([a], [b]) => classNameCompare(a, b));

  return (
    <div>
      <PageHeader
        title={role === "PARENT" ? "Results & Report Cards" : role === "STUDENT" ? "My Results" : "Results"}
        subtitle={
          role === "PARENT"
            ? "Your children's published term report cards."
            : role === "STUDENT"
              ? "Your published term report cards."
              : "Educators enter subject scores, submit them to the administration, and the admin publishes report cards per student."
        }
        actions={
          role === "ADMIN" || role === "OWNER" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" onClick={openBuilder}>
                Report card builder
              </Button>
              <Button variant="outline" onClick={openConfig}>
                Configure result contents
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Entry sheet — teachers enter their own scores; admin/owner can open
          any subject read-only from "Subject submissions" to review what
          was submitted without having to Reopen (and re-lock) it first. */}
      {(role === "TEACHER" || role === "ADMIN" || role === "OWNER") && sheet && (
        <Card
          title={`${sheet.classSubject.subject} — ${sheet.classSubject.class}`}
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {sheet.submitted ? (
                <Badge tone="success">Submitted to admin</Badge>
              ) : role === "TEACHER" ? (
                <>
                  {autoSaveStatus === "saving" && <span style={{ fontSize: 12, color: "var(--duga-muted)" }}>Saving draft…</span>}
                  {autoSaveStatus === "saved" && <span style={{ fontSize: 12, color: "var(--duga-muted)" }}>Draft saved</span>}
                  {autoSaveStatus === "error" && <span style={{ fontSize: 12, color: "var(--duga-danger, #b91c1c)" }}>Draft not saved — check your connection</span>}
                  <Button variant="accent" size="sm" onClick={submitSheet} disabled={saving || sheetLoading}>
                    {saving ? "Submitting…" : "Submit to admin"}
                  </Button>
                </>
              ) : (
                <Badge tone="neutral">Not yet submitted</Badge>
              )}
              <Button variant="outline" size="sm" onClick={() => setSheet(null)}>Close</Button>
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
                  const pct = status.total > 0 ? Math.round((status.entered / status.total) * 100) : 0;
                  const remaining = Math.max(0, status.total - status.entered);
                  const tone = status.allSubmitted ? "success" : pct >= 80 ? "success" : pct >= 40 ? "warning" : "danger";
                  return (
                    <Card key={cs.id} title={cs.subject.name}>
                      <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 12 }}>
                        {cs.classGroup.level.name} {cs.classGroup.name} · {cs.classGroup.students.length} students
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <Badge tone={tone}>{status.allSubmitted ? "Submitted" : `${pct}% entered`}</Badge>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <ProgressBar pct={pct} tone={tone} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, marginBottom: 14 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--duga-muted)" }}>
                          <Icon name="check" size={13} /> {status.entered} of {status.total} entered
                        </span>
                        {remaining > 0 && (
                          <span style={{ color: "var(--duga-danger)", fontWeight: 600 }}>{remaining} remaining</span>
                        )}
                      </div>
                      <Button variant="outline" size="sm" disabled={sheetLoading} onClick={() => openSheet(cs.id)}>
                        <Icon name="assignment" size={14} /> {status.allSubmitted ? "View scores" : status.entered > 0 ? "Continue entering scores" : "Enter scores"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Admin submissions overview — grouped by class rather than one long
          flat table of every class×subject combination in the school. */}
      {(role === "ADMIN" || role === "OWNER") && submissionRows.length > 0 && (
        <Card title={`Subject submissions (${submissionsByClass.length} classes)`} style={{ marginBottom: 24 }}>
          {submissionsByClass.map(([className, rows]) => {
            const fullySubmitted = rows.filter((r) => r.status.allSubmitted).length;
            return (
              <details key={className} open={submissionsByClass.length <= 3} style={{ marginBottom: 10 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--duga-surface-2, #f4f6f9)",
                    fontWeight: 700,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {className}
                  <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--duga-muted)" }}>
                    {rows.length} subject{rows.length === 1 ? "" : "s"}
                  </span>
                  <Badge tone={fullySubmitted === rows.length ? "success" : fullySubmitted > 0 ? "warning" : "neutral"}>
                    {fullySubmitted}/{rows.length} fully submitted
                  </Badge>
                </summary>
                <div style={{ marginTop: 8 }}>
                  <Table headers={["Subject", "Entered", "Submitted", ""]}>
                    {rows.map((row) => {
                      const pct = row.status.total > 0 ? Math.round((row.status.entered / row.status.total) * 100) : 0;
                      return (
                        <tr key={row.classSubjectId}>
                          <td>{row.subjectName}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 110 }}>
                              <div style={{ flex: 1 }}><ProgressBar pct={pct} /></div>
                              <span style={{ fontSize: 12, color: "var(--duga-muted)", whiteSpace: "nowrap" }}>{row.status.entered}/{row.status.total}</span>
                            </div>
                          </td>
                          <td>
                            <Badge tone={row.status.allSubmitted ? "success" : row.status.submitted > 0 ? "warning" : "neutral"}>
                              {row.status.allSubmitted ? "All submitted" : `${row.status.submitted}/${row.status.total} submitted`}
                            </Badge>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              {row.status.entered > 0 && (
                                <Button size="sm" variant="outline" disabled={sheetLoading} onClick={() => openSheet(row.classSubjectId, activeTermId)}>View</Button>
                              )}
                              {row.status.submitted > 0 && (
                                <Button size="sm" variant="ghost" onClick={() => reopenSubject(row.classSubjectId)}>Reopen</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                </div>
              </details>
            );
          })}
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
              {rc.access === "granted" && (
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <Button size="sm" variant="outline" loading={downloadingId === rc.id} onClick={() => downloadPdf(rc)}>Download PDF</Button>
                </div>
              )}
            </Card>
          ))
        )
      ) : cards.length === 0 ? (
        <EmptyState title="No report cards published yet" hint="Teachers enter and submit subject scores; then use the Publish button per student once the class is ready." />
      ) : (
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) minmax(180px,1fr)", gap: 10, alignItems: "end", marginBottom: 12 }}>
            <Field label="Filter by class"><Select value={printClassId} onChange={(e) => setPrintClassId(e.target.value)}><option value="">All classes</option>{printClasses.map(([id, group]) => <option key={id} value={id}>{group.level.name} {group.name}</option>)}</Select></Field>
            <Field label="Filter by term"><Select value={printTermId} onChange={(e) => setPrintTermId(e.target.value)}><option value="">All terms</option>{printTerms.map(([id, term]) => <option key={id} value={id}>{term.name}</option>)}</Select></Field>
          </div>
          {cardsByClass.map(([className, rows]) => {
            const publishedCount = rows.filter((rc) => rc.isPublished).length;
            return (
              <details key={className} open={cardsByClass.length <= 3} style={{ marginBottom: 10 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--duga-surface-2, #f4f6f9)",
                    fontWeight: 700,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {className}
                  <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--duga-muted)" }}>
                    {rows.length} student{rows.length === 1 ? "" : "s"}
                  </span>
                  <Badge tone={publishedCount === rows.length ? "success" : publishedCount > 0 ? "warning" : "neutral"}>
                    {publishedCount}/{rows.length} published
                  </Badge>
                </summary>
                <div style={{ marginTop: 8 }}>
                  <Table headers={["Student", "Term", "Average", "Position", "Status", ""]}>
                    {rows.map((rc) => (
                      <tr key={rc.id}>
                        <td>{rc.student.user.firstName} {rc.student.user.lastName}</td>
                        <td>{rc.term?.name}</td>
                        <td>{rc.average !== null ? Number(rc.average).toFixed(1) : "—"}</td>
                        <td>{rc.position ?? "—"}</td>
                        <td><Badge tone={rc.isPublished ? "success" : "neutral"}>{rc.isPublished ? "Published" : "Draft"}</Badge></td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Button size="sm" variant="outline" loading={downloadingId === rc.id} onClick={() => downloadPdf(rc)}>PDF</Button>
                            {!rc.isPublished && (role === "ADMIN" || role === "OWNER") && rc.termId && (
                              <Button size="sm" variant="accent" onClick={() => publishStudent(rc)}>Publish</Button>
                            )}
                            {(role === "TEACHER" || role === "ADMIN" || role === "OWNER") && <Button size="sm" variant="ghost" onClick={() => openDetails(rc)}>Comments &amp; fees</Button>}
                            {(role === "TEACHER" || role === "ADMIN" || role === "OWNER") && <Button size="sm" variant="outline" onClick={() => draftRemark(rc)}>Draft remark</Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </details>
            );
          })}
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

      {/* Admin: report card visual builder — which sections render on the PDF */}
      {builderOpen && builderDraft && (
        <Card
          title="Report card builder"
          style={{ marginTop: 20 }}
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" size="sm" onClick={previewBuilder} loading={previewing}>Preview template</Button>
              <Button variant="ghost" size="sm" onClick={() => { setBuilderOpen(false); closePreview(); }}>Cancel</Button>
              <Button size="sm" onClick={saveBuilder} loading={builderSaving}>Save</Button>
            </div>
          }
        >
          <Alert tone="info">
            Preview renders a sample report card below, reflecting your current (unsaved) choices — use it to see the effect of each toggle before saving.
          </Alert>
          <Alert tone="info">
            {section
              ? `Editing the report card layout for ${section} only.`
              : "Editing the school-wide default layout, used by any section without its own override."}
          </Alert>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 14 }}>
            <Field label="Motto"><Input value={builderDraft.motto ?? ""} onChange={(e) => setBuilderDraft({ ...builderDraft, motto: e.target.value || null })} placeholder="Imparting the winning wisdom" /></Field>
            <Field label="Section header" hint='Printed under the motto, e.g. "SECONDARY SECTION".'><Input value={builderDraft.sectionLabel ?? ""} onChange={(e) => setBuilderDraft({ ...builderDraft, sectionLabel: e.target.value || null })} placeholder={section ? `${section} Section` : "e.g. Secondary Section"} /></Field>
            <Field label="Town"><Input value={builderDraft.town ?? ""} onChange={(e) => setBuilderDraft({ ...builderDraft, town: e.target.value || null })} /></Field>
            <Field label="State"><Input value={builderDraft.state ?? ""} onChange={(e) => setBuilderDraft({ ...builderDraft, state: e.target.value || null })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 14 }}>
            {([
              ["showCognitive", "Subjects & scores table"],
              ["showPsychomotor", "Behavioral assessment grid"],
              ["showAttendance", "Attendance line"],
              ["showFees", "Fees owed / next term's fees"],
              ["showLogo", "School logo"],
              ["showWatermark", "Watermark"],
            ] as const).map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={builderDraft[key]}
                  onChange={(e) => setBuilderDraft({ ...builderDraft, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Signature lines" hint="Up to 4, in order — e.g. Class Teacher, Principal.">
              <Input
                value={builderDraft.signatureLabels.join(", ")}
                onChange={(e) => setBuilderDraft({ ...builderDraft, signatureLabels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4) })}
                placeholder="Class Teacher, Principal"
              />
            </Field>
          </div>
          {previewUrl && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 8 }}>
                Preview (sample data)
              </div>
              <iframe src={previewUrl} title="Report card preview" style={{ width: "100%", height: 700, border: "1px solid var(--duga-border)", borderRadius: 8 }} />
            </div>
          )}
        </Card>
      )}

      {detailsTarget && (
        <Modal
          open
          onClose={() => setDetailsTarget(null)}
          title={`Comments & fees — ${detailsTarget.student.user.firstName} ${detailsTarget.student.user.lastName}`}
          wide
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => setDetailsTarget(null)}>Cancel</Button>
              <Button onClick={saveDetails} loading={detailsSaving}>Save</Button>
            </div>
          }
        >
          <Field label="Behavioral assessment" hint="Graded A (best) to E.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              {Object.keys(detailsForm.psychomotor).map((trait) => (
                <div key={trait} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13.5 }}>{trait}</span>
                  <Select
                    style={{ maxWidth: 90 }}
                    value={detailsForm.psychomotor[trait] ?? ""}
                    onChange={(e) => setDetailsForm({ ...detailsForm, psychomotor: { ...detailsForm.psychomotor, [trait]: e.target.value } })}
                  >
                    <option value="">—</option>
                    {BEHAVIORAL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </Select>
                </div>
              ))}
            </div>
          </Field>
          <Field label="Form Master's Comment">
            <Textarea rows={2} value={detailsForm.remark} onChange={(e) => setDetailsForm({ ...detailsForm, remark: e.target.value })} />
          </Field>
          <Field label="Form Master's Name">
            <Input value={detailsForm.formMasterName} onChange={(e) => setDetailsForm({ ...detailsForm, formMasterName: e.target.value })} />
          </Field>
          <Field label="Principal's Comment">
            <Textarea rows={2} value={detailsForm.principalComment} onChange={(e) => setDetailsForm({ ...detailsForm, principalComment: e.target.value })} />
          </Field>
          <Field label="Principal's Name">
            <Input value={detailsForm.principalName} onChange={(e) => setDetailsForm({ ...detailsForm, principalName: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <Field label="Fees owed (₦)" hint="Auto-computed from this term's invoice; override if needed.">
              <Input type="number" min={0} value={detailsForm.feesOwed} onChange={(e) => setDetailsForm({ ...detailsForm, feesOwed: e.target.value })} />
            </Field>
            <Field label="Next term's fees (₦)" hint="Auto-computed from next term's fee structure.">
              <Input type="number" min={0} value={detailsForm.nextTermFees} onChange={(e) => setDetailsForm({ ...detailsForm, nextTermFees: e.target.value })} />
            </Field>
            <Field label="Payable on or before">
              <Input type="date" value={detailsForm.feesPayableBy} onChange={(e) => setDetailsForm({ ...detailsForm, feesPayableBy: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}