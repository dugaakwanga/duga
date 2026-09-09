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

interface SubjectGroup {
  name: string;
  code?: string | null;
  rows: SubjectRow[];
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

  // A subject like "Basic Science" gets one class-subject row per class it's
  // taught in — grouping by class made it look like a different subject per
  // class. Group by subject name instead, with the classes nested under it.
  const bySubject = new Map<string, SubjectGroup>();
  for (const s of subjects) {
    const key = s.subject.name;
    if (!bySubject.has(key)) bySubject.set(key, { name: s.subject.name, code: s.subject.code, rows: [] });
    bySubject.get(key)!.rows.push(s);
  }
  const grouped = [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader title="My Subjects" subtitle="The subjects assigned to you and the classes you teach them in. Enter scores straight from each class." />

      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : grouped.length === 0 ? (
        <EmptyState title="No subjects assigned" hint="Ask the school admin to assign you to classes and subjects." />
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {grouped.map((subj) => (
            <section key={subj.name} className="classes-section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                <h2 style={{ fontSize: 16, margin: 0, color: "var(--duga-primary-ink)" }}>
                  {subj.name}
                </h2>
                <span style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>
                  {subj.code ? `Code: ${subj.code} · ` : ""}{subj.rows.length} class{subj.rows.length === 1 ? "" : "es"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
                {subj.rows.map((s) => (
                  <Card key={s.id} title={`${s.classGroup.level.name} ${s.classGroup.name}`}>
                    <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 10 }}>
                      {s.classGroup._count.students} students
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
