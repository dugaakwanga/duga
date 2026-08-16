"use client";

import { useEffect, useState } from "react";
import { Card, Table, Badge, Button, Alert, Spinner, EmptyState, Stat, Modal, Field, Input, Select, Tabs } from "@duga/ui";

async function saApi<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/superadmin/${path.replace(/^\//, "")}`, {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json.data as T;
}

interface SchoolRow {
  id: string;
  name: string;
  shortName: string;
  domain: string;
  platformStatus: string;
  createdAt: string;
  subscription: { plan: string; status: string; expiresAt: string | null } | null;
  stats: { students: number; paid: number; outstanding: number };
}

interface LogRow {
  id: string;
  action: string;
  meta: unknown;
  createdAt: string;
  superAdmin?: { username: string };
  school?: { name: string };
  level?: string;
  source?: string;
  message?: string;
}

interface OwnerRow {
  id: string;
  schoolId: string;
  schoolName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  schoolId: string;
  schoolName: string;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface LiveRow {
  id: string;
  school: { id: string; name: string } | null;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  provider: string;
  status: string;
  teacher?: { user?: { firstName?: string; lastName?: string } };
  classSubject?: {
    subject?: { name?: string };
    classGroup?: { level?: { name?: string }; name?: string };
  };
}

interface CbtRow {
  id: string;
  school: { id: string; name: string } | null;
  title: string;
  status: string;
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  isAutoGraded: boolean;
  createdAt: string;
  _count: { questions: number; attempts: number };
  classSubject?: {
    subject?: { name?: string };
    classGroup?: { level?: { name?: string }; name?: string };
  };
  teacher?: { user?: { firstName?: string; lastName?: string } };
}

function naira(v: string | number | null | undefined): string {
  return `₦${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function statusTone(status: string) {
  switch (status) {
    case "ACTIVE":
      return "success" as const;
    case "SUSPENDED":
      return "warning" as const;
    case "SHUT_DOWN":
      return "danger" as const;
    case "DEACTIVATED":
      return "danger" as const;
    case "TRIALING":
      return "info" as const;
    case "PAST_DUE":
      return "warning" as const;
    case "CANCELLED":
    case "EXPIRED":
    case "CLOSED":
      return "danger" as const;
    case "PUBLISHED":
    case "LIVE":
    case "SCHEDULED":
      return "success" as const;
    case "DRAFT":
    case "ENDED":
      return "neutral" as const;
    default:
      return "neutral" as const;
  }
}

function userName(u: { firstName?: string; lastName?: string } | undefined | null): string {
  if (!u) return "—";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
}

function subjectLabel(c: { subject?: { name?: string }; classGroup?: { level?: { name?: string }; name?: string } } | undefined | null): string {
  if (!c) return "—";
  const sbj = c.subject?.name ?? "—";
  const cls = c.classGroup ? `${c.classGroup.level?.name ?? ""} ${c.classGroup.name ?? ""}`.trim() : "";
  return cls ? `${sbj} · ${cls}` : sbj;
}

export default function SuperAdminDashboard() {
  const [tab, setTab] = useState("schools");
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [cbt, setCbt] = useState<CbtRow[]>([]);
  const [logs, setLogs] = useState<{ system: LogRow[]; activities: LogRow[] }>({ system: [], activities: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscription modal (schools)
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SchoolRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  // School status modal
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusForm, setStatusForm] = useState<Record<string, string>>({});
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Section limit modal
  const [secOpen, setSecOpen] = useState(false);
  const [secSchool, setSecSchool] = useState<SchoolRow | null>(null);
  const [secData, setSecData] = useState<{ maxSections: number; sections: { id: string; name: string }[] } | null>(null);
  const [secMax, setSecMax] = useState("");
  const [secBusy, setSecBusy] = useState(false);
  const [secError, setSecError] = useState<string | null>(null);

  // Add school modal
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [schoolForm, setSchoolForm] = useState<Record<string, string>>({});
  const [schoolBusy, setSchoolBusy] = useState(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);

  // Owners
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerForm, setOwnerForm] = useState<Record<string, string>>({});
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  // Users
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState<Record<string, string>>({});
  const [userBusy, setUserBusy] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  // Live / CBT
  const [entityBusy, setEntityBusy] = useState(false);
  const [entityError, setEntityError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      saApi<{ items: SchoolRow[] }>("schools"),
      saApi<{ items: OwnerRow[] }>("owners"),
      saApi<{ items: UserRow[] }>("users"),
      saApi<{ items: LiveRow[] }>("live"),
      saApi<{ items: CbtRow[] }>("cbt"),
      saApi<{ system: LogRow[]; activities: LogRow[] }>("logs"),
    ])
      .then(([s, o, u, lv, cb, lg]) => {
        setSchools(s.items);
        setOwners(o.items);
        setUsers(u.items);
        setLive(lv.items);
        setCbt(cb.items);
        setLogs(lg);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function load() {
    const [s, o, u, lv, cb] = await Promise.all([
      saApi<{ items: SchoolRow[] }>("schools"),
      saApi<{ items: OwnerRow[] }>("owners"),
      saApi<{ items: UserRow[] }>("users"),
      saApi<{ items: LiveRow[] }>("live"),
      saApi<{ items: CbtRow[] }>("cbt"),
    ]);
    setSchools(s.items);
    setOwners(o.items);
    setUsers(u.items);
    setLive(lv.items);
    setCbt(cb.items);
  }

  // Schools — subscription
  async function openSub(school: SchoolRow) {
    setSelected(school);
    setForm({
      schoolId: school.id,
      plan: school.subscription?.plan ?? "FREE_TRIAL",
      status: school.subscription?.status ?? "TRIALING",
      expiresAt: school.subscription?.expiresAt ? school.subscription.expiresAt.slice(0, 10) : "",
    });
    setOpen(true);
  }

  async function saveSub() {
    try {
      await saApi("subscriptions/update", { method: "POST", body: form });
      setOpen(false);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // Schools — platform status (requires SA password)
  function openStatus(school: SchoolRow, target: string) {
    setSelected(school);
    setStatusForm({ schoolId: school.id, status: target, password: "" });
    setStatusError(null);
    setStatusOpen(true);
  }

  async function applyStatus() {
    if (!statusForm.password) {
      setStatusError("Enter your super admin password to confirm this action.");
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    try {
      await saApi("schools/setStatus", { method: "POST", body: statusForm });
      setStatusOpen(false);
      await load();
    } catch (e) {
      setStatusError((e as Error).message);
    } finally {
      setStatusBusy(false);
    }
  }

  // ---- Schools — add
  function openAddSchool() {
    setSchoolForm({ name: "", shortName: "", domain: "", address: "", phone: "", email: "" });
    setSchoolError(null);
    setSchoolOpen(true);
  }

  // ---- Schools — section limit
  async function openSections(school: SchoolRow) {
    setSecSchool(school);
    setSecError(null);
    try {
      const d = await saApi<{ maxSections: number; sections: { id: string; name: string }[] }>(`sections/${school.id}`);
      setSecData(d);
      setSecMax(String(d.maxSections));
    } catch (e) {
      setSecError((e as Error).message);
    }
    setSecOpen(true);
  }

  async function saveSections() {
    if (!secSchool) return;
    const max = Math.floor(Number(secMax));
    if (!max || max < 1) {
      setSecError("Enter a positive max section count.");
      return;
    }
    setSecBusy(true);
    setSecError(null);
    try {
      await saApi("sections/setLimit", { method: "POST", body: { schoolId: secSchool.id, maxSections: max } });
      setSecOpen(false);
      await load();
    } catch (e) {
      setSecError((e as Error).message);
    } finally {
      setSecBusy(false);
    }
  }

  async function saveSchool() {
    setSchoolBusy(true);
    setSchoolError(null);
    try {
      await saApi("schools/create", { method: "POST", body: schoolForm });
      setSchoolOpen(false);
      await load();
    } catch (e) {
      setSchoolError((e as Error).message);
    } finally {
      setSchoolBusy(false);
    }
  }

  // ---- Owners
  function openAddOwner() {
    setOwnerForm({ schoolId: "", schoolName: "", schoolShortName: "", firstName: "", lastName: "", email: "", phone: "", tempPassword: "" });
    setOwnerError(null);
    setOwnerOpen(true);
  }

  async function saveOwner() {
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      const res = await saApi<{ id: string; email: string; tempPassword: string }>("owners/create", { method: "POST", body: ownerForm });
      setOwnerOpen(false);
      await load();
      alert(`Owner created. Email: ${res.email}  Password: ${res.tempPassword}`);
    } catch (e) {
      setOwnerError((e as Error).message);
    } finally {
      setOwnerBusy(false);
    }
  }

  async function resetOwnerPassword(row: OwnerRow) {
    const newPw = prompt(`New temporary password for ${row.firstName} ${row.lastName} (${row.email}):`, "password123");
    if (!newPw) return;
    try {
      const res = await saApi<{ id: string; tempPassword: string }>("owners/resetPassword", { method: "POST", body: { id: row.id, tempPassword: newPw } });
      await load();
      alert(`Password reset. ${row.email} can now sign in with: ${res.tempPassword}`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function toggleOwnerStatus(row: OwnerRow) {
    const next = row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (!window.confirm(`${next === "SUSPENDED" ? "Suspend" : "Reactivate"} ${row.firstName} ${row.lastName} (${row.email})?`)) return;
    try {
      await saApi("owners/edit", { method: "POST", body: { id: row.id, status: next } });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // --------- Users
  function openAddUser() {
    setUserForm({ schoolId: schools[0]?.id ?? "", role: "ADMIN", firstName: "", lastName: "", email: "", tempPassword: "", designation: "" });
    setUserError(null);
    setUserOpen(true);
  }

  async function saveUser() {
    setUserBusy(true);
    setUserError(null);
    try {
      const res = await saApi<{ id: string; email: string; tempPassword: string }>("users/add", { method: "POST", body: userForm });
      setUserOpen(false);
      await load();
      alert(`${userForm.role} created. Email: ${res.email}  Password: ${res.tempPassword}`);
    } catch (e) {
      setUserError((e as Error).message);
    } finally {
      setUserBusy(false);
    }
  }

  async function resetUserPassword(row: UserRow) {
    const newPw = window.prompt(`New temporary password for ${row.firstName} ${row.lastName} (${row.email})?`, "password123");
    if (!newPw) return;
    try {
      const res = await saApi<{ id: string; tempPassword: string }>("users/resetPassword", { method: "POST", body: { id: row.id, tempPassword: newPw } });
      await load();
      alert(`Password reset. ${row.email} can sign in with: ${res.tempPassword}`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function setUserStatus(row: UserRow, status: string) {
    const label = status === "ACTIVE" ? "Reactivate" : status === "SUSPENDED" ? "Suspend" : "Deactivate";
    if (!window.confirm(`${label} ${row.firstName} ${row.lastName} (${row.email})?`)) return;
    try {
      await saApi("users/setStatus", { method: "POST", body: { id: row.id, status } });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // --------- Live / CBT status
  async function setLiveStatus(row: LiveRow, status: string) {
    if (!window.confirm(`Set live class "${row.title}" to ${status}?`)) return;
    setEntityBusy(true);
    setEntityError(null);
    try {
      await saApi("live/setStatus", { method: "POST", body: { id: row.id, status } });
      await load();
    } catch (e) {
      setEntityError((e as Error).message);
    } finally {
      setEntityBusy(false);
    }
  }

  async function setCbtStatus(row: CbtRow, status: string) {
    if (!window.confirm(`Set CBT "${row.title}" to ${status}?`)) return;
    setEntityBusy(true);
    setEntityError(null);
    try {
      await saApi("cbt/setStatus", { method: "POST", body: { id: row.id, status } });
      await load();
    } catch (e) {
      setEntityError((e as Error).message);
    } finally {
      setEntityBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/superadmin/logout", { method: "POST" });
    window.location.href = "/superadmin/login";
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading) return <Spinner size={28} />;

  const targetLabel =
    statusForm.status === "SUSPENDED" ? "Suspend" : statusForm.status === "SHUT_DOWN" ? "Shut down" : statusForm.status === "ACTIVE" ? "Reactivate" : "";

  return (
    <div className="sa-shell">
      <div style={{ width: "100%" }}>
        <div className="portal-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="portal-sidebar__logo">SA</div>
            <div>
              <div className="portal-topbar__title">Platform Admin Console</div>
              <div style={{ fontSize: 11.5, color: "var(--duga-muted)" }}>De Ultimate Glory Academy</div>
            </div>
          </div>
          <div className="portal-topbar__actions">
            <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/superadmin/features")}>Features</Button>
            <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
          </div>
        </div>
        <div className="portal-content" style={{ maxWidth: 1200 }}>
          <Tabs
            tabs={[
              { id: "schools", label: `Schools (${schools.length})` },
              { id: "owners", label: `Owners (${owners.length})` },
              { id: "users", label: `Users (${users.length})` },
              { id: "live", label: `Online classes (${live.length})` },
              { id: "cbt", label: `CBT (${cbt.length})` },
              { id: "logs", label: "Logs" },
            ]}
            value={tab}
            onChange={(t) => setTab(t)}
          />

          {/* -------- SCHOOLS -------- */}
          {tab === "schools" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 18 }}>
                <Stat label="Schools on platform" value={schools.length} />
                <Stat label="Total students" value={schools.reduce((a, s) => a + s.stats.students, 0)} />
                <Stat label="Collected" value={naira(schools.reduce((a, s) => a + Number(s.stats.paid), 0))} tone="success" />
                <Stat label="Outstanding" value={naira(schools.reduce((a, s) => a + Number(s.stats.outstanding), 0))} tone="danger" />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <Button variant="primary" size="sm" onClick={openAddSchool}>+ Add school</Button>
              </div>

              {schools.length === 0 ? (
                <EmptyState title="No schools registered yet" />
              ) : (
                <Card>
                  <Table headers={["School", "Domain", "Students", "Subscription", "Platform", "Collected", ""]}>
                    {schools.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.name}</strong>
                          <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{s.shortName}</div>
                        </td>
                        <td>{s.domain}</td>
                        <td>{s.stats.students}</td>
                        <td>
                          <Badge tone={s.subscription?.status === "ACTIVE" ? "success" : s.subscription?.status === "TRIALING" ? "info" : "danger"}>
                            {s.subscription?.status ?? "none"}
                          </Badge>
                          <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{s.subscription?.plan.replace("_", " ") ?? "—"}</div>
                        </td>
                        <td><Badge tone={statusTone(s.platformStatus)}>{s.platformStatus?.replace("_", " ") ?? "ACTIVE"}</Badge></td>
                        <td>{naira(s.stats.paid)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Button variant="outline" size="sm" onClick={() => openSections(s)}>Sections</Button>
                            <Button variant="outline" size="sm" onClick={() => openSub(s)}>Manage</Button>
                            {s.platformStatus === "ACTIVE" ? (
                              <Button variant="danger" size="sm" onClick={() => openStatus(s, "SUSPENDED")}>Suspend</Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => openStatus(s, "ACTIVE")}>Reactivate</Button>
                            )}
                            {s.platformStatus !== "SHUT_DOWN" && (
                              <Button variant="ghost" size="sm" onClick={() => openStatus(s, "SHUT_DOWN")}>Shut down</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}
            </>
          )}

          {/* -------- OWNERS -------- */}
          {tab === "owners" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <Button variant="primary" size="sm" onClick={openAddOwner}>+ Add owner</Button>
              </div>
              {owners.length === 0 ? (
                <EmptyState title="No owners yet" />
              ) : (
                <Card>
                  <Table headers={["Owner", "School", "Email", "Status", "Last login", ""]}>
                    {owners.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.firstName} {o.lastName}</strong>
                          {o.mustChangePassword && <div style={{ fontSize: 12, color: "var(--duga-danger)" }}>Must change password</div>}
                        </td>
                        <td>{o.schoolName}</td>
                        <td>{o.email}</td>
                        <td><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
                        <td>{o.lastLoginAt ? new Date(o.lastLoginAt).toLocaleString() : "Never"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Button variant="outline" size="sm" onClick={() => resetOwnerPassword(o)}>Reset password</Button>
                            <Button variant={o.status === "ACTIVE" ? "danger" : "outline"} size="sm" onClick={() => toggleOwnerStatus(o)}>
                              {o.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}
            </>
          )}

          {/* -------- USERS -------- */}
          {tab === "users" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <Button variant="primary" size="sm" onClick={openAddUser}>+ Add user</Button>
              </div>
              {users.length === 0 ? (
                <EmptyState title="No users yet" />
              ) : (
                <Card>
                  <Table headers={["User", "Role", "School", "Email", "Status", ""]}>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.firstName} {u.lastName}</strong>
                          {u.mustChangePassword && <div style={{ fontSize: 12, color: "var(--duga-danger)" }}>Must change password</div>}
                        </td>
                        <td><Badge tone="neutral">{u.role}</Badge></td>
                        <td>{u.schoolName}</td>
                        <td>{u.email}</td>
                        <td><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Button variant="outline" size="sm" onClick={() => resetUserPassword(u)}>Reset password</Button>
                            {u.status === "ACTIVE" ? (
                              <Button variant="danger" size="sm" onClick={() => setUserStatus(u, "SUSPENDED")}>Suspend</Button>
                            ) : u.status === "SUSPENDED" ? (
                              <Button variant="outline" size="sm" onClick={() => setUserStatus(u, "ACTIVE")}>Reactivate</Button>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => setUserStatus(u, "ACTIVE")}>Activate</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}
            </>
          )}

          {/* -------- ONLINE CLASSES -------- */}
          {tab === "live" && (
            <>
              {entityError && <Alert tone="danger">{entityError}</Alert>}
              {entityBusy && <Spinner size={18} />}
              {live.length === 0 ? (
                <EmptyState title="No online classes yet" />
              ) : (
                <Card>
                  <Table headers={["Class", "Subject", "Teacher", "School", "Scheduled", "Status", ""]}>
                    {live.map((lv) => (
                      <tr key={lv.id}>
                        <td><strong>{lv.title}</strong></td>
                        <td>{subjectLabel(lv.classSubject)}</td>
                        <td>{userName(lv.teacher?.user)}</td>
                        <td>{lv.school?.name ?? "—"}</td>
                        <td>{new Date(lv.scheduledAt).toLocaleString()}</td>
                        <td><Badge tone={statusTone(lv.status)}>{lv.status}</Badge></td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            {lv.status !== "ENDED" && lv.status !== "CANCELLED" && (
                              <Button variant="outline" size="sm" onClick={() => setLiveStatus(lv, lv.status === "SCHEDULED" ? "CANCELLED" : "ENDED")}>
                                {lv.status === "SCHEDULED" ? "Cancel" : "End"}
                              </Button>
                            )}
                            {lv.status === "SCHEDULED" && (
                              <Button variant="ghost" size="sm" onClick={() => setLiveStatus(lv, "LIVE")}>Mark live</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}
            </>
          )}

          {/* -------- CBT -------- */}
          {tab === "cbt" && (
            <>
              {entityError && <Alert tone="danger">{entityError}</Alert>}
              {entityBusy && <Spinner size={18} />}
              {cbt.length === 0 ? (
                <EmptyState title="No CBT tests yet" />
              ) : (
                <Card>
                  <Table headers={["Test", "Subject", "Questions", "Attempts", "School", "Status", ""]}>
                    {cbt.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.title}</strong></td>
                        <td>{subjectLabel(c.classSubject)}</td>
                        <td>{c._count.questions}</td>
                        <td>{c._count.attempts}</td>
                        <td>{c.school?.name ?? "—"}</td>
                        <td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            {c.status === "DRAFT" && <Button variant="outline" size="sm" onClick={() => setCbtStatus(c, "PUBLISHED")}>Publish</Button>}
                            {c.status === "PUBLISHED" && <Button variant="danger" size="sm" onClick={() => setCbtStatus(c, "CLOSED")}>Close</Button>}
                            {c.status === "CLOSED" && <Button variant="ghost" size="sm" onClick={() => setCbtStatus(c, "PUBLISHED")}>Reopen</Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}
            </>
          )}

          {/* -------- LOGS -------- */}
          {tab === "logs" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
              <Card title="Super admin activity">
                {logs.activities.length === 0 ? (
                  <EmptyState title="No activity" />
                ) : (
                  <Table headers={["Time", "Admin", "Action"]}>
                    {logs.activities.map((a) => (
                      <tr key={a.id}>
                        <td>{new Date(a.createdAt).toLocaleString()}</td>
                        <td>{a.superAdmin?.username ?? "—"}</td>
                        <td><Badge tone="neutral">{a.action}</Badge></td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
              <Card title="System logs">
                {logs.system.length === 0 ? (
                  <EmptyState title="No system logs" />
                ) : (
                  <Table headers={["Time", "Level", "Source", "Message"]}>
                    {logs.system.map((l) => (
                      <tr key={l.id}>
                        <td>{new Date(l.createdAt).toLocaleString()}</td>
                        <td><Badge tone={l.level === "ERROR" ? "danger" : l.level === "WARN" ? "warning" : "neutral"}>{l.level}</Badge></td>
                        <td>{l.source}</td>
                        <td>{l.message}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Subscription modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={`Subscription — ${selected?.name ?? ""}`}>
        <Field label="Plan">
          <Select value={form.plan ?? ""} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            <option value="FREE_TRIAL">Free trial</option>
            <option value="BASIC">Basic</option>
            <option value="PRO">Pro</option>
            <option value="ENTERPRISE">Enterprise</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status ?? ""} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="TRIALING">Trial</option>
            <option value="ACTIVE">Active</option>
            <option value="PAST_DUE">Past due</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
          </Select>
        </Field>
        <Field label="Expires">
          <Input type="date" value={form.expiresAt ?? ""} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </Field>
        <Field label="Seats">
          <Input value={form.seats ?? ""} onChange={(e) => setForm({ ...form, seats: e.target.value })} placeholder="Optional" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={saveSub}>Save</Button>
        </div>
      </Modal>

      {/* Section limit modal */}
      <Modal open={secOpen} onClose={() => setSecOpen(false)} title={`Sections — ${secSchool?.name ?? ""}`}>
        <Alert tone="info">
          The school owner can create up to this many school sections (e.g. Primary, Secondary, Junior, Senior). Increase it here to let them add more.
        </Alert>
        {secData && secData.sections.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 8 }}>Current sections ({secData.sections.length})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {secData.sections.map((sec) => (
                <Badge key={sec.id} tone="neutral">{sec.name}</Badge>
              ))}
            </div>
          </div>
        )}
        <Field label="Max sections the owner can create" required>
          <Input type="number" min={1} value={secMax} onChange={(e) => setSecMax(e.target.value)} placeholder="e.g. 2" />
        </Field>
        {secError && <Alert tone="danger">{secError}</Alert>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setSecOpen(false)}>Cancel</Button>
          <Button onClick={saveSections} disabled={secBusy}>{secBusy ? "Saving…" : "Save limit"}</Button>
        </div>
      </Modal>

      {/* School platform status modal */}
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title={`${targetLabel} ${selected?.name ?? ""}`}>
        <Alert tone="warning">
          {statusForm.status === "SHUT_DOWN"
            ? "Shutting down holds the entire platform for this school — no one can sign in. No data is deleted, and you can reactivate anytime."
            : statusForm.status === "SUSPENDED"
              ? "Suspending holds portal access for this school. No data is deleted, and you can reactivate anytime."
              : "Reactivating restores full access for this school."}
        </Alert>
        <Field label="Your super admin password" hint="Required to confirm this sensitive action.">
          <Input type="password" value={statusForm.password ?? ""} onChange={(e) => setStatusForm({ ...statusForm, password: e.target.value })} />
        </Field>
        {statusError && <Alert tone="danger">{statusError}</Alert>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setStatusOpen(false)}>Cancel</Button>
          <Button variant={statusForm.status === "ACTIVE" ? "primary" : "danger"} onClick={applyStatus} disabled={statusBusy}>
            {statusBusy ? "Working…" : `Confirm ${targetLabel}`}
          </Button>
        </div>
      </Modal>

      {/* Add owner modal */}
      <Modal open={ownerOpen} onClose={() => setOwnerOpen(false)} title="Add owner">
        <Field label="School" hint="Pick an existing school, or leave blank to create a new one below.">
          <Select value={ownerForm.schoolId ?? ""} onChange={(e) => setOwnerForm({ ...ownerForm, schoolId: e.target.value })}>
            <option value="">— Create a new school —</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        {!ownerForm.schoolId && (
          <>
            <Field label="New school name" hint="e.g. De Ultimate Glory Academy">
              <Input value={ownerForm.schoolName ?? ""} onChange={(e) => setOwnerForm({ ...ownerForm, schoolName: e.target.value })} />
            </Field>
            <Field label="Short name" hint="e.g. DUGA">
              <Input value={ownerForm.schoolShortName ?? ""} onChange={(e) => setOwnerForm({ ...ownerForm, schoolShortName: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="First name">
          <Input value={ownerForm.firstName ?? ""} onChange={(e) => setOwnerForm({ ...ownerForm, firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <Input value={ownerForm.lastName ?? ""} onChange={(e) => setOwnerForm({ ...ownerForm, lastName: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={ownerForm.email ?? ""} onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={ownerForm.phone ?? ""} onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })} />
        </Field>
        <Field label="Temporary password" hint="Defaults to password123">
          <Input value={ownerForm.tempPassword ?? ""} onChange={(e) => setOwnerForm({ ...ownerForm, tempPassword: e.target.value })} />
        </Field>
        {ownerError && <Alert tone="danger">{ownerError}</Alert>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOwnerOpen(false)}>Cancel</Button>
          <Button onClick={saveOwner} disabled={ownerBusy}>{ownerBusy ? "Creating…" : "Create owner"}</Button>
        </div>
      </Modal>

      {/* Add school modal */}
      <Modal open={schoolOpen} onClose={() => setSchoolOpen(false)} title="Add school">
        <Field label="School name">
          <Input value={schoolForm.name ?? ""} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} placeholder="e.g. De Ultimate Glory Academy" />
        </Field>
        <Field label="Short name">
          <Input value={schoolForm.shortName ?? ""} onChange={(e) => setSchoolForm({ ...schoolForm, shortName: e.target.value })} placeholder="e.g. DUGA" />
        </Field>
        <Field label="Domain" hint="Optional — a unique one is generated if left blank.">
          <Input value={schoolForm.domain ?? ""} onChange={(e) => setSchoolForm({ ...schoolForm, domain: e.target.value })} placeholder="school.example.com" />
        </Field>
        <Field label="Address">
          <Input value={schoolForm.address ?? ""} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={schoolForm.phone ?? ""} onChange={(e) => setSchoolForm({ ...schoolForm, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={schoolForm.email ?? ""} onChange={(e) => setSchoolForm({ ...schoolForm, email: e.target.value })} />
        </Field>
        {schoolError && <Alert tone="danger">{schoolError}</Alert>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setSchoolOpen(false)}>Cancel</Button>
          <Button onClick={saveSchool} disabled={schoolBusy}>{schoolBusy ? "Creating…" : "Create school"}</Button>
        </div>
      </Modal>

      {/* Add user modal */}
      <Modal open={userOpen} onClose={() => setUserOpen(false)} title="Add user">
        <Field label="School">
          <Select value={userForm.schoolId ?? ""} onChange={(e) => setUserForm({ ...userForm, schoolId: e.target.value })}>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Role">
          <Select value={userForm.role ?? "ADMIN"} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
            <option value="ADMIN">Admin</option>
            <option value="TEACHER">Teacher</option>
            <option value="STUDENT">Student</option>
          </Select>
        </Field>
        <Field label="First name">
          <Input value={userForm.firstName ?? ""} onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <Input value={userForm.lastName ?? ""} onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })} />
        </Field>
        <Field label="Email" hint="Optional — a generated address is used if blank.">
          <Input type="email" value={userForm.email ?? ""} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
        </Field>
        <Field label="Designation / staff number (optional)">
          <Input value={userForm.designation ?? ""} onChange={(e) => setUserForm({ ...userForm, designation: e.target.value })} placeholder="e.g. Registrar / STF-001" />
        </Field>
        <Field label="Temporary password" hint="Defaults to password123">
          <Input value={userForm.tempPassword ?? ""} onChange={(e) => setUserForm({ ...userForm, tempPassword: e.target.value })} />
        </Field>
        {userError && <Alert tone="danger">{userError}</Alert>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setUserOpen(false)}>Cancel</Button>
          <Button onClick={saveUser} disabled={userBusy}>{userBusy ? "Creating…" : "Create user"}</Button>
        </div>
      </Modal>
    </div>
  );
}