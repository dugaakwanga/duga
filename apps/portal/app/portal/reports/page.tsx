"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Stat } from "@duga/ui";
import { api } from "@/lib/client/api";

interface ReportsData {
  feeSummary: { _sum: { totalAmount: number | null; paidAmount: number | null; balance: number | null }; _count: number };
  byStatus: Array<{ status: string; _count: number; _sum: { paidAmount: number | null; balance: number | null } }>;
  attendance: Array<{ status: string; _count: number }>;
  counts: { studentCount: number; staffCount: number; termCount: number; classCount: number };
}

function naira(v: number | null | undefined): string {
  return `₦${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ReportsData>("reports")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Whole-school summary for the proprietor." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
        <Stat label="Students" value={data.counts.studentCount} />
        <Stat label="Staff" value={data.counts.staffCount} />
        <Stat label="Classes" value={data.counts.classCount} />
        <Stat label="Terms" value={data.counts.termCount} />
        <Stat label="Invoices" value={data.feeSummary._count} />
        <Stat label="Total billed" value={naira(data.feeSummary._sum.totalAmount)} />
        <Stat label="Collected" value={naira(data.feeSummary._sum.paidAmount)} tone="success" />
        <Stat label="Outstanding" value={naira(data.feeSummary._sum.balance)} tone="danger" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
        <Card title="Invoices by status">
          {data.byStatus.length === 0 ? (
            <EmptyState title="No invoices" />
          ) : (
            <Table headers={["Status", "Count", "Collected", "Outstanding"]}>
              {data.byStatus.map((s) => (
                <tr key={s.status}>
                  <td><Badge tone={s.status === "PAID" ? "success" : s.status === "PARTIAL" ? "warning" : "danger"}>{s.status}</Badge></td>
                  <td>{s._count}</td>
                  <td>{naira(s._sum.paidAmount)}</td>
                  <td>{naira(s._sum.balance)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Attendance breakdown">
          {data.attendance.length === 0 ? (
            <EmptyState title="No attendance recorded" />
          ) : (
            <Table headers={["Status", "Count"]}>
              {data.attendance.map((a) => (
                <tr key={a.status}>
                  <td><Badge tone="neutral">{a.status}</Badge></td>
                  <td>{a._count}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
