"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Badge, Table, Alert, Spinner, EmptyState, Button, Icon, Modal, Field, Input, Textarea } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Executive {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  isActive: boolean;
  order: number;
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  venue: string | null;
  agenda: string | null;
  minutes: string | null;
  recordedBy: { firstName: string; lastName: string } | null;
}

interface Contribution {
  id: string;
  memberName: string;
  amount: string | number;
  method: string;
  date: string;
  note: string | null;
}

interface PtaData {
  role: string;
  executives: Executive[];
  meetings: Meeting[];
  contributions: Contribution[];
  totalContribution: number;
}

function naira(v: string | number | undefined): string {
  return `₦${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

type ModalKind = "executive" | "meeting" | "contribution";

export default function PtaPage() {
  const [data, setData] = useState<PtaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ModalKind>("executive");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const d = await api<PtaData>("pta");
    setData(d);
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const isStaff = data?.role === "ADMIN" || data?.role === "OWNER";

  function openModal(kind: ModalKind) {
    setKind(kind);
    setEditId(null);
    setForm({});
    setOpen(true);
  }

  function openEdit(kind: ModalKind, id: string) {
    const item = kind === "executive" ? data?.executives.find((e) => e.id === id) : kind === "meeting" ? data?.meetings.find((m) => m.id === id) : data?.contributions.find((c) => c.id === id);
    if (!item) return;
    setKind(kind);
    setEditId(id);
    if (kind === "executive") {
      const e = item as Executive;
      setForm({ name: e.name, role: e.role, phone: e.phone ?? "", email: e.email ?? "" });
    } else if (kind === "meeting") {
      const m = item as Meeting;
      setForm({ title: m.title, date: m.date ? new Date(m.date).toISOString().slice(0, 10) : "", venue: m.venue ?? "", agenda: m.agenda ?? "" });
    } else {
      const c = item as Contribution;
      setForm({ memberName: c.memberName, amount: String(c.amount), method: c.method, date: c.date ? new Date(c.date).toISOString().slice(0, 10) : "" });
    }
    setOpen(true);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      let path: string;
      if (editId) {
        path =
          kind === "executive"
            ? `pta/${editId}/updateExecutive`
            : kind === "meeting"
              ? `pta/${editId}/updateMeeting`
              : ""; // contributions have no update endpoint
        if (!path) throw new Error("Contributions cannot be edited — remove and re-add instead.");
      } else {
        path =
          kind === "executive"
            ? "pta/addExecutive"
            : kind === "meeting"
              ? "pta/addMeeting"
              : "pta/addContribution";
      }
      await api(path, { method: "POST", body: form });
      setOpen(false);
      setEditId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind: ModalKind, id: string) {
    if (!confirm("Delete this record?")) return;
    try {
      const path =
        kind === "executive"
          ? `pta/${id}/deleteExecutive`
          : kind === "meeting"
            ? `pta/${id}/deleteMeeting`
            : `pta/${id}/deleteContribution`;
      await api(path, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  const modalTitle =
    editId
      ? (kind === "executive" ? "Edit executive" : kind === "meeting" ? "Edit meeting" : "Add contribution")
      : (kind === "executive" ? "Add executive" : kind === "meeting" ? "Add meeting" : "Add contribution");

  return (
    <div>
      <PageHeader
        title="Parent-Teacher Association"
        subtitle="Executives, meetings and contributions."
        actions={
          isStaff ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" onClick={() => openModal("meeting")}><Icon name="plus" size={16} /> Meeting</Button>
              <Button variant="outline" onClick={() => openModal("contribution")}><Icon name="plus" size={16} /> Contribution</Button>
              <Button onClick={() => openModal("executive")}><Icon name="plus" size={16} /> Executive</Button>
            </div>
          ) : undefined
        }
      />

      <Card title="PTA executives">
        {(data.executives ?? []).length === 0 ? (
          <EmptyState title="No executives yet" hint="Add the PTA leadership to display them to parents." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {(data.executives ?? []).map((e) => (
              <div key={e.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>{e.name}</strong>
                  <Badge tone={e.isActive ? "success" : "neutral"}>{e.role}</Badge>
                </div>
                {e.phone && <div style={{ fontSize: 13, color: "var(--duga-muted)", marginTop: 6 }}>{e.phone}</div>}
                {e.email && <div style={{ fontSize: 13, color: "var(--duga-muted)" }}>{e.email}</div>}
                {isStaff && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <Button variant="ghost" size="sm" onClick={() => openEdit("executive", e.id)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove("executive", e.id)}>Remove</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Meetings" style={{ marginTop: 16 }}>
        {(data.meetings ?? []).length === 0 ? (
          <EmptyState title="No meetings recorded" />
        ) : (
          <Table headers={["Date", "Title", "Venue", "Agenda", isStaff ? "" : null].filter(Boolean) as React.ReactNode[]}>
            {(data.meetings ?? []).map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.date).toLocaleDateString()}</td>
                <td>{m.title}</td>
                <td>{m.venue ?? "—"}</td>
                <td style={{ maxWidth: 320, whiteSpace: "normal" }}>{m.agenda ?? "—"}</td>
                {isStaff && (
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button variant="ghost" size="sm" onClick={() => openEdit("meeting", m.id)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => remove("meeting", m.id)}>Remove</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {isStaff && (
        <Card title="Contributions" style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <Badge tone="accent">Total collected: {naira(data.totalContribution)}</Badge>
          </div>
          {(data.contributions ?? []).length === 0 ? (
            <EmptyState title="No contributions recorded" />
          ) : (
            <Table headers={["Date", "Member", "Method", "Amount", ""]}>
              {(data.contributions ?? []).map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.date).toLocaleDateString()}</td>
                  <td>{c.memberName}</td>
                  <td>{c.method}</td>
                  <td>{naira(c.amount)}</td>
                  <td>
                    <Button variant="ghost" size="sm" onClick={() => remove("contribution", c.id)}>Remove</Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Modal open={open} onClose={() => { setOpen(false); setEditId(null); }} title={modalTitle}>
        {kind === "executive" && (
          <>
            <Field label="Full name" required>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Role" required>
              <Input value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Chairman" />
            </Field>
            <Field label="Phone">
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </>
        )}
        {kind === "meeting" && (
          <>
            <Field label="Title" required>
              <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. First term PTA meeting" />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Venue">
              <Input value={form.venue ?? ""} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. School hall" />
            </Field>
            <Field label="Agenda">
              <Textarea rows={3} value={form.agenda ?? ""} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
            </Field>
          </>
        )}
        {kind === "contribution" && (
          <>
            <Field label="Member name" required>
              <Input value={form.memberName ?? ""} onChange={(e) => setForm({ ...form, memberName: e.target.value })} />
            </Field>
            <Field label="Amount (₦)" required>
              <Input type="number" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Method">
              <Input value={form.method ?? ""} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="CASH / TRANSFER" />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setOpen(false); setEditId(null); }}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editId ? "Save changes" : "Save"}</Button>
        </div>
      </Modal>
    </div>
  );
}
