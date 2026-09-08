"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Input, Button, Stat } from "@duga/ui";
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

function statusTone(status: string): "success" | "warning" | "info" | "danger" {
  return status === "PRESENT" ? "success" : status === "LATE" ? "warning" : status === "EXCUSED" ? "info" : "danger";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function AttendancePage() {
  const [role, setRole] = useState("");
  const [items, setItems] = useState<RecordRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [byChild, setByChild] = useState<ChildSummary[] | undefined>(undefined);
  const [isRangeView, setIsRangeView] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classGroupId, setClassGroupId] = useState("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isStaffFilter = role === "OWNER" || role === "ADMIN" || role === "TEACHER";
  const isParent = role === "PARENT";
  const isStudent = role === "STUDENT";

  const title = isParent ? "Children's Attendance" : isStudent ? "My Attendance" : "Attendance";
  const subtitle = isParent
    ? "Your children's attendance over the last 30 days."
    : isStudent
      ? "Your attendance over the last 30 days."
      : "Daily attendance records for students.";

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      {isStaffFilter && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />
          {(role === "OWNER" || role === "ADMIN") && (
            <Input placeholder="Class group ID (optional)" value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)} style={{ width: 220 }} />
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
          title="No attendance records"
          hint={isRangeView ? "Nothing recorded in the last 30 days yet." : "Records are created when a teacher takes attendance."}
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
