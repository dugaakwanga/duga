"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Button, Select, Input, Alert, EmptyState } from "@duga/ui";
import { api } from "@/lib/client/api";

interface ClassOption {
  id: string;
  name: string;
  level: { name: string };
  _count: { students: number };
}

interface RosterRow {
  studentId: string;
  admissionNumber: string;
  name: string;
  status: string;
  remark: string | null;
}

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

const STATUSES: Status[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

export default function TeacherAttendancePage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classGroupId, setClassGroupId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    try {
      const res = await api<ClassOption[]>("teacher/formClasses", { method: "POST" });
      setClasses(res);
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  async function loadRoster() {
    if (!classGroupId) return alert("Select a class first");
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ roster: RosterRow[] }>(`attendance/roster?classGroupId=${classGroupId}&date=${date}`, { method: "POST" });
      setRows(res.roster);
      const st: Record<string, Status> = {};
      res.roster.forEach((r) => {
        if (r.status && r.status !== "UNMARKED") st[r.studentId] = r.status as Status;
        else st[r.studentId] = "PRESENT";
      });
      setStatuses(st);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!classGroupId) return alert("Select a class first");
    setSaving(true);
    setMessage(null);
    try {
      const entries = rows.map((r) => ({ studentId: r.studentId, status: statuses[r.studentId] ?? "PRESENT" }));
      const res = await api<{ count: number }>("attendance", { method: "POST", body: { date, classGroupId, entries } });
      setMessage(`Saved attendance for ${res.count} student(s) on ${date}.`);
      loadRoster();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function markAll(st: Status) {
    const next: Record<string, Status> = {};
    rows.forEach((r) => (next[r.studentId] = st));
    setStatuses(next);
  }

  const summary = (s: Status) => rows.filter((r) => statuses[r.studentId] === s).length;

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark attendance for a class, per day. Applies to the selected class group." />

      <Card pad={false}>
        <div className="duga-card__pad">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 180px auto", gap: 10, flexWrap: "wrap" }}>
            <Select value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)}>
              <option value="">Select a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.level.name} {c.name} ({c._count.students} students)</option>
              ))}
            </Select>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button onClick={loadRoster} loading={loading}>Load roster</Button>
          </div>

          {message && <Alert tone="success" >{message}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}

          {rows.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "16px 0 8px" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Quick set:</span>
                {STATUSES.map((s) => (
                  <Button key={s} size="sm" variant="outline" onClick={() => markAll(s)}>{s} ({summary(s)})</Button>
                ))}
                <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--duga-muted)" }}>
                  {rows.length} student(s) on {date}
                </div>
              </div>

              <div className="duga-table-wrap">
                <table className="duga-table">
                  <thead>
                    <tr><th>Student</th><th>Adm No.</th><th colSpan={4}>Status</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.studentId}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td>{r.admissionNumber}</td>
                        <td colSpan={4}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {STATUSES.map((s) => {
                              const active = statuses[r.studentId] === s;
                              return (
                                <Button
                                  key={s}
                                  size="sm"
                                  variant={active ? (s === "ABSENT" ? "danger" : s === "LATE" ? "outline" : "accent") : "ghost"}
                                  onClick={() => setStatuses((prev) => ({ ...prev, [r.studentId]: s }))}
                                >
                                  {s}
                                </Button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <Button onClick={save} loading={saving}>Save attendance</Button>
              </div>
            </>
          )}

          {!loading && !error && classGroupId && rows.length === 0 && (
            <div style={{ marginTop: 16 }}>
              <EmptyState title="No roster" hint="Load the roster to start marking." />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}