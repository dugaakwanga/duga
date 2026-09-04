"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Select, Field, Input, Modal, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Application {
  id: string;
  applicantName: string;
  applicantType: string;
  email: string;
  phone: string;
  section: string;
  levelApplied: string | null;
  previousSchool: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelation: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  notes: string | null;
  status: string;
  submittedAt: string;
  test: { isSubmitted: boolean; score: number | null; maxScore: number | null; percentage: number | null; submittedAt: string | null } | null;
}

interface ClassOption {
  id: string;
  name: string;
  level: { name: string; section: string };
  session: { name: string };
}

const STATUSES = ["RECEIVED", "REVIEWING", "APPROVED", "WAITLISTED", "REJECTED"] as const;
const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  RECEIVED: "info",
  REVIEWING: "warning",
  APPROVED: "success",
  WAITLISTED: "neutral",
  REJECTED: "danger",
};

export default function ApplicationsPage() {
  const [items, setItems] = useState<Application[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [detail, setDetail] = useState<Application | null>(null);
  const [admitTarget, setAdmitTarget] = useState<Application | null>(null);
  const [admitForm, setAdmitForm] = useState<{ classGroupId: string; tempPassword: string }>({ classGroupId: "", tempPassword: "" });
  const [saving, setSaving] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Application | null>(null);
  const [testLink, setTestLink] = useState<{ applicantName: string; url: string } | null>(null);

  useEffect(() => {
    api<{ items: Application[]; counts: Array<{ status: string; _count: number }> }>("applications")
      .then((d) => {
        setItems(d.items);
        const map: Record<string, number> = {};
        d.counts.forEach((c) => (map[c.status] = c._count));
        setCounts(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    api<{ items: ClassOption[] }>("classes")
      .then((d) => setClasses(d.items))
      .catch(() => setClasses([]));
  }, []);

  async function setStatus(id: string, status: string) {
    try {
      await api(`applications/${id}/updateStatus`, { method: "POST", body: { status } });
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function refresh() {
    const d = await api<{ items: Application[]; counts: Array<{ status: string; _count: number }> }>("applications");
    setItems(d.items);
    const map: Record<string, number> = {};
    d.counts.forEach((c) => (map[c.status] = c._count));
    setCounts(map);
    setDetail((cur) => (cur ? d.items.find((i) => i.id === cur.id) ?? null : null));
    setAdmitTarget((cur) => (cur ? d.items.find((i) => i.id === cur.id) ?? null : null));
  }

  async function admit() {
    if (!admitTarget) return;
    if (!admitForm.classGroupId) return alert("Choose a class to admit into");
    setSaving(true);
    try {
      const d = await api<{ admissionNumber: string }>(`applications/${admitTarget.id}/admit`, {
        method: "POST",
        body: { classGroupId: admitForm.classGroupId, tempPassword: admitForm.tempPassword },
      });
      setAdmitTarget(null);
      setAdmitForm({ classGroupId: "", tempPassword: "" });
      await refresh();
      alert(`Admitted successfully — admission number ${d.admissionNumber}`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: string) {
    if (!statusTarget) return;
    await setStatus(statusTarget.id, status);
    setStatusTarget(null);
  }

  async function viewTestLink(a: Application) {
    try {
      const d = await api<{ path: string }>(`applications/${a.id}/getTestLink`, { method: "POST" });
      setTestLink({ applicantName: a.applicantName, url: `${window.location.origin}${d.path}` });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const visible = filter ? items.filter((i) => i.status === filter) : items;
  const admitClasses = admitTarget
    ? classes.filter((c) => c.level.section === admitTarget.section)
    : [];

  return (
    <div>
      <PageHeader
        title="Admission applications"
        subtitle="Inbox for applications from the public website."
        actions={
          <Link href="/portal/applications/test">
            <Button variant="outline"><Icon name="notes" size={14} /> Manage entrance test</Button>
          </Link>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <>
          {/* Funnel */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 18 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(filter === s ? "" : s)}
                className="appl-funnel"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  border: `1px solid ${filter === s ? "var(--duga-primary)" : "var(--duga-border)"}`,
                  background: filter === s ? "var(--duga-primary-light, #eef2fb)" : "#fff",
                  borderRadius: 12,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--duga-primary-ink)" }}>{counts[s] ?? 0}</div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--duga-muted)" }}>{s}</div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s} ({counts[s] ?? 0})</option>
              ))}
            </Select>
          </div>

          {visible.length === 0 ? (
            <EmptyState title="No applications" hint="Applications from the website will appear here." />
          ) : (
            <Card>
              <Table headers={["Applicant", "Section", "Level", "Contact", "Entrance test", "Submitted", "Status", "Actions"]}>
                {visible.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <button style={{ textAlign: "left", background: "none", border: "none", padding: 0, fontWeight: 600, cursor: "pointer", color: "var(--duga-primary)" }} onClick={() => setDetail(a)}>
                        {a.applicantName}
                      </button>
                      <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{a.applicantType.toLowerCase()}</div>
                    </td>
                    <td><Badge tone={a.section === "PRIMARY" ? "info" : "accent"}>{a.section.toLowerCase()}</Badge></td>
                    <td>{a.levelApplied ?? "—"}</td>
                    <td>
                      {a.email}
                      <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{a.phone}</div>
                    </td>
                    <td>
                      {a.test?.isSubmitted ? (
                        <Badge tone={a.test.percentage != null && a.test.percentage >= 50 ? "success" : "warning"}>{a.test.percentage}%</Badge>
                      ) : (
                        <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--duga-primary)", fontSize: 12.5 }} onClick={() => viewTestLink(a)}>
                          Get link
                        </button>
                      )}
                    </td>
                    <td>{new Date(a.submittedAt).toLocaleDateString()}</td>
                    <td><Badge tone={STATUS_TONES[a.status] ?? "neutral"}>{a.status}</Badge></td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "APPROVED")}>Approve</Button>
                        {a.status === "APPROVED" && (
                          <Button size="sm" variant="accent" onClick={() => { setAdmitTarget(a); setAdmitForm({ classGroupId: "", tempPassword: "" }); }}><Icon name="plus" size={14} /> Admit</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => { setStatusTarget(a); }}>Status</Button>
                        <Button size="sm" variant="danger" onClick={() => setStatus(a.id, "REJECTED")}>Reject</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.applicantName : ""}>
        {detail && (
          <div style={{ display: "grid", gap: 8 }}>
            {[
              ["Applicant type", detail.applicantType],
              ["Section", detail.section.toLowerCase()],
              ["Level applied", detail.levelApplied ?? "—"],
              ["Email", detail.email],
              ["Phone", detail.phone],
              ["Gender", detail.gender ? detail.gender.toLowerCase() : "—"],
              ["Date of birth", detail.dateOfBirth ? new Date(detail.dateOfBirth).toLocaleDateString() : "—"],
              ["Previous school", detail.previousSchool ?? "—"],
              ["Guardian", detail.guardianName ?? "—"],
              ["Guardian phone", detail.guardianPhone ?? "—"],
              ["Guardian relation", detail.guardianRelation ? detail.guardianRelation.toLowerCase() : "—"],
              ["Submitted", new Date(detail.submittedAt).toLocaleString()],
              ["Status", detail.status],
              ["Entrance test", detail.test?.isSubmitted ? `${detail.test.percentage}% (${detail.test.score}/${detail.test.maxScore})` : "Not taken yet"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "7px 0", borderBottom: "1px solid var(--duga-border)" }}>
                <span style={{ color: "var(--duga-muted)", fontSize: 13 }}>{k}</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
              </div>
            ))}
            {detail.notes && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 6 }}>Notes</div>
                <div style={{ whiteSpace: "pre-wrap", background: "var(--duga-surface-2, #f7f9fc)", borderRadius: 8, padding: 10, fontSize: 13 }}>{detail.notes}</div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Status modal */}
      <Modal open={!!statusTarget} onClose={() => setStatusTarget(null)} title={statusTarget ? `Change status — ${statusTarget.applicantName}` : ""}>
        {statusTarget && (
          <div style={{ display: "grid", gap: 8 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                  border: `1px solid ${statusTarget.status === s ? "var(--duga-primary)" : "var(--duga-border)"}`,
                  background: statusTarget.status === s ? "var(--duga-primary-light, #eef2fb)" : "#fff",
                  fontWeight: 700, fontSize: 14,
                }}
              >
                <span>{s}</span>
                {statusTarget.status === s && <Badge tone="accent">current</Badge>}
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Admit modal */}
      <Modal open={!!admitTarget} onClose={() => setAdmitTarget(null)} title={admitTarget ? `Admit — ${admitTarget.applicantName}` : ""}>
        {admitTarget && (
          <div style={{ display: "grid", gap: 14 }}>
            <Alert tone="info">
              This creates a student account for <strong>{admitTarget.applicantName}</strong> in the{" "}
              <strong>{admitTarget.section === "PRIMARY" ? "Primary" : "Secondary"}</strong> school.
            </Alert>
            <Field label="Class" required>
              <Select value={admitForm.classGroupId} onChange={(e) => setAdmitForm({ ...admitForm, classGroupId: e.target.value })}>
                <option value="">Select class…</option>
                {admitClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.level.name} {c.name} ({c.session.name})</option>
                ))}
              </Select>
            </Field>
            <Field label="Temp password" hint="The student changes this on first login. Default: password123">
              <Input value={admitForm.tempPassword} onChange={(e) => setAdmitForm({ ...admitForm, tempPassword: e.target.value })} placeholder="password123" />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="ghost" onClick={() => setAdmitTarget(null)}>Cancel</Button>
              <Button onClick={admit} loading={saving}>Admit student</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Entrance-test link modal */}
      <Modal open={!!testLink} onClose={() => setTestLink(null)} title={testLink ? `Entrance test link — ${testLink.applicantName}` : ""}>
        {testLink && (
          <div style={{ display: "grid", gap: 14 }}>
            <Alert tone="info">Share this link with the applicant so they can take the entrance test — no portal account needed.</Alert>
            <Input readOnly value={testLink.url} onFocus={(e) => e.currentTarget.select()} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button
                variant="accent"
                onClick={() => {
                  navigator.clipboard?.writeText(testLink.url).catch(() => undefined);
                }}
              >
                Copy link
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}