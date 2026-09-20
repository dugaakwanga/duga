"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Card, Select, Alert, Spinner, EmptyState, Badge, Button, Field, Input } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Level {
  name: string;
  section: string;
}

interface TextbookRow {
  id: string;
  title: string;
  subjectName: string;
  levelName: string;
  section: string;
  fileUrl: string;
  createdAt: string;
  _count: { chunks: number };
}

interface ListResult {
  items: TextbookRow[];
  levels: Level[];
  subjects: string[];
}

export default function TextbooksPage() {
  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadSubject, setUploadSubject] = useState("");
  const [uploadLevel, setUploadLevel] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<ListResult>("textbooks");
      setData(d);
      setUploadSubject((prev) => (prev && d.subjects.includes(prev) ? prev : d.subjects[0] ?? ""));
      setUploadLevel((prev) => (prev && d.levels.some((l) => l.name === prev) ? prev : d.levels[0]?.name ?? ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!uploadSubject || !uploadLevel) return alert("Choose a subject and a class first");
    const level = data?.levels.find((l) => l.name === uploadLevel);
    if (!level) return alert("Choose a valid class");
    setUploading(true);
    setError(null);
    setUploadMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=textbook", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      const result = await api<{ chunks: number }>("textbooks/ingest", {
        method: "POST",
        body: {
          url: json.data.url,
          title: uploadTitle || file.name,
          subjectName: uploadSubject,
          levelName: uploadLevel,
          section: level.section,
        },
      });
      setUploadMessage(`Uploaded — read and embedded ${result.chunks} section(s). The AI will now ground lesson notes for ${uploadSubject} (${uploadLevel}) in this book.`);
      setUploadTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeTextbook(id: string) {
    if (!confirm("Delete this textbook and everything the AI learned from it?")) return;
    try {
      await api(`textbooks/${id}/delete`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Textbooks"
        subtitle="Upload the school's own textbooks so the AI lesson-note generator matches their actual content, depth and worked examples — not just general knowledge of the topic."
      />
      {error && <Alert tone="danger">{error}</Alert>}

      <div style={{ display: "grid", gap: 20 }}>
        <Card title="Upload a textbook">
          <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 14 }}>
            Upload a PDF (e.g. a Mathematics Association of Nigeria text). Tag it with the subject and class it&apos;s for — a textbook doesn&apos;t
            reliably state that itself the way a scheme of work does, so this is picked here rather than guessed from the file.
          </div>
          {uploadMessage && <Alert tone="success">{uploadMessage}</Alert>}
          {loading ? (
            <Spinner size={24} />
          ) : !data || data.subjects.length === 0 || data.levels.length === 0 ? (
            <Alert tone="info">Add subjects and classes first (Classes page) before uploading a textbook.</Alert>
          ) : (
            <>
              <div className="duga-form-grid">
                <Field label="Subject" required>
                  <Select value={uploadSubject} onChange={(e) => setUploadSubject(e.target.value)}>
                    {data.subjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Class" required>
                  <Select value={uploadLevel} onChange={(e) => setUploadLevel(e.target.value)}>
                    {data.levels.map((l) => (
                      <option key={l.name} value={l.name}>{l.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Title (optional)">
                  <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="e.g. MAN Mathematics for Primary 4" />
                </Field>
              </div>
              <Field label="PDF file" hint="Up to 64MB. Reading, chunking and embedding a full textbook can take a minute or two.">
                <input ref={fileRef} type="file" accept="application/pdf" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
              </Field>
              {uploading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "var(--duga-muted)" }}>
                  <Spinner size={16} /> Reading, chunking and embedding the textbook — please don&apos;t close this page…
                </div>
              )}
            </>
          )}
        </Card>

        <Card title="Uploaded textbooks">
          {loading ? (
            <Spinner size={24} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState title="No textbooks uploaded yet" hint="Upload one above." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {data.items.map((t) => (
                <div key={t.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{t.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 2 }}>
                        {t._count.chunks} section{t._count.chunks === 1 ? "" : "s"} · uploaded {new Date(t.createdAt).toLocaleDateString()}
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                        <Badge tone="info">{t.subjectName}</Badge>
                        <Badge tone="neutral">{t.levelName}</Badge>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <a href={t.fileUrl} target="_blank" rel="noopener noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">View PDF</a>
                      <Button variant="ghost" size="sm" onClick={() => removeTextbook(t.id)}>Delete</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
