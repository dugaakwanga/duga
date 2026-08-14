"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader, Badge, Alert, Spinner, EmptyState, Button, Modal, Field, Input, Select, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Level { id: string; name: string; section: string; order: number }
interface Session { id: string; name: string }
interface Teacher { id: string; firstName: string; lastName: string }
interface Subject { id: string; name: string; section: string }
interface ClassGroup {
  id: string;
  name: string;
  room: string | null;
  level: Level;
  session: Session;
  formTeacherId?: string | null;
  formTeacher?: { id: string; user: { firstName: string; lastName: string } } | null;
  classSubjects?: { id: string; subject?: { id: string; name: string; section: string }; teacher?: { id: string; user?: { firstName: string; lastName: string } } | null }[];
  _count?: { students: number };
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [addKind, setAddKind] = useState<"" | "subject" | "level" | "session">("");
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ClassGroup | null>(null);
  const [assignSection, setAssignSection] = useState<"PRIMARY" | "SECONDARY">("SECONDARY");
  const [assignSubjectIds, setAssignSubjectIds] = useState<string[]>([]);
  const [assignTeachers, setAssignTeachers] = useState<Record<string, string>>({});
  const [shownSubjects, setShownSubjects] = useState<Record<string, boolean>>({});
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);
  const [editingItem, setEditingItem] = useState<{ kind: "subject" | "level" | "session"; id: string } | null>(null);
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const primaryClasses = classes.filter((c) => c.level.section === "PRIMARY");
  const secondaryClasses = classes.filter((c) => c.level.section === "SECONDARY");
  const primarySubjects = subjects.filter((s) => s.section === "PRIMARY");
  const secondarySubjects = subjects.filter((s) => s.section === "SECONDARY");
  const assignableSubjects = assignTarget
    ? subjects.filter((s) => s.section === assignSection)
    : subjects;

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: ClassGroup[]; levels: Level[]; sessions: Session[]; subjects: Subject[]; teachers: Teacher[]; role: string }>("classes");
      setClasses(d.items);
      setLevels(d.levels);
      setSessions(d.sessions);
      setSubjects(d.subjects ?? []);
      setTeachers(d.teachers ?? []);
      setRole(d.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addClass() {
    try {
      if (editingClass) {
        await api(`classes/${editingClass.id}`, { method: "PATCH", body: form });
        setOpen(false);
        setEditingClass(null);
        load();
        return;
      }
      await api("classes", { method: "POST", body: form });
      setOpen(false);
      const d = await api<{ items: ClassGroup[] }>("classes");
      setClasses(d.items);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function openEditClass(c: ClassGroup) {
    setEditingClass(c);
    setForm({ name: c.name, room: c.room ?? "", formTeacherId: c.formTeacher?.id ?? "" });
    setOpen(true);
  }

  async function deleteClass(c: ClassGroup) {
    if (!confirm(`Delete class ${c.level.name} ${c.name}? This cannot be undone.`)) return;
    try {
      await api(`classes/${c.id}/deleteClass`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function openAdd(kind: "subject" | "level" | "session") {
    setAddKind(kind);
    setEditingItem(null);
    setAddForm(kind === "session" ? {} : { section: "SECONDARY" });
  }

  function openEditItem(kind: "subject" | "level" | "session", id: string) {
    setEditingItem({ kind, id });
    const item = kind === "subject" ? subjects.find((s) => s.id === id) : kind === "level" ? levels.find((l) => l.id === id) : sessions.find((s) => s.id === id);
    if (!item) return;
    setAddForm({ name: item.name, section: (item as Subject | Level).section ?? "SECONDARY" });
    setAddKind(kind as "subject" | "level" | "session");
  }

  async function saveEditItem() {
    if (!editingItem) return;
    setSaving(true);
    try {
      const action = editingItem.kind === "subject" ? "updateSubject" : editingItem.kind === "level" ? "updateLevel" : "updateSession";
      await api(`classes/${editingItem.id}/${action}`, { method: "POST", body: addForm });
      setAddKind("");
      setEditingItem(null);
      setAddForm({});
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(kind: "subject" | "level" | "session", id: string) {
    if (!confirm(`Delete this ${kind}? This cannot be undone.`)) return;
    try {
      const action = kind === "subject" ? "deleteSubject" : kind === "level" ? "deleteLevel" : "deleteSession";
      await api(`classes/${id}/${action}`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function saveAdd() {
    if (!addKind) return;
    setSaving(true);
    try {
      const endpoint = addKind === "subject" ? "classes/addSubject" : addKind === "level" ? "classes/addLevel" : "classes/addSession";
      const body =
        addKind === "session"
          ? addForm
          : { name: addForm.name, section: (addForm.section ?? "SECONDARY") as "PRIMARY" | "SECONDARY" };
      if (!(body as { name?: string }).name) throw new Error("Name is required");
      await api(endpoint, { method: "POST", body });
      setAddKind("");
      setAddForm({});
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function assignFormTeacher(c: ClassGroup, teacherId: string) {
    try {
      await api(`classes/${c.id}`, { method: "PATCH", body: { formTeacherId: teacherId || "none" } });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function assignSubject() {
    if (!assignTarget) return;
    if (assignSubjectIds.length === 0) return alert("Choose at least one subject");
    try {
      await api(`classes/${assignTarget.id}/assignSubject`, { method: "POST", body: { subjectIds: assignSubjectIds, teachers: assignTeachers } });
      setAssignTarget(null);
      setAssignSubjectIds([]);
      setAssignTeachers({});
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function unassignSubject(c: ClassGroup, subjectId: string) {
    if (!confirm(`Unassign this subject from ${c.level.name} ${c.name}?`)) return;
    try {
      await api(`classes/${c.id}/unassignSubject`, { method: "POST", body: { subjectId } });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Classes"
        subtitle="Class groups, levels, sessions and subjects."
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" onClick={() => openAdd("session")} style={{ marginRight: 10 }}>Add session</Button>
              <Button variant="outline" onClick={() => openAdd("level")} style={{ marginRight: 10 }}>Add level</Button>
              <Button variant="outline" onClick={() => openAdd("subject")} style={{ marginRight: 10 }}>Add subject</Button>
              <Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New class</Button>
            </>
          ) : undefined
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : classes.length === 0 ? (
        <EmptyState title="No classes yet" />
      ) : (
        <div style={{ display: "grid", gap: 28 }}>
          {([
            ["Primary classes", primaryClasses],
            ["Secondary classes", secondaryClasses],
          ] as const).map(([title, sectionClasses]) => sectionClasses.length > 0 && (
          <section key={title} className="classes-section">
            <h2 style={{ fontSize: 17, margin: "0 0 12px", color: "var(--duga-primary-ink)" }}>{title}</h2>
            <div className="classes-card-grid">
          {sectionClasses.map((c) => (
            <Card key={c.id} title={`${c.level.name} ${c.name}`} className="classes-card">
              <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 8 }}>
                {c.session.name}
                {c.room ? ` · Room ${c.room}` : ""}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tone={c.level.section === "PRIMARY" ? "info" : "accent"}>{c.level.section.toLowerCase()}</Badge>
                <Badge tone="neutral">{c._count?.students ?? 0} students</Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 10 }}>
                Class teacher: {c.formTeacher ? `${c.formTeacher.user.firstName} ${c.formTeacher.user.lastName}` : "Not set"}
              </div>
              {isAdmin && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="classes-card__actions">
                    <Button size="sm" variant={shownSubjects[c.id] ? "ghost" : "outline"} onClick={() => setShownSubjects((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}>
                      Subjects ({c.classSubjects?.length ?? 0})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setAssignTarget(c); setAssignSection(c.level.section === "PRIMARY" ? "PRIMARY" : "SECONDARY"); setAssignSubjectIds((c.classSubjects ?? []).map((cs) => cs.subject?.id ?? "").filter(Boolean)); setAssignTeachers(Object.fromEntries((c.classSubjects ?? []).map((cs) => [cs.subject?.id ?? "", cs.teacher?.id ?? ""]).filter(([id]) => id))); }}>Assign subject</Button>
                    <Button size="sm" variant="outline" onClick={() => openEditClass(c)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => deleteClass(c)} title={`Delete ${c.level.name} ${c.name}`}>Delete</Button>
                  </div>
                  {shownSubjects[c.id] && (
                    <>
                      {(c.classSubjects?.length ?? 0) > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {(c.classSubjects ?? []).map((cs) => (
                            <button
                              key={cs.id}
                              onClick={() => unassignSubject(c, cs.subject!.id)}
                              className="duga-btn duga-btn--sm duga-btn--ghost"
                              title={`Unassign ${cs.subject!.name}`}
                              style={{ fontSize: 12, padding: "2px 8px", maxWidth: "100%", overflowWrap: "anywhere" }}
                            >
                              {cs.subject!.name}{cs.teacher?.user ? ` · ${cs.teacher.user.firstName} ${cs.teacher.user.lastName}` : ""} ×
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Alert tone="info">No subjects assigned yet.</Alert>
                      )}
                    </>
                  )}
                  <Select value={c.formTeacher?.id ?? ""} onChange={(e) => assignFormTeacher(c, e.target.value)}>
                    <option value="">— Select class teacher —</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                    ))}
                  </Select>
                </div>
              )}
            </Card>
          ))}
            </div>
          </section>
          ))}
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
            {([
              ["Primary subjects", primarySubjects],
              ["Secondary subjects", secondarySubjects],
            ] as const).map(([title, sectionSubjects]) => (
            <Card key={title} title={title}>
              {sectionSubjects.length === 0 ? <EmptyState title={`No ${title.toLowerCase()}`} /> : (
                <div className="subject-list">
                  {sectionSubjects.map((s) => (
                    <div key={s.id} className="subject-list__item">
                      <span>{s.name}</span>
                      <div className="subject-list__actions">
                        <Button size="sm" variant="ghost" onClick={() => openEditItem("subject", s.id)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteItem("subject", s.id)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            ))}
            {([
              ["Primary levels", levels.filter((l) => l.section === "PRIMARY")],
              ["Secondary levels", levels.filter((l) => l.section === "SECONDARY")],
            ] as const).map(([title, sectionLevels]) => (
            <Card key={title} title={title}>
              {sectionLevels.length === 0 ? <EmptyState title={`No ${title.toLowerCase()}`} /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sectionLevels.map((l) => (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, overflowWrap: "anywhere" }}>{l.name}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Button size="sm" variant="ghost" onClick={() => openEditItem("level", l.id)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteItem("level", l.id)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            ))}
            <Card title="Sessions">
              {sessions.length === 0 ? <EmptyState title="No sessions" /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sessions.map((s) => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13.5 }}>{s.name}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Button size="sm" variant="ghost" onClick={() => openEditItem("session", s.id)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteItem("session", s.id)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => { setOpen(false); setEditingClass(null); }} title={editingClass ? `Edit class — ${editingClass.level.name} ${editingClass.name}` : "Create class group"}>
        {!editingClass && (
          <>
            <div style={{ marginBottom: 12 }}>
              {levels.length === 0 && <Alert tone="warning">No levels yet — add a level first (e.g. Basic 1, JSS 1) using the &quot;Add level&quot; button.</Alert>}
              {sessions.length === 0 && <Alert tone="warning">No sessions yet — add a session first (e.g. 2025/2026) using the &quot;Add session&quot; button.</Alert>}
            </div>
            <Field label="Level" required>
              <Select value={form.levelId ?? ""} onChange={(e) => setForm({ ...form, levelId: e.target.value })}>
                <option value="">Select level…</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.section.toLowerCase()})</option>
                ))}
              </Select>
            </Field>
            <Field label="Session" required>
              <Select value={form.sessionId ?? ""} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}>
                <option value="">Select session…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label="Class name" required>
          <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. A or 1A" />
        </Field>
        <Field label="Room">
          <Input value={form.room ?? ""} onChange={(e) => setForm({ ...form, room: e.target.value })} />
        </Field>
        <Field label="Class teacher">
          <Select value={form.formTeacherId ?? ""} onChange={(e) => setForm({ ...form, formTeacherId: e.target.value })}>
            <option value="">— None —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
            ))}
          </Select>
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setOpen(false); setEditingClass(null); }}>Cancel</Button>
          <Button onClick={addClass}>{editingClass ? "Save changes" : "Create"}</Button>
        </div>
      </Modal>

      <Modal open={!!assignTarget} onClose={() => setAssignTarget(null)} title={assignTarget ? `Assign subjects — ${assignTarget.level.name} ${assignTarget.name}` : ""}>
        <div style={{ marginBottom: 12 }}>
          {subjects.length === 0 && <Alert tone="warning">No subjects yet — create one with the &quot;Add subject&quot; button first.</Alert>}
          {subjects.length > 0 && assignableSubjects.length === 0 && <Alert tone="warning">No {assignSection.toLowerCase()} subjects yet — create one with the &quot;Add subject&quot; button first.</Alert>}
        </div>
        <Field label="Section" required>
          <Select value={assignSection} onChange={(e) => setAssignSection(e.target.value as "PRIMARY" | "SECONDARY")}>
            <option value="PRIMARY">Primary</option>
            <option value="SECONDARY">Secondary</option>
          </Select>
        </Field>
        <Field label="Subjects" required hint="Select one or more subjects and pick the teacher assigned to each.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto", border: "1px solid var(--duga-border)", borderRadius: 8, padding: 8 }}>
            {assignableSubjects.map((s) => {
              const checked = assignSubjectIds.includes(s.id);
              return (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr 180px", gap: 8, alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setAssignSubjectIds((prev) => (checked ? prev.filter((id) => id !== s.id) : [...prev, s.id]))}
                    />
                    <span>{s.name}</span>
                  </label>
                  <Select
                    value={assignTeachers[s.id] ?? ""}
                    disabled={!checked}
                    onChange={(e) => setAssignTeachers((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  >
                    <option value="">— Teacher —</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                    ))}
                  </Select>
                </div>
              );
            })}
          </div>
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setAssignTarget(null)}>Cancel</Button>
          <Button onClick={assignSubject} disabled={assignSubjectIds.length === 0}>Assign {assignSubjectIds.length > 0 ? `(${assignSubjectIds.length})` : ""}</Button>
        </div>
      </Modal>

      <Modal
        open={!!addKind}
        onClose={() => { setAddKind(""); setEditingItem(null); }}
        title={`${editingItem ? "Edit" : "Add"} ${addKind === "subject" ? "subject" : addKind === "level" ? "level" : "session"}`}
      >
        {addKind === "level" && (
          <div style={{ marginBottom: 12 }}>
            <Alert tone="info">Levels group classes by stage, e.g. Basic 1, JSS 1, SS 1.</Alert>
          </div>
        )}
        {addKind === "session" && (
          <div style={{ marginBottom: 12 }}>
            <Alert tone="info">Sessions are school years, e.g. 2025/2026.</Alert>
          </div>
        )}
        <Field label={addKind === "session" ? "Session name" : "Name"} required>
          <Input
            value={addForm.name ?? ""}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            placeholder={addKind === "session" ? "e.g. 2025/2026" : addKind === "level" ? "e.g. Basic 1" : "e.g. Mathematics"}
          />
        </Field>
        {addKind !== "session" && (
          <Field label="Section" required>
            <Select value={addForm.section ?? "SECONDARY"} onChange={(e) => setAddForm({ ...addForm, section: e.target.value })}>
              <option value="PRIMARY">Primary</option>
              <option value="SECONDARY">Secondary</option>
            </Select>
          </Field>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => { setAddKind(""); setEditingItem(null); }}>Cancel</Button>
          <Button onClick={editingItem ? saveEditItem : saveAdd} loading={saving}>{editingItem ? "Save changes" : "Save"}</Button>
        </div>
      </Modal>
    </div>
  );
}
