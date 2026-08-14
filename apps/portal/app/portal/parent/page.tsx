"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge, PageHeader, Icon, EmptyState, Alert, Spinner } from "@duga/ui";
import { api } from "@/lib/client/api";

interface ChildStudent {
  id: string;
  admissionNumber: string;
  firstName?: string;
  lastName?: string;
  user?: { firstName: string; lastName: string };
  classGroup: { level: { name: string }; name: string } | null;
  reportAverage?: number | null;
  feeBalance?: string | number | null;
  feeStatus?: string | null;
  attendancePct?: number | null;
  subjectCount?: number;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  author?: { firstName: string; lastName: string };
  createdAt: string;
}

interface InvoiceLike {
  id: string;
  status: string;
  totalAmount: string | number;
  balance: string | number;
  student?: { user: { firstName: string; lastName: string } };
}

interface ParentData {
  role: string;
  children?: Array<{ student: ChildStudent }>;
  invoices?: InvoiceLike[] | null;
  announcements?: Announcement[];
}

function naira(v: string | number | undefined | null): string {
  return `₦${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK_LINKS = [
  { href: "/portal/results", label: "Results", icon: "results" as const },
  { href: "/portal/fees", label: "Fees", icon: "fees" as const },
  { href: "/portal/timetable", label: "Timetable", icon: "timetable" as const },
  { href: "/portal/attendance", label: "Attendance", icon: "attendance" as const },
];

export default function ParentHomePage() {
  const [data, setData] = useState<ParentData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ParentData>("dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Spinner size={28} />;

  const children = data.children ?? [];
  const openInvoices = (data.invoices ?? []).filter((i) => i.status !== "PAID" && i.status !== "OVERPAID");

  return (
    <div>
      <PageHeader
        title="My Family Home"
        subtitle={`${greeting()}. Here is how your child(ren) are doing at De Ultimate Glory Academy.`}
      />

      {children.length === 0 ? (
        <Card>
          <EmptyState title="No children linked yet" hint="Your account is not linked to any student. Contact the school office to link your child." />
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {/* Quick actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {QUICK_LINKS.map((q) => (
              <Link key={q.href} href={q.href} className="duga-btn duga-btn--outline">
                <Icon name={q.icon} size={16} />
                {q.label}
              </Link>
            ))}
          </div>

          {/* Children cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
            {children.map((c) => {
              const s = c.student;
              const name = `${s.user?.firstName ?? ""} ${s.user?.lastName ?? ""}`.trim() || s.admissionNumber;
              const className = s.classGroup ? `${s.classGroup.level.name} ${s.classGroup.name}`.trim() : "Not assigned";
              const section = s.classGroup?.level.name?.includes("JSS") || s.classGroup?.level.name?.includes("SSS") ? "SECONDARY" : "PRIMARY";
              const average = s.reportAverage;
              return (
                <div key={s.id} className="duga-card parent-child-card">
                  <div className="duga-card__pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, var(--duga-primary), var(--duga-gold))",
                          color: "#fff",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 800,
                          fontSize: 17,
                          flexShrink: 0,
                        }}
                      >
                        {name
                          .split(" ")
                          .map((w) => w[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                        <div style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>{s.admissionNumber}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      <Badge tone={section === "SECONDARY" ? "accent" : "info"}>{className}</Badge>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, fontSize: 12.5 }}>
                      <div className="parent-child-stat">
                        <div className="parent-child-stat__value">{average != null ? `${Math.round(average)}%` : "—"}</div>
                        <div className="parent-child-stat__label">Avg score</div>
                      </div>
                      <div className="parent-child-stat">
                        <div className="parent-child-stat__value">{s.attendancePct != null ? `${s.attendancePct}%` : "—"}</div>
                        <div className="parent-child-stat__label">Attendance</div>
                      </div>
                      <div className="parent-child-stat">
                        <div className="parent-child-stat__value">{s.subjectCount ?? 0}</div>
                        <div className="parent-child-stat__label">Subjects</div>
                      </div>
                    </div>

                    {s.feeBalance != null && Number(s.feeBalance) > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "var(--duga-danger-soft)", borderRadius: 10, padding: "8px 12px" }}>
                        <span style={{ fontSize: 12.5, color: "var(--duga-danger)", fontWeight: 700 }}>Fees owing</span>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--duga-danger)" }}>{naira(s.feeBalance)}</span>
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Link href="/portal/results" className="duga-btn duga-btn--outline duga-btn--sm" style={{ justifyContent: "center" }}>
                        View results
                      </Link>
                      <Link href="/portal/fees" className="duga-btn duga-btn--outline duga-btn--sm" style={{ justifyContent: "center" }}>
                        Fees
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Two-column: outstanding fees + announcements */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
            <Card title="Outstanding fees">
              {openInvoices.length === 0 ? (
                <EmptyState title="All fees are settled" hint="Great — there is nothing owing on your children's accounts." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {openInvoices.map((inv) => (
                    <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid var(--duga-border)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inv.student?.user?.firstName ? `${inv.student.user.firstName} ${inv.student.user.lastName}`.trim() : "Student"}
                        </div>
                        <Badge tone={inv.status === "PARTIAL" ? "warning" : "danger"}>{inv.status}</Badge>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>{naira(inv.balance)}</span>
                        <Link href="/portal/fees" className="duga-btn duga-btn--sm duga-btn--accent">Pay</Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Latest announcements">
              {(data.announcements ?? []).length === 0 ? (
                <EmptyState title="No announcements yet" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(data.announcements ?? []).map((a) => (
                    <div key={a.id} style={{ borderBottom: "1px solid var(--duga-border)", paddingBottom: 10 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.title}</div>
                      {a.body && <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 3 }}>{a.body.slice(0, 140)}{a.body.length > 140 ? "…" : ""}</div>}
                      <div style={{ fontSize: 11, color: "var(--duga-muted)", marginTop: 4 }}>{new Date(a.createdAt).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}