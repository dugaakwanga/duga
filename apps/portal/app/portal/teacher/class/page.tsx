"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Stat, Badge, Select, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { BarChart } from "@/components/charts";
import { useSection } from "@/components/SectionContext";

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
  todayAttendanceRate: number | null;
}

export default function MyClassPage() {
  const [data, setData] = useState<ClassDashboard | null>(null);
  const [classGroupId, setClassGroupId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { section } = useSection();

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
        </>
      )}
    </div>
  );
}
