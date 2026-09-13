"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Card, Select, Alert, Spinner, EmptyState, Badge, Button, Modal, Field, Input, Textarea, Tabs, Table } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface ChunkTable {
  columns: string[];
  rows: string[][];
}

interface Chunk {
  id: string;
  schemeId: string;
  section: string;
  levelName: string | null;
  subjectName: string;
  term: string | null;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  tableJson: ChunkTable | null;
}

interface SchemeDoc {
  id: string;
  title: string;
  fileUrl: string | null;
  section: string;
}

interface BrowseResult {
  chunks: Chunk[];
  schemes: SchemeDoc[];
  canEdit: boolean;
}

interface SchemeRow {
  id: string;
  title: string;
  section: string;
  createdAt: string;
  fileUrl: string | null;
  coversSections: string[];
  _count: { chunks: number };
}

interface LevelGroup {
  level: string;
  chunks: Chunk[];
}
interface SubjectGroup {
  subject: string;
  levels: LevelGroup[];
}
interface SectionGroup {
  section: string;
  subjects: SubjectGroup[];
  schemeLinks: SchemeDoc[];
}

// A scheme document is naturally organized Subject -> Class -> Term (a
// subject taught across six classes used to show as six separate flat
// cards); this rebuilds that structure client-side from the flat chunk
// list, then groups the whole thing again by each chunk's real section
// (Pre-Primary/Primary/Junior/Senior) since one PDF can span more than one.
const SECTION_ORDER = ["Pre-Primary", "Primary", "Junior Secondary", "Senior Secondary"];
function buildGroups(chunks: Chunk[], schemes: SchemeDoc[]): SectionGroup[] {
  const bySection = new Map<string, Chunk[]>();
  for (const c of chunks) {
    if (!bySection.has(c.section)) bySection.set(c.section, []);
    bySection.get(c.section)!.push(c);
  }
  const sections = [...bySection.keys()].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return sections.map((section) => {
    const sectionChunks = bySection.get(section)!;
    const bySubject = new Map<string, Chunk[]>();
    for (const c of sectionChunks) {
      if (!bySubject.has(c.subjectName)) bySubject.set(c.subjectName, []);
      bySubject.get(c.subjectName)!.push(c);
    }
    const subjects = [...bySubject.keys()].sort().map((subject) => {
      const subjChunks = bySubject.get(subject)!;
      const byLevel = new Map<string, Chunk[]>();
      for (const c of subjChunks) {
        const key = c.levelName ?? "General";
        if (!byLevel.has(key)) byLevel.set(key, []);
        byLevel.get(key)!.push(c);
      }
      const levels = [...byLevel.keys()].sort().map((level) => ({ level, chunks: byLevel.get(level)! }));
      return { subject, levels };
    });
    const schemeIds = new Set(sectionChunks.map((c) => c.schemeId));
    const schemeLinks = schemes.filter((s) => schemeIds.has(s.id));
    return { section, subjects, schemeLinks };
  });
}

