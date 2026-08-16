"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader, Badge, Alert, Spinner, EmptyState, Button, Modal, Field, Input, Select, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface Level { id: string; name: string; section: string; order: number }
interface Term { id: string; name: string; termNumber: number; status: string }
interface Session { id: string; name: string; terms?: Term[] }
interface Teacher { id: string; firstName: string; lastName: string; subjectIds: string[]; sections: string[] }
interface Subject { id: string; name: string; section: string }
interface SchoolSection { id: string; name: string; order: number }
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

function DrillCard({
  icon,
  title,
  subtitle,
  count,
  label,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  subtitle: string;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="classes-drill-card" onClick={onClick}>
      <div className="classes-drill-card__icon"><Icon name={icon} size={20} /></div>
      <div className="classes-drill-card__title">{title}</div>
      <div className="classes-drill-card__sub">{subtitle}</div>
      <div className="classes-drill-card__foot">
        <Badge tone="accent">{count}</Badge>
        <span className="classes-drill-card__manage">Manage {label} →</span>
      </div>
    </button>
  );
}

function CategoryPicker({
  sections,
  onPick,
  manage,
}: {
  sections: Array<{ section: string; label: string; count: number; items: string[] }>;
  onPick: (s: string) => void;
  manage?: (s: string) => React.ReactNode;
}) {
  return (
    <div className="classes-drill">
      {sections.map((s) => (
        <button key={s.section} className={`classes-drill-card classes-drill-card--${s.section.toLowerCase()}`} onClick={() => onPick(s.section)}>
          <div className="classes-drill-card__icon"><Icon name="classes" size={20} /></div>
          <div className="classes-drill-card__title">{s.label}</div>
          <div className="classes-drill-card__sub">
            {s.count} item{s.count === 1 ? "" : "s"} · {s.items.slice(0, 5).join(", ") || "Nothing added yet"}
            {s.items.length > 5 ? "…" : ""}
          </div>
          <div className="classes-drill-card__foot">
            <span className="classes-drill-card__manage">Open {s.label} →</span>
            {manage && <span onClick={(e) => e.stopPropagation()}>{manage(s.section)}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schoolSections, setSchoolSections] = useState<SchoolSection[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [addKind, setAddKind] = useState<"" | "section" | "subject" | "level" | "session">("");
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ClassGroup | null>(null);
  const [assignSection, setAssignSection] = useState<string>("");
  const [assignSubjectIds, setAssignSubjectIds] = useState<string[]>([]);
  const [assignTeachers, setAssignTeachers] = useState<Record<string, string>>({});
  const [shownSubjects, setShownSubjects] = useState<Record<string, boolean>>({});
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);
  const [editingItem, setEditingItem] = useState<{ kind: "subject" | "level" | "session"; id: string } | null>(null);
  // Drill-down navigation: overview -> (classes | subjects | sessions) -> section -> items.
  type View =
    | { name: "overview" }
    | { name: "classes" }
    | { name: "subjects" }
    | { name: "sessions" }
    | { name: "classes-list"; section: string }
    | { name: "subjects-list"; section: string };
  const [view, setView] = useState<View>({ name: "overview" });
  const { section } = useSection();
  const isAdmin = role === "OWNER" || role === "ADMIN";
  // Non-admins (students, parents, teachers) only see the sections that
  // actually contain their classes/subjects — never an empty sibling section.
  const allSectionNames = isAdmin
    ? [...new Set([...schoolSections.map((item) => item.name), ...classes.map((item) => item.level.section), ...subjects.map((item) => item.section)])]
    : [...new Set([...classes.map((item) => item.level.section), ...subjects.map((item) => item.section)])];
  // When a section is active (switcher), only that section is shown — admins
  // should never see sibling sections while scoped to one.
  const sectionNames = section ? [section] : allSectionNames;
  const assignableSubjects = assignTarget
    ? subjects.filter((s) => s.section === assignTarget.level.section)
    : subjects;
  const teachersFor = (schoolSection: string, subjectId?: string) => teachers.filter((teacher) =>
    teacher.sections.includes(schoolSection) && (!subjectId || teacher.subjectIds.includes(subjectId)),
  );

  // When a global section is active, auto-drill into that section's list.
  useEffect(() => {
    if (!section) return;
    setView((v) =>
      v.name === "classes"
        ? { name: "classes-list", section }
        : v.name === "subjects"
          ? { name: "subjects-list", section }
          : v,
    );
  }, [section]);

  const load = useCallback(async () => {
    void section;
    try {
      const d = await api<{ items: ClassGroup[]; levels: Level[]; sessions: Session[]; subjects: Subject[]; sections?: SchoolSection[]; teachers: Teacher[]; role: string }>("classes");
      setClasses(d.items);
      setLevels(d.levels);
      setSessions(d.sessions);
      setSubjects(d.subjects ?? []);
      setSchoolSections(d.sections ?? []);
      setTeachers(d.teachers ?? []);
      setRole(d.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [section]);

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

  function openAdd(kind: "section" | "subject" | "level" | "session") {
    setAddKind(kind);
    setEditingItem(null);
    setAddForm(kind === "session" || kind === "section" ? {} : { section: sectionNames[0] ?? "" });
  }

  function openEditItem(kind: "subject" | "level" | "session", id: string) {
    setEditingItem({ kind, id });
    const item = kind === "subject" ? subjects.find((s) => s.id === id) : kind === "level" ? levels.find((l) => l.id === id) : sessions.find((s) => s.id === id);
    if (!item) return;
    setAddForm({ name: item.name, section: (item as Subject | Level).section ?? sectionNames[0] ?? "" });
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
      const endpoint = addKind === "section" ? "classes/addSection" : addKind === "subject" ? "classes/addSubject" : addKind === "level" ? "classes/addLevel" : "classes/addSession";
      const body =
        addKind === "session" || addKind === "section"
          ? addForm
          : { name: addForm.name, section: addForm.section ?? "" };
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

  async function renameSection(section: string) {
    const name = window.prompt(`Rename the "${section}" section to:`, section);
    if (!name || name.trim() === section) return;
    try {
      await api("classes/updateSection", { method: "POST", body: { section, name: name.trim() } });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function removeSection(section: string) {
    if (!confirm(`Delete the "${section}" section? This cannot be undone.`)) return;
    try {
      await api("classes/removeSection", { method: "POST", body: { section } });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Classes"
        subtitle="Manage classes, subjects and sessions."
        actions={
          isAdmin ? (
            view.name === "overview" && role === "OWNER" ? (
              <Button variant="outline" onClick={() => openAdd("section")}><Icon name="plus" size={16} /> Add section</Button>
            ) : view.name === "classes-list" ? (
              <div style={{ display: "inline-flex", gap: 8 }}>
                <Button onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New class</Button>
                <Button variant="outline" onClick={() => openAdd("level")}><Icon name="plus" size={16} /> Add level</Button>
              </div>
            ) : view.name === "subjects-list" ? (
              <Button variant="outline" onClick={() => openAdd("subject")}><Icon name="plus" size={16} /> Add subject</Button>
            ) : view.name === "sessions" ? (
              <Button variant="outline" onClick={() => openAdd("session")}><Icon name="plus" size={16} /> Add session</Button>
            ) : view.name === "classes" ? (
              <Button variant="outline" onClick={() => openAdd("level")}><Icon name="plus" size={16} /> Add level</Button>
            ) : undefined
          ) : undefined
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {/* Breadcrumb */}
          <div className="classes-crumb">
            {view.name !== "overview" && (
              <Button variant="ghost" size="sm" onClick={() => setView({ name: "overview" })}>
                <Icon name="back" size={14} /> Classes
              </Button>
            )}
            {view.name === "classes" && <span className="classes-crumb__current">Classes</span>}
            {view.name === "subjects" && <span className="classes-crumb__current">Subjects</span>}
            {view.name === "sessions" && <span className="classes-crumb__current">Sessions</span>}
            {view.name === "classes-list" && (
              <>
                <button className="classes-crumb__link" onClick={() => setView({ name: "classes" })}>Classes</button>
                <span className="classes-crumb__sep">/</span>
                <span className="classes-crumb__current">{view.section}</span>
              </>
            )}
            {view.name === "subjects-list" && (
              <>
                <button className="classes-crumb__link" onClick={() => setView({ name: "subjects" })}>Subjects</button>
                <span className="classes-crumb__sep">/</span>
                <span className="classes-crumb__current">{view.section}</span>
              </>
            )}
          </div>

          {/* Overview */}
          {view.name === "overview" && (
            <div className="classes-drill">
              <DrillCard icon="classes" title="Classes" subtitle="Class groups organised by school section" count={classes.length} label="classes" onClick={() => setView(section ? { name: "classes-list", section } : { name: "classes" })} />
              <DrillCard icon="notes" title="Subjects" subtitle="Subjects taught across your school sections" count={subjects.length} label="subjects" onClick={() => setView(section ? { name: "subjects-list", section } : { name: "subjects" })} />
              <DrillCard icon="timetable" title="Sessions" subtitle="Academic years, e.g. 2025/2026" count={sessions.length} label="sessions" onClick={() => setView({ name: "sessions" })} />
            </div>
          )}

          {/* Classes -> pick a category */}
          {view.name === "classes" && (
            <CategoryPicker
              onPick={(s) => setView({ name: "classes-list", section: s })}
              manage={role === "OWNER" ? (s) => (
                <span style={{ display: "inline-flex", gap: 4, marginLeft: 8 }}>
                  <Button size="sm" variant="ghost" onClick={() => renameSection(s)}>Rename</Button>
                  <Button size="sm" variant="danger" onClick={() => removeSection(s)}>Delete</Button>
                </span>
              ) : undefined}
              sections={sectionNames.map((section) => {
                const items = classes.filter((item) => item.level.section === section).sort((a, b) => (a.level.order ?? 0) - (b.level.order ?? 0));
                return { section, label: section, count: items.length, items: items.map((item) => `${item.level.name} ${item.name}`) };
              })}
            />
          )}

          {/* Classes -> category -> list */}
          {view.name === "classes-list" &&
            (() => {
              const sectionClasses = classes.filter((item) => item.level.section === view.section);
              return (
                <section className="classes-section">
                  <h2 style={{ fontSize: 17, margin: "0 0 12px", color: "var(--duga-primary-ink)" }}>
                    {view.section} classes
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--duga-muted)", marginLeft: 6 }}>({sectionClasses.length})</span>
                  </h2>
                  {sectionClasses.length === 0 ? (
                    <EmptyState title={`No ${view.section.toLowerCase()} classes yet`} hint={isAdmin ? "Create your first class with the “New class” button above." : "Check back later."} />
                  ) : (
                    <div className="classes-card-grid">
                      {[...sectionClasses]
                        .sort((a, b) => (a.level.order ?? 0) - (b.level.order ?? 0) || a.name.localeCompare(b.name))
                        .map((c) => (
                          <Card key={c.id} title={`${c.level.name} ${c.name}`} className="classes-card">
                            <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 8 }}>
                              {c.session.name}
                              {c.room ? ` · Room ${c.room}` : ""}
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <Badge tone={c.level.section === "PRIMARY" ? "info" : "accent"}>{c.level.section.toLowerCase()}</Badge>
                              <Badge tone="neutral">{c._count?.students ?? 0} students</Badge>
                              <Badge tone="neutral">{c.classSubjects?.length ?? 0} subjects</Badge>
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
                                  <Button size="sm" variant="outline" onClick={() => { setAssignTarget(c); setAssignSection(c.level.section); setAssignSubjectIds((c.classSubjects ?? []).map((cs) => cs.subject?.id ?? "").filter(Boolean)); setAssignTeachers(Object.fromEntries((c.classSubjects ?? []).map((cs) => [cs.subject?.id ?? "", cs.teacher?.id ?? ""]).filter(([id]) => id))); }}>Assign subject</Button>
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
                                  {teachersFor(c.level.section).map((t) => (
                                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                                  ))}
                                </Select>
                              </div>
                            )}
                          </Card>
                        ))}
                    </div>
                  )}
                </section>
              );
            })()}

          {/* Subjects -> pick a category */}
          {view.name === "subjects" && (
            <CategoryPicker
              onPick={(s) => setView({ name: "subjects-list", section: s })}
              sections={sectionNames.map((section) => {
                const items = subjects.filter((item) => item.section === section);
                return { section, label: section, count: items.length, items: items.map((item) => item.name) };
              })}
            />
          )}

          {/* Subjects -> category -> list */}
          {view.name === "subjects-list" &&
            (() => {
              const sectionSubjects = subjects.filter((item) => item.section === view.section);
              return (
                <Card title={`${view.section} subjects`}>
                  {sectionSubjects.length === 0 ? (
                    <EmptyState title={`No ${view.section.toLowerCase()} subjects yet`} hint={isAdmin ? "Create one with the “Add subject” button above." : "Check back later."} />
                  ) : (
                    <div className="subject-list">
                      {sectionSubjects.map((s) => (
                        <div key={s.id} className="subject-list__item">
                          <span>{s.name}</span>
                          {isAdmin && (
                            <div className="subject-list__actions">
                              <Button size="sm" variant="ghost" onClick={() => openEditItem("subject", s.id)}>Edit</Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteItem("subject", s.id)}>Delete</Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })()}

          {/* Sessions */}
          {view.name === "sessions" && (
            <Card title="Sessions">
              {sessions.length === 0 ? (
                <EmptyState title="No sessions yet" hint={isAdmin ? "Create one with the “Add session” button above." : "Check back later."} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sessions.map((s) => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderBottom: "1px solid var(--duga-border)", paddingBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</div>
                        {s.terms && s.terms.length > 0 ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                            {s.terms.map((t) => (
                              <Badge key={t.id} tone={t.status === "ACTIVE" ? "success" : "neutral"}>{t.name}</Badge>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--duga-muted)", marginTop: 4 }}>No terms added yet</div>
                        )}
                      </div>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <Button size="sm" variant="ghost" onClick={() => openEditItem("session", s.id)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteItem("session", s.id)}>Delete</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
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
                {sectionNames.map((section) => {
                  const sectionLevels = levels.filter((l) => l.section === section);
                  return sectionLevels.length > 0 ? (
                    <optgroup key={section} label={section}>
                      {sectionLevels.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
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
            {teachersFor(editingClass?.level.section ?? levels.find((level) => level.id === form.levelId)?.section ?? "").map((t) => (
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
          {subjects.length > 0 && assignableSubjects.length === 0 && <Alert tone="warning">No {assignTarget?.level.section.toLowerCase()} subjects yet — create one with the &quot;Add subject&quot; button first.</Alert>}
        </div>
        <Alert tone="info">{assignTarget?.level.section ?? "Selected"} subjects only. Teachers shown are assigned to this section and subject.</Alert>
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
                    {teachersFor(assignTarget?.level.section ?? assignSection, s.id).map((t) => (
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
        title={`${editingItem ? "Edit" : "Add"} ${addKind === "section" ? "section" : addKind === "subject" ? "subject" : addKind === "level" ? "level" : "session"}`}
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
        <Field label={addKind === "session" ? "Session name" : addKind === "section" ? "Section name" : "Name"} required>
          <Input
            value={addForm.name ?? ""}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            placeholder={addKind === "session" ? "e.g. 2025/2026" : addKind === "section" ? "e.g. Nursery, Junior School" : addKind === "level" ? "e.g. Basic 1" : "e.g. Mathematics"}
          />
        </Field>
        {addKind !== "session" && addKind !== "section" && (
          <Field label="Section" required>
            <Select value={addForm.section ?? ""} onChange={(e) => setAddForm({ ...addForm, section: e.target.value })}>
              <option value="">Select section…</option>
              {sectionNames.map((section) => <option key={section} value={section}>{section}</option>)}
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
