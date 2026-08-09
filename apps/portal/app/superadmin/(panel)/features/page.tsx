"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Badge, Button, Alert, Spinner, Select, Field } from "@duga/ui";
import { FEATURES, type FeatureDef } from "@/lib/features";

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
}

interface FeatureConfig {
  disabled: string[];
  admin: string[];
  teacher: string[];
  family: string[];
}

export default function SuperAdminFeatures() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [config, setConfig] = useState<FeatureConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const groups = useMemo(() => {
    const order = [...new Set(FEATURES.map((f) => f.group))];
    return order.map((g) => ({ group: g, features: FEATURES.filter((f) => f.group === g) }));
  }, []);

  useEffect(() => {
    saApi<{ items: SchoolRow[] }>("schools")
      .then((d) => {
        setSchools(d.items);
        if (d.items[0]) setSchoolId(d.items[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadConfig(id: string) {
    if (!id) return;
    setError(null);
    setConfig(null);
    try {
      const d = await saApi<{ config: FeatureConfig }>(`features/${id}`);
      setConfig(d.config);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (schoolId) loadConfig(schoolId);
  }, [schoolId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading) return <Spinner size={28} />;

  const disabled = new Set(config?.disabled ?? []);

  function toggle(f: FeatureDef) {
    if (!config) return;
    const on = disabled.has(f.id);
    const next = new Set(disabled);
    if (on) next.delete(f.id);
    else next.add(f.id);
    setConfig({ ...config, disabled: [...next] });
    setSaved(false);
  }

  async function save() {
    if (!config) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saApi("features/disable", { method: "POST", body: { schoolId, ids: config.disabled } });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sa-shell">
      <div style={{ width: "100%" }}>
        <div className="portal-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="portal-sidebar__logo">SA</div>
            <div>
              <div className="portal-topbar__title">Platform features</div>
              <div style={{ fontSize: 11.5, color: "var(--duga-muted)" }}>Turn platform functions off for a school — data is never deleted.</div>
            </div>
          </div>
          <div className="portal-topbar__actions">
            <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/superadmin/dashboard")}>Back to dashboard</Button>
          </div>
        </div>

        <div className="portal-content" style={{ maxWidth: 1000 }}>
          <Card>
            <Field label="School">
              <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <div style={{ fontSize: 13, color: "var(--duga-muted)", marginTop: 8 }}>
              Turning a function off hides it from the whole school (owner included). The data behind it stays safe and can be turned back on anytime.
            </div>
          </Card>

          {config ? (
            <Card style={{ marginTop: 16 }}>
              {groups.map(({ group, features }) => (
                <div key={group} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 10 }}>
                    {group}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
                    {features.map((f) => {
                      const off = disabled.has(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggle(f)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            border: `1px solid ${off ? "var(--duga-danger)" : "var(--duga-border)"}`,
                            borderRadius: 10,
                            background: off ? "var(--duga-danger-soft, rgba(220,53,69,0.08))" : "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: 13.5,
                            fontWeight: 600,
                          }}
                        >
                          <span>{f.label}</span>
                          <Badge tone={off ? "danger" : "success"}>{off ? "Disabled" : "On"}</Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <Button onClick={save} loading={busy}>Save changes</Button>
                {saved && <Badge tone="success">Saved</Badge>}
                {error && <Alert tone="danger">{error}</Alert>}
              </div>
            </Card>
          ) : (
            <Card style={{ marginTop: 16 }}><Spinner size={24} /></Card>
          )}
        </div>
      </div>
    </div>
  );
}
