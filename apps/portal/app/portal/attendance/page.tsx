"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Input, Select, Button, Stat } from "@duga/ui";
import { api } from "@/lib/client/api";

interface RecordRow {
  id: string;
  status: string;
  remark: string | null;
  date: string;
  student: { user: { firstName: string; lastName: string } };
  classGroup: { level: { name: string }; name: string } | null;
}

interface ChildSummary {
  studentId: string;
  name: string;
  summary: Record<string, number>;
  total: number;
}

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

type MarkStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
const MARK_STATUSES: MarkStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

function statusTone(status: string): "success" | "warning" | "info" | "danger" {
  return status === "PRESENT" ? "success" : status === "LATE" ? "warning" : status === "EXCUSED" ? "info" : "danger";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// Mark or correct attendance, right on the same page the records are
// viewed — two scopes share this:
// - "admin": every class in the school, any date (including the past, to
//   retroactively override whatever a class teacher already took).
// - "teacher": only the teacher's own form class, TODAY only — a class
//   teacher can fix a mismarked student the same day, but retroactively
//   rewriting an earlier day's record is an admin-only override, same as
//   everywhere else attendance correction is scoped in this app.
function MarkPanel({ scope, onSaved }: { scope: "admin" | "teacher"; onSaved: () => void }) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classGroupId, setClassGroupId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, MarkStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Whether ANY student in the loaded roster has a real, saved record for
  // this date — if none do, every "PRESENT" shown below is just this
  // form's own default for an unmarked student (so a fresh sheet doesn't
  // require clicking PRESENT for everyone), not something actually
  // recorded. Surfaced explicitly so picking an arbitrary date — even one
  // before the school ever used this app — doesn't look like it returned
  // real historical attendance.
  const [hasExistingRecords, setHasExistingRecords] = useState(true);
  // When a date has no real records, the roster/marking table is hidden
  // behind this explicit confirmation instead of showing right away — a
  // list of every student's name defaulted to PRESENT read as real
  // attendance even with a banner above it. Reset on every fresh load.
  const [confirmedNoData, setConfirmedNoData] = useState(false);

  useEffect(() => {
    const req = scope === "admin" ? api<{ items: ClassOption[] }>("classes") : api<ClassOption[]>("teacher/formClasses", { method: "POST" }).then((items) => ({ items }));
    req.then((d) => setClasses(d.items)).catch(() => undefined);
  }, [scope]);

  async function loadRoster() {
    if (!classGroupId) return alert("Select a class first");
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{ roster: RosterRow[] }>(`attendance/roster?classGroupId=${classGroupId}&date=${date}`, { method: "POST" });
      setRows(res.roster);
      setHasExistingRecords(res.roster.some((r) => r.status && r.status !== "UNMARKED"));
      setConfirmedNoData(false);
      const st: Record<string, MarkStatus> = {};
      res.roster.forEach((r) => {
        st[r.studentId] = r.status && r.status !== "UNMARKED" ? (r.status as MarkStatus) : "PRESENT";
      });
      setStatuses(st);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!classGroupId) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const entries = rows.map((r) => ({ studentId: r.studentId, status: statuses[r.studentId] ?? "PRESENT" }));
      const res = await api<{ count: number }>("attendance", { method: "POST", body: { date, classGroupId, entries } });
      setMessage(`Saved attendance for ${res.count} student(s) on ${date}.`);
      onSaved();
      loadRoster();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function clearDay() {
    if (!classGroupId) return;
    if (!confirm(`Clear ALL attendance recorded for this class on ${date}? Every student goes back to unmarked. This cannot be undone.`)) return;
    setClearing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api<{ count: number }>("attendance/clearDay", { method: "POST", body: { date, classGroupId } });
      setMessage(`Cleared ${res.count} record(s) for ${date} — the class is back to unmarked.`);
      onSaved();
      loadRoster();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClearing(false);
    }
  }

  const isPast = scope === "admin" && date < todayIso();

  return (
    <Card title={scope === "admin" ? "Mark or correct attendance" : "Mark or edit today's attendance"} pad={false} style={{ marginBottom: 20 }}>
      <div className="duga-card__pad">
        <div className="duga-attend-controls">
          <Select value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)}>
            <option value="">Select a class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.level.name} {c.name} ({c._count.students} students)</option>
            ))}
          </Select>
          {scope === "admin" ? (
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", fontSize: 13, color: "var(--duga-muted)", fontWeight: 600 }}>Today, {date}</div>
          )}
          <Button onClick={loadRoster} loading={loading}>Load roster</Button>
        </div>
        {scope === "teacher" && (
          <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 6 }}>
            You can mark or change today&apos;s attendance any time. To correct an earlier date, ask an admin.
          </div>
        )}

        {isPast && classGroupId && (
          <Alert tone="warning">
            This date is in the past — saving will retroactively override whatever attendance was already recorded for {date}.
          </Alert>
        )}
        {message && <Alert tone="success">{message}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}

        {rows.length > 0 && !hasExistingRecords && !confirmedNoData && (
          <>
            <Alert tone="info">No attendance was taken on {date}.</Alert>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <Button variant="outline" onClick={() => setConfirmedNoData(true)}>Mark attendance for this day</Button>
            </div>
          </>
        )}

        {rows.length > 0 && (hasExistingRecords || confirmedNoData) && (
          <>
            {!hasExistingRecords && (
              <Alert tone="info">
                Everyone below is shown as PRESENT only as a starting point for marking it now — none of this reflects real recorded attendance yet.
              </Alert>
            )}
            <div className="duga-table-wrap" style={{ marginTop: 12 }}>
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
                          {MARK_STATUSES.map((s) => {
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
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <Button variant="outline" onClick={clearDay} loading={clearing}>{scope === "admin" ? "Clear this day" : "Clear today"}</Button>
              <Button onClick={save} loading={saving}>{isPast ? "Save override" : "Save attendance"}</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default function AttendancePage() {
  const [role, setRole] = useState("");
  const [items, setItems] = useState<RecordRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [byChild, setByChild] = useState<ChildSummary[] | undefined>(undefined);
  const [isRangeView, setIsRangeView] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classGroupId, setClassGroupId] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ role: string; items: RecordRow[]; summary: Record<string, number>; byChild?: ChildSummary[]; isRangeView: boolean }>("attendance", {
        query: { date, classGroupId: classGroupId || undefined },
      });
      setRole(d.role);
      setItems(d.items);
      setSummary(d.summary);
      setByChild(d.byChild);
      setIsRangeView(d.isRangeView);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [date, classGroupId]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = role === "OWNER" || role === "ADMIN";
  const isStaffFilter = isAdmin || role === "TEACHER";
  const isParent = role === "PARENT";
  const isStudent = role === "STUDENT";

  useEffect(() => {
    if (!isAdmin) return;
    api<{ items: ClassOption[] }>("classes").then((d) => setClasses(d.items)).catch(() => undefined);
  }, [isAdmin]);

  const title = isParent ? "Children's Attendance" : isStudent ? "My Attendance" : isAdmin ? "Attendance Management" : "Attendance";
  const subtitle = isParent
    ? "Your children's attendance over the last 30 days."
    : isStudent
      ? "Your attendance over the last 30 days."
      : isAdmin
        ? "View attendance school-wide or by class, mark it directly, or correct a past record."
        : role === "TEACHER"
          ? "Daily attendance records — mark or fix today's attendance for your class below."
          : "Daily attendance records for students.";

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      {isAdmin && <MarkPanel scope="admin" onSaved={load} />}
      {role === "TEACHER" && <MarkPanel scope="teacher" onSaved={load} />}

      {isStaffFilter && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />
          {isAdmin && (
            <Select value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)} style={{ width: 220 }}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.level.name} {c.name}</option>
              ))}
            </Select>
          )}
          <Button variant="outline" onClick={load}>Filter</Button>
        </div>
      )}

      {isParent && byChild && byChild.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 20 }}>
          {byChild.map((c) => {
            const present = c.summary.PRESENT ?? 0;
            const rate = c.total ? Math.round((present / c.total) * 100) : 0;
            return (
              <Card key={c.studentId} title={c.name}>
                <div style={{ display: "flex", gap: 20 }}>
                  <Stat label="Present" value={`${rate}%`} tone={rate >= 80 ? "success" : rate >= 50 ? "warning" : "danger"} />
                  <Stat label="Days recorded" value={c.total} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!isParent && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
          {Object.entries(summary).map(([k, v]) => (
            <Card key={k}>
              <div style={{ fontWeight: 700, fontSize: 22 }}>{v}</div>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>{k.toLowerCase()}</div>
            </Card>
          ))}
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState
          title={isRangeView ? "No attendance records" : `No attendance was taken on ${date}`}
          hint={
            isRangeView
              ? "Nothing recorded in the last 30 days yet."
              : isAdmin
                ? "Use “Mark or correct attendance” above to add it."
                : "Records are created when a teacher takes attendance."
          }
        />
      ) : (
        <Card>
          <Table headers={isParent ? ["Student", "Date", "Status", "Remark"] : isStudent ? ["Date", "Status", "Remark"] : ["Student", "Class", "Status", "Remark"]}>
            {items.map((r) => (
              <tr key={r.id}>
                {isParent && <td>{r.student.user.firstName} {r.student.user.lastName}</td>}
                {!isParent && !isStudent && <td>{r.student.user.firstName} {r.student.user.lastName}</td>}
                {isRangeView ? <td>{fmtDate(r.date)}</td> : !isStudent && <td>{r.classGroup ? `${r.classGroup.level.name} ${r.classGroup.name}` : "—"}</td>}
                <td>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </td>
                <td>{r.remark ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
