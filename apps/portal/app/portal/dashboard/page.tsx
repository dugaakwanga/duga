"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Stat, Badge, Table, PageHeader, Icon, EmptyState, Alert, Spinner } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface InvoiceLike {
  id: string;
  status: string;
  totalAmount: string | number;
  balance: string | number;
  student?: { user: { firstName: string; lastName: string } };
}

interface DashboardData {
  role: string;
  counts?: { studentCount: number; staffCount: number; classCount: number; applications: number; unpaid: number; today: number };
  feeSummary?: { total: number; paid: number; balance: number };
  schoolProgress?: { attendanceRate: number; subjectAverage: number; assessedStudents: number };
  recentAnnouncements?: Array<{ id: string; title: string; audience: string; author: { firstName: string; lastName: string }; createdAt: string }>;
  classSubjects?: Array<{ id: string; subject: { name: string }; classGroup?: { level: { name: string }; name: string }; teacher?: { user: { firstName: string; lastName: string } } }>;
  upcomingLive?: Array<{ id: string; title: string; scheduledAt: string }>;
  pendingGrading?: number;
  classTeacherOf?: Array<{ classGroupId: string; className: string; studentCount: number; attendanceRate: number; subjectAverage: number | null }>;
  children?: Array<{ student: { id: string; admissionNumber: string; user: { firstName: string; lastName: string }; classGroup: { level: { name: string }; name: string } | null } }>;
  invoices?: InvoiceLike[];
  assignments?: Array<{ id: string; title: string; classSubject?: { subject: { name: string } } }>;
  live?: Array<{ id: string; title: string; scheduledAt: string }>;
  reportCard?: { id: string; average: number | null; isPublished: boolean };
  invoice?: InvoiceLike;
  fee?: { feeAmount: string; feeDays: number; feePaidThrough: string | null; usedDays: number; daysRemaining: number; expired: boolean };
  recentPayments?: Array<{ id: string; amount: string | number; paidAt: string | null; student?: { user: { firstName: string; lastName: string } } }>;
}

