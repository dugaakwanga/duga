"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Stat, Badge, Table, PageHeader, Icon, EmptyState, Alert, Spinner } from "@duga/ui";
import { api } from "@/lib/client/api";

interface DashboardData {
  role: string;
  classSubjects?: Array<{ id: string; subject: { name: string }; teacher?: { user: { firstName: string; lastName: string } } | null }>;
  assignments?: Array<{ id: string; title: string; classSubject?: { subject: { name: string } } | null }>;
  live?: Array<{ id: string; title: string; scheduledAt: string }>;
  reportCard?: { id: string; gradeAverage: number | null; isPublished: boolean } | null;
  invoice?: { id: string; status: string; balance: string | number } | null;
}

interface TestItem {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  classSubject?: { subject: { name: string }; classGroup?: { level: { name: string }; name: string } | null } | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export default function StudentHomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<DashboardData>("dashboard"),
      api<{ items: TestItem[] }>("learning?kind=tests"),
    ])
      .then(([d, t]) => {
        setData(d);
        setTests(t.items);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Spinner size={28} />;

  const openTests = tests.filter((t) => t.status === "PUBLISHED");
  const dueAssignments = (data.assignments ?? []).length;
  const invoice = data.invoice;
  const feesOwing = invoice && invoice.status !== "PAID" && invoice.status !== "OVERPAID";

  return (
    <div>
      <PageHeader title="My Home" subtitle="Welcome back! Here is what is happening in your class today." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
        <Stat label="My subjects" value={data.classSubjects?.length ?? 0} hint="across my class" />
        <Stat label="Assignments to do" value={dueAssignments} tone="info" hint="awaiting my work" />
        <Stat label="CBT exams" value={openTests.length} tone="warning" hint="available now" />
        <Stat label="Average grade" value={data.reportCard?.gradeAverage != null ? `${data.reportCard.gradeAverage}%` : "—"} tone="success" hint="latest report card" />
        <Stat label="Fees balance" value={feesOwing ? `₦${Number(invoice!.balance).toLocaleString()}` : "Clear"} tone={feesOwing ? "danger" : "success"} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        <Link href="/portal/learning?kind=tests" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="quiz" size={16} /> Take a CBT exam</Link>
        <Link href="/portal/learning?kind=assignments" className="duga-btn duga-btn--accent duga-btn--md"><Icon name="assignment" size={16} /> View assignments</Link>
        <Link href="/portal/results" className="duga-btn duga-btn--outline duga-btn--md"><Icon name="results" size={16} /> My results</Link>
        <Link href="/portal/fees" className="duga-btn duga-btn--outline duga-btn--md"><Icon name="fees" size={16} /> My fees</Link>
      </div>

      <div className="duga-split-2">
        <Card title="My CBT exams">
          {openTests.length === 0 ? (
            <EmptyState title="No open exams right now" hint="When your teacher publishes an exam it will show up here." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {openTests.map((t) => (
                <div key={t.id} className="duga-card__pad" style={{ border: "1px solid var(--duga-border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--duga-muted)", display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {t.classSubject?.subject && <Badge tone="info">{t.classSubject.subject.name}</Badge>}
                        {t.classSubject?.classGroup && <Badge tone="neutral">{t.classSubject.classGroup.level.name} {t.classSubject.classGroup.name}</Badge>}
                        <Badge tone="accent">{t.durationMinutes} min</Badge>
                      </div>
                    </div>
                    <Link href="/portal/learning?kind=tests" className="duga-btn duga-btn--accent duga-btn--sm">Take test</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div style={{ display: "grid", gap: 16 }}>
          <Card title="My subjects">
            {data.classSubjects?.length ? (
              <Table headers={["Subject", "Teacher"]}>
                {data.classSubjects.map((cs) => (
                  <tr key={cs.id}>
                    <td>{cs.subject.name}</td>
                    <td>{cs.teacher ? `${cs.teacher.user.firstName} ${cs.teacher.user.lastName}` : "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <EmptyState title="No subjects" />
            )}
          </Card>

          <Card title="Upcoming live classes">
            {data.live?.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {data.live.map((l) => (
                  <li key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--duga-border)" }}>
                    <Icon name="live" size={16} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.title}</div>
                      <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{new Date(l.scheduledAt).toLocaleString()}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No upcoming live classes" />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
