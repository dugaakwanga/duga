"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Icon, Modal, Field, Input, Select, Textarea } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Bed {
  id: string;
  bedNumber: string;
  allocations?: Array<{ id: string; student: { user: { firstName: string; lastName: string } } }>;
}

interface Room {
  id: string;
  name?: string;
  roomNumber?: string;
  capacity?: number | null;
  beds: Bed[];
}

interface HostelAllocation {
  id: string;
  status?: string;
  student: { user: { firstName: string; lastName: string } };
  room: { name: string; roomNumber?: string };
  bed: { bedNumber: string };
  hostel?: { name: string };
}

interface Hostel {
  id: string;
  name: string;
  gender: string;
  capacity: number | null;
  rooms: Room[];
  allocations: HostelAllocation[];
  nightAttendance: Array<{ id: string; date: string; status: string; remark: string | null }>;
}

interface Incident {
  id: string;
  title: string;
  status: string;
  date: string;
  severity?: string;
  description?: string | null;
}

interface HostelData {
  role: string;
  hostels?: Hostel[];
  allocations?: Array<{ id: string; hostel: { name: string }; room: { name: string; roomNumber?: string }; bed: { bedNumber: string } }>;
  nightAttendance?: Array<{ id: string; date: string; status: string }>;
  boardingStudents?: Array<{ id: string; user: { firstName: string; lastName: string }; hostelAllocations?: Array<{ id: string }> }>;
  incidents?: Incident[];
}

const emptyForm = (): Record<string, string> => ({});