function naira(v: string | number | undefined): string {
  return `₦${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function ProgressBar({ value, tone = "blue" }: { value: number; tone?: "blue" | "gold" | "green" }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return <div className="portal-progress" aria-label={`${safe}%`}><span className={`portal-progress__bar portal-progress__bar--${tone}`} style={{ width: `${safe}%` }} /></div>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { section } = useSection();

  useEffect(() => {
    api<DashboardData>("dashboard").then(setData).catch((e) => setError(e.message));
  }, [section]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Spinner size={28} />;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Welcome back — you are signed in as ${data.role.toLowerCase()}.`} />

      {data.role === "STUDENT" && data.fee && Number(data.fee.feeAmount) > 0 && (
        data.fee.expired ? (
          <div style={{ marginBottom: 18 }}>
            <Alert tone="danger">
              <strong>Access suspended.</strong> Your school fee period ended on {data.fee.feePaidThrough ? new Date(data.fee.feePaidThrough).toLocaleDateString() : "the set date"}. Please contact the school to renew your access.
            </Alert>
          </div>
        ) : data.fee.daysRemaining <= 7 ? (
          <div style={{ marginBottom: 18 }}>
            <Alert tone="warning">
              <strong>{data.fee.daysRemaining} day{data.fee.daysRemaining === 1 ? "" : "s"} of fee access remaining.</strong> Renew with the school before your access ends on {data.fee.feePaidThrough ? new Date(data.fee.feePaidThrough).toLocaleDateString() : ""}.
            </Alert>
          </div>
        ) : null
      )}

      {data.role === "OWNER" || data.role === "ADMIN" ? (
        <>
          <div className="portal-metrics" style={{ marginBottom: 20 }}>
            <Stat label="Students" value={data.counts?.studentCount} />
            <Stat label="Teaching staff" value={data.counts?.staffCount} />
            <Stat label="Classes" value={data.counts?.classCount} />
            {data.feeSummary && <Stat label="Fees collected" value={naira(data.feeSummary.paid)} tone="success" />}
            {data.feeSummary && <Stat label="Outstanding" value={naira(data.feeSummary.balance)} tone="danger" />}
            <Stat label="New applications" value={data.counts?.applications} tone="info" />
            <Stat label="Attendance today" value={data.counts?.today} />
          </div>

          <div className="portal-dashboard-grid">
          <Card title="School monitoring" className="portal-monitor-card">
            {data.feeSummary && (
              <>
                <div className="portal-monitor-row"><div><strong>Fee collection</strong><small>{naira(data.feeSummary.paid)} received</small></div><b>{Math.round((Number(data.feeSummary.paid) / Math.max(1, Number(data.feeSummary.total))) * 100)}%</b></div>
                <ProgressBar tone="green" value={Number(data.feeSummary.paid) / Math.max(1, Number(data.feeSummary.total)) * 100} />
              </>
            )}
            <div className="portal-monitor-row"><div><strong>Average attendance</strong><small>{data.counts?.today ?? 0} records captured today</small></div><b>{data.schoolProgress?.attendanceRate ?? 0}%</b></div>
            <ProgressBar tone="gold" value={data.schoolProgress?.attendanceRate ?? 0} />
            <div className="portal-monitor-row"><div><strong>Average subject progress</strong><small>{data.schoolProgress?.assessedStudents ?? 0} published student results</small></div><b>{data.schoolProgress?.subjectAverage ?? 0}%</b></div>
            <ProgressBar value={data.schoolProgress?.subjectAverage ?? 0} />
            <div className="portal-monitor-row"><div><strong>Admissions pipeline</strong><small>{data.counts?.applications ?? 0} new applications</small></div><Badge tone="info">Live</Badge></div>
          </Card>
          <Card title="Recent announcements">
            {data.recentAnnouncements?.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {data.recentAnnouncements.map((a) => (
                  <li key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--duga-border)" }}>
                    <strong>{a.title}</strong>
                    <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>
                      {a.author.firstName} {a.author.lastName} · {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No announcements yet" hint="Post one from the Messages page." />
            )}
          </Card>
          </div>
        </>
      ) : null}

      {data.role === "TEACHER" && data.classTeacherOf?.length ? (
        <div className="portal-dashboard-grid" style={{ marginBottom: 18 }}>
          {data.classTeacherOf.map((cg) => (
            <Card
              key={cg.classGroupId}
              title={cg.className}
              actions={<Link href="/portal/teacher/attendance" className="duga-btn duga-btn--accent duga-btn--sm"><Icon name="attendance" size={14} /> Take attendance</Link>}
            >
              <div style={{ marginBottom: 12 }}><Badge tone="accent">You are the Class Teacher</Badge></div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <Stat label="Students" value={cg.studentCount} />
                <Stat label="Attendance rate (30d)" value={`${cg.attendanceRate}%`} tone={cg.attendanceRate >= 80 ? "success" : "warning"} />
                <Stat label="Class average" value={cg.subjectAverage === null ? "—" : cg.subjectAverage} tone="info" />
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {data.role === "TEACHER" ? (
        <div className="portal-dashboard-grid">
          <Card title="My classes & subjects">
            {data.classSubjects?.length ? (
              <Table headers={["Subject", "Class"]}>
                {data.classSubjects.map((cs) => (
                  <tr key={cs.id}>
                    <td>{cs.subject.name}</td>
                    <td>{cs.classGroup ? `${cs.classGroup.level.name} ${cs.classGroup.name}` : "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <EmptyState title="No classes assigned" />
            )}
          </Card>
          <Card title="Upcoming live classes">
            {data.upcomingLive?.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {data.upcomingLive.map((l) => (
                  <li key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--duga-border)" }}>
                    <strong>{l.title}</strong>
                    <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>{new Date(l.scheduledAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No live classes" />
            )}
          </Card>
          <Card title="To-do">
            <Stat label="Submissions awaiting grading" value={data.pendingGrading ?? 0} tone="warning" />
            <Link href="/portal/learning" className="duga-btn duga-btn--outline duga-btn--sm" style={{ marginTop: 12, display: "inline-flex" }}>
              Go to Learning
            </Link>
          </Card>
        </div>
      ) : null}

      {data.role === "PARENT" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
          <Card title="My children">
            {data.children?.length ? (
              <Table headers={["Name", "Class"]}>
                {data.children.map((c) => (
                  <tr key={c.student.id}>
                    <td>
                      {c.student.user.firstName} {c.student.user.lastName}
                      <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{c.student.admissionNumber}</div>
                    </td>
                    <td>{c.student.classGroup ? `${c.student.classGroup.level.name} ${c.student.classGroup.name}` : "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <EmptyState title="No linked children" />
            )}
          </Card>
          {data.invoices !== null && (
            <Card title="Outstanding fees">
              {data.invoices?.length ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {data.invoices.map((i) => (
                    <li key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--duga-border)" }}>
                      <span>
                        <Badge tone={i.status === "PAID" ? "success" : i.status === "PARTIAL" ? "warning" : "danger"}>{i.status}</Badge>
                        <div style={{ fontSize: 12, color: "var(--duga-muted)", marginTop: 2 }}>
                          {i.student ? `${i.student.user.firstName} ${i.student.user.lastName}` : ""}
                        </div>
                      </span>
                      <span>{naira(i.balance)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No outstanding fees" />
              )}
              <Link href="/portal/fees" className="duga-btn duga-btn--outline duga-btn--sm" style={{ marginTop: 12, display: "inline-flex" }}>
                Pay fees
              </Link>
            </Card>
          )}
        </div>
      ) : null}

      {data.role === "STUDENT" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
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
          <Card title="Recent assignments">
            {data.assignments?.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {data.assignments.map((a) => (
                  <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--duga-border)" }}>
                    <Icon name="assignment" size={16} />
                    <span>{a.title}</span>
                    {a.classSubject?.subject ? <Badge tone="info">{a.classSubject.subject.name}</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No assignments" />
            )}
          </Card>
          <Card title="Upcoming live classes">
            {data.live?.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {data.live.map((l) => (
                  <li key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--duga-border)" }}>
                    <strong>{l.title}</strong>
                    <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>{new Date(l.scheduledAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No upcoming live classes" />
            )}
          </Card>
        </div>
      ) : null}

      {data.role === "BURSAR" ? (
        <>
          <div className="portal-metrics" style={{ marginBottom: 20 }}>
            {data.feeSummary ? (
              <>
                <Stat label="Fees collected" value={naira(data.feeSummary.paid)} tone="success" />
                <Stat label="Outstanding" value={naira(data.feeSummary.balance)} tone="danger" />
                <Stat label="Total billed" value={naira(data.feeSummary.total)} />
              </>
            ) : (
              <Stat label="Finance access" value="Not enabled" hint="Ask the owner to enable finance access." />
            )}
            <Stat label="Unpaid / partial invoices" value={data.counts?.unpaid ?? 0} tone="info" />
          </div>
          <Card title="Recent payments">
            {data.recentPayments?.length ? (
              <Table headers={["Student", "Amount", "Date"]}>
                {data.recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.student ? `${p.student.user.firstName} ${p.student.user.lastName}` : "—"}</td>
                    <td>{naira(p.amount)}</td>
                    <td>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <EmptyState title="No payments recorded yet" />
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
