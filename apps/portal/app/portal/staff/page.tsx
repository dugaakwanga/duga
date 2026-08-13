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
  teacher?: { staffNumber: string; specialty: string | null; subjectIds?: string[] | null; designation: string | null } | null;
  admin?: { designation: string | null } | null;
}
interface Subject { id: string; name: string; section: string }

export default function StaffPage() {
  const [items, setItems] = useState<StaffUser[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffUser | null>(null);

  // Reset-password modal
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);
  const canManage = (user: StaffUser) => currentRole === "OWNER" || !["OWNER", "ADMIN", "BURSAR"].includes(user.role);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ items: StaffUser[]; subjects: Subject[]; role: string }>("staff");
      setItems(data.items);
      setSubjects(data.subjects ?? []);
      setCurrentRole(data.role);
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
      if (editing) {
        await api(`staff/${editing.id}`, { method: "PATCH", body: { ...form, subjectIds: selectedSubjectIds } });
        setNotice("Staff member updated.");
      } else {
        await api("staff", { method: "POST", body: { ...form, subjectIds: selectedSubjectIds } });
        setNotice(form.tempPassword
          ? `Staff member added. Temporary password: ${form.tempPassword} — they will be asked to change it on first login.`
          : "Staff member added. They will be asked to set their own password on first login.");
      }
      setOpen(false);
      setEditing(null);
      setForm({});
      setSelectedSubjectIds([]);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(u: StaffUser) {
    setEditing(u);
    setForm({
      status: u.status,
      phone: u.phone ?? "",
      specialty: u.teacher?.specialty ?? "",
      designation: u.teacher?.designation ?? u.admin?.designation ?? "",
    });
    setSelectedSubjectIds(u.teacher?.subjectIds ?? []);
    setError(null);
    setOpen(true);
  }

  async function removeStaff(u: StaffUser) {
    if (!confirm(`Remove ${u.firstName} ${u.lastName}? Their account will be suspended.`)) return;
    try {
      await api(`staff/${u.id}`, { method: "DELETE" });
      setNotice(`${u.firstName} ${u.lastName} has been removed.`);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function submitTempPassword() {
    if (!resetTarget) return;
    setResetError(null);
    if (tempPassword.length < 8) {
      setResetError("Temporary password must be at least 8 characters");
      return;
    }
    setResetSaving(true);
    try {
      await api(`staff/${resetTarget.id}/setTempPassword`, { method: "POST", body: { tempPassword } });
      setResetTarget(null);
      setTempPassword("");
      setNotice(`${resetTarget.firstName} ${resetTarget.lastName} can now sign in with the temporary password and will be asked to change it on first login.`);
    } catch (e) {
      setResetError((e as Error).message);
    } finally {
      setResetSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Teachers, administrators, bursars and the proprietor."
        actions={<Button onClick={() => { setEditing(null); setForm({}); setSelectedSubjectIds([]); setOpen(true); }}><Icon name="plus" size={16} /> Add staff</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No staff" />
      ) : (
        <Card>
          <Table headers={["Name", "Role", "Designation", "Email", "Staff no.", "Status", ""]}>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.firstName} {u.lastName}</td>
                <td><Badge tone={u.role === "OWNER" ? "accent" : u.role === "ADMIN" ? "info" : "neutral"}>{u.role.toLowerCase()}</Badge></td>
                <td>{u.teacher?.designation ?? u.admin?.designation ?? "—"}</td>
                <td>{u.email}</td>
                <td>{u.teacher?.staffNumber ?? u.admin?.designation ?? "—"}</td>
                <td><Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{u.status}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {canManage(u) && (
                      <Button size="sm" variant="ghost" onClick={() => { setResetTarget(u); setTempPassword(""); setResetError(null); }}>
                        Set password
                      </Button>
                    )}
                    {canManage(u) && <Button size="sm" variant="outline" onClick={() => openEdit(u)}>Edit</Button>}
                    {canManage(u) && u.role !== "OWNER" && (
                      <Button size="sm" variant="ghost" onClick={() => removeStaff(u)}>Remove</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? `Edit staff — ${editing.firstName} ${editing.lastName}` : "Add staff member"}>
        {!editing && <Alert tone="info" >Any one of email, phone or staff number works. The staff member signs in with that identifier and sets their own password on first login.</Alert>}
        <div className="duga-form-grid" style={{ marginTop: 14 }}>
          {!editing ? (
            <>
              <Field label="Role" required>
                <Select value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="">Select…</option>
                  <option value="TEACHER">Teacher</option>
                  {currentRole === "OWNER" && <option value="ADMIN">Admin</option>}
                  {currentRole === "OWNER" && <option value="BURSAR">Bursar</option>}
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
            </>
          ) : (
            <>
              <Field label="Status">
                <Select value={form.status ?? "ACTIVE"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              </Field>
              <Field label="Phone">
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Specialty">
            <Input value={form.specialty ?? ""} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
          </Field>
          {(form.role === "TEACHER" || editing?.role === "TEACHER") && (
            <div className="staff-subject-picker">
              <div className="staff-subject-picker__heading">
                <span>Teaching subjects</span>
                <small>Select one or more subjects for this teacher.</small>
              </div>
              {subjects.length === 0 ? <Alert tone="warning">Add subjects in Classes first.</Alert> : (
                <div className="staff-subject-picker__grid">
                  {subjects.map((subject) => {
                    const selected = selectedSubjectIds.includes(subject.id);
                    return (
                      <button
                        key={subject.id}
                        type="button"
                        className={`staff-subject-picker__option${selected ? " is-selected" : ""}`}
                        onClick={() => setSelectedSubjectIds((ids) => selected ? ids.filter((id) => id !== subject.id) : [...ids, subject.id])}
                        aria-pressed={selected}
                      >
                        <span>{subject.name}</span><Badge tone={subject.section === "PRIMARY" ? "info" : "accent"}>{subject.section.toLowerCase()}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {!editing && (
          <Field label="Temporary password" hint="Optional — leave empty to let them set their own password on first login.">
            <Input value={form.tempPassword ?? ""} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} placeholder="At least 8 characters" />
          </Field>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
          <Button onClick={save} loading={saving}>{editing ? "Save changes" : "Add staff"}</Button>
        </div>
      </Modal>

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={resetTarget ? `Set temporary password — ${resetTarget.firstName} ${resetTarget.lastName}` : ""}>
        <Alert tone="info">
          The staff member will sign in with this temporary password using their email, phone or staff ID, and will be asked to change it on first login.
        </Alert>
        <div style={{ marginTop: 14 }}>
          <Field label="Temporary password" required hint="At least 8 characters">
            <Input type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="e.g. Welcome2026!" autoComplete="off" />
          </Field>
          {resetError && <Alert tone="danger">{resetError}</Alert>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setResetTarget(null)}>Cancel</Button>
          <Button onClick={submitTempPassword} loading={resetSaving}>Set temporary password</Button>
        </div>
      </Modal>
    </div>
  );
}
