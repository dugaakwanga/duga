"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Alert, Spinner, EmptyState, Button, Modal, Field, Input, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Entry {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { id: string; name: string } | null;
  classGroup: { id: string; level: { name: string }; name: string } | null;
  teacher: { id: string; user: { firstName: string; lastName: string } } | null;
}

interface ExamEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string | null;
  subject: { id: string; name: string } | null;
  classGroup: { id: string; level: { name: string }; name: string } | null;
}

interface TimetableData {
  grid: Array<{ day: string; index: number; entries: Entry[] }>;
  examTimetable: ExamEntry[];
  refs?: {
    classes: Array<{ id: string; level: { name: string }; name: string }>;
    subjects: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; firstName: string; lastName: string }>;
    terms: Array<{ id: string; name: string }>;
  };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const emptyForm = (): Record<string, string> => ({});

export default function TimetablePage() {
  const [data, setData] = useState<TimetableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"" | "entry" | "exam">("");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm());

  const isAdmin = !!data?.refs;

  const load = useCallback(() => {
    return api<TimetableData>("timetable")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openModal(kind: "entry" | "exam", target?: { id?: string; form: Record<string, string> }) {
    setModal(kind);
    setEditId(target?.id ?? null);
    setForm(target?.form ?? emptyForm());
  }

  async function submit() {
    if (!modal) return;
    try {
      const id = editId;
      const endpoint =
        modal === "entry"
          ? id
            ? `timetable/${id}/updateEntry`
            : "timetable/addEntry"
          : id
            ? `timetable/${id}/updateExam`
            : "timetable/addExam";
      await api(endpoint, { method: "POST", body: form });
      setModal("");
      setEditId(null);
      setForm(emptyForm());
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(kind: "entry" | "exam", id: string) {
    if (!confirm("Delete this timetable entry?")) return;
    try {
      await api(`timetable/${id}/${kind === "entry" ? "removeEntry" : "removeExam"}`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  return (
    <div>
      <PageHeader
        title="Timetable"
        subtitle="Weekly class schedule."
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" onClick={() => openModal("exam")} style={{ marginRight: 10 }}><span style={{ marginRight: 4 }}>＋</span> Exam entry</Button>
              <Button onClick={() => openModal("entry")}>Add period</Button>
            </>
          ) : undefined
        }
      />
      <div className="tt-grid" style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(140px, 1fr))`, minWidth: "max-content" }}>
        {data.grid.map((day) => (
          <div key={day.day} className="duga-card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>{day.day}</div>
            {day.entries.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>No classes</div>
            ) : (
              day.entries.map((e) => (
                <div key={e.id} className="tt-cell" style={{ marginBottom: 6, position: "relative" }}>
                  <strong>{e.subject?.name ?? "—"}</strong>
                  <div>{e.startTime}–{e.endTime}</div>
                  <span>
                    {e.classGroup ? `${e.classGroup.level.name} ${e.classGroup.name}` : ""}
                    {e.teacher ? ` · ${e.teacher.user.firstName[0]}. ${e.teacher.user.lastName}` : ""}
                    {e.room ? ` · ${e.room}` : ""}
                  </span>
                  {isAdmin && (
                    <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
                      <button
                        className="duga-btn duga-btn--sm duga-btn--ghost"
                        style={{ fontSize: 11, padding: "0 4px" }}
                        onClick={() =>
                          openModal("entry", {
                            id: e.id,
                            form: {
                              classGroupId: e.classGroup?.id ?? "",
                              subjectId: e.subject?.id ?? "",
                              teacherId: e.teacher?.id ?? "",
                              dayOfWeek: String(e.dayOfWeek),
                              periodNumber: String(e.periodNumber),
                              startTime: e.startTime,
                              endTime: e.endTime,
                              room: e.room ?? "",
                            },
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="duga-btn duga-btn--sm duga-btn--ghost"
                        style={{ fontSize: 11, padding: "0 4px" }}
                        onClick={() => remove("entry", e.id)}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      <Card title="Examination timetable" style={{ marginTop: 24 }}>
        {data.examTimetable.length === 0 ? (
          <EmptyState title="No exam timetable yet" />
        ) : (
          <div className="duga-table-wrap">
            <table className="duga-table">
              <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th>Class</th><th>Venue</th>{isAdmin && <th>Actions</th>}</tr></thead>
              <tbody>
                {data.examTimetable.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.date).toLocaleDateString()}</td>
                    <td>{e.startTime}–{e.endTime}</td>
                    <td>{e.subject?.name}</td>
                    <td>{e.classGroup ? `${e.classGroup.level.name} ${e.classGroup.name}` : "—"}</td>
                    <td>{e.venue ?? "—"}</td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="sm" variant="ghost" onClick={() => openModal("exam", { id: e.id, form: { subjectId: e.subject?.id ?? "", classGroupId: e.classGroup?.id ?? "", date: new Date(e.date).toISOString().slice(0, 10), startTime: e.startTime, endTime: e.endTime, venue: e.venue ?? "" } })}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => remove("exam", e.id)}>Delete</Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => { setModal(""); setEditId(null); setForm(emptyForm()); }} title={`${editId ? "Edit" : "Add"} timetable ${modal === "entry" ? "period" : "exam entry"}`} wide>
        {modal === "entry" && (
          <>
            <div className="duga-form-grid">
              <Field label="Day of week" required>
                <Select value={form.dayOfWeek ?? ""} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                  <option value="">Select day…</option>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Period number" required>
                <Input type="number" value={form.periodNumber ?? ""} onChange={(e) => setForm({ ...form, periodNumber: e.target.value })} placeholder="1" />
              </Field>
            </div>
            <div className="duga-form-grid">
              <Field label="Start time" required>
                <Input type="time" value={form.startTime ?? ""} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </Field>
              <Field label="End time" required>
                <Input type="time" value={form.endTime ?? ""} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </Field>
            </div>
            <Field label="Class group" required>
              <Select value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}>
                <option value="">Select class…</option>
                {data.refs?.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.level.name} {c.name}</option>
                ))}
              </Select>
            </Field>
            <div className="duga-form-grid">
              <Field label="Subject" required>
                <Select value={form.subjectId ?? ""} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                  <option value="">Select subject…</option>
                  {data.refs?.subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Teacher" required>
                <Select value={form.teacherId ?? ""} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                  <option value="">Select teacher…</option>
                  {data.refs?.teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="duga-form-grid">
              <Field label="Term">
                <Select value={form.termId ?? ""} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
                  <option value="">—</option>
                  {data.refs?.terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Room">
                <Input value={form.room ?? ""} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. Hall B" />
              </Field>
            </div>
          </>
        )}
        {modal === "exam" && (
          <>
            <div className="duga-form-grid">
              <Field label="Subject" required>
                <Select value={form.subjectId ?? ""} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                  <option value="">Select subject…</option>
                  {data.refs?.subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Class group">
                <Select value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}>
                  <option value="">All classes</option>
                  {data.refs?.classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.level.name} {c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="duga-form-grid">
              <Field label="Date" required>
                <Input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Term">
                <Select value={form.termId ?? ""} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
                  <option value="">—</option>
                  {data.refs?.terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="duga-form-grid">
              <Field label="Start time">
                <Input type="time" value={form.startTime ?? "09:00"} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </Field>
              <Field label="End time">
                <Input type="time" value={form.endTime ?? "11:30"} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </Field>
            </div>
            <Field label="Venue">
              <Input value={form.venue ?? ""} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. Main Hall" />
            </Field>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setModal(""); setEditId(null); setForm(emptyForm()); }}>Cancel</Button>
          <Button onClick={submit}>{editId ? "Save changes" : "Add"}</Button>
        </div>
      </Modal>
    </div>
  );
}