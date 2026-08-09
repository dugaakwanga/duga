"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, Field, Input, Button, Badge, Alert, Spinner, Table, EmptyState } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Term {
  id: string;
  name: string;
  termNumber: number;
  status: string;
  session: { name: string };
}

interface SettingsData {
  school: { id: string; name: string; shortName: string; phone: string | null; email: string | null; address: string | null; logoUrl: string | null };
  subscription: { plan: string; status: string; expiresAt: string | null } | null;
  terms: Term[];
  role?: string;
  financeAccess?: boolean;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<SettingsData>("settings")
      .then((d) => {
        setData(d);
        setForm({
          name: d.school.name,
          shortName: d.school.shortName,
          phone: d.school.phone ?? "",
          email: d.school.email ?? "",
          address: d.school.address ?? "",
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await api("settings", { method: "PATCH", body: form });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function activateTerm(id: string) {
    await api("settings/activateTerm", { method: "POST", body: { termId: id } });
    const d = await api<SettingsData>("settings");
    setData(d);
  }

  async function toggleFinanceAccess() {
    setError(null);
    try {
      const next = !data?.financeAccess;
      await api("settings/setFinanceAccess", { method: "POST", body: { value: next } });
      const d = await api<SettingsData>("settings");
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  return (
    <div>
      <PageHeader title="School settings" subtitle="Manage school profile and academic terms." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
        <Card title="School profile">
          <Field label="School name"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Short name"><Input value={form.shortName ?? ""} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Address"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          {saved && <Alert tone="success">Saved.</Alert>}
          <Button onClick={save} style={{ marginTop: 14 }}>Save profile</Button>
        </Card>

        <div>
          <Card title="Subscription">
            {data.subscription ? (
              <div>
                <Badge tone={data.subscription.status === "ACTIVE" ? "success" : "warning"}>{data.subscription.status}</Badge>
                <div style={{ marginTop: 8 }}>
                  <strong>{data.subscription.plan.replace("_", " ")}</strong>
                  <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>
                    {data.subscription.expiresAt ? `Expires ${new Date(data.subscription.expiresAt).toLocaleDateString()}` : "No expiry set"}
                  </div>
                </div>
              </div>
            ) : (
              <Alert tone="info">No subscription on file.</Alert>
            )}
          </Card>

          {data.role === "OWNER" && (
            <Card title="Finance dashboard access" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 12 }}>
                The finance dashboard (Reports) is visible only to the school owner by default. Toggle this to let the
                school admin view it as well.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Badge tone={data.financeAccess ? "success" : "neutral"}>{data.financeAccess ? "Admin access granted" : "Owner only"}</Badge>
                <Button variant="outline" size="sm" onClick={toggleFinanceAccess}>
                  {data.financeAccess ? "Revoke admin access" : "Grant admin access"}
                </Button>
              </div>
            </Card>
          )}

          <Card title="Features & roles" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 12 }}>
              The owner decides what the admin can use, and the admin decides what teachers and students can use.
            </div>
            <Link href="/portal/settings/features" className="duga-btn duga-btn--outline duga-btn--sm" style={{ display: "inline-flex" }}>
              Manage features & roles
            </Link>
          </Card>

          <Card title="Academic terms" style={{ marginTop: 16 }}>
            {data.terms.length === 0 ? (
              <EmptyState title="No terms yet" />
            ) : (
              <Table headers={["Term", "Session", "Status", ""]}>
                {data.terms.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.session.name}</td>
                    <td>
                      <Badge tone={t.status === "ACTIVE" ? "success" : "neutral"}>{t.status}</Badge>
                    </td>
                    <td>
                      {t.status !== "ACTIVE" && (
                        <Button variant="outline" size="sm" onClick={() => activateTerm(t.id)}>Activate</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
