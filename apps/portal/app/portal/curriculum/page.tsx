"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Select, Alert, Spinner, EmptyState, Badge, Button, Modal, Field, Input, Textarea } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface Chunk {
  id: string;
  schemeId: string;
  levelName: string | null;
  subjectName: string;
  term: string | null;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
}

interface SchemeDoc {
  id: string;
  title: string;
  fileUrl: string | null;
  section: string;
}

interface BrowseResult {
  chunks: Chunk[];
  levels: string[];
  subjects: string[];
  schemes: SchemeDoc[];
  canEdit: boolean;
}

export default function CurriculumPage() {
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelName, setLevelName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [editChunk, setEditChunk] = useState<Chunk | null>(null);
  const [editForm, setEditForm] = useState({ levelName: "", subjectName: "", term: "", text: "" });
  const [saving, setSaving] = useState(false);
  const { section } = useSection();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<BrowseResult>("scheme/browse", { query: { levelName: levelName || undefined, subjectName: subjectName || undefined } });
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelName, subjectName, section]);

  useEffect(() => {
    load();
  }, [load]);

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

  // Group by the source document so each PDF's own link/title only shows
  // once, with the sections extracted from it nested underneath — this is
  // also what naturally keeps everything grouped by section, since each
  // uploaded scheme belongs to exactly one section.
  const bySchemeId = new Map<string, Chunk[]>();
  for (const c of data?.chunks ?? []) {
    if (!bySchemeId.has(c.schemeId)) bySchemeId.set(c.schemeId, []);
    bySchemeId.get(c.schemeId)!.push(c);
  }
  const groups = (data?.schemes ?? [])
    .map((s) => ({ scheme: s, chunks: bySchemeId.get(s.id) ?? [] }))
    .filter((g) => g.chunks.length > 0);

  return (
    <div>
      <PageHeader title="Curriculum" subtitle="The school's official scheme of work, as uploaded — the same content the AI lesson-note generator reads from." />
      {error && <Alert tone="danger">{error}</Alert>}

      {!loading && data && data.schemes.length === 0 ? (
        <EmptyState title="No scheme of work uploaded yet for you" hint="An admin can upload one in Settings → Scheme of Work." />
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <Select value={levelName} onChange={(e) => setLevelName(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">All levels</option>
              {data?.levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
            <Select value={subjectName} onChange={(e) => setSubjectName(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">All subjects</option>
              {data?.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>

          {loading ? (
            <Spinner size={28} />
          ) : groups.length === 0 ? (
            <EmptyState title="Nothing matches this filter" hint="Try a different level or subject." />
          ) : (
            <div style={{ display: "grid", gap: 24 }}>
              {groups.map((g) => (
                <div key={g.scheme.id}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: 15 }}>{g.scheme.title}</h3>
                      <Badge tone="neutral">{g.scheme.section}</Badge>
                    </div>
                    {g.scheme.fileUrl && (
                      <a href={g.scheme.fileUrl} target="_blank" rel="noopener noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">
                        View original PDF
                      </a>
                    )}
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {g.chunks.map((c) => (
                      <Card key={c.id}>
                        <details>
                          <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontWeight: 700, fontSize: 14 }}>
                            {c.subjectName}
                            {c.levelName && <Badge tone="info">{c.levelName}</Badge>}
                            {c.term && <Badge tone="neutral">{c.term} TERM</Badge>}
                          </summary>
                          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, marginTop: 12, color: "var(--duga-ink-2)" }}>
                            {c.text}
                          </pre>
                          {data?.canEdit && (
                            <div style={{ marginTop: 10 }}>
                              <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit this section</Button>
                            </div>
                          )}
                        </details>
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
