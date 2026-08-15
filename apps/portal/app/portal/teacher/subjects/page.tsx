"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Alert, Spinner, EmptyState } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface SubjectRow {
  id: string;
  subject: { name: string; code?: string | null };
  classGroup: { id: string; level: { name: string }; name: string; _count: { students: number } };
  _count: { lessonNotes: number; assignments: number; tests: number };
}

interface ClassGroup {
  id: string;
  level: string;
  name: string;
  students: number;
  subjects: SubjectRow[];
}

export default function MySubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { section } = useSection();

  useEffect(() => {
    api<SubjectRow[]>("teacher")
      .then(setSubjects)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [section]);

  const classes = new Map<string, ClassGroup>();
  for (const s of subjects) {
    const key = s.classGroup.id;
    if (!classes.has(key)) {
      classes.set(key, {
        id: s.classGroup.id,
        level: s.classGroup.level.name,
        name: s.classGroup.name,
        students: s.classGroup._count.students,
        subjects: [],
      });
    }
    classes.get(key)!.subjects.push(s);
  }
  const grouped = [...classes.values()];

  return (
    <div>
      <PageHeader title="My Subjects" subtitle="The subjects and classes assigned to you. Enter scores straight from each subject." />

      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : grouped.length === 0 ? (
        <EmptyState title="No subjects assigned" hint="Ask the school admin to assign you to classes and subjects." />
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {grouped.map((cls) => (
            <section key={cls.id} className="classes-section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                <h2 style={{ fontSize: 16, margin: 0, color: "var(--duga-primary-ink)" }}>
                  {cls.level} {cls.name}
                </h2>
                <span style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>{cls.students} students · {cls.subjects.length} subject{cls.subjects.length === 1 ? "" : "s"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
                {cls.subjects.map((s) => (
                  <Card key={s.id} title={s.subject.name}>
                    <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 10 }}>
                      {s.subject.code ? `Code: ${s.subject.code} · ` : ""}{s.classGroup._count.students} students
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginBottom: 12 }}>
                      {s._count.lessonNotes} notes · {s._count.assignments} assignments · {s._count.tests} CBT
                    </div>
                    <Link href={`/portal/results?classSubject=${s.id}`} className="duga-btn duga-btn--accent duga-btn--sm">
                      Enter scores
                    </Link>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
