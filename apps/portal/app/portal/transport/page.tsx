"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Alert, Spinner, EmptyState, Button, Icon, Modal, Field, Input, Select } from "@duga/ui";
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

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  licenseNumber: string | null;
  vehicleId: string | null;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  model: string | null;
  capacity: number | null;
  routeId: string | null;
  route: Route | null;
  driver: Driver | null;
  locations?: Array<{ lat: number; lng: number; recordedAt: string }>;
}

interface TransportData {
  role: string;
  routes: Route[];
  vehicles: Vehicle[];
  drivers: Driver[];
  my?: Array<{ id: string; route: Route; stop: Stop | null; student?: { user: { firstName: string; lastName: string } } }>;
}

const emptyForm = (): Record<string, string> => ({});

export default function TransportPage() {
  const [data, setData] = useState<TransportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"" | "route" | "stop" | "vehicle" | "driver">("");
  const [editId, setEditId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string>("");
  const [form, setForm] = useState<Record<string, string>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    return api<TransportData>("transport")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openModal(kind: "route" | "stop" | "vehicle" | "driver", target?: { id?: string; form: Record<string, string>; routeId: string }) {
    setModal(kind);
    setEditId(target?.id ?? null);
    setRouteId(target?.routeId ?? "");
    setForm(target?.form ?? emptyForm());
  }

  async function submit() {
    if (!modal) return;
    setSaving(true);
    try {
      const id = editId;
      if (modal === "route") {
        await api(id ? `transport/${id}/updateRoute` : "transport/addRoute", { method: "POST", body: form });
      } else if (modal === "stop") {
        await api(id ? `transport/${id}/updateStop` : "transport/addStop", { method: "POST", body: { ...form, routeId } });
      } else if (modal === "vehicle") {
        await api(id ? `transport/${id}/updateVehicle` : "transport/addVehicle", { method: "POST", body: form });
      } else if (modal === "driver") {
        await api(id ? `transport/${id}/updateDriver` : "transport/addDriver", { method: "POST", body: form });
      }
      setModal("");
      setEditId(null);
      setForm(emptyForm());
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind: "route" | "stop" | "vehicle" | "driver" | "assignment", id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      const action = { route: "deleteRoute", stop: "deleteStop", vehicle: "deleteVehicle", driver: "deleteDriver", assignment: "removeAssignment" }[kind];
      await api(`transport/${id}/${action}`, { method: "POST", body: {} });
      load();
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
        subtitle="Routes, stops, vehicles and drivers."
        actions={<Button onClick={() => openModal("route")}><Icon name="plus" size={16} /> New route</Button>}
      />
      {(data.routes ?? []).length === 0 ? (
        <EmptyState title="No transport routes yet" />
      ) : (
        (data.routes ?? []).map((r) => (
          <Card key={r.id} title={r.name} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>
                {r.description ?? ""}
                {r.fee ? ` · Fee: ₦${Number(r.fee).toLocaleString()}` : ""}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" variant="outline" onClick={() => openModal("stop", { id: undefined, form: emptyForm(), routeId: r.id })}>Add stop</Button>
                <Button size="sm" variant="outline" onClick={() => openModal("route", { id: r.id, form: { name: r.name, description: r.description ?? "", fee: r.fee != null ? String(r.fee) : "" }, routeId: "" })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove("route", r.id, `route "${r.name}"`)}>Delete</Button>
              </div>
            </div>
            <strong style={{ fontSize: 13 }}>Stops</strong>
            <div style={{ fontSize: 13, color: "var(--duga-ink-2)", margin: "4px 0 10px" }}>
              {r.stops.length ? (
                r.stops.map((s) => (
                  <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}>
                    {s.order}. {s.name}{s.pickupTime ? ` (${s.pickupTime})` : ""}
                    <button
                      className="duga-btn duga-btn--sm duga-btn--ghost"
                      style={{ fontSize: 11, padding: "0 4px" }}
                      onClick={() => openModal("stop", { id: s.id, form: { name: s.name, pickupTime: s.pickupTime ?? "", order: String(s.order) }, routeId: r.id })}
                      title="Edit stop"
                    >
                      Edit
                    </button>
                    <button
                      className="duga-btn duga-btn--sm duga-btn--ghost"
                      style={{ fontSize: 11, padding: "0 4px" }}
                      onClick={() => remove("stop", s.id, `stop "${s.name}"`)}
                      title="Delete stop"
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                "No stops"
              )}
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
                <div style={{ fontSize: 13, marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                  {r.assignments.map((a) => (
                    <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {a.student.user.firstName} {a.student.user.lastName}
                      <button
                        className="duga-btn duga-btn--sm duga-btn--ghost"
                        style={{ fontSize: 11, padding: "0 4px" }}
                        onClick={() => remove("assignment", a.id, `assignment for ${a.student.user.firstName} ${a.student.user.lastName}`)}
                      >
                        Remove
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))
      )}

      <div style={{ marginTop: 24 }}>
        <Card title="Vehicles">
          {data.vehicles.length === 0 ? <EmptyState title="No vehicles" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.vehicles.map((v) => (
                <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5 }}>{v.plateNumber}{v.model ? ` · ${v.model}` : ""}{v.route ? ` → ${v.route.name}` : ""}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" variant="ghost" onClick={() => openModal("vehicle", { id: v.id, form: { plateNumber: v.plateNumber, model: v.model ?? "", capacity: v.capacity != null ? String(v.capacity) : "", routeId: v.routeId ?? "" }, routeId: "" })}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove("vehicle", v.id, `vehicle ${v.plateNumber}`)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Button size="sm" variant="outline" onClick={() => openModal("vehicle")}><Icon name="plus" size={14} /> Add vehicle</Button>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Drivers">
          {data.drivers.length === 0 ? <EmptyState title="No drivers" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.drivers.map((d) => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5 }}>{d.name}{d.phone ? ` · ${d.phone}` : ""}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" variant="ghost" onClick={() => openModal("driver", { id: d.id, form: { name: d.name, phone: d.phone ?? "", licenseNumber: d.licenseNumber ?? "", vehicleId: d.vehicleId ?? "" }, routeId: "" })}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove("driver", d.id, `driver ${d.name}`)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Button size="sm" variant="outline" onClick={() => openModal("driver")}><Icon name="plus" size={14} /> Add driver</Button>
          </div>
        </Card>
      </div>

      <Modal open={!!modal} onClose={() => { setModal(""); setEditId(null); setForm(emptyForm()); }} title={`${editId ? "Edit" : "New"} ${modal}`}>
        {modal === "stop" && (
          <Field label="Route" required>
            <Select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              {data.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        )}
        {modal === "vehicle" && (
          <Field label="Route">
            <Select value={form.routeId ?? ""} onChange={(e) => setForm({ ...form, routeId: e.target.value })}>
              <option value="">— No route —</option>
              {data.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        )}
        {modal === "driver" && (
          <Field label="Vehicle">
            <Select value={form.vehicleId ?? ""} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
              <option value="">— No vehicle —</option>
              {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
            </Select>
          </Field>
        )}
        {modal === "route" && (
          <>
            <Field label="Name" required>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Akwanga Town Route" />
            </Field>
            <Field label="Description">
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Fee">
              <Input value={form.fee ?? ""} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="e.g. 15000" />
            </Field>
          </>
        )}
        {modal === "stop" && (
          <>
            <Field label="Stop name" required>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. City Centre Gate" />
            </Field>
            <Field label="Pick-up time">
              <Input value={form.pickupTime ?? ""} onChange={(e) => setForm({ ...form, pickupTime: e.target.value })} placeholder="e.g. 07:00" />
            </Field>
          </>
        )}
        {modal === "vehicle" && (
          <>
            <Field label="Plate number" required>
              <Input value={form.plateNumber ?? ""} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} placeholder="e.g. ABC-123-XY" />
            </Field>
            <div className="duga-form-grid">
              <Field label="Model">
                <Input value={form.model ?? ""} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </Field>
              <Field label="Capacity">
                <Input type="number" value={form.capacity ?? ""} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              </Field>
            </div>
          </>
        )}
        {modal === "driver" && (
          <>
            <Field label="Name" required>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Driver full name" />
            </Field>
            <div className="duga-form-grid">
              <Field label="Phone">
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="License number">
                <Input value={form.licenseNumber ?? ""} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
              </Field>
            </div>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setModal(""); setEditId(null); setForm(emptyForm()); }}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editId ? "Save changes" : "Create"}</Button>
        </div>
      </Modal>
    </div>
  );
}