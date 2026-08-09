"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader, Button, Badge, Alert, Spinner, Tabs } from "@duga/ui";
import { api } from "@/lib/client/api";
import { FEATURES, type FeatureDef } from "@/lib/features";

type Target = "admin" | "teacher" | "family";

interface FeaturesData {
  role: string;
  mine: string[];
  config: { disabled: string[]; admin: string[]; teacher: string[]; family: string[] };
  canConfigure: string[];
}

const GROUP_ORDER = ["Academics", "Operations", "Communication", "Website", "Administration"];

export default function FeaturesPage() {
  const [data, setData] = useState<FeaturesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Target>("admin");

  async function load() {
    setLoading(true);
    try {
      const d = await api<FeaturesData>("features");
      setData(d);
      // Default to the first role this caller may configure.
      const targets: Target[] = ["admin", "teacher", "family"];
      const first = targets.find((t) => d.canConfigure.includes(t === "admin" ? "ADMIN" : t === "teacher" ? "TEACHER" : "PARENT"));
      if (first) setTab(first);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const order = [...GROUP_ORDER, ...FEATURES.map((f) => f.group).filter((g) => !GROUP_ORDER.includes(g))];
    const unique: string[] = [];
    for (const g of order) if (!unique.includes(g)) unique.push(g);
    return unique.map((g) => ({
      group: g,
      features: FEATURES.filter((f) => f.group === g),
    }));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  const targetRole = tab === "admin" ? "ADMIN" : tab === "teacher" ? "TEACHER" : "PARENT & STUDENT";
  const current = data.config[tab];

  function toggle(f: FeatureDef, on: boolean) {
    if (!data) return;
    const next = on ? [...new Set([...current, f.id])] : current.filter((id) => id !== f.id);
    setData({ ...data, config: { ...data.config, [tab]: next } });
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const cfg = await api<FeaturesData["config"]>("features/set", { method: "POST", body: { target: tab, ids: data.config[tab] } });
      setData({ ...data, config: cfg });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const cfg = await api<FeaturesData["config"]>("features/reset", { method: "POST", body: { target: tab } });
      setData({ ...data, config: cfg });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    ...(data.canConfigure.includes("ADMIN") ? [{ id: "admin" as Target, label: "Admin" }] : []),
    ...(data.canConfigure.includes("TEACHER") ? [{ id: "teacher" as Target, label: "Teacher" }] : []),
    ...(data.canConfigure.includes("PARENT") ? [{ id: "family" as Target, label: "Students & Parents" }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Features & roles"
        subtitle="Decide which functions each role can use. Disabling a function only hides it — no data is ever deleted."
      />

      <Card>
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(id) => {
            setTab(id as Target);
            setSaved(false);
          }}
        />
        <div style={{ fontSize: 13.5, color: "var(--duga-muted)", marginBottom: 16 }}>
          Turning a function on or off below controls what <strong>{targetRole}</strong> can see and use in their portal.
          The school owner and the platform always keep full access.
        </div>

        {groups.map(({ group, features }) => (
          <div key={group} style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 10 }}>
              {group}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
              {features.map((f) => {
                const on = current.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggle(f, !on)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "10px 12px",
                      border: `1px solid ${on ? "var(--duga-primary)" : "var(--duga-border)"}`,
                      borderRadius: 10,
                      background: on ? "var(--duga-primary-soft, rgba(26,115,232,0.08))" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  >
                    <span>{f.label}</span>
                    <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <Button onClick={save} loading={saving}>Save changes</Button>
          <Button variant="ghost" onClick={reset} disabled={saving}>Restore defaults</Button>
          {saved && <Badge tone="success">Saved</Badge>}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      </Card>
    </div>
  );
}