export default function CurriculumPage() {
  const { section: activeSection } = useSection();
  const [tab, setTab] = useState("browse");
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [editChunk, setEditChunk] = useState<Chunk | null>(null);
  const [editForm, setEditForm] = useState({ levelName: "", subjectName: "", term: "", text: "" });
  const [saving, setSaving] = useState(false);

  // Manage tab
  const { available: sections } = useSection();
  const [docs, setDocs] = useState<SchemeRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadSection, setUploadSection] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [sectionBusyId, setSectionBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Per-chunk formatted tables, layered on top of whatever browse() already
  // returned cached (tableJson) — keyed here too so a freshly-formatted
  // table shows immediately without waiting on a full reload. Triggered
  // automatically the first time a section is opened (see the <details>
  // onToggle below) rather than needing an extra click.
  const [tables, setTables] = useState<Record<string, ChunkTable>>({});
  const [formattingId, setFormattingId] = useState<string | null>(null);
  const [formatErrors, setFormatErrors] = useState<Record<string, string>>({});

  async function formatTable(chunkId: string) {
    setFormattingId(chunkId);
    setFormatErrors((e) => ({ ...e, [chunkId]: "" }));
    try {
      const d = await api<{ table: ChunkTable }>(`scheme/${chunkId}/formatTable`, { method: "POST", body: {} });
      setTables((t) => ({ ...t, [chunkId]: d.table }));
    } catch (e) {
      setFormatErrors((err) => ({ ...err, [chunkId]: (e as Error).message }));
    } finally {
      setFormattingId(null);
    }
  }

  useEffect(() => {
    setUploadSection((prev) => (prev && sections.includes(prev) ? prev : sections[0] ?? ""));
  }, [sections]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<BrowseResult>("scheme/browse");
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeSection]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const d = await api<{ items: SchemeRow[] }>("scheme");
      setDocs(d.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "manage" && data?.canEdit) loadDocs();
  }, [tab, data?.canEdit, loadDocs]);

  function openEdit(c: Chunk) {
    setEditChunk(c);
    setEditForm({ levelName: c.levelName ?? "", subjectName: c.subjectName, term: c.term ?? "", text: c.text });
  }

  async function saveEdit() {
    if (!editChunk) return;
    setSaving(true);
    try {
      await api(`scheme/${editChunk.id}/updateChunk`, { method: "POST", body: editForm });
      setEditChunk(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=scheme", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      const result = await api<{ chunks: number }>("scheme/ingest", {
        method: "POST",
        body: { url: json.data.url, title: uploadTitle || file.name, section: uploadSection },
      });
      setUploadMessage(`Uploaded — found ${result.chunks} curriculum section(s).`);
      setUploadTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await Promise.all([loadDocs(), load()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(id: string) {
    if (!confirm("Delete this scheme of work and everything the AI learned from it?")) return;
    try {
      await api(`scheme/${id}/delete`, { method: "POST", body: {} });
      await Promise.all([loadDocs(), load()]);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function fixSection(id: string, newSection: string) {
    setSectionBusyId(id);
    try {
      await api(`scheme/${id}/updateSection`, { method: "POST", body: { section: newSection } });
      await Promise.all([loadDocs(), load()]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSectionBusyId(null);
    }
  }

  const groups = data ? buildGroups(data.chunks, data.schemes) : [];
  const filteredGroups = subjectFilter.trim()
    ? groups
        .map((g) => ({ ...g, subjects: g.subjects.filter((s) => s.subject.toLowerCase().includes(subjectFilter.trim().toLowerCase())) }))
        .filter((g) => g.subjects.length > 0)
    : groups;

  return (
    <div>
      <PageHeader title="Curriculum" subtitle="The school's official scheme of work, as uploaded — the same content the AI lesson-note generator reads from." />
      {data?.canEdit && (
        <Tabs tabs={[{ id: "browse", label: "Browse" }, { id: "manage", label: "Manage documents" }]} value={tab} onChange={setTab} />
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {tab === "manage" && data?.canEdit ? (
        <div style={{ display: "grid", gap: 20 }}>
          <Card title="Upload a scheme of work">
            <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 14 }}>
              Upload a PDF (e.g. a NERDC-aligned scheme of work). It&apos;s parsed into per-subject, per-class, per-term sections, then automatically
              sorted into whichever of the school&apos;s sections each class actually belongs to — one document covering several sections (e.g.
              Pre-Primary through Primary) is split correctly without needing separate uploads.
            </div>
            {uploadMessage && <Alert tone="success">{uploadMessage}</Alert>}
            <div className="duga-form-grid">
              <Field label="Default section" required hint="Used only when a section within the document can't be matched to one of your class levels.">
                <Select value={uploadSection} onChange={(e) => setUploadSection(e.target.value)}>
                  {sections.length === 0 && <option value="">No sections configured</option>}
                  {sections.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Title (optional)">
                <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="e.g. NERDC Primary Scheme of Work 2026" />
              </Field>
            </div>
            <Field label="PDF file" hint="Up to 64MB.">
              <input ref={fileRef} type="file" accept="application/pdf" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
            </Field>
            {uploading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "var(--duga-muted)" }}>
                <Spinner size={16} /> Reading and parsing the document — large files can take a minute…
              </div>
            )}
          </Card>

          <Card title="Uploaded documents">
            {docsLoading ? (
              <Spinner size={24} />
            ) : docs.length === 0 ? (
              <EmptyState title="No scheme of work uploaded yet" hint="Upload one above." />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {docs.map((s) => (
                  <div key={s.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.title}</div>
                        <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 2 }}>
                          {s._count.chunks} section{s._count.chunks === 1 ? "" : "s"} · uploaded {new Date(s.createdAt).toLocaleDateString()}
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                          {s.coversSections.length > 0 ? (
                            s.coversSections.map((sec) => <Badge key={sec} tone="info">{sec}</Badge>)
                          ) : (
                            <Badge tone="neutral">{s.section}</Badge>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {s.fileUrl && (
                          <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">View PDF</a>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => removeDoc(s.id)}>Delete</Button>
                      </div>
                    </div>
                    {!sections.includes(s.section) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <span style={{ fontSize: 11.5, color: "var(--duga-danger, #c0392b)" }}>Default section &quot;{s.section}&quot; doesn&apos;t match a real section:</span>
                        <Select value="" disabled={sectionBusyId === s.id} onChange={(e) => e.target.value && fixSection(s.id, e.target.value)} style={{ maxWidth: 180 }}>
                          <option value="">Fix…</option>
                          {sections.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
                        </Select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : loading ? (
        <Spinner size={28} />
      ) : !data || data.schemes.length === 0 ? (
        <EmptyState title="No scheme of work uploaded yet for you" hint="An admin can upload one from the Manage documents tab." />
      ) : (
        <>
          <div style={{ marginBottom: 18, maxWidth: 320 }}>
            <Input value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} placeholder="Filter by subject…" />
          </div>
          {filteredGroups.length === 0 ? (
            <EmptyState title="Nothing matches this filter" hint="Try a different subject." />
          ) : (
            <div style={{ display: "grid", gap: 28 }}>
              {filteredGroups.map((g) => (
                <div key={g.section}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 17 }}>{g.section}</h2>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {g.schemeLinks.filter((s) => s.fileUrl).map((s) => (
                        <a key={s.id} href={s.fileUrl!} target="_blank" rel="noopener noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">
                          View original PDF{g.schemeLinks.length > 1 ? ` — ${s.title}` : ""}
                        </a>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 14 }}>
                    {g.subjects.map((sub) => (
                      <Card key={sub.subject} title={sub.subject}>
                        <div style={{ display: "grid", gap: 12 }}>
                          {sub.levels.map((lvl) => (
                            <div key={lvl.level}>
                              <Badge tone="info">{lvl.level}</Badge>
                              <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                                {lvl.chunks.map((c) => {
                                  const table = tables[c.id] ?? c.tableJson;
                                  const isFormatting = formattingId === c.id;
                                  const formatError = formatErrors[c.id];
                                  return (
                                    <Card key={c.id} style={{ background: "var(--duga-surface-2, #f8f9fb)" }}>
                                      <details
                                        onToggle={(e) => {
                                          if (e.currentTarget.open && !table && !isFormatting) formatTable(c.id);
                                        }}
                                      >
                                        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13.5 }}>
                                          {c.term ? `${c.term} Term` : "Term not specified"}
                                        </summary>
                                        {table ? (
                                          <Table headers={table.columns}>
                                            {table.rows.map((row, ri) => (
                                              <tr key={ri}>
                                                {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                                              </tr>
                                            ))}
                                          </Table>
                                        ) : isFormatting ? (
                                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--duga-muted)" }}>
                                            <Spinner size={16} /> Arranging as a table…
                                          </div>
                                        ) : (
                                          <>
                                            {formatError && <Alert tone="danger">{formatError}</Alert>}
                                            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, marginTop: 12, color: "var(--duga-ink-2)" }}>
                                              {c.text}
                                            </pre>
                                          </>
                                        )}
                                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                          {!table && !isFormatting && (
                                            <Button size="sm" variant="outline" onClick={() => formatTable(c.id)}>
                                              {formatError ? "Try again" : "Show as a table"}
                                            </Button>
                                          )}
                                          {data.canEdit && (
                                            <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit this section</Button>
                                          )}
                                        </div>
                                      </details>
                                    </Card>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={!!editChunk} onClose={() => setEditChunk(null)} title="Edit curriculum section" wide>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
            <Field label="Level"><Input value={editForm.levelName} onChange={(e) => setEditForm({ ...editForm, levelName: e.target.value })} placeholder="e.g. Primary 4" /></Field>
            <Field label="Subject" required><Input value={editForm.subjectName} onChange={(e) => setEditForm({ ...editForm, subjectName: e.target.value })} /></Field>
            <Field label="Term"><Input value={editForm.term} onChange={(e) => setEditForm({ ...editForm, term: e.target.value })} placeholder="e.g. FIRST" /></Field>
          </div>
          <Field label="Content" required>
            <Textarea rows={12} value={editForm.text} onChange={(e) => setEditForm({ ...editForm, text: e.target.value })} />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setEditChunk(null)}>Cancel</Button>
          <Button loading={saving} onClick={saveEdit}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
