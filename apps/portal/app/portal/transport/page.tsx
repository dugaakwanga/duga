"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Alert, Spinner, EmptyState, Button, Icon, Modal, Field, Input } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Stop {
  id: string;
  name: string;
  order: number;
  pickupTime: string | null;
}

interface Route {
  id: string;
  name: string;
  description: string | null;
  fee: string | number | null;
  stops: Stop[];
  vehicles: Array<{ id: string; plateNumber: string; model: string | null; capacity: number | null; locations?: Array<{ lat: number; lng: number; recordedAt: string }> }>;
  assignments: Array<{ id: string; student: { user: { firstName: string; lastName: string } } }>;
}

interface TransportData {
  role: string;
  routes: Route[];
  vehicles: Array<{ id: string; plateNumber: string; model: string | null; capacity: number | null; route: Route | null; driver: unknown; locations?: Array<{ lat: number; lng: number; recordedAt: string }> }>;
  my?: Array<{ id: string; route: Route; stop: Stop | null; student?: { user: { firstName: string; lastName: string } } }>;
}

export default function TransportPage() {
  const [data, setData] = useState<TransportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    api<TransportData>("transport")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function addRoute() {
    try {
      await api("transport/addRoute", { method: "POST", body: form });
      setOpen(false);
      const d = await api<TransportData>("transport");
      setData(d);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  if (data.role === "STUDENT" || data.role === "PARENT") {
    return (
      <div>
        <PageHeader title="Transport" subtitle="School bus routes and live vehicle location." />
        {(data.my ?? []).length === 0 ? (
          <EmptyState title="No transport assignment" hint="Contact the school office to subscribe to a route." />
        ) : (
          (data.my ?? []).map((m) => (
            <Card key={m.id} title={m.route.name} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, marginBottom: 10 }}>
                {m.stop ? <>Pick-up stop: <strong>{m.stop.name}</strong> · {m.stop.pickupTime ?? ""}</> : "No stop assigned"}
              </div>
              <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>
                {m.route.stops.map((s) => s.name).join(" → ")}
              </div>
              {m.route.vehicles.map((v) => {
                const loc = v.locations?.[0];
                return (
                  <div key={v.id} style={{ marginTop: 12, padding: 10, background: "var(--duga-surface)", borderRadius: 8 }}>
                    <Badge tone="success">{v.plateNumber}</Badge>
                    {loc ? (
                      <div style={{ fontSize: 12.5, marginTop: 6 }}>
                        Bus last seen at {new Date(loc.recordedAt).toLocaleTimeString()} ({loc.lat.toFixed(5)}, {loc.lng.toFixed(5)})
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--duga-muted)" }}>No live location yet</div>
                    )}
                  </div>
                );
              })}
            </Card>
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Transport"
        subtitle="Routes, stops, vehicles and assignments."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New route</Button>}
      />
      {(data.routes ?? []).length === 0 ? (
        <EmptyState title="No transport routes yet" />
      ) : (
        (data.routes ?? []).map((r) => (
          <Card key={r.id} title={r.name} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 8 }}>
              {r.description ?? ""}
              {r.fee ? ` · Fee: ₦${Number(r.fee).toLocaleString()}` : ""}
            </div>
            <strong style={{ fontSize: 13 }}>Stops</strong>
            <div style={{ fontSize: 13, color: "var(--duga-ink-2)", margin: "4px 0 10px" }}>
              {r.stops.length ? r.stops.map((s) => `${s.order}. ${s.name}${s.pickupTime ? ` (${s.pickupTime})` : ""}`).join(" · ") : "No stops"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {r.vehicles.map((v) => (
                <Badge key={v.id} tone="info">{v.plateNumber}{v.model ? ` · ${v.model}` : ""}</Badge>
              ))}
              {r.vehicles.length === 0 && <span style={{ fontSize: 12.5, color: "var(--duga-muted)" }}>No vehicles</span>}
            </div>
            {r.assignments.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 13 }}>Assigned students</strong>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {r.assignments.map((a) => `${a.student.user.firstName} ${a.student.user.lastName}`).join(", ")}
                </div>
              </div>
            )}
          </Card>
        ))
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New transport route">
        <Field label="Name" required>
          <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Akwanga Town Route" />
        </Field>
        <Field label="Description">
          <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Fee">
          <Input value={form.fee ?? ""} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="e.g. 15000" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={addRoute}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}
