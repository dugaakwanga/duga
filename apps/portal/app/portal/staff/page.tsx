"use client";

import { useEffect, useState } from "react";
import { Card, Badge, Table, PageHeader, Button, Modal, Field, Input, Select, EmptyState, Alert, Spinner, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface StaffUser {
  id: string;
  role: string;
  email: string;
  phone: string | null;
  status: string;
  firstName: string;
  lastName: string;
  teacher?: { staffNumber: string; specialty: string | null; designation: string | null } | null;
  admin?: { designation: string | null } | null;
}

export default function StaffPage() {
  const [items, setItems] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ items: StaffUser[] }>("staff");
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api("staff", { method: "POST", body: form });
      setOpen(false);
      setForm({});
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Teachers, administrators and the proprietor."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> Add staff</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No staff" />
      ) : (
        <Card>
          <Table headers={["Name", "Role", "Email", "Staff no.", "Status"]}>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.firstName} {u.lastName}</td>
                <td><Badge tone={u.role === "OWNER" ? "accent" : u.role === "ADMIN" ? "info" : "neutral"}>{u.role.toLowerCase()}</Badge></td>
                <td>{u.email}</td>
                <td>{u.teacher?.staffNumber ?? u.admin?.designation ?? "—"}</td>
                <td><Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{u.status}</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add staff member">
        <Alert tone="info" >Any one of email, phone or staff number works. The staff member signs in with that identifier and sets their own password on first login.</Alert>
        <div className="duga-form-grid" style={{ marginTop: 14 }}>
          <Field label="Role" required>
            <Select value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="">Select…</option>
              <option value="TEACHER">Teacher</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
          <Field label="Designation">
            <Input value={form.designation ?? ""} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Teacher" />
          </Field>
          <Field label="First name" required>
            <Input value={form.firstName ?? ""} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Last name" required>
            <Input value={form.lastName ?? ""} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Staff number">
            <Input value={form.staffNumber ?? ""} onChange={(e) => setForm({ ...form, staffNumber: e.target.value })} placeholder="Auto if empty" />
          </Field>
          <Field label="Specialty">
            <Input value={form.specialty ?? ""} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} loading={saving}>Add staff</Button>
        </div>
      </Modal>
    </div>
  );
}
