"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Stat, Badge, Select, Alert, Spinner, EmptyState, Icon, Table, Button, Modal, Field, Textarea, Tabs } from "@duga/ui";
import { api } from "@/lib/client/api";
import { BarChart } from "@/components/charts";
import { useSection } from "@/components/SectionContext";

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
  subject: { name: string };
}

interface StudentCard {
  student: { id: string; name: string; admissionNumber: string | null };
  activeTerm: { id: string; name: string } | null;
  reportCard: {
    id: string;
    average: number | null;
    position: number | null;
    remark: string | null;
    psychomotor: Record<string, string> | null;
    items: ReportCardItem[];
    teacherSubmittedAt: string | null;
  } | null;
  attendance: { total: number; present: number; rate: number };
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
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [modalTab, setModalTab] = useState("performance");
  const [showPreview, setShowPreview] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);

  async function openStudent(s: RosterStudent) {
    setStudentTarget(s);
    setStudentCard(null);
    setStudentError(null);
    setStudentLoading(true);
    setModalTab("performance");
    setShowPreview(false);
    try {
      const d = await api<StudentCard>("teacher/studentCard", { query: { studentId: s.id } });
      setStudentCard(d);
      setRemarkDraft(d.reportCard?.remark ?? "");
      setTraitsDraft(d.reportCard?.psychomotor ?? {});
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
        body: { remark: remarkDraft, psychomotor: traitsDraft },
      });
      setStudentCard((c) => (c ? { ...c, reportCard: c.reportCard ? { ...c.reportCard, remark: remarkDraft, psychomotor: traitsDraft } : null } : c));
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
                            <td><Badge tone="neutral">{i.grade ?? "—"}</Badge></td>
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

                    <div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)}>
                        {showPreview ? "Hide" : "Preview"} final draft
                      </Button>
                    </div>

                    {showPreview && (
                      <div style={{ border: "1px dashed var(--duga-border)", borderRadius: 12, padding: 16, background: "var(--duga-surface-2, #f8f9fb)" }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{studentCard.student.name}</div>
                        <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginBottom: 12 }}>
                          {studentCard.activeTerm.name} · Average{" "}
                          {studentCard.reportCard.average !== null && studentCard.reportCard.average !== undefined ? `${Number(studentCard.reportCard.average).toFixed(1)}%` : "—"} · Position{" "}
                          {studentCard.reportCard.position ?? "—"}
                        </div>
                        {studentCard.reportCard.items.length > 0 && (
                          <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
                            {studentCard.reportCard.items.map((i) => (
                              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                                <span>{i.subject.name}</span>
                                <span>{i.total ?? "—"} ({i.grade ?? "—"})</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {Object.keys(traitsDraft).length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Behavioral grades</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {Object.entries(traitsDraft).map(([trait, g]) => (
                                <Badge key={trait} tone="neutral">{trait}: {g || "—"}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Class teacher&apos;s comment</div>
                          <div style={{ fontSize: 13, fontStyle: remarkDraft ? "normal" : "italic", color: remarkDraft ? "inherit" : "var(--duga-muted)" }}>
                            {remarkDraft || "No comment yet"}
                          </div>
                        </div>
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
