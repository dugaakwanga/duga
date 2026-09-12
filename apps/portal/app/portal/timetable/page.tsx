"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Alert, Spinner, EmptyState, Button, Modal, Field, Input, Select } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Entry {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { id: string; name: string } | null;
  classGroup: { id: string; level: { name: string }; name: string } | null;
  teacher: { id: string; user: { firstName: string; lastName: string } } | null;
}

interface ExamEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string | null;
  subject: { id: string; name: string } | null;
  classGroup: { id: string; level: { name: string }; name: string } | null;
}

interface TimetableData {
  role: string;
  grid: Array<{ day: string; index: number; entries: Entry[] }>;
  examTimetable: ExamEntry[];
  refs?: {
    classes: Array<{ id: string; level: { name: string }; name: string }>;
    subjects: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; user: { firstName: string; lastName: string } }>;
    terms: Array<{ id: string; name: string }>;
  };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_INDEXES = [1, 2, 3, 4, 5]; // Mon–Fri always shown; Sat/Sun only if they have entries.
const emptyForm = (): Record<string, string> => ({});

const CSV_TEMPLATE = "Level,Class,Day,Period,StartTime,EndTime,Subject,Teacher,Room,Term\nSSS 2,A,Monday,1,08:00,08:45,Mathematics,Jane Doe,Hall A,\n";

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "timetable-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function TtCellContent({ e, showClass, isAdmin, onEdit, onRemove }: { e: Entry; showClass: boolean; isAdmin: boolean; onEdit: (e: Entry) => void; onRemove: (id: string) => void }) {
  return (
    <div className="tt-cell">
      <strong>{e.subject?.name ?? "—"}</strong>
      <div>{e.startTime}–{e.endTime}</div>
      <span>
        {showClass && e.classGroup ? `${e.classGroup.level.name} ${e.classGroup.name}` : ""}
        {e.teacher ? `${showClass && e.classGroup ? " · " : ""}${e.teacher.user.firstName[0]}. ${e.teacher.user.lastName}` : ""}
        {e.room ? ` · ${e.room}` : ""}
      </span>
      {isAdmin && (
        <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
          <button className="duga-btn duga-btn--sm duga-btn--ghost" style={{ fontSize: 11, padding: "0 4px" }} onClick={() => onEdit(e)}>Edit</button>
          <button className="duga-btn duga-btn--sm duga-btn--ghost" style={{ fontSize: 11, padding: "0 4px" }} onClick={() => onRemove(e.id)}>×</button>
        </div>
      )}
    </div>
  );
}

