"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Alert, Spinner, EmptyState, Button, Modal, Field, Input, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Entry {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { name: string } | null;
  classGroup: { level: { name: string }; name: string } | null;
  teacher: { user: { firstName: string; lastName: string } } | null;
}

interface ExamEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string | null;
  subject: { name: string } | null;
  classGroup: { level: { name: string }; name: string } | null;
}

interface TimetableData {
  grid: Array<{ day: string; index: number; entries: Entry[] }>;
  examTimetable: ExamEntry[];
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function TimetablePage() {
  const [data, setData] = useState<TimetableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    api<TimetableData>("timetable")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function addEntry() {
    try {
      await api("timetable/addEntry", { method: "POST", body: form });
      setOpen(false);
      const d = await api<TimetableData>("timetable");
      setData(d);
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
        actions={<Button onClick={() => setOpen(true)}>Add period</Button>}
      />
      <div className="tt-grid" style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(140px, 1fr))`, minWidth: "max-content" }}>
        {data.grid.map((day) => (
          <div key={day.day} className="duga-card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>{day.day}</div>
            {day.entries.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>No classes</div>
            ) : (
              day.entries.map((e) => (
                <div key={e.id} className="tt-cell" style={{ marginBottom: 6 }}>
                  <strong>{e.subject?.name ?? "—"}</strong>
                  <div>{e.startTime}–{e.endTime}</div>
                  <span>
                    {e.classGroup ? `${e.classGroup.level.name} ${e.classGroup.name}` : ""}
                    {e.teacher ? ` · ${e.teacher.user.firstName[0]}. ${e.teacher.user.lastName}` : ""}
                    {e.room ? ` · ${e.room}` : ""}
                  </span>
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
              <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th>Class</th><th>Venue</th></tr></thead>
              <tbody>
                {data.examTimetable.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.date).toLocaleDateString()}</td>
                    <td>{e.startTime}–{e.endTime}</td>
                    <td>{e.subject?.name}</td>
                    <td>{e.classGroup ? `${e.classGroup.level.name} ${e.classGroup.name}` : "—"}</td>
                    <td>{e.venue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add timetable period">
        <Field label="Day of week" required>
          <Select value={form.dayOfWeek ?? ""} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
            <option value="">Select day…</option>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Period number" required>
          <Input value={form.periodNumber ?? ""} onChange={(e) => setForm({ ...form, periodNumber: e.target.value })} placeholder="1" />
        </Field>
        <Field label="Start time">
          <Input type="time" value={form.startTime ?? ""} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
        </Field>
        <Field label="End time">
          <Input type="time" value={form.endTime ?? ""} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
        </Field>
        <Field label="Class group ID">
          <Input value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })} />
        </Field>
        <Field label="Subject ID">
          <Input value={form.subjectId ?? ""} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} />
        </Field>
        <Field label="Teacher ID">
          <Input value={form.teacherId ?? ""} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} />
        </Field>
        <Field label="Room">
          <Input value={form.room ?? ""} onChange={(e) => setForm({ ...form, room: e.target.value })} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={addEntry}>Add</Button>
        </div>
      </Modal>
    </div>
  );
}
