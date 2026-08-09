"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Icon, Modal, Field, Input } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Bed {
  id: string;
  bedNumber: string;
  allocations?: Array<{ id: string; student: { user: { firstName: string; lastName: string } } }>;
}

interface Room {
  id: string;
  name: string;
  beds: Bed[];
}

interface Hostel {
  id: string;
  name: string;
  gender: string;
  rooms: Room[];
  allocations: Array<{ id: string; student: { user: { firstName: string; lastName: string } }; room: { name: string }; bed: { bedNumber: string } }>;
  nightAttendance: Array<{ id: string; date: string; status: string; remark: string | null }>;
}

interface HostelData {
  role: string;
  hostels?: Hostel[];
  allocations?: Array<{ id: string; hostel: { name: string }; room: { name: string }; bed: { bedNumber: string } }>;
  nightAttendance?: Array<{ id: string; date: string; status: string }>;
  boardingStudents?: Array<{ id: string; user: { firstName: string; lastName: string }; hostelAllocations?: Array<{ id: string }> }>;
  incidents?: Array<{ id: string; title: string; status: string; date: string }>;
}

export default function HostelPage() {
  const [data, setData] = useState<HostelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    api<HostelData>("hostel")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function addHostel() {
    try {
      await api("hostel/addHostel", { method: "POST", body: form });
      setOpen(false);
      const d = await api<HostelData>("hostel");
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
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New hostel</Button>}
      />
      {(data.hostels ?? []).length === 0 ? (
        <EmptyState title="No hostels yet" />
      ) : (
        (data.hostels ?? []).map((h) => (
          <Card key={h.id} title={`${h.name} (${h.gender.toLowerCase()})`} style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
              {h.rooms.map((r) => (
                <div key={r.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: 12 }}>
                  <strong>{r.name}</strong>
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
                <Table headers={["Student", "Room", "Bed"]}>
                  {h.allocations.map((a) => (
                    <tr key={a.id}>
                      <td>{a.student.user.firstName} {a.student.user.lastName}</td>
                      <td>{a.room.name}</td>
                      <td>{a.bed.bedNumber}</td>
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

      <Modal open={open} onClose={() => setOpen(false)} title="New hostel">
        <Field label="Name" required>
          <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Boys Hostel A" />
        </Field>
        <Field label="Gender">
          <Input value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="MALE / FEMALE" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={addHostel}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}
