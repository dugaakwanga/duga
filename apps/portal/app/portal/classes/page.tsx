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
  const [assignForm, setAssignForm] = useState<Record<string, string>>({});
  const isAdmin = role === "OWNER" || role === "ADMIN";

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
      await api("classes", { method: "POST", body: form });
      setOpen(false);
      const d = await api<{ items: ClassGroup[] }>("classes");
      setClasses(d.items);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function openAdd(kind: "subject" | "level" | "session") {
    setAddKind(kind);
    setAddForm(kind === "session" ? {} : { section: "SECONDARY" });
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
    if (!assignForm.subjectId || !assignForm.teacherId) return alert("Choose a subject and a teacher");
    try {
      await api(`classes/${assignTarget.id}/assignSubject`, { method: "POST", body: assignForm });
      setAssignTarget(null);
      setAssignForm({});
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {classes.map((c) => (
            <Card key={c.id} title={`${c.level.name} ${c.name}`}>
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
                  <Select value={c.formTeacher?.id ?? ""} onChange={(e) => assignFormTeacher(c, e.target.value)}>
                    <option value="">— Select class teacher —</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                    ))}
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => { setAssignTarget(c); setAssignForm({}); }}><Icon name="quiz" size={14} /> Assign subject</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Create class group">
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
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={addClass}>Create</Button>
        </div>
      </Modal>

      <Modal open={!!assignTarget} onClose={() => setAssignTarget(null)} title={assignTarget ? `Assign subject — ${assignTarget.level.name} ${assignTarget.name}` : ""}>
        <div style={{ marginBottom: 12 }}>
          {subjects.length === 0 && <Alert tone="warning">No subjects yet — create one with the &quot;Add subject&quot; button first.</Alert>}
        </div>
        <Field label="Subject" required>
          <Select value={assignForm.subjectId ?? ""} onChange={(e) => setAssignForm({ ...assignForm, subjectId: e.target.value })}>
            <option value="">Select subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.section.toLowerCase()})</option>
            ))}
          </Select>
        </Field>
        <Field label="Teacher" required>
          <Select value={assignForm.teacherId ?? ""} onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })}>
            <option value="">Select teacher…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
            ))}
          </Select>
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setAssignTarget(null)}>Cancel</Button>
          <Button onClick={assignSubject}>Assign</Button>
        </div>
      </Modal>

      <Modal
        open={!!addKind}
        onClose={() => setAddKind("")}
        title={addKind === "subject" ? "Add subject" : addKind === "level" ? "Add level" : "Add session"}
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
          <Button variant="ghost" onClick={() => setAddKind("")}>Cancel</Button>
          <Button onClick={saveAdd} loading={saving}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
