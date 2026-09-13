"use client";

import { useEffect, useRef, useState } from "react";
import { Card, PageHeader, Button, Badge, Alert, Spinner, Table, EmptyState, Field, Select, Input } from "@duga/ui";
import { api } from "@/lib/client/api";
import { useSection } from "@/components/SectionContext";

interface SchemeRow {
  id: string;
  title: string;
  section: string;
  createdAt: string;
  _count: { chunks: number };
}

export default function SchemeOfWorkPage() {
  const { available: sections } = useSection();
  const [items, setItems] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [section, setSection] = useState("");
  const [title, setTitle] = useState("");
  const [sectionBusyId, setSectionBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSection((prev) => (prev && sections.includes(prev) ? prev : sections[0] ?? ""));
  }, [sections]);

  async function load() {
    setLoading(true);
    try {
      const d = await api<{ items: SchemeRow[] }>("scheme");
      setItems(d.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?purpose=scheme", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      const result = await api<{ chunks: number }>("scheme/ingest", {
        method: "POST",
        body: { url: json.data.url, title: title || file.name, section },
      });
      setMessage(`Uploaded — found ${result.chunks} curriculum section(s).`);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this scheme of work and everything the AI learned from it?")) return;
    try {
      await api(`scheme/${id}/delete`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function fixSection(id: string, newSection: string) {
    setSectionBusyId(id);
    try {
      await api(`scheme/${id}/updateSection`, { method: "POST", body: { section: newSection } });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSectionBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Scheme of Work"
        subtitle="Upload the school's official curriculum documents so the AI assistant can draft lesson notes grounded in them."
      />

      <Card title="Upload a scheme of work" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13.5, color: "var(--duga-ink-2)", marginBottom: 14 }}>
          Upload a PDF (e.g. a NERDC-aligned scheme of work). It&apos;s parsed into per-subject, per-class, per-term sections — when a teacher asks the
          AI assistant to draft a lesson note, it looks up the matching section here first, so the note follows this document&apos;s actual topics
          instead of something generic.
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}
        <div className="duga-form-grid">
          <Field label="Section" required>
            <Select value={section} onChange={(e) => setSection(e.target.value)}>
              {sections.length === 0 && <option value="">No sections configured</option>}
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Title (optional)">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. NERDC Primary Scheme of Work 2026" />
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
        {loading ? (
          <Spinner size={24} />
        ) : items.length === 0 ? (
          <EmptyState title="No scheme of work uploaded yet" hint="Upload one above." />
        ) : (
          <Table headers={["Title", "Section", "Sections found", "Uploaded", ""]}>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>
                  {sections.includes(s.section) ? (
                    <Badge tone="info">{s.section}</Badge>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Badge tone="danger">{s.section}</Badge>
                      <span style={{ fontSize: 11.5, color: "var(--duga-muted)" }}>doesn&apos;t match a real section</span>
                    </div>
                  )}
                  <Select
                    value={sections.includes(s.section) ? s.section : ""}
                    disabled={sectionBusyId === s.id}
                    onChange={(e) => e.target.value && fixSection(s.id, e.target.value)}
                    style={{ marginTop: 4, maxWidth: 180 }}
                  >
                    <option value="">{sections.includes(s.section) ? "Change section…" : "Fix section…"}</option>
                    {sections.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
                  </Select>
                </td>
                <td>{s._count.chunks}</td>
                <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
