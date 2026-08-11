"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Badge, Button, Alert, Spinner, Select, Field } from "@duga/ui";
import { FEATURES, GLOBAL_SUBFEATURES, type FeatureDef } from "@/lib/features";
import { WEB_PAGES, WEB_FEATURES } from "@duga/core";

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
  disabledSubs: string[];
  admin: string[];
  teacher: string[];
  family: string[];
}

interface WebsiteConfig {
  enabled: boolean;
  notice: string;
  pages: string[];
  features: string[];
}

export default function SuperAdminFeatures() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [config, setConfig] = useState<FeatureConfig | null>(null);
  const [website, setWebsite] = useState<WebsiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const groups = useMemo(() => {
    const order = [...new Set(FEATURES.map((f) => f.group))];
    return order.map((g) => ({ group: g, features: FEATURES.filter((f) => f.group === g) }));
  }, []);

  const globalGroups = useMemo(() => {
    const order = [...new Set(GLOBAL_SUBFEATURES.map((s) => s.group ?? "Student environment"))];
    return order.map((g) => ({ group: g, subs: GLOBAL_SUBFEATURES.filter((s) => (s.group ?? "Student environment") === g) }));
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
    setWebsite(null);
    try {
      const [f, w] = await Promise.all([
        saApi<{ config: FeatureConfig }>(`features/${id}`),
        saApi<{ config: WebsiteConfig }>(`website/${id}`),
      ]);
      setConfig(f.config);
      setWebsite(w.config);
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
  const disabledSubs = new Set(config?.disabledSubs ?? []);

  function toggle(f: FeatureDef) {
    if (!config) return;
    const on = disabled.has(f.id);
    const next = new Set(disabled);
    if (on) next.delete(f.id);
    else next.add(f.id);
    setConfig({ ...config, disabled: [...next] });
    setSaved(false);
  }

  function toggleSub(id: string) {
    if (!config) return;
    const on = disabledSubs.has(id);
    const next = new Set(disabledSubs);
    if (on) next.delete(id);
    else next.add(id);
    setConfig({ ...config, disabledSubs: [...next] });
    setSaved(false);
  }

  async function save() {
    if (!config) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saApi("features/disable", { method: "POST", body: { schoolId, ids: config.disabled, subIds: config.disabledSubs } });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveWebsite() {
    if (!website) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const d = await saApi<{ config: WebsiteConfig }>("website/update", {
        method: "POST",
        body: { schoolId, enabled: website.enabled, notice: website.notice, pages: website.pages, features: website.features },
      });
      setWebsite(d.config);
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

            {website && (
              <Card style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 12 }}>
                  Public website
                </div>
                <Field label="Website status">
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={website.enabled}
                      onChange={(e) => setWebsite({ ...website, enabled: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {website.enabled ? "Live — visitors can view the school's website" : "Offline — visitors see a maintenance page"}
                    </span>
                  </label>
                </Field>
                {!website.enabled && (
                  <Field label="Maintenance notice" hint="Shown to visitors while the website is offline.">
                    <textarea
                      rows={3}
                      value={website.notice}
                      onChange={(e) => setWebsite({ ...website, notice: e.target.value })}
                      className="duga-input"
                      placeholder="e.g. This website is under maintenance. Please check back soon."
                    />
                  </Field>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Button onClick={saveWebsite} loading={busy}>Save website settings</Button>
                  {saved && <Badge tone="success">Saved</Badge>}
                  {error && <Alert tone="danger">{error}</Alert>}
                </div>
              </Card>
            )}

            {website && (
              <Card style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 12 }}>
                  Website pages
                </div>
                <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 12 }}>
                  Hidden pages disappear from the site menu and return a &quot;page not found&quot; when visited directly.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
                  {WEB_PAGES.map((p) => {
                    const on = website.pages.includes(p.slug);
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() =>
                          setWebsite({
                            ...website,
                            pages: on
                              ? website.pages.filter((s) => s !== p.slug)
                              : [...website.pages, p.slug],
                          })
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 12px",
                          border: `1px solid ${on ? "var(--duga-border)" : "var(--duga-danger)"}`,
                          borderRadius: 10,
                          background: on ? "transparent" : "var(--duga-danger-soft, rgba(220,53,69,0.08))",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 13.5,
                          fontWeight: 600,
                        }}
                      >
                        <span>{p.label}</span>
                        <Badge tone={on ? "success" : "danger"}>{on ? "Live" : "Hidden"}</Badge>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

            {website && (
              <Card style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 12 }}>
                  Website features
                </div>
                <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 12 }}>
                  Sections of the public site that can be turned on or off for this school.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
                  {WEB_FEATURES.map((f) => {
                    const on = website.features.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          setWebsite({
                            ...website,
                            features: on
                              ? website.features.filter((id) => id !== f.id)
                              : [...website.features, f.id],
                          })
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 12px",
                          border: `1px solid ${on ? "var(--duga-border)" : "var(--duga-danger)"}`,
                          borderRadius: 10,
                          background: on ? "transparent" : "var(--duga-danger-soft, rgba(220,53,69,0.08))",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 13.5,
                          fontWeight: 600,
                        }}
                      >
                        <span>
                          {f.label}
                          <div style={{ fontSize: 11.5, fontWeight: 400, color: "var(--duga-muted)", marginTop: 2 }}>{f.hint}</div>
                        </span>
                        <Badge tone={on ? "success" : "danger"}>{on ? "On" : "Off"}</Badge>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                  <Button onClick={saveWebsite} loading={busy}>Save website settings</Button>
                  {saved && <Badge tone="success">Saved</Badge>}
                </div>
              </Card>
            )}


          {config ? (
            <Card style={{ marginTop: 16 }}>
              {groups.map(({ group, features }) => (
                <div key={group} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 10 }}>
                    {group}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, alignItems: "start" }}>
                    {features.map((f) => {
                      const off = disabled.has(f.id);
                      return (
                        <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <button
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
                          {f.subfeatures && f.subfeatures.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {(f.subfeatures ?? []).map((s) => {
                                const subOff = disabledSubs.has(s.id);
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => toggleSub(s.id)}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: 10,
                                      padding: "7px 10px",
                                      border: `1px solid ${subOff ? "var(--duga-danger)" : "var(--duga-border)"}`,
                                      borderRadius: 8,
                                      background: subOff ? "var(--duga-danger-soft, rgba(220,53,69,0.08))" : off ? "rgba(0,0,0,0.04)" : "transparent",
                                      cursor: off ? "not-allowed" : "pointer",
                                      opacity: off ? 0.6 : 1,
                                      textAlign: "left",
                                      fontSize: 12.5,
                                      fontWeight: 500,
                                    }}
                                    title={s.hint}
                                  >
                                    <span>{s.label}</span>
                                    <Badge tone={off || subOff ? "danger" : "success"}>{off || subOff ? "Off" : "On"}</Badge>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {globalGroups.map(({ group, subs }) => (
                <div key={group} style={{ marginBottom: 18, paddingTop: 18, borderTop: "1px solid var(--duga-border)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 10 }}>
                    {group}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 12 }}>
                    Master switches that apply to the whole school regardless of role.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, alignItems: "start" }}>
                    {subs.map((s) => {
                      const off = disabledSubs.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleSub(s.id)}
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
                          title={s.hint}
                        >
                          <span>
                            {s.label}
                            {s.hint && <div style={{ fontSize: 11.5, fontWeight: 400, color: "var(--duga-muted)", marginTop: 2 }}>{s.hint}</div>}
                          </span>
                          <Badge tone={off ? "danger" : "success"}>{off ? "Off" : "On"}</Badge>
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
