"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Table, PageHeader, Button, Modal, Field, Input, Select, EmptyState, Alert, Spinner, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface FeeInfo {
  feeAmount: string;
  feeDays: number;
  feePaidThrough: string | null;
  usedDays: number;
  daysRemaining: number;
  expired: boolean;
}

interface Student {
  id: string;
  admissionNumber: string;
  status: string;
  isBoarding: boolean;
  gender: string | null;
  dateOfBirth: string | null;
  user: { firstName: string; lastName: string; email: string; phone: string | null; status: string };
  classGroup: { level: { name: string }; name: string } | null;
  fee?: FeeInfo;
}

interface ClassOption {
  id: string;
  name: string;
  level: { name: string; section: string };
  session: { name: string };
}

export default function StudentsPage() {
  const [items, setItems] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [feeTarget, setFeeTarget] = useState<Student | null>(null);
  const [feeForm, setFeeForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
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
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<ClassOption[]>("teacher/classes", { method: "POST" }).then(setClasses).catch(() => setClasses([]));
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

  async function saveEdit() {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api(`students/${editTarget.id}`, { method: "PATCH", body: editForm });
      setEditTarget(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveFee() {
    if (!feeTarget) return;
    setSaving(true);
    try {
      await api(`students/${feeTarget.id}/setFee`, { method: "POST", body: feeForm });
      setFeeTarget(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(s: Student) {
    setEditTarget(s);
    setEditForm({
      gender: s.gender ?? "",
      dateOfBirth: s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : "",
      isBoarding: s.isBoarding ? "true" : "false",
      status: s.status,
      currentClassGroupId: "",
    });
  }

  async function removeStudent(s: Student) {
    if (!confirm(`Remove "${s.user.firstName} ${s.user.lastName}"? This deactivates their account so they can no longer sign in.`)) return;
    setSaving(true);
    try {
      await api(`students/${s.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function feeBadge(s: Student) {
    if (!s.fee || (!s.fee.feeAmount || Number(s.fee.feeAmount) === 0)) return <Badge tone="neutral">No fee set</Badge>;
    if (s.fee.expired) return <Badge tone="danger">Expired</Badge>;
    return (
      <Badge tone={s.fee.daysRemaining <= 7 ? "warning" : "success"}>
        {s.fee.daysRemaining} day{s.fee.daysRemaining === 1 ? "" : "s"} left
      </Badge>
    );
  }

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Enroll, search and manage students and their fee access."
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
          <Table headers={["Adm No.", "Name", "Class", "Status", "Fee access", "Actions"]}>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{s.admissionNumber}</td>
                <td>
                  {s.user.firstName} {s.user.lastName}
                  <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{s.user.email}</div>
                </td>
                <td>{s.classGroup ? `${s.classGroup.level.name} ${s.classGroup.name}` : "—"}</td>
                <td><Badge tone={s.status === "ACTIVE" ? "success" : "warning"}>{s.status}</Badge></td>
                <td>{feeBadge(s)}</td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => { setFeeTarget(s); setFeeForm({}); }}>Set fee</Button>
                    <Button size="sm" variant="danger" onClick={() => removeStudent(s)}>Remove</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Enroll new student" wide>
        <div className="duga-form-grid">
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
          <Field label="Class" required>
            <Select value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}>
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.level.name} {c.name} ({c.session.name})</option>
              ))}
            </Select>
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
          <Field label="Admission number">
            <Input value={form.admissionNumber ?? ""} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} placeholder="Auto if empty" />
          </Field>
          <Field label="School fee amount (₦)">
            <Input type="number" value={form.feeAmount ?? ""} onChange={(e) => setForm({ ...form, feeAmount: e.target.value })} placeholder="e.g. 150000" />
          </Field>
          <Field label="Fee covers (days)" hint="Access runs for this many days from enrollment; the portal locks when it ends.">
            <Input type="number" value={form.feeDays ?? ""} onChange={(e) => setForm({ ...form, feeDays: e.target.value })} placeholder="e.g. 180" />
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
          <Field label="Parent email">
            <Input value={form.parentEmail ?? ""} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} placeholder="parent@email.com" />
          </Field>
          <Field label="Parent name">
            <Input value={form.parentName ?? ""} onChange={(e) => setForm({ ...form, parentName: e.target.value })} placeholder="Parent name" />
          </Field>
          <Field label="Parent phone">
            <Input value={form.parentPhone ?? ""} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} placeholder="0803 000 0000" />
          </Field>
        </div>
        {Number(form.feeDays) > 0 && (
          <div style={{ marginTop: 10 }}>
            <Alert tone="info">This sets the fee plan: {form.feeDays} days of access when the full amount is paid. Access begins after payment; part-payments grant proportional days.</Alert>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} loading={saving}>Enroll</Button>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={editTarget ? `Edit — ${editTarget.user.firstName} ${editTarget.user.lastName}` : ""}>
        <div className="duga-form-grid">
          <Field label="Gender">
            <Select value={editForm.gender ?? ""} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
              <option value="">Select…</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </Select>
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={editForm.dateOfBirth ?? ""} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} />
          </Field>
          <Field label="Boarding">
            <Select value={editForm.isBoarding ?? "false"} onChange={(e) => setEditForm({ ...editForm, isBoarding: e.target.value })}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={editForm.status ?? ""} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="WITHDRAWN">Withdrawn</option>
              <option value="GRADUATED">Graduated</option>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={editForm.currentClassGroupId ?? ""} onChange={(e) => setEditForm({ ...editForm, currentClassGroupId: e.target.value })}>
              <option value="">Leave unchanged</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.level.name} {c.name} ({c.session.name})</option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button onClick={saveEdit} loading={saving}>Save</Button>
        </div>
      </Modal>

      <Modal open={!!feeTarget} onClose={() => setFeeTarget(null)} title={feeTarget ? `Set fee — ${feeTarget.user.firstName} ${feeTarget.user.lastName}` : ""}>
        {feeTarget?.fee?.expired && (
          <div style={{ marginBottom: 12 }}>
            <Alert tone="danger">This child&apos;s fee access has expired. Renew it below to reopen their portal access.</Alert>
          </div>
        )}
        <div className="duga-form-grid">
          <Field label="School fee amount (₦)" required>
            <Input type="number" value={feeForm.feeAmount ?? (feeTarget?.fee?.feeAmount ?? "")} onChange={(e) => setFeeForm({ ...feeForm, feeAmount: e.target.value })} placeholder="e.g. 150000" />
          </Field>
          <Field label="Fee covers (days)" required hint="Days of access this payment covers, counted from now.">
            <Input type="number" value={feeForm.feeDays ?? (feeTarget?.fee?.feeDays ? String(feeTarget.fee.feeDays) : "")} onChange={(e) => setFeeForm({ ...feeForm, feeDays: e.target.value })} placeholder="e.g. 180" />
          </Field>
        </div>
        {Number(feeForm.feeDays) > 0 && (
          <div style={{ marginTop: 10 }}>
            <Alert tone="info">This updates the fee plan. Access begins only after payment, and a part-payment grants the matching proportion of days.</Alert>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setFeeTarget(null)}>Cancel</Button>
          <Button onClick={saveFee} loading={saving}>Save fee</Button>
        </div>
      </Modal>
    </div>
  );
}
