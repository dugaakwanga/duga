"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Field, Input, Select, Button, Alert, Spinner, EmptyState, Badge } from "@duga/ui";
import { api } from "@/lib/client/api";

interface GalleryItem {
  id: string;
  title: string;
  category: string;
  url: string;
  alt: string | null;
  createdAt: string;
}

const CATEGORIES = ["Students", "Campus", "Facilities", "Events", "Hostel"];

export default function GalleryAdminPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Students");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ items: GalleryItem[] }>("gallery")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    if (!file) {
      alert("Choose an image first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      const url = json.data.url as string;

      await api("gallery", {
        method: "POST",
        body: { url, title: title || file.name, category, alt: title || file.name },
      });
      setTitle("");
      setFile(null);
      setPreview(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this photo from the website gallery?")) return;
    try {
      await api(`gallery/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Website gallery"
        subtitle="Photos shown on the public website gallery page. Upload, caption and organise images here."
      />
      {error && <Alert tone="danger">{error}</Alert>}

      <Card title="Upload a new photo" style={{ marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Photo title" hint="Shown as the caption on the website.">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning assembly" />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Image file" hint="JPG, PNG, WebP or GIF up to 8MB.">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
        </Field>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" style={{ width: 200, borderRadius: 12, marginTop: 8, border: "1px solid var(--duga-border)" }} />
        )}
        <div style={{ marginTop: 16 }}>
          <Button onClick={upload} loading={saving} disabled={!file}>
            Upload photo
          </Button>
        </div>
      </Card>

      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No photos yet" hint="Upload the first photo above — it will appear on the website gallery." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 }}>
          {items.map((g) => (
            <Card key={g.id} style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.url}
                alt={g.alt ?? g.title}
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, background: "var(--duga-surface)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--duga-primary-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</div>
                  <Badge tone="accent">{g.category}</Badge>
                </div>
                <Button size="sm" variant="danger" onClick={() => remove(g.id)}>Remove</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
