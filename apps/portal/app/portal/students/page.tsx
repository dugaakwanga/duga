"use client";

import { useEffect, useState } from "react";
import { Card, Badge, Table, PageHeader, Button, Modal, Field, Input, Select, EmptyState, Alert, Spinner, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Student {
  id: string;
  admissionNumber: string;
  status: string;
  isBoarding: boolean;
  user: { firstName: string; lastName: string; email: string; phone: string | null; status: string };
  classGroup: { level: { name: string }; name: string } | null;
}

export default function StudentsPage() {
  const [items, setItems] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: Student[] }>("students", { query: { search: search || undefined } });
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api("students", { method: "POST", body: form });
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
        title="Students"
        subtitle="Enroll, search and manage students."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Icon name="plus" size={16} /> Enroll student
          </Button>
        }
      />

      <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
        <Input placeholder="Search by name or admission number…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="outline" onClick={load}>Search</Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No students found" hint="Enroll a new student to get started." />
      ) : (
        <Card>
          <Table headers={["Adm No.", "Name", "Class", "Section", "Status", "Boarding"]}>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{s.admissionNumber}</td>
                <td>
                  {s.user.firstName} {s.user.lastName}
                  <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{s.user.email}</div>
                </td>
                <td>{s.classGroup ? `${s.classGroup.level.name} ${s.classGroup.name}` : "—"}</td>
                <td>{s.classGroup ? s.classGroup.level.name.split(" ")[0] : "—"}</td>
                <td><Badge tone={s.status === "ACTIVE" ? "success" : "warning"}>{s.status}</Badge></td>
                <td>{s.isBoarding ? "Yes" : "No"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Enroll new student" wide>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="First name" required>
            <Input value={form.firstName ?? ""} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" />
          </Field>
          <Field label="Last name" required>
            <Input value={form.lastName ?? ""} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" />
          </Field>
          <Field label="Email">
            <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="student@school.com" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0803 000 0000" />
          </Field>
          <Field label="Admission number">
            <Input value={form.admissionNumber ?? ""} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} placeholder="Auto if empty" />
          </Field>
          <Field label="Gender">
            <Select value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select…</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </Select>
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
          </Field>
          <Field label="Class group">
            <Input value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })} placeholder="Class group ID" />
          </Field>
          <Field label="Parent email">
            <Input value={form.parentEmail ?? ""} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} placeholder="parent@email.com" />
          </Field>
          <Field label="Parent name">
            <Input value={form.parentName ?? ""} onChange={(e) => setForm({ ...form, parentName: e.target.value })} placeholder="Parent name" />
          </Field>
          <Field label="Temp password">
            <Input value={form.tempPassword ?? ""} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} placeholder="default: password123" />
          </Field>
          <Field label="Boarding">
            <Select value={form.isBoarding ?? "false"} onChange={(e) => setForm({ ...form, isBoarding: e.target.value })}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </Select>
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} loading={saving}>Enroll</Button>
        </div>
      </Modal>
    </div>
  );
}
