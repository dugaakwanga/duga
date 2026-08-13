"use client";

import { useEffect, useState } from "react";
import { Card, Stat, PageHeader, Badge, EmptyState, Alert, Spinner } from "@duga/ui";
import { api } from "@/lib/client/api";
import { BarChart, Donut, formatNumber } from "@/components/charts";

interface ProgressData {
  role: string;
  scope: "school" | "classes" | "own" | "children";
  sections: { fees: boolean; attendance: boolean; enrollment: boolean; scores: boolean; classes: boolean };
  classes: { studentCount: number; teacherCount: number; classCount: number };
  myClasses: Array<{ id: string; name: string; levelName: string; studentCount: number }>;
  subjects: Array<{ id: string; name: string; section: string; classGroupName: string; value: number; students: number; count: number }>;
  fees: { series: Array<{ label: string; value: number }>; summary: { total: number; paid: number; balance: number } } | null;
  attendance: { series: Array<{ label: string; value: number }> } | null;
  enrollment: { series: Array<{ label: string; value: number }> } | null;
  scores: { series: Array<{ label: string; value: number; passRate: number }> } | null;
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

  const role = data.role;
  const isAdmin = role === "ADMIN";
  const isBursar = role === "BURSAR";
  const isTeacher = role === "TEACHER";
  const isStudent = role === "STUDENT";
  const isParent = role === "PARENT";

  const title = isBursar ? "Financial progress" : isStudent ? "My progress" : isParent ? "Children's progress" : isTeacher ? "Class & subject progress" : isAdmin ? "School progress" : "School progress";
  const subtitle = isBursar
    ? "Monetary performance across the school — fees, collections and balances."
    : isStudent
      ? "Your attendance and academic performance."
      : isParent
        ? "Attendance and academic performance for your children."
        : isTeacher
          ? "Progress for the classes and subjects you teach."
          : isAdmin
            ? "The whole school's progress. Financial figures are managed by the bursar."
            : "How the whole school is doing — at a glance.";

  const collectionRate = data.fees
    ? data.fees.summary.total > 0
      ? Math.round((data.fees.summary.paid / data.fees.summary.total) * 100)
      : 0
    : 0;
  const lastAttendance = data.attendance?.series[data.attendance.series.length - 1];
  const lastAvg = data.scores?.series[data.scores.series.length - 1];

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      {data.sections.classes && !isBursar && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
          {isTeacher ? (
            <>
              <Stat label="My students" value={formatNumber(data.classes.studentCount)} />
              <Stat label="My classes" value={formatNumber(data.classes.classCount)} />
              <Stat label="Attendance" value={lastAttendance ? `${lastAttendance.value}%` : "—"} tone="info" />
              {lastAvg && <Stat label="Average score" value={String(lastAvg.value)} tone="accent" />}
            </>
          ) : isStudent || isParent ? (
            <>
              <Stat label="Attendance" value={lastAttendance ? `${lastAttendance.value}%` : "—"} tone="info" />
              {lastAvg && <Stat label="Average score" value={String(lastAvg.value)} tone="accent" />}
              {data.attendance && <Stat label="Days present (7d)" value={formatNumber(data.classes.studentCount)} tone="info" />}
            </>
          ) : (
            <>
              <Stat label="Students" value={formatNumber(data.classes.studentCount)} />
              <Stat label="Staff" value={formatNumber(data.classes.teacherCount)} />
              <Stat label="Classes" value={formatNumber(data.classes.classCount)} />
              {data.fees && <Stat label="Fee collection rate" value={`${collectionRate}%`} tone={collectionRate >= 80 ? "success" : collectionRate >= 50 ? "warning" : "danger"} />}
              {data.attendance && <Stat label="Attendance" value={lastAttendance ? `${lastAttendance.value}%` : "—"} tone="info" />}
              {lastAvg && <Stat label="Average score" value={String(lastAvg.value)} tone="accent" />}
            </>
          )}
        </div>
      )}

      {isBursar && data.fees && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
          <Stat label="Billed" value={naira(data.fees.summary.total)} />
          <Stat label="Collected" value={naira(data.fees.summary.paid)} />
          <Stat label="Outstanding" value={naira(data.fees.summary.balance)} />
          <Stat label="Collection rate" value={`${collectionRate}%`} tone={collectionRate >= 80 ? "success" : collectionRate >= 50 ? "warning" : "danger"} />
        </div>
      )}

      {isTeacher && data.myClasses.length > 0 && (
        <Card title="My classes" style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
            {data.myClasses.map((c) => (
              <div key={c.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 2 }}>{c.studentCount} active students</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isTeacher && (
        <Card title="Subject performance" style={{ marginBottom: 18 }}>
          {data.subjects.length === 0 ? (
            <EmptyState title="No subject results yet" hint="Scores appear once results are published for your classes." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              {data.subjects.map((s) => (
                <div key={s.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</span>
                    <Badge tone={s.section === "PRIMARY" ? "info" : "accent"}>{s.section.toLowerCase()}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--duga-muted)", marginTop: 3 }}>{s.classGroupName}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{s.value}%</span>
                    <span style={{ fontSize: 12, color: "var(--duga-muted)" }}>{s.students} students</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
        {data.fees && (
          <Card title="Fees collected (last 6 months)">
            <BarChart points={data.fees.series} color="var(--duga-success, #1a8754)" format={naira} />
            <div style={{ marginTop: 16 }}>
              <Donut value={data.fees.summary.paid} total={data.fees.summary.total} label="Collected vs billed" color="var(--duga-success, #1a8754)" />
            </div>
          </Card>
        )}

        {data.attendance && (
          <Card title="Attendance rate (last 7 days)">
            <BarChart points={data.attendance.series} color="var(--duga-info, #0d6efd)" format={(v) => `${v}%`} />
            {lastAttendance && (
              <div style={{ marginTop: 14, fontSize: 13, color: "var(--duga-muted)" }}>
                Latest attendance: <strong>{lastAttendance.value}%</strong> present
              </div>
            )}
          </Card>
        )}

        {data.enrollment && (
          <Card title="Enrollment growth (last 6 months)">
            <BarChart points={data.enrollment.series} color="var(--duga-accent, #7b3fe4)" />
          </Card>
        )}

        {data.scores && (
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
        )}

        {isBursar && (
          <Card title="Overview">
            <div style={{ display: "grid", gap: 12 }}>
              {([
                ["Total billed", naira(data.fees?.summary.total ?? 0)],
                ["Total collected", naira(data.fees?.summary.paid ?? 0)],
                ["Outstanding balance", naira(data.fees?.summary.balance ?? 0)],
                ["Collection rate", `${collectionRate}%`],
              ] as const).map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--duga-border)", paddingBottom: 8 }}>
                  <span style={{ fontSize: 13.5, color: "var(--duga-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 800 }}>{value}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}