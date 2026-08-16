"use client";

import { useEffect, useState } from "react";
import { Card, Badge, Table, PageHeader, Button, Modal, Field, Input, Select, EmptyState, Alert, Spinner, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface StaffUser {
  id: string;
  role: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  firstName: string;
  lastName: string;
  teacher?: { staffNumber: string; specialty: string | null; subjectIds?: string[] | null; sections?: string[] | null; designation: string | null } | null;
  admin?: { designation: string | null; sections?: string[] | null; staffNumber?: string | null } | null;
}
interface Subject { id: string; name: string; section: string }

export default function StaffPage() {
  const [items, setItems] = useState<StaffUser[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
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
  // Change-role modal (owner only)
  const [roleTarget, setRoleTarget] = useState<StaffUser | null>(null);
  const [roleValue, setRoleValue] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const canManage = (user: StaffUser) => currentRole === "OWNER" || !["OWNER", "ADMIN", "BURSAR"].includes(user.role);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ items: StaffUser[]; subjects: Subject[]; sections?: string[]; role: string }>("staff");
      setItems(data.items);
      setSubjects(data.subjects ?? []);
      setSections(data.sections?.length ? data.sections : ["PRIMARY", "SECONDARY"]);
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
        await api(`staff/${editing.id}`, { method: "PATCH", body: { ...form, subjectIds: selectedSubjectIds, sections: selectedSections } });
        setNotice("Staff member updated.");
      } else {
        await api("staff", { method: "POST", body: { ...form, subjectIds: selectedSubjectIds, sections: selectedSections } });
        setNotice(form.tempPassword
          ? `Staff member added. Temporary password: ${form.tempPassword} — they will be asked to change it on first login.`
          : "Staff member added. They will be asked to set their own password on first login.");
      }
      setOpen(false);
      setEditing(null);
      setForm({});
      setSelectedSubjectIds([]);
      setSelectedSections([]);
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
      role: u.role,
      staffNumber: u.teacher?.staffNumber ?? u.admin?.staffNumber ?? "",
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email ?? "",
      status: u.status,
      phone: u.phone ?? "",
      specialty: u.teacher?.specialty ?? "",
      designation: u.teacher?.designation ?? u.admin?.designation ?? "",
    });
    setSelectedSubjectIds(u.teacher?.subjectIds ?? []);
    setSelectedSections(u.teacher?.sections ?? u.admin?.sections ?? []);
    setError(null);
    setOpen(true);
  }

  async function removeStaff(u: StaffUser) {
    if (!confirm(`Remove ${u.firstName} ${u.lastName}? Their account will be deactivated and they will no longer be able to sign in.`)) return;
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

  function openRole(u: StaffUser) {
    setRoleTarget(u);
    setRoleValue(u.role);
    setRoleError(null);
  }

  async function saveRole() {
    if (!roleTarget) return;
    if (!roleValue || roleValue === roleTarget.role) { setRoleTarget(null); return; }
    setRoleError(null);
    setRoleSaving(true);
    try {
      await api(`staff/${roleTarget.id}`, { method: "PATCH", body: { role: roleValue } });
      setNotice(`${roleTarget.firstName} ${roleTarget.lastName}'s role is now ${roleValue.toLowerCase()}.`);
      setRoleTarget(null);
      load();
    } catch (e) {
      setRoleError((e as Error).message);
    } finally {
      setRoleSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Teachers, administrators, bursars and the proprietor."
        actions={<Button onClick={() => { setEditing(null); setForm({}); setSelectedSubjectIds([]); setSelectedSections([]); setOpen(true); }}><Icon name="plus" size={16} /> Add staff</Button>}
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
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--duga-border)" }} />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, var(--duga-primary), var(--duga-gold))", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                        {`${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase()}
                      </div>
                    )}
                    <span>{u.firstName} {u.lastName}</span>
                  </div>
                </td>
                <td><Badge tone={u.role === "OWNER" ? "accent" : u.role === "ADMIN" ? "info" : "neutral"}>{u.role.toLowerCase()}</Badge></td>
                <td>{u.teacher?.designation ?? u.admin?.designation ?? "—"}</td>
                <td>{u.email || "—"}</td>
                <td>{u.teacher?.staffNumber ?? u.admin?.staffNumber ?? "—"}</td>
                <td><Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{u.status}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {currentRole === "OWNER" && u.role !== "OWNER" && (
                      <Button size="sm" variant="accent" onClick={() => openRole(u)}>Change role</Button>
                    )}
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
              {editing.role !== "OWNER" && (
                <Field label="Role" required>
                  <Select value={form.role ?? editing.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="TEACHER">Teacher</option>
                    {currentRole === "OWNER" && <option value="ADMIN">Admin</option>}
                    {currentRole === "OWNER" && <option value="BURSAR">Bursar</option>}
                  </Select>
                </Field>
              )}
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
                <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Leave empty if they use phone or staff ID" />
              </Field>
              <Field label="Status">
                <Select value={form.status ?? "ACTIVE"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {(["ACTIVE", "SUSPENDED", "DEACTIVATED"] as const).map((status) => (
                    <option key={status} value={status}>{status[0] + status.slice(1).toLowerCase()}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Phone">
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Staff number">
                <Input value={form.staffNumber ?? ""} onChange={(e) => setForm({ ...form, staffNumber: e.target.value })} placeholder="Auto if empty" />
              </Field>
            </>
          )}
          <Field label="Specialty">
            <Input value={form.specialty ?? ""} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
          </Field>
          {((form.role === "TEACHER" || editing?.role === "TEACHER") || (currentRole === "OWNER" && [form.role, editing?.role].some((role) => role === "ADMIN" || role === "BURSAR"))) && (
            <div className="staff-subject-picker">
              <div className="staff-subject-picker__heading">
                <span>School sections</span>
                <small>{form.role === "TEACHER" || editing?.role === "TEACHER" ? "Choose where this teacher is allowed to teach." : "Choose the sections this staff account can access. Leave both unassigned for full-school access."}</small>
              </div>
              <div className="staff-subject-picker__grid staff-section-picker">
                {sections.map((schoolSection) => {
                  const selected = selectedSections.includes(schoolSection);
                  return (
                    <button key={schoolSection} type="button" className={`staff-subject-picker__option${selected ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedSections((current) => selected ? current.filter((item) => item !== schoolSection) : [...current, schoolSection]);
                        if (selected && (form.role === "TEACHER" || editing?.role === "TEACHER")) setSelectedSubjectIds((ids) => ids.filter((id) => subjects.find((subject) => subject.id === id)?.section !== schoolSection));
                      }} aria-pressed={selected}>
                      <span>{schoolSection[0] + schoolSection.slice(1).toLowerCase()}</span>
                      <Badge tone="neutral">{selected ? "Assigned" : "Not assigned"}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {(form.role === "TEACHER" || editing?.role === "TEACHER") && (
            <div className="staff-subject-picker">
              <div className="staff-subject-picker__heading">
                <span>Teaching subjects</span>
                <small>Select one or more subjects for this teacher.</small>
              </div>
              {subjects.length === 0 ? <Alert tone="warning">Add subjects in Classes first.</Alert> : (
                <div className="staff-subject-picker__grid">
                  {subjects.filter((subject) => selectedSections.includes(subject.section)).map((subject) => {
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

      <Modal open={!!roleTarget} onClose={() => setRoleTarget(null)} title={roleTarget ? `Change role — ${roleTarget.firstName} ${roleTarget.lastName}` : ""}>
        <Alert tone="info">
          The role controls what this staff member can do: teachers manage classes and learning, admins run the school,
          and bursars are limited to fees and finance. Their sections and subjects are managed in Edit.
        </Alert>
        <div style={{ marginTop: 14 }}>
          <Field label="New role" required>
            <Select value={roleValue} onChange={(e) => setRoleValue(e.target.value)}>
              <option value="TEACHER">Teacher</option>
              <option value="ADMIN">Admin</option>
              <option value="BURSAR">Bursar</option>
            </Select>
          </Field>
          {roleError && <Alert tone="danger">{roleError}</Alert>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setRoleTarget(null)}>Cancel</Button>
          <Button onClick={saveRole} loading={roleSaving} disabled={!roleValue || roleValue === roleTarget?.role}>Save role</Button>
        </div>
      </Modal>
    </div>
  );
}
