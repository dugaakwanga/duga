"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Stat, Badge, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface SubjectRow {
  id: string;
  subject: { name: string; code?: string | null };
  classGroup: { level: { name: string }; name: string; _count: { students: number } };
  _count: { lessonNotes: number; assignments: number; tests: number };
}

interface Overview {
  counts: {
    classSubjects: number;
    classes: number;
    students: number;
    notes: number;
    assignments: number;
    tests: number;
    pendingGrading: number;
    content: number;
    games: number;
    todayAttendance: number;
  };
  upcomingLive: Array<{
    id: string;
    title: string;
    scheduledAt: string;
    classSubject: { subject: { name: string }; classGroup: { level: { name: string }; name: string } } | null;
  }>;
}

export default function TeacherHomePage() {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { section } = useSection();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        api<SubjectRow[]>("teacher"),
        api<Overview>("teacher/overview", { method: "POST" }),
      ]);
      setSubjects(s);
      setOverview(o);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    load();
  }, [load]);

  const c = overview?.counts;

  return (
    <div>
      <PageHeader title="Teaching Overview" subtitle="Manage your classes, notes, assignments, CBT exams and rewards." />

      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
            <Stat label="My subjects" value={c?.classSubjects ?? 0} hint="class subjects" />
            <Stat label="Classes" value={c?.classes ?? 0} hint="I teach" />
            <Stat label="Students" value={c?.students ?? 0} hint="across my classes" />
            <Stat label="Pending grading" value={c?.pendingGrading ?? 0} tone="warning" hint="submissions await" />
            <Stat label="Lesson notes" value={c?.notes ?? 0} />
            <Stat label="Assignments" value={c?.assignments ?? 0} />
            <Stat label="CBT exams" value={c?.tests ?? 0} />
            <Stat label="Online content" value={c?.content ?? 0} hint="rewards" />
            <Stat label="Games" value={c?.games ?? 0} />
            <Stat label="Marked today" value={c?.todayAttendance ?? 0} hint="attendance records" />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            <Link href="/portal/teacher/notes" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="notes" size={16} /> Lesson notes</Link>
            <Link href="/portal/teacher/assignments" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="assignment" size={16} /> Assignments</Link>
            <Link href="/portal/teacher/cbt" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="quiz" size={16} /> CBT exams</Link>
            <Link href="/portal/teacher/attendance" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="attendance" size={16} /> Take attendance</Link>
            <Link href="/portal/elearn" className="duga-btn duga-btn--outline duga-btn--md"><Icon name="notes" size={16} /> Online content</Link>
            <Link href="/portal/games" className="duga-btn duga-btn--outline duga-btn--md"><Icon name="quiz" size={16} /> Educational games</Link>
          </div>

          <div className="duga-split-2">
            <Card title="My subjects & classes">
              {subjects.length === 0 ? (
                <EmptyState title="No class subjects assigned" hint="Ask the school admin to assign you to classes and subjects." />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {subjects.map((s) => (
                    <div key={s.id} className="duga-card__pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid var(--duga-border)", borderRadius: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {s.subject.name} <span style={{ color: "var(--duga-muted)", fontWeight: 400 }}> · {s.classGroup.level.name} {s.classGroup.name}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>
                          {s.classGroup._count.students} students · {s._count.lessonNotes} notes · {s._count.assignments} assignments · {s._count.tests} CBT
                        </div>
                      </div>
                      <Link href="/portal/teacher/attendance" className="duga-btn duga-btn--outline duga-btn--sm">Class page</Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Upcoming live classes">
              {!overview?.upcomingLive?.length ? (
                <EmptyState title="No upcoming live classes" hint="You can schedule one from the Learning section." />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {overview.upcomingLive.map((l) => (
                    <div key={l.id} className="dua-card__pad" style={{ border: "1px solid var(--duga-border)", borderRadius: 8 }}>
                      <div style={{ fontWeight: 600 }}>{l.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--duga-muted)", display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {l.classSubject && <Badge tone="info">{l.classSubject.subject.name}</Badge>}
                        {l.classSubject && <Badge tone="neutral">{l.classSubject.classGroup.level.name} {l.classSubject.classGroup.name}</Badge>}
                        <Badge tone="accent">{new Date(l.scheduledAt).toLocaleString()}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
