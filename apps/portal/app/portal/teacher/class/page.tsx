"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Stat, Badge, Select, Alert, Spinner, EmptyState, Icon, Table, Button, Modal, Field, Input, Textarea, Tabs } from "@duga/ui";
import { api } from "@/lib/client/api";
import { BarChart } from "@/components/charts";
import { useSection } from "@/components/SectionContext";
import {
  renderReportCardPreviewUrl,
  type ReportCardPdfSchool,
  type ReportCardPdfConfig,
  type ReportCardPdfComponent,
  type ReportCardPdfGradeBand,
} from "@/lib/client/reportCardPdf";

// A 6-step green -> red gradient keyed to a band's rank among the school's
// configured grade bands — mirrors reportCardPdf.ts's own gradientColorForRank
// so the on-screen grade badges match the printed card.
function gradeBandColor(score: number | null | undefined, scale: ReportCardPdfGradeBand[]): string | undefined {
  if (score === null || score === undefined || score <= 0 || scale.length === 0) return undefined;
  const rank = scale.findIndex((b) => score >= b.min && score <= b.max);
  if (rank === -1) return undefined;
  const t = scale.length <= 1 ? 0 : rank / (scale.length - 1);
  return `hsl(${120 - 120 * t}, 62%, 88%)`;
}

interface RosterStudent {
  id: string;
  name: string;
  admissionNumber: string | null;
  attendanceRate: number | null;
}

interface ReportCardItem {
  id: string;
  ca: number | null;
  exam: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
  position: number | null;
  classAverage: number | null;
  componentScores: Record<string, number> | null;
  subject: { name: string };
}

interface StudentCard {
  student: { id: string; name: string; admissionNumber: string | null; photoUrl: string | null };
  classGroupName: string;
  activeTerm: { id: string; name: string; startDate: string | null; endDate: string | null; sessionName: string | null } | null;
  reportCard: {
    id: string;
    average: number | null;
    position: number | null;
    classSize: number | null;
    gpa: number | null;
    remark: string | null;
    psychomotor: Record<string, string> | null;
    coCurricular: Record<string, string> | null;
    attendanceRemark: string | null;
    studentAge: number | null;
    schoolDaysOpened: number | null;
    daysPresent: number | null;
    daysRecorded: number | null;
    feesOwed: number | string | null;
    nextTermFees: number | string | null;
    feesPayableBy: string | null;
    formMasterName: string | null;
    principalComment: string | null;
    principalName: string | null;
    items: ReportCardItem[];
    teacherSubmittedAt: string | null;
  } | null;
  attendance: { total: number; present: number; rate: number };
  school: ReportCardPdfSchool | null;
  reportCardConfig: ReportCardPdfConfig | null;
  gradingScale: ReportCardPdfGradeBand[];
  components: ReportCardPdfComponent[];
}

interface SubjectPerf {
  name: string;
  teacherName: string;
  value: number;
  passRate: number;
  count: number;
}

interface ClassDashboard {
  classes: Array<{ id: string; name: string; studentCount: number }>;
  selectedClassId: string;
  studentCount: number;
  attendance: Array<{ label: string; value: number }>;
  subjects: SubjectPerf[];
  students: RosterStudent[];
  todayAttendanceRate: number | null;
}

