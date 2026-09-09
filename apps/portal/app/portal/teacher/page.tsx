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
  teacher?: { user: { firstName: string; lastName: string } } | null;
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
  const [role, setRole] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"subject" | "teacher">("subject");
  const { section } = useSection();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o, me] = await Promise.all([
        api<SubjectRow[]>("teacher"),
        api<Overview>("teacher/overview", { method: "POST" }),
        fetch("/api/auth/me").then((r) => r.json()).then((j) => (j.ok ? j.user : null)).catch(() => null),
      ]);
      setSubjects(s);
      setOverview(o);
      setRole(me?.role ?? null);
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
  const isManager = role === "OWNER" || role === "ADMIN";

  // Institutional view: group every class-subject in the school by the
  // teacher who owns it, so an admin can see at a glance who's behind on
  // notes/assignments — not a flat 100+-row list mislabeled as "my subjects".
  const byTeacher = isManager
    ? Array.from(
        subjects.reduce((map, s) => {
          const key = s.teacher ? `${s.teacher.user.firstName} ${s.teacher.user.lastName}` : "Unassigned";
          const list = map.get(key) ?? [];
          list.push(s);
          map.set(key, list);
          return map;
        }, new Map<string, SubjectRow[]>()),
      ).sort(([a], [b]) => a.localeCompare(b))
    : [];

  // A class-subject row exists once per class (e.g. "Basic Science" appears
  // once for every class it's taught in), so a flat list reads as a
  // ridiculous number of "subjects" when it's really one subject taught
  // across many classes. Group by subject name instead — the subject
  // appears once, with the classes it's taught in nested underneath.
  const bySubject = isManager
    ? Array.from(
        subjects.reduce((map, s) => {
          const key = s.subject.name;
          const list = map.get(key) ?? [];
          list.push(s);
          map.set(key, list);
          return map;
        }, new Map<string, SubjectRow[]>()),
      ).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div>
      <PageHeader
        title={isManager ? "Teaching" : "Teaching Overview"}
        subtitle={isManager ? "Institutional view of teaching across the school — notes, assignments, CBT exams and grading progress." : "Manage your classes, notes, assignments, CBT exams and rewards."}
      />

      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
            <Stat label={isManager ? "Class subjects" : "My subjects"} value={c?.classSubjects ?? 0} />
            <Stat label="Classes" value={c?.classes ?? 0} hint={isManager ? "in the school" : "I teach"} />
            <Stat label="Students" value={c?.students ?? 0} hint={isManager ? "across the school" : "across my classes"} />
            <Stat label="Pending grading" value={c?.pendingGrading ?? 0} tone="warning" hint="submissions await" />
            <Stat label="Lesson notes" value={c?.notes ?? 0} />
            <Stat label="Assignments" value={c?.assignments ?? 0} />
            <Stat label="CBT exams" value={c?.tests ?? 0} />
            {!isManager && <Stat label="Online content" value={c?.content ?? 0} hint="rewards" />}
            {!isManager && <Stat label="Games" value={c?.games ?? 0} />}
            <Stat label="Marked today" value={c?.todayAttendance ?? 0} hint="attendance records" />
          </div>

          {!isManager && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
              <Link href="/portal/teacher/notes" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="notes" size={16} /> Lesson notes</Link>
              <Link href="/portal/teacher/assignments" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="assignment" size={16} /> Assignments</Link>
              <Link href="/portal/teacher/cbt" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="quiz" size={16} /> CBT exams</Link>
              <Link href="/portal/teacher/attendance" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="attendance" size={16} /> Take attendance</Link>
              <Link href="/portal/elearn" className="duga-btn duga-btn--outline duga-btn--md"><Icon name="notes" size={16} /> Online content</Link>
              <Link href="/portal/games" className="duga-btn duga-btn--outline duga-btn--md"><Icon name="quiz" size={16} /> Educational games</Link>
            </div>
          )}

          {isManager ? (
            <Card
              title={groupBy === "subject" ? `Teaching by subject (${bySubject.length} subjects)` : `Teaching by staff (${byTeacher.length} teachers)`}
              actions={
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className={groupBy === "subject" ? "duga-btn duga-btn--accent duga-btn--sm" : "duga-btn duga-btn--outline duga-btn--sm"}
                    onClick={() => setGroupBy("subject")}
                  >
                    By subject
                  </button>
                  <button
                    className={groupBy === "teacher" ? "duga-btn duga-btn--accent duga-btn--sm" : "duga-btn duga-btn--outline duga-btn--sm"}
                    onClick={() => setGroupBy("teacher")}
                  >
                    By staff
                  </button>
                </div>
              }
            >
              {groupBy === "subject" ? (
                bySubject.length === 0 ? (
                  <EmptyState title="No class subjects assigned yet" hint="Assign subjects to classes from Classes." />
                ) : (
                  bySubject.map(([name, rows]) => {
                    const classCount = new Set(rows.map((r) => r.classGroup.name + r.classGroup.level.name)).size;
                    const notes = rows.reduce((a, r) => a + r._count.lessonNotes, 0);
                    const assignments = rows.reduce((a, r) => a + r._count.assignments, 0);
                    const tests = rows.reduce((a, r) => a + r._count.tests, 0);
                    return (
                      <details key={name} open={bySubject.length <= 5} style={{ marginBottom: 10 }}>
                        <summary
                          style={{
                            cursor: "pointer",
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "var(--duga-surface-2, #f4f6f9)",
                            fontWeight: 700,
                            fontSize: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          {name}
                          <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--duga-muted)" }}>
                            {classCount} class{classCount === 1 ? "" : "es"} · {notes} notes · {assignments} assignments · {tests} CBT
                          </span>
                        </summary>
                        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                          {rows.map((s) => (
                            <div key={s.id} className="duga-card__pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid var(--duga-border)", borderRadius: 8 }}>
                              <div>
                                <div style={{ fontWeight: 600 }}>
                                  {s.classGroup.level.name} {s.classGroup.name}
                                  <span style={{ color: "var(--duga-muted)", fontWeight: 400 }}> · {s.teacher ? `${s.teacher.user.firstName} ${s.teacher.user.lastName}` : "Unassigned"}</span>
                                </div>
                                <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>
                                  {s.classGroup._count.students} students · {s._count.lessonNotes} notes · {s._count.assignments} assignments · {s._count.tests} CBT
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })
                )
              ) : byTeacher.length === 0 ? (
                <EmptyState title="No class subjects assigned yet" hint="Assign teachers to class subjects from Classes." />
              ) : (
                byTeacher.map(([name, rows]) => {
                  const notes = rows.reduce((a, r) => a + r._count.lessonNotes, 0);
                  const assignments = rows.reduce((a, r) => a + r._count.assignments, 0);
                  const tests = rows.reduce((a, r) => a + r._count.tests, 0);
                  return (
                    <details key={name} open={byTeacher.length <= 5} style={{ marginBottom: 10 }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "var(--duga-surface-2, #f4f6f9)",
                          fontWeight: 700,
                          fontSize: 14,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        {name}
                        <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--duga-muted)" }}>
                          {rows.length} subject{rows.length === 1 ? "" : "s"} · {notes} notes · {assignments} assignments · {tests} CBT
                        </span>
                      </summary>
                      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        {rows.map((s) => (
                          <div key={s.id} className="duga-card__pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid var(--duga-border)", borderRadius: 8 }}>
                            <div>
                              <div style={{ fontWeight: 600 }}>
                                {s.subject.name} <span style={{ color: "var(--duga-muted)", fontWeight: 400 }}> · {s.classGroup.level.name} {s.classGroup.name}</span>
                              </div>
                              <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>
                                {s.classGroup._count.students} students · {s._count.lessonNotes} notes · {s._count.assignments} assignments · {s._count.tests} CBT
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })
              )}
            </Card>
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}
