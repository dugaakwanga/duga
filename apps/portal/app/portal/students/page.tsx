"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Table, PageHeader, Button, Modal, Field, Input, Select, EmptyState, Alert, Spinner, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

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
  photoUrl: string | null;
  user: { firstName: string; lastName: string; email: string | null; phone: string | null; status: string };
  classGroup: { level: { name: string; section: string }; name: string } | null;
  parentLinks?: Array<{ parent: { user: { firstName: string; lastName: string; email: string; phone: string | null } } }>;
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
  const [uploading, setUploading] = useState(false);
  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [feeTarget, setFeeTarget] = useState<Student | null>(null);
  const [feeForm, setFeeForm] = useState<Record<string, string>>({});
  const [levels, setLevels] = useState<{ id: string; name: string; section: string }[]>([]);
  const [sessions, setSessions] = useState<{ id: string; name: string }[]>([]);
  const [newClassOpen, setNewClassOpen] = useState(false);
  const [newClass, setNewClass] = useState<Record<string, string>>({});
  const [creatingClass, setCreatingClass] = useState(false);
  // Drill-down navigation: overview -> (secondary | primary | unassigned) -> classes -> students.
  type View = { name: "overview" } | { name: "category"; section: "SECONDARY" | "PRIMARY" | "UNASSIGNED" };
  const [view, setView] = useState<View>({ name: "overview" });
  const secondaryStudents = items.filter((s) => s.classGroup?.level.section === "SECONDARY");
  const primaryStudents = items.filter((s) => s.classGroup?.level.section === "PRIMARY");
  const unassignedStudents = items.filter((s) => !s.classGroup);
  const sectionItems = view.name === "category"
    ? view.section === "SECONDARY" ? secondaryStudents : view.section === "PRIMARY" ? primaryStudents : unassignedStudents
    : [];
  const byClass = new Map<string, Student[]>();
  for (const s of sectionItems) {
    const key = s.classGroup ? `${s.classGroup.level.name} ${s.classGroup.name}` : "Unassigned";
    const arr = byClass.get(key) ?? [];
    arr.push(s);
    byClass.set(key, arr);
  }
  const classGroups = [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b));

  const { section } = useSection();
  const load = useCallback(async () => {
    void section;
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
  }, [search, section]);

  useEffect(() => {
    load();
  }, [load]);

  // When a global section is active, auto-open that section's group.
  useEffect(() => {
    if (!section) return;
    setView((v) => (v.name === "overview" ? { name: "category", section } : v));
  }, [section]);

  useEffect(() => {
    api<{ items: ClassOption[]; levels: { id: string; name: string; section: string }[]; sessions: { id: string; name: string }[] }>("classes")
      .then((d) => { setClasses(d.items); setLevels(d.levels ?? []); setSessions(d.sessions ?? []); })
      .catch(() => setClasses([]));
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

  async function createAndUseClass() {
    if (!newClass.levelId || !newClass.sessionId || !newClass.name?.trim()) return;
    setCreatingClass(true);
    try {
      const created = await api<{ id: string; levelId: string; sessionId: string; name: string }>("classes", {
        method: "POST",
        body: { levelId: newClass.levelId, sessionId: newClass.sessionId, name: newClass.name.trim() },
      });
      const lvl = levels.find((l) => l.id === created.levelId);
      const sess = sessions.find((s) => s.id === created.sessionId);
      const opt: ClassOption = {
        id: created.id,
        name: created.name,
        level: { name: lvl?.name ?? "?", section: lvl?.section ?? "SECONDARY" },
        session: { name: sess?.name ?? "?" },
      };
      setClasses((c) => [...c, opt]);
      setForm((f) => ({ ...f, classGroupId: created.id }));
      setNewClassOpen(false);
      setNewClass({});
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreatingClass(false);
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

  async function uploadPhoto(file: File | undefined) {
    if (!file || !editTarget) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=student-photo", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      setEditForm((f) => ({ ...f, photoUrl: json.data.url }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function openEdit(s: Student) {
    const parent = s.parentLinks?.[0]?.parent.user;
    setEditTarget(s);
    setEditForm({
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      email: s.user.email ?? "",
      phone: s.user.phone ?? "",
      admissionNumber: s.admissionNumber,
      gender: s.gender ?? "",
      dateOfBirth: s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : "",
      isBoarding: s.isBoarding ? "true" : "false",
      status: s.status,
      currentClassGroupId: "",
      photoUrl: s.photoUrl ?? "",
      parentEmail: parent?.email ?? "",
      parentName: parent ? `${parent.firstName} ${parent.lastName}`.trim() : "",
      parentPhone: parent?.phone ?? "",
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
      ) : view.name === "overview" ? (
        <div className="classes-drill">
          <button className="classes-drill-card" onClick={() => setView({ name: "category", section: "SECONDARY" })}>
            <div className="classes-drill-card__icon"><Icon name="students" size={20} /></div>
            <div className="classes-drill-card__title">Secondary</div>
            <div className="classes-drill-card__sub">JSS &amp; SSS students grouped by class</div>
            <div className="classes-drill-card__foot">
              <Badge tone="accent">{secondaryStudents.length}</Badge>
              <span className="classes-drill-card__manage">Open Secondary →</span>
            </div>
          </button>
          <button className="classes-drill-card classes-drill-card--primary" onClick={() => setView({ name: "category", section: "PRIMARY" })}>
            <div className="classes-drill-card__icon"><Icon name="students" size={20} /></div>
            <div className="classes-drill-card__title">Primary</div>
            <div className="classes-drill-card__sub">Primary school students grouped by class</div>
            <div className="classes-drill-card__foot">
              <Badge tone="info">{primaryStudents.length}</Badge>
              <span className="classes-drill-card__manage">Open Primary →</span>
            </div>
          </button>
          {unassignedStudents.length > 0 && (
            <button className="classes-drill-card" onClick={() => setView({ name: "category", section: "UNASSIGNED" })}>
              <div className="classes-drill-card__icon"><Icon name="students" size={20} /></div>
              <div className="classes-drill-card__title">Unassigned</div>
              <div className="classes-drill-card__sub">Students not yet placed in a class</div>
              <div className="classes-drill-card__foot">
                <Badge tone="neutral">{unassignedStudents.length}</Badge>
                <span className="classes-drill-card__manage">Review →</span>
              </div>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          <div className="classes-crumb">
            <Button variant="ghost" size="sm" onClick={() => setView({ name: "overview" })}>
              <Icon name="back" size={14} /> Students
            </Button>
            <span className="classes-crumb__sep">/</span>
            <span className="classes-crumb__current">
              {view.section === "SECONDARY" ? "Secondary" : view.section === "PRIMARY" ? "Primary" : "Unassigned"}
            </span>
          </div>

          <div>
            <h2 style={{ fontSize: 17, margin: "0 0 12px", color: "var(--duga-primary-ink)" }}>
              {view.section === "SECONDARY" ? "Secondary" : view.section === "PRIMARY" ? "Primary" : "Unassigned"} classes
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--duga-muted)", marginLeft: 6 }}>({sectionItems.length} students)</span>
            </h2>
            {classGroups.length === 0 ? (
              <EmptyState title={`No ${view.section === "UNASSIGNED" ? "unassigned" : view.section.toLowerCase()} classes yet`} hint="Enroll students into classes to see them grouped here." />
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {classGroups.map(([className, classStudents]) => (
                  <Card key={className} title={className} className="students-group-card">
                    <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge tone="neutral">{classStudents.length} student{classStudents.length === 1 ? "" : "s"}</Badge>
                    </div>
                    <Table headers={["Adm No.", "Name", "Status", "Fee access", "Actions"]}>
                      {classStudents.map((s) => (
                        <tr key={s.id}>
                          <td>{s.admissionNumber}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {s.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--duga-border)" }} />
                              ) : (
                                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, var(--duga-primary), var(--duga-gold))", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                                  {`${s.user.firstName[0] ?? ""}${s.user.lastName[0] ?? ""}`.toUpperCase()}
                                </div>
                              )}
                              <span>
                                {s.user.firstName} {s.user.lastName}
                                <div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{s.user.email || "—"}</div>
                              </span>
                            </div>
                          </td>
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
                ))}
              </div>
            )}
          </div>
        </div>
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
            <Select value={form.classGroupId ?? ""} onChange={(e) => { const v = e.target.value; if (v === "__new__") { setNewClassOpen(true); setForm({ ...form, classGroupId: "" }); } else { setNewClassOpen(false); setForm({ ...form, classGroupId: v }); } }}>
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.level.name} {c.name} ({c.session.name})</option>
              ))}
              <option value="__new__">＋ Add new class…</option>
            </Select>
          </Field>
          {newClassOpen && (
            <div style={{ gridColumn: "1 / -1", border: "1px solid var(--duga-border)", borderRadius: 12, padding: 14, background: "var(--duga-surface-2, #fafafa)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 12 }}>Create the class first</div>
              <div className="duga-form-grid">
                <Field label="Level" required>
                  <Select value={newClass.levelId ?? ""} onChange={(e) => setNewClass({ ...newClass, levelId: e.target.value })}>
                    <option value="">Select level…</option>
                    <optgroup label="Secondary">
                      {levels.filter((l) => l.section === "SECONDARY").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </optgroup>
                    <optgroup label="Primary">
                      {levels.filter((l) => l.section === "PRIMARY").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </optgroup>
                  </Select>
                </Field>
                <Field label="Session" required>
                  <Select value={newClass.sessionId ?? ""} onChange={(e) => setNewClass({ ...newClass, sessionId: e.target.value })}>
                    <option value="">Select session…</option>
                    {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
                <Field label="Class name" required hint="e.g. A, B or Red">
                  <Input value={newClass.name ?? ""} onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} placeholder="e.g. 2A" />
                </Field>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <Button variant="ghost" size="sm" onClick={() => setNewClassOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={createAndUseClass} loading={creatingClass} disabled={!newClass.levelId || !newClass.sessionId || !newClass.name?.trim()}>Create class &amp; select</Button>
              </div>
            </div>
          )}
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
          <Field label="Parent temp password" hint="They sign in with the parent email and this password, and will change it on first login.">
            <Input value={form.parentTempPassword ?? ""} onChange={(e) => setForm({ ...form, parentTempPassword: e.target.value })} placeholder="default: parent123" />
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
        <Field label="Photo">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {editForm.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={editForm.photoUrl} alt="Student" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--duga-border)", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, var(--duga-primary), var(--duga-gold))", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>
                {`${(editTarget?.user.firstName[0] ?? "")}${(editTarget?.user.lastName[0] ?? "")}`.toUpperCase()}
              </div>
            )}
            <Input value={editForm.photoUrl ?? ""} onChange={(e) => setEditForm({ ...editForm, photoUrl: e.target.value })} placeholder="Paste image URL or upload" />
            <label className="duga-btn duga-btn--outline duga-btn--sm" style={{ flexShrink: 0, cursor: "pointer", margin: 0 }}>
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
              {uploading ? "Uploading…" : "Upload"}
            </label>
          </div>
        </Field>
        <div className="duga-form-grid" style={{ marginTop: 14 }}>
          <Field label="First name" required>
            <Input value={editForm.firstName ?? ""} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
          </Field>
          <Field label="Last name" required>
            <Input value={editForm.lastName ?? ""} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={editForm.email ?? ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="Leave empty if they use admission number" />
          </Field>
          <Field label="Phone">
            <Input value={editForm.phone ?? ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="0803 000 0000" />
          </Field>
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
          <Field label="Admission number">
            <Input value={editForm.admissionNumber ?? ""} onChange={(e) => setEditForm({ ...editForm, admissionNumber: e.target.value })} />
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
        <div style={{ marginTop: 18, borderTop: "1px solid var(--duga-border)", paddingTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--duga-muted)", marginBottom: 12 }}>Parent / guardian</div>
          <div className="duga-form-grid">
            <Field label="Parent email">
              <Input value={editForm.parentEmail ?? ""} onChange={(e) => setEditForm({ ...editForm, parentEmail: e.target.value })} placeholder="parent@email.com" />
            </Field>
            <Field label="Parent name">
              <Input value={editForm.parentName ?? ""} onChange={(e) => setEditForm({ ...editForm, parentName: e.target.value })} placeholder="Parent name" />
            </Field>
            <Field label="Parent phone">
              <Input value={editForm.parentPhone ?? ""} onChange={(e) => setEditForm({ ...editForm, parentPhone: e.target.value })} placeholder="0803 000 0000" />
            </Field>
            <Field label="Parent temp password" hint="Leave empty to keep the current password. A new one resets their login and must be changed on next sign-in.">
              <Input value={editForm.parentTempPassword ?? ""} onChange={(e) => setEditForm({ ...editForm, parentTempPassword: e.target.value })} placeholder="At least 8 characters" />
            </Field>
          </div>
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
