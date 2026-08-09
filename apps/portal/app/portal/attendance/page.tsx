"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Input, Button } from "@duga/ui";
import { api } from "@/lib/client/api";

interface RecordRow {
  id: string;
  status: string;
  remark: string | null;
  date: string;
  student: { user: { firstName: string; lastName: string } };
  classGroup: { level: { name: string }; name: string } | null;
}

export default function AttendancePage() {
  const [items, setItems] = useState<RecordRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classGroupId, setClassGroupId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await api<{ items: RecordRow[]; summary: Record<string, number> }>("attendance", {
        query: { date, classGroupId: classGroupId || undefined },
      });
      setItems(d.items);
      setSummary(d.summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Daily attendance records for students." />
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />
        <Input placeholder="Class group ID (optional)" value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)} style={{ width: 220 }} />
        <Button variant="outline" onClick={load}>Filter</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
        {Object.entries(summary).map(([k, v]) => (
          <Card key={k}>
            <div style={{ fontWeight: 700, fontSize: 22 }}>{v}</div>
            <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>{k.toLowerCase()}</div>
          </Card>
        ))}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No attendance records" hint="Records are created when a teacher takes attendance." />
      ) : (
        <Card>
          <Table headers={["Student", "Class", "Status", "Remark"]}>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{r.student.user.firstName} {r.student.user.lastName}</td>
                <td>{r.classGroup ? `${r.classGroup.level.name} ${r.classGroup.name}` : "—"}</td>
                <td>
                  <Badge tone={r.status === "PRESENT" ? "success" : r.status === "LATE" ? "warning" : r.status === "EXCUSED" ? "info" : "danger"}>{r.status}</Badge>
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