// One class's (admin) or one person's (teacher/student/parent) weekly
// schedule — replaces the old view, which crammed every class in the whole
// school into 7 day columns at once and forced horizontal scroll.
//
// Two renderings, CSS-toggled by viewport (see .tt-grid2/.tt-daylist in
// globals.css) rather than a JS breakpoint check, so there's no hydration
// mismatch: a day-column x period-row grid for tablet/desktop where there's
// room for five legible columns, and a single stacked day-by-day list on a
// phone, where five columns of full subject names has no honest fit — that
// would either force horizontal scroll (which we're explicitly removing) or
// truncate every name to a couple of characters.
function WeeklyGrid({ entries, isAdmin, showClass, onEdit, onRemove }: { entries: Entry[]; isAdmin: boolean; showClass: boolean; onEdit: (e: Entry) => void; onRemove: (id: string) => void }) {
  if (entries.length === 0) return <EmptyState title="No periods yet" hint={isAdmin ? "Add a period, generate one, or import a CSV." : "Nothing scheduled yet."} />;

  const days = [...WEEKDAY_INDEXES, 6, 0].filter((d) => (d !== 0 && d !== 6) || entries.some((e) => e.dayOfWeek === d));
  const periods = [...new Set(entries.map((e) => e.periodNumber))].sort((a, b) => a - b);
  const byCell = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.dayOfWeek}:${e.periodNumber}`;
    byCell.set(key, [...(byCell.get(key) ?? []), e]);
  }
  const cellProps = { showClass, isAdmin, onEdit, onRemove };

  return (
    <>
      <div className="tt-grid2" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="tt-grid2__corner" />
        {days.map((d) => (
          <div key={d} className="tt-grid2__head">{(DAYS[d] ?? "").slice(0, 3)}</div>
        ))}
        {periods.map((p) => (
          <Fragment key={p}>
            <div className="tt-grid2__period">{p}</div>
            {days.map((d) => {
              const cellEntries = byCell.get(`${d}:${p}`) ?? [];
              return (
                <div key={`${d}-${p}`} className="tt-grid2__cell">
                  {cellEntries.map((e) => <TtCellContent key={e.id} e={e} {...cellProps} />)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="tt-daylist">
        {days.map((d) => {
          const dayEntries = periods.flatMap((p) => byCell.get(`${d}:${p}`) ?? []);
          return (
            <div key={d} className="tt-daylist__day">
              <div className="tt-daylist__day-head">{DAYS[d]}</div>
              {dayEntries.length === 0 ? (
                <div className="tt-daylist__empty">No periods</div>
              ) : (
                dayEntries.map((e) => <TtCellContent key={e.id} e={e} {...cellProps} />)
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function TimetablePage() {
  const [data, setData] = useState<TimetableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"" | "entry" | "exam" | "import">("");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm());
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [classGroupId, setClassGroupId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; failed: number; results: Array<{ row: number; ok: boolean; error?: string }> } | null>(null);

  // Was previously `!!data?.refs` — the server always includes a `refs` key
  // (an empty object for non-managers), so that check was always truthy and
  // every role saw the Owner/Admin-only timetable controls. Derive it from
  // the role itself instead, same as every other page in the portal.
  const isAdmin = data?.role === "OWNER" || data?.role === "ADMIN";

  const load = useCallback((cgId?: string) => {
    return api<TimetableData>("timetable", { query: { classGroupId: cgId || undefined } })
      .then((d) => {
        setData(d);
        // Default to the first class in the active section so the admin
        // never lands on the old "every class mixed together" view.
        const firstClass = d.refs?.classes[0];
        if ((d.role === "OWNER" || d.role === "ADMIN") && !cgId && firstClass) {
          setClassGroupId(firstClass.id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (classGroupId) load(classGroupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classGroupId]);

  function openModal(kind: "entry" | "exam" | "import", target?: { id?: string; form: Record<string, string> }) {
    setModal(kind);
    setEditId(target?.id ?? null);
    setForm(target?.form ?? emptyForm());
    if (kind === "import") { setCsvText(""); setImportResult(null); }
  }

  async function submit() {
    if (!modal || modal === "import") return;
    try {
      const id = editId;
      const endpoint =
        modal === "entry"
          ? id
            ? `timetable/${id}/updateEntry`
            : "timetable/addEntry"
          : id
            ? `timetable/${id}/updateExam`
            : "timetable/addExam";
      await api(endpoint, { method: "POST", body: form });
      setModal("");
      setEditId(null);
      setForm(emptyForm());
      load(classGroupId);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(kind: "entry" | "exam", id: string) {
    if (!confirm("Delete this timetable entry?")) return;
    try {
      await api(`timetable/${id}/${kind === "entry" ? "removeEntry" : "removeExam"}`, { method: "POST", body: {} });
      load(classGroupId);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function publish() {
    if (!confirm("Publish this timetable and notify affected students and teachers?")) return;
    setPublishing(true);
    try {
      const result = await api<{ recipients: number }>("timetable/publish", { method: "POST", body: {} });
      alert(`Timetable published. ${result.recipients} recipient(s) were notified.`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  async function generate() {
    if (!confirm("Generate missing timetable periods for all assigned class subjects in the active section? Existing periods will be kept.")) return;
    setGenerating(true);
    try {
      const result = await api<{ created: number; skipped: number }>("timetable/generate", { method: "POST", body: {} });
      alert(`Generated ${result.created} period(s) without clashes.${result.skipped ? ` ${result.skipped} period(s) could not fit.` : ""}`);
      load(classGroupId);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function importCsv() {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api<{ created: number; failed: number; results: Array<{ row: number; ok: boolean; error?: string }> }>("timetable/importCsv", { method: "POST", body: { csv: csvText } });
      setImportResult(result);
      if (result.created) load(classGroupId);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function onCsvFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading || !data) return <Spinner size={28} />;

  function editEntry(e: Entry) {
    openModal("entry", {
      id: e.id,
      form: {
        classGroupId: e.classGroup?.id ?? "",
        subjectId: e.subject?.id ?? "",
        teacherId: e.teacher?.id ?? "",
        dayOfWeek: String(e.dayOfWeek),
        periodNumber: String(e.periodNumber),
        startTime: e.startTime,
        endTime: e.endTime,
        room: e.room ?? "",
      },
    });
  }

  const allEntries = data.grid.flatMap((d) => d.entries);
  const selectedClass = data.refs?.classes.find((c) => c.id === classGroupId);

  return (
    <div>
      <PageHeader
        title="Timetable"
        subtitle={isAdmin ? "Section and class-scoped weekly schedule." : "Your weekly schedule."}
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" loading={generating} onClick={generate} style={{ marginRight: 10 }}>Generate timetable</Button>
              <Button variant="accent" loading={publishing} onClick={publish} style={{ marginRight: 10 }}>Publish & notify</Button>
              <Button variant="outline" onClick={() => openModal("import")} style={{ marginRight: 10 }}>Import CSV</Button>
              <Button variant="outline" onClick={() => openModal("exam")} style={{ marginRight: 10 }}><span style={{ marginRight: 4 }}>＋</span> Exam entry</Button>
              <Button onClick={() => openModal("entry")}>Add period</Button>
            </>
          ) : undefined
        }
      />

      {isAdmin && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--duga-muted)" }}>Class:</span>
          <Select value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)} style={{ maxWidth: 260 }}>
            {data.refs?.classes.map((c) => (
              <option key={c.id} value={c.id}>{c.level.name} {c.name}</option>
            ))}
          </Select>
        </div>
      )}

      <Card title={isAdmin && selectedClass ? `${selectedClass.level.name} ${selectedClass.name}` : undefined} pad={false}>
        <div className="duga-card__pad">
          <WeeklyGrid entries={allEntries} isAdmin={isAdmin} showClass={!isAdmin} onEdit={editEntry} onRemove={(id) => remove("entry", id)} />
        </div>
      </Card>

      <Card title="Examination timetable" style={{ marginTop: 24 }}>
        {data.examTimetable.length === 0 ? (
          <EmptyState title="No exam timetable yet" />
        ) : (
          <div className="duga-table-wrap">
            <table className="duga-table">
              <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th>Class</th><th>Venue</th>{isAdmin && <th>Actions</th>}</tr></thead>
              <tbody>
                {data.examTimetable.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.date).toLocaleDateString()}</td>
                    <td>{e.startTime}–{e.endTime}</td>
                    <td>{e.subject?.name}</td>
                    <td>{e.classGroup ? `${e.classGroup.level.name} ${e.classGroup.name}` : "—"}</td>
                    <td>{e.venue ?? "—"}</td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="sm" variant="ghost" onClick={() => openModal("exam", { id: e.id, form: { subjectId: e.subject?.id ?? "", classGroupId: e.classGroup?.id ?? "", date: new Date(e.date).toISOString().slice(0, 10), startTime: e.startTime, endTime: e.endTime, venue: e.venue ?? "" } })}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => remove("exam", e.id)}>Delete</Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={() => { setModal(""); setEditId(null); setForm(emptyForm()); }}
        title={modal === "import" ? "Import timetable from CSV" : `${editId ? "Edit" : "Add"} timetable ${modal === "entry" ? "period" : "exam entry"}`}
        wide
      >
        {modal === "entry" && (
          <>
            <div className="duga-form-grid">
              <Field label="Day of week" required>
                <Select value={form.dayOfWeek ?? ""} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                  <option value="">Select day…</option>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Period number" required>
                <Input type="number" value={form.periodNumber ?? ""} onChange={(e) => setForm({ ...form, periodNumber: e.target.value })} placeholder="1" />
              </Field>
            </div>
            <div className="duga-form-grid">
              <Field label="Start time" required>
                <Input type="time" value={form.startTime ?? ""} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </Field>
              <Field label="End time" required>
                <Input type="time" value={form.endTime ?? ""} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </Field>
            </div>
            <Field label="Class group" required>
              <Select value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}>
                <option value="">Select class…</option>
                {data.refs?.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.level.name} {c.name}</option>
                ))}
              </Select>
            </Field>
            <div className="duga-form-grid">
              <Field label="Subject" required>
                <Select value={form.subjectId ?? ""} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                  <option value="">Select subject…</option>
                  {data.refs?.subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Teacher" required>
                <Select value={form.teacherId ?? ""} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                  <option value="">Select teacher…</option>
                  {data.refs?.teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="duga-form-grid">
              <Field label="Term">
                <Select value={form.termId ?? ""} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
                  <option value="">—</option>
                  {data.refs?.terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Room">
                <Input value={form.room ?? ""} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. Hall B" />
              </Field>
            </div>
          </>
        )}
        {modal === "exam" && (
          <>
            <div className="duga-form-grid">
              <Field label="Subject" required>
                <Select value={form.subjectId ?? ""} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                  <option value="">Select subject…</option>
                  {data.refs?.subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Class group" required>
                <Select value={form.classGroupId ?? ""} onChange={(e) => setForm({ ...form, classGroupId: e.target.value })}>
                  <option value="">Select class…</option>
                  {data.refs?.classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.level.name} {c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="duga-form-grid">
              <Field label="Date" required>
                <Input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Term">
                <Select value={form.termId ?? ""} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
                  <option value="">—</option>
                  {data.refs?.terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="duga-form-grid">
              <Field label="Start time">
                <Input type="time" value={form.startTime ?? "09:00"} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </Field>
              <Field label="End time">
                <Input type="time" value={form.endTime ?? "11:30"} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </Field>
            </div>
            <Field label="Venue">
              <Input value={form.venue ?? ""} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. Main Hall" />
            </Field>
          </>
        )}
        {modal === "import" && (
          <>
            <Alert tone="info">
              Columns: <strong>Level, Class, Day, Period, StartTime, EndTime, Subject, Teacher, Room, Term</strong> (Room and Term are optional).
              Day can be a name (Monday) or number (0=Sunday…6=Saturday). Level/Class/Subject/Teacher names must match this school&apos;s records exactly.
            </Alert>
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0" }}>
              <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>Download CSV template</Button>
            </div>
            <Field label="CSV file">
              <input type="file" accept=".csv,text/csv" onChange={(e) => onCsvFile(e.target.files?.[0])} />
            </Field>
            <Field label="Or paste CSV text" hint="Include the header row.">
              <textarea
                className="duga-textarea"
                rows={8}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={CSV_TEMPLATE}
                style={{ width: "100%", fontFamily: "monospace", fontSize: 12.5 }}
              />
            </Field>
            {importResult && (
              <div style={{ marginTop: 10 }}>
                <Alert tone={importResult.failed ? "warning" : "success"}>
                  {importResult.created} period(s) imported{importResult.failed ? `, ${importResult.failed} row(s) skipped` : ""}.
                </Alert>
                {importResult.failed > 0 && (
                  <div className="duga-table-wrap" style={{ marginTop: 8 }}>
                    <table className="duga-table">
                      <thead><tr><th>Row</th><th>Error</th></tr></thead>
                      <tbody>
                        {importResult.results.filter((r) => !r.ok).map((r) => (
                          <tr key={r.row}><td>{r.row}</td><td>{r.error}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <Button variant="ghost" onClick={() => setModal("")}>Close</Button>
              <Button onClick={importCsv} loading={importing} disabled={!csvText.trim()}>Import</Button>
            </div>
          </>
        )}
        {modal !== "import" && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <Button variant="ghost" onClick={() => { setModal(""); setEditId(null); setForm(emptyForm()); }}>Cancel</Button>
            <Button onClick={submit}>{editId ? "Save changes" : "Add"}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