export default function HostelPage() {
  const [data, setData] = useState<HostelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"" | "hostel" | "room">("");
  const [editId, setEditId] = useState<string | null>(null);
  const [hostelId, setHostelId] = useState<string>("");
  const [form, setForm] = useState<Record<string, string>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState<Record<string, string>>({});
  const [resolveIncident, setResolveIncident] = useState<Incident | null>(null);
  const [resolveForm, setResolveForm] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    return api<HostelData>("hostel")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openModal(kind: "hostel" | "room", target?: { id?: string; form: Record<string, string>; hostelId: string }) {
    setModal(kind);
    setEditId(target?.id ?? null);
    setHostelId(target?.hostelId ?? "");
    setForm(target?.form ?? emptyForm());
  }

  async function submit() {
    if (!modal) return;
    setSaving(true);
    try {
      const id = editId;
      if (modal === "hostel") {
        await api(id ? `hostel/${id}/updateHostel` : "hostel/addHostel", { method: "POST", body: form });
      } else if (modal === "room") {
        await api(id ? `hostel/${id}/updateRoom` : "hostel/addRoom", { method: "POST", body: { ...form, hostelId } });
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

  async function remove(kind: "hostel" | "room" | "incident", id: string, name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      const action = { hostel: "deleteHostel", room: "deleteRoom", incident: "deleteIncident" }[kind];
      await api(`hostel/${id}/${action}`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function release(a: HostelAllocation) {
    if (!confirm(`Release ${a.student.user.firstName} ${a.student.user.lastName} from this bed?`)) return;
    try {
      await api(`hostel/${a.id}/release`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function logIncident() {
    setSaving(true);
    try {
      await api("hostel/logIncident", { method: "POST", body: incidentForm });
      setIncidentOpen(false);
      setIncidentForm({});
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveResolve() {
    if (!resolveIncident) return;
    setSaving(true);
    try {
      await api(`hostel/${resolveIncident.id}/resolveIncident`, { method: "POST", body: resolveForm });
      setResolveIncident(null);
      setResolveForm({});
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const roomName = (r: Room) => r.name ?? r.roomNumber ?? "—";

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  if (data.role === "STUDENT" || data.role === "PARENT") {
    return (
      <div>
        <PageHeader title="Hostel" subtitle="Your hostel accommodation." />
        {(data.allocations ?? []).length === 0 ? (
          <EmptyState title="No hostel allocation" hint="Contact the school office if you should be in boarding." />
        ) : (
          (data.allocations ?? []).map((a) => (
            <Card key={a.id} title={a.hostel.name}>
              <div style={{ fontSize: 14 }}>
                Room <strong>{a.room.name}</strong> · Bed <strong>{a.bed.bedNumber}</strong>
              </div>
            </Card>
          ))
        )}
        {data.role === "STUDENT" && (data.nightAttendance ?? []).length > 0 && (
          <Card title="Night attendance" style={{ marginTop: 16 }}>
            <Table headers={["Date", "Status"]}>
              {(data.nightAttendance ?? []).map((n) => (
                <tr key={n.id}>
                  <td>{new Date(n.date).toLocaleDateString()}</td>
                  <td><Badge tone={n.status === "PRESENT" ? "success" : "danger"}>{n.status}</Badge></td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Hostel management"
        subtitle="Hostels, rooms, beds and boarding students."
        actions={<div style={{ display: "flex", gap: 8 }}><Button variant="outline" onClick={() => { setIncidentOpen(true); setIncidentForm({}); }}>Log incident</Button><Button onClick={() => openModal("hostel")}><Icon name="plus" size={16} /> New hostel</Button></div>}
      />
      {(data.hostels ?? []).length === 0 ? (
        <EmptyState title="No hostels yet" />
      ) : (
        (data.hostels ?? []).map((h) => (
          <Card key={h.id} title={`${h.name} (${h.gender.toLowerCase()})`} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <Badge tone="neutral">{h.capacity ?? "—"} beds</Badge>
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" variant="outline" onClick={() => openModal("room", { id: undefined, form: emptyForm(), hostelId: h.id })}>Add room</Button>
                <Button size="sm" variant="outline" onClick={() => openModal("hostel", { id: h.id, form: { name: h.name, gender: h.gender, capacity: h.capacity != null ? String(h.capacity) : "" }, hostelId: "" })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove("hostel", h.id, `hostel "${h.name}"`)}>Delete</Button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
              {h.rooms.map((r) => (
                <div key={r.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <strong>{roomName(r)}</strong>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="duga-btn duga-btn--sm duga-btn--ghost"
                        style={{ fontSize: 11, padding: "0 4px" }}
                        onClick={() => openModal("room", { id: r.id, form: { roomNumber: r.roomNumber ?? r.name ?? "", capacity: r.capacity != null ? String(r.capacity) : "" }, hostelId: h.id })}
                      >
                        Edit
                      </button>
                      <button
                        className="duga-btn duga-btn--sm duga-btn--ghost"
                        style={{ fontSize: 11, padding: "0 4px" }}
                        onClick={() => remove("room", r.id, `room ${roomName(r)}`)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 4 }}>
                    {r.beds.map((b) => (
                      <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                        <span>Bed {b.bedNumber}</span>
                        <Badge tone={(b.allocations ?? []).length ? "success" : "neutral"}>
                          {(b.allocations ?? []).length ? "occupied" : "free"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {(h.allocations ?? []).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Table headers={["Student", "Room", "Bed", "Actions"]}>
                  {h.allocations.map((a) => (
                    <tr key={a.id}>
                      <td>{a.student.user.firstName} {a.student.user.lastName}</td>
                      <td>{a.room.name}</td>
                      <td>{a.bed.bedNumber}</td>
                      <td><Button size="sm" variant="ghost" onClick={() => release(a)}>Release</Button></td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        ))
      )}
      <Card title="Boarding students">
        {(data.boardingStudents ?? []).length === 0 ? (
          <EmptyState title="No boarding students" />
        ) : (
          <Table headers={["Name", "Allocated"]}>
            {(data.boardingStudents ?? []).map((s) => (
              <tr key={s.id}>
                <td>{s.user.firstName} {s.user.lastName}</td>
                <td>{s.hostelAllocations?.length ? "Yes" : "No"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {(data.incidents ?? []).length > 0 && (
        <Card title="Incident reports" style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <Button variant="outline" size="sm" onClick={() => { setIncidentOpen(true); setIncidentForm({}); }}>Log incident</Button>
          </div>
          <Table headers={["Title", "Severity", "Status", "Date", "Actions"]}>
            {(data.incidents ?? []).map((i) => (
              <tr key={i.id}>
                <td>{i.title}</td>
                <td>{i.severity ?? "LOW"}</td>
                <td><Badge tone={i.status === "RESOLVED" ? "success" : "warning"}>{i.status}</Badge></td>
                <td>{new Date(i.date).toLocaleDateString()}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {i.status !== "RESOLVED" && (
                      <Button size="sm" variant="outline" onClick={() => { setResolveIncident(i); setResolveForm({}); }}>Resolve</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove("incident", i.id, `incident "${i.title}"`)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={!!modal} onClose={() => { setModal(""); setEditId(null); setForm(emptyForm()); }} title={`${editId ? "Edit" : "New"} ${modal}`}>
        {modal === "room" && (
          <Field label="Hostel" required>
            <Select value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              {(data.hostels ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
        )}
        {modal === "hostel" && (
          <>
            <Field label="Name" required>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Boys Hostel A" />
            </Field>
            <div className="duga-form-grid">
              <Field label="Gender">
                <Select value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </Select>
              </Field>
              <Field label="Capacity">
                <Input type="number" value={form.capacity ?? ""} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              </Field>
            </div>
          </>
        )}
        {modal === "room" && (
          <>
            <Field label="Room number" required>
              <Input value={form.roomNumber ?? ""} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} placeholder="e.g. Room 101" />
            </Field>
            <Field label="Capacity">
              <Input type="number" value={form.capacity ?? "1"} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </Field>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setModal(""); setEditId(null); setForm(emptyForm()); }}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editId ? "Save changes" : "Create"}</Button>
        </div>
      </Modal>

      <Modal open={incidentOpen} onClose={() => setIncidentOpen(false)} title="Log hostel incident">
        <div className="duga-form-grid">
          <Field label="Hostel" required>
            <Select value={incidentForm.hostelId ?? ""} onChange={(e) => setIncidentForm({ ...incidentForm, hostelId: e.target.value })}>
              <option value="">Select hostel…</option>
              {(data.hostels ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          <Field label="Severity">
            <Select value={incidentForm.severity ?? "LOW"} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
          </Field>
        </div>
        <Field label="Student (optional)">
          <Select value={incidentForm.studentId ?? ""} onChange={(e) => setIncidentForm({ ...incidentForm, studentId: e.target.value })}>
            <option value="">—</option>
            {(data.boardingStudents ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.user.firstName} {s.user.lastName}</option>
            ))}
          </Select>
        </Field>
        <Field label="Title" required>
          <Input value={incidentForm.title ?? ""} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })} placeholder="e.g. Damaged property" />
        </Field>
        <Field label="Description">
          <Textarea rows={3} value={incidentForm.description ?? ""} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setIncidentOpen(false)}>Cancel</Button>
          <Button onClick={logIncident} loading={saving}>Log incident</Button>
        </div>
      </Modal>

      <Modal open={!!resolveIncident} onClose={() => setResolveIncident(null)} title={resolveIncident ? `Resolve — ${resolveIncident.title}` : "Resolve incident"}>
        <Field label="Action taken" hint="Record what was done to resolve this incident.">
          <Textarea rows={3} value={resolveForm.actionTaken ?? ""} onChange={(e) => setResolveForm({ ...resolveForm, actionTaken: e.target.value })} />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setResolveIncident(null)}>Cancel</Button>
          <Button onClick={saveResolve} loading={saving}>Mark resolved</Button>
        </div>
      </Modal>
    </div>
  );
}