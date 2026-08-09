"use client";

import { useEffect, useState } from "react";
import { Card, Stat, PageHeader, Badge, EmptyState, Alert, Spinner } from "@duga/ui";
import { api } from "@/lib/client/api";
import { BarChart, Donut, formatNumber } from "@/components/charts";

interface ProgressData {
  role: string;
  scoped: boolean;
  classes: { studentCount: number; teacherCount: number; classCount: number };
  fees: {
    series: Array<{ label: string; value: number }>;
    summary: { total: number; paid: number; balance: number };
  };
  attendance: { series: Array<{ label: string; value: number }> };
  enrollment: { series: Array<{ label: string; value: number }> };
  scores: { series: Array<{ label: string; value: number; passRate: number }> };
  generatedAt: string;
}

function naira(v: number): string {
  return `₦${formatNumber(v)}`;
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProgressData>("progress").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Spinner size={28} />;

  const collectionRate =
    data.fees.summary.total > 0 ? Math.round((data.fees.summary.paid / data.fees.summary.total) * 100) : 0;
  const lastAttendance = data.attendance.series[data.attendance.series.length - 1];
  const lastAvg = data.scores.series[data.scores.series.length - 1];

  return (
    <div>
      <PageHeader
        title="School progress"
        subtitle={data.scoped ? "Showing progress for what you have access to (your classes / your child)." : "How the whole school is doing — at a glance."}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
        <Stat label="Students" value={formatNumber(data.classes.studentCount)} />
        {data.role !== "STUDENT" && <Stat label="Staff" value={formatNumber(data.classes.teacherCount)} />}
        <Stat label="Classes" value={formatNumber(data.classes.classCount)} />
        <Stat label="Fee collection rate" value={`${collectionRate}%`} tone={collectionRate >= 80 ? "success" : collectionRate >= 50 ? "warning" : "danger"} />
        <Stat label="Attendance" value={lastAttendance ? `${lastAttendance.value}%` : "—"} tone="info" />
        {lastAvg && <Stat label="Average score" value={String(lastAvg.value)} tone="accent" />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
        <Card title="Fees collected (last 6 months)">
          <BarChart points={data.fees.series} color="var(--duga-success, #1a8754)" format={naira} />
          <div style={{ marginTop: 16 }}>
            <Donut value={data.fees.summary.paid} total={data.fees.summary.total} label="Collected vs billed" color="var(--duga-success, #1a8754)" />
          </div>
        </Card>

        <Card title="Attendance rate (last 7 days)">
          <BarChart points={data.attendance.series} color="var(--duga-info, #0d6efd)" format={(v) => `${v}%`} />
          {lastAttendance && (
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--duga-muted)" }}>
              Latest attendance: <strong>{lastAttendance.value}%</strong> present
            </div>
          )}
        </Card>

        <Card title="Enrollment growth (last 6 months)">
          <BarChart points={data.enrollment.series} color="var(--duga-accent, #7b3fe4)" />
        </Card>

        <Card title="Academic performance by term">
          {data.scores.series.length === 0 ? (
            <EmptyState title="No published report cards yet" hint="Scores appear once results are published." />
          ) : (
            <div>
              <BarChart points={data.scores.series.map((s) => ({ label: s.label, value: s.value }))} color="var(--duga-primary)" />
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {data.scores.series.map((s) => (
                  <Badge key={s.label} tone={s.passRate >= 75 ? "success" : s.passRate >= 50 ? "warning" : "danger"}>
                    {s.label}: {s.passRate}% pass rate
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