export default function MyClassPage() {
  const [data, setData] = useState<ClassDashboard | null>(null);
  const [classGroupId, setClassGroupId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { section } = useSection();

  const [studentTarget, setStudentTarget] = useState<RosterStudent | null>(null);
  const [studentCard, setStudentCard] = useState<StudentCard | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [traitsDraft, setTraitsDraft] = useState<Record<string, string>>({});
  const [coCurricularDraft, setCoCurricularDraft] = useState<Record<string, string>>({});
  const [formMasterNameDraft, setFormMasterNameDraft] = useState("");
  const [principalCommentDraft, setPrincipalCommentDraft] = useState("");
  const [principalNameDraft, setPrincipalNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [modalTab, setModalTab] = useState("performance");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Renders the SAME PDF the student/parent ultimately sees (not a
  // hand-rolled summary) using whatever grades/comments are currently
  // drafted, so "Preview final draft" is a genuine preview of the real
  // report card, not a stand-in for it.
  async function openPreview() {
    if (!studentCard?.reportCard || !studentCard.school || !studentCard.reportCardConfig) return;
    setPreviewing(true);
    try {
      const url = await renderReportCardPreviewUrl(
        studentCard.school,
        studentCard.reportCardConfig,
        {
          student: { ...(() => { const [firstName, ...rest] = studentCard.student.name.split(" "); return { firstName: firstName ?? studentCard.student.name, lastName: rest.join(" ") }; })(), admissionNumber: studentCard.student.admissionNumber ?? undefined, photoUrl: studentCard.student.photoUrl },
          className: studentCard.classGroupName,
          term: studentCard.activeTerm ? { name: studentCard.activeTerm.name, startDate: studentCard.activeTerm.startDate, endDate: studentCard.activeTerm.endDate } : null,
          sessionName: studentCard.activeTerm?.sessionName ?? null,
          average: studentCard.reportCard.average,
          position: studentCard.reportCard.position,
          classSize: studentCard.reportCard.classSize,
          gpa: studentCard.reportCard.gpa,
          items: studentCard.reportCard.items.map((i) => ({ ...i, subject: i.subject })),
          psychomotor: traitsDraft,
          coCurricular: coCurricularDraft,
          attendanceRemark: studentCard.reportCard.attendanceRemark,
          studentAge: studentCard.reportCard.studentAge,
          schoolDaysOpened: studentCard.reportCard.schoolDaysOpened,
          daysPresent: studentCard.reportCard.daysPresent,
          daysRecorded: studentCard.reportCard.daysRecorded,
          feesOwed: studentCard.reportCard.feesOwed !== null && studentCard.reportCard.feesOwed !== undefined ? Number(studentCard.reportCard.feesOwed) : null,
          nextTermFees: studentCard.reportCard.nextTermFees !== null && studentCard.reportCard.nextTermFees !== undefined ? Number(studentCard.reportCard.nextTermFees) : null,
          feesPayableBy: studentCard.reportCard.feesPayableBy,
          remark: remarkDraft || studentCard.reportCard.remark,
          formMasterName: formMasterNameDraft || studentCard.reportCard.formMasterName,
          principalComment: principalCommentDraft || studentCard.reportCard.principalComment,
          principalName: principalNameDraft || studentCard.reportCard.principalName,
        },
        studentCard.components,
        studentCard.gradingScale,
      );
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function openStudent(s: RosterStudent) {
    setStudentTarget(s);
    setStudentCard(null);
    setStudentError(null);
    setStudentLoading(true);
    setModalTab("performance");
    closePreview();
    try {
      const d = await api<StudentCard>("teacher/studentCard", { query: { studentId: s.id } });
      setStudentCard(d);
      setRemarkDraft(d.reportCard?.remark ?? "");
      setTraitsDraft(d.reportCard?.psychomotor ?? {});
      setCoCurricularDraft(d.reportCard?.coCurricular ?? {});
      setFormMasterNameDraft(d.reportCard?.formMasterName ?? "");
      setPrincipalCommentDraft(d.reportCard?.principalComment ?? "");
      setPrincipalNameDraft(d.reportCard?.principalName ?? "");
    } catch (e) {
      setStudentError((e as Error).message);
    } finally {
      setStudentLoading(false);
    }
  }

  async function submitToAdmin() {
    if (!studentCard?.reportCard) return;
    setSubmitBusy(true);
    try {
      await api(`results/${studentCard.reportCard.id}/submitToAdmin`, { method: "POST" });
      const now = new Date().toISOString();
      setStudentCard((c) => (c && c.reportCard ? { ...c, reportCard: { ...c.reportCard, teacherSubmittedAt: now } } : c));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitBusy(false);
    }
  }

  async function saveStudentDetails() {
    if (!studentCard?.reportCard) return;
    setSaving(true);
    try {
      await api(`results/${studentCard.reportCard.id}/updateDetails`, {
        method: "POST",
        body: {
          remark: remarkDraft,
          psychomotor: traitsDraft,
          coCurricular: coCurricularDraft,
          formMasterName: formMasterNameDraft,
          principalComment: principalCommentDraft,
          principalName: principalNameDraft,
        },
      });
      setStudentCard((c) =>
        c
          ? {
              ...c,
              reportCard: c.reportCard
                ? {
                    ...c.reportCard,
                    remark: remarkDraft,
                    psychomotor: traitsDraft,
                    coCurricular: coCurricularDraft,
                    formMasterName: formMasterNameDraft,
                    principalComment: principalCommentDraft,
                    principalName: principalNameDraft,
                  }
                : null,
            }
          : c,
      );
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function draftWeaknessAwareRemark() {
    if (!studentCard) return;
    const items = studentCard.reportCard?.items ?? [];
    const weak = [...items].filter((i) => i.total !== null).sort((a, b) => (a.total ?? 0) - (b.total ?? 0)).slice(0, 2);
    const focus = weak.length
      ? `Weakest subjects this term: ${weak.map((i) => `${i.subject.name} (${i.total}%)`).join(", ")}. Gently name the specific weak area(s) and suggest one concrete thing to work on, alongside genuine praise for strengths.`
      : undefined;
    setAiBusy(true);
    try {
      const d = await api<{ reply: string }>("ai/remark", {
        method: "POST",
        body: {
          studentName: studentCard.student.name,
          average: studentCard.reportCard?.average ?? undefined,
          className: data?.classes.find((c) => c.id === classGroupId)?.name,
          focus,
        },
      });
      setRemarkDraft(d.reply);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  const load = useCallback(async (targetClassId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<ClassDashboard>("teacher/classDashboard", { query: { classGroupId: targetClassId } });
      setData(d);
      setClassGroupId(d.selectedClassId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const overallAverage = data && data.subjects.length > 0
    ? Math.round(data.subjects.reduce((a, s) => a + s.value, 0) / data.subjects.length)
    : null;

  return (
    <div>
      <PageHeader title="My Class" subtitle="How your class is doing — attendance and performance across every subject, not just the ones you teach." />

      {error === "You are not a class teacher for any class" ? (
        <EmptyState title="You're not a class teacher" hint="This page is only for the teacher assigned as a class's form teacher. Ask an admin if you believe this is wrong." />
      ) : error ? (
        <Alert tone="danger">{error}</Alert>
      ) : loading || !data ? (
        <Spinner size={28} />
      ) : (
        <>
          {data.classes.length > 1 && (
            <div style={{ marginBottom: 18, maxWidth: 320 }}>
              <Select value={classGroupId} onChange={(e) => { setClassGroupId(e.target.value); load(e.target.value); }}>
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.studentCount} students)</option>
                ))}
              </Select>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 20 }}>
            <Stat label="Students" value={data.studentCount} />
            <Stat label="Attendance today" value={data.todayAttendanceRate !== null ? `${data.todayAttendanceRate}%` : "—"} tone="info" />
            <Stat label="Class average" value={overallAverage !== null ? `${overallAverage}%` : "—"} tone="accent" />
            <Stat label="Subjects tracked" value={data.subjects.length} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            <Link href="/portal/teacher/attendance" className="duga-btn duga-btn--accent duga-btn--md">
              <Icon name="attendance" size={16} /> Take attendance
            </Link>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
            <Card title="Attendance rate (last 7 days)">
              <BarChart points={data.attendance} color="var(--duga-info, #0d6efd)" format={(v) => `${v}%`} />
            </Card>

            <Card title="Performance by subject">
              {data.subjects.length === 0 ? (
                <EmptyState title="No published results yet" hint="Subject averages appear once report cards are published for this class." />
              ) : (
                <BarChart points={data.subjects.map((s) => ({ label: s.name, value: s.value }))} color="var(--duga-primary)" format={(v) => `${v}%`} />
              )}
            </Card>
          </div>

          {data.subjects.length > 0 && (
            <Card title="Subject breakdown" style={{ marginTop: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
                {data.subjects.map((s) => (
                  <div key={s.name} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "var(--duga-muted)", marginTop: 2 }}>{s.teacherName}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 800 }}>{s.value}%</span>
                      <Badge tone={s.passRate >= 75 ? "success" : s.passRate >= 50 ? "warning" : "danger"}>{s.passRate}% pass rate</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Students" style={{ marginTop: 18 }}>
            {data.students.length === 0 ? (
              <EmptyState title="No active students in this class" />
            ) : (
              <Table headers={["Student", "Adm. No.", "Attendance", ""]}>
                {data.students.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>{s.admissionNumber ?? "—"}</td>
                    <td>{s.attendanceRate !== null ? `${s.attendanceRate}%` : "—"}</td>
                    <td>
                      <Button size="sm" variant="outline" onClick={() => openStudent(s)}>View performance</Button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      <Modal open={!!studentTarget} onClose={() => setStudentTarget(null)} title={studentTarget?.name ?? ""} wide>
        {studentLoading ? (
          <Spinner size={24} />
        ) : studentError ? (
          <Alert tone="danger">{studentError}</Alert>
        ) : studentCard ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Stat label="Attendance (all-time)" value={`${studentCard.attendance.rate}%`} hint={`${studentCard.attendance.present}/${studentCard.attendance.total} days present`} />
              <Stat label="Term average" value={studentCard.reportCard?.average !== null && studentCard.reportCard?.average !== undefined ? `${Number(studentCard.reportCard.average).toFixed(1)}%` : "—"} />
              <Stat label="Position" value={studentCard.reportCard?.position ?? "—"} />
            </div>

            {!studentCard.activeTerm ? (
              <Alert tone="info">No active term is set — ask an admin to activate one in Settings.</Alert>
            ) : !studentCard.reportCard ? (
              <Alert tone="info">
                No report card yet for {studentCard.activeTerm.name} — an admin needs to collate this class&apos;s report cards first, from Results.
              </Alert>
            ) : (
              <>
                <Tabs
                  tabs={[
                    { id: "performance", label: "Performance" },
                    { id: "report", label: "Report card" },
                  ]}
                  value={modalTab}
                  onChange={setModalTab}
                />

                {modalTab === "performance" ? (
                  studentCard.reportCard.items.length > 0 ? (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Subject scores — {studentCard.activeTerm.name}</div>
                      <Table headers={["Subject", "CA", "Exam", "Total", "Grade"]}>
                        {studentCard.reportCard.items.map((i) => (
                          <tr key={i.id}>
                            <td>{i.subject.name}</td>
                            <td>{i.ca ?? "—"}</td>
                            <td>{i.exam ?? "—"}</td>
                            <td>{i.total ?? "—"}</td>
                            <td>
                              <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontWeight: 700, fontSize: 12.5, background: gradeBandColor(i.total, studentCard.gradingScale) ?? "var(--duga-chip-bg, #eee)" }}>
                                {i.grade ?? "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  ) : (
                    <EmptyState title="No subject scores yet" hint="Scores appear here once subject teachers enter and submit them." />
                  )
                ) : (
                  <div style={{ display: "grid", gap: 16 }}>
                    {studentCard.reportCard.teacherSubmittedAt && (
                      <Alert tone="info">
                        Submitted to admin on {new Date(studentCard.reportCard.teacherSubmittedAt).toLocaleString()} — you can keep editing and re-submit any time.
                      </Alert>
                    )}

                    {Object.keys(coCurricularDraft).length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Psychomotor &amp; affective domain</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
                          {Object.keys(coCurricularDraft).map((trait) => (
                            <Field key={trait} label={trait}>
                              <Select value={coCurricularDraft[trait] ?? ""} onChange={(e) => setCoCurricularDraft((t) => ({ ...t, [trait]: e.target.value }))}>
                                <option value="">—</option>
                                {["A", "B", "C", "D", "E"].map((g) => <option key={g} value={g}>{g}</option>)}
                              </Select>
                            </Field>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(traitsDraft).length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Behavioral grades</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
                          {Object.keys(traitsDraft).map((trait) => (
                            <Field key={trait} label={trait}>
                              <Select value={traitsDraft[trait] ?? ""} onChange={(e) => setTraitsDraft((t) => ({ ...t, [trait]: e.target.value }))}>
                                <option value="">—</option>
                                {["A", "B", "C", "D", "E"].map((g) => <option key={g} value={g}>{g}</option>)}
                              </Select>
                            </Field>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Class teacher&apos;s comment</label>
                        <Button type="button" variant="outline" size="sm" loading={aiBusy} onClick={draftWeaknessAwareRemark}>
                          <Icon name="notes" size={14} /> Draft with AI
                        </Button>
                      </div>
                      <Textarea rows={4} value={remarkDraft} onChange={(e) => setRemarkDraft(e.target.value)} placeholder="e.g. A hardworking pupil who participates well in class..." />
                    </div>

                    <Field label="Form master's name" hint="Printed under your comment on the report card.">
                      <Input value={formMasterNameDraft} onChange={(e) => setFormMasterNameDraft(e.target.value)} placeholder="e.g. Mrs. Grace Adebayo" />
                    </Field>

                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>Principal&apos;s comment</label>
                      <Textarea rows={3} value={principalCommentDraft} onChange={(e) => setPrincipalCommentDraft(e.target.value)} placeholder="Only fill this in if the principal has given you their comment to add." />
                    </div>

                    <Field label="Principal's name">
                      <Input value={principalNameDraft} onChange={(e) => setPrincipalNameDraft(e.target.value)} placeholder="e.g. Mr. Emmanuel Okafor" />
                    </Field>

                    <div>
                      <Button type="button" variant="outline" size="sm" loading={previewing} onClick={previewUrl ? closePreview : openPreview}>
                        {previewUrl ? "Hide preview" : "Preview final draft"}
                      </Button>
                      {!studentCard.school && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--duga-muted)" }}>Report card settings still loading…</span>}
                    </div>

                    {previewUrl && (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 8 }}>
                          This is exactly what the student/parent will see once published
                        </div>
                        <iframe src={previewUrl} title="Report card preview" style={{ width: "100%", height: 700, border: "1px solid var(--duga-border)", borderRadius: 8 }} />
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                      <Button variant="ghost" onClick={() => setStudentTarget(null)}>Close</Button>
                      <Button variant="outline" loading={saving} onClick={saveStudentDetails}>Save</Button>
                      <Button loading={submitBusy} onClick={submitToAdmin}>
                        {studentCard.reportCard.teacherSubmittedAt ? "Re-submit to admin" : "Submit to admin"}
                      </Button>
                    </div>
                  </div>
                )}

                {modalTab === "performance" && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button variant="ghost" onClick={() => setStudentTarget(null)}>Close</Button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
