"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Field, Input, Select, Textarea, Button, Badge, Alert, Spinner, EmptyState } from "@duga/ui";
import { api } from "@/lib/client/api";

interface NewsItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  body: string[];
  coverUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
}

const CATEGORIES = ["Announcement", "Achievement", "Events", "Facilities", "Academic"];

const emptyForm = {
  id: "",
  title: "",
  category: "Announcement",
  excerpt: "",
  body: "",
  coverUrl: "",
  isPublished: true,
};

export default function NewsAdminPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api<{ items: NewsItem[] }>("news")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(item?: NewsItem) {
    if (!item) {
      setForm({ ...emptyForm });
      setEditing(false);
      return;
    }
    setForm({
      id: item.id,
      title: item.title,
      category: item.category,
      excerpt: item.excerpt,
      body: Array.isArray(item.body) ? item.body.join("\n\n") : "",
      coverUrl: item.coverUrl ?? "",
      isPublished: item.isPublished,
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = form.body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      const payload = {
        title: form.title,
        category: form.category,
        excerpt: form.excerpt,
        body,
        coverUrl: form.coverUrl || undefined,
        isPublished: form.isPublished,
      };
      if (editing) {
        await api(`news/${form.id}`, { method: "PATCH", body: payload });
      } else {
        await api("news", { method: "POST", body: payload });
      }
      startEdit();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save post");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(item: NewsItem) {
    try {
      await api(`news/${item.id}/${item.isPublished ? "unpublish" : "publish"}`, { method: "POST", body: {} });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this news post permanently?")) return;
    try {
      await api(`news/${id}`, { method: "DELETE" });
      if (form.id === id) startEdit();
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="News & announcements"
        subtitle="Write and publish news that appears on the public website news page."
        actions={
          <Button variant="outline" onClick={() => startEdit()}>
            {editing ? "Cancel editing" : "New post"}
          </Button>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {(editing || form.title) && (
        <Card title={editing ? "Edit post" : "New post"} style={{ marginBottom: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Title" required>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. BECE 2025 results are out" />
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Cover image URL (optional)">
            <Input value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} placeholder="/uploads/gallery/....jpg or full URL" />
          </Field>
          <Field label="Excerpt" hint="Short summary shown on cards.">
            <Textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} placeholder="A one or two sentence summary..." />
          </Field>
          <Field label="Body" hint="Separate paragraphs with a blank line.">
            <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={10} placeholder="Full story, one paragraph per block..." />
          </Field>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />
              Publish immediately
            </label>
          </div>
          <Button onClick={save} loading={saving} disabled={!form.title}>
            {editing ? "Save changes" : "Create post"}
          </Button>
        </Card>
      )}

      {loading ? (
        <Spinner size={28} />
      ) : items.length === 0 ? (
        <EmptyState title="No news yet" hint="Write your first announcement above — it will appear on the website news page." />
      ) : (
        items.map((item) => (
          <Card key={item.id} style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 16, color: "var(--duga-primary-ink)", margin: 0 }}>{item.title}</h3>
                <Badge tone={item.isPublished ? "success" : "neutral"}>{item.isPublished ? "Published" : "Draft"}</Badge>
                <Badge tone="accent">{item.category}</Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 4 }}>
                {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "Not yet published"} · /news/{item.slug}
              </div>
              <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "8px 0 0" }}>{item.excerpt}</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button size="sm" variant="outline" onClick={() => startEdit(item)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => togglePublish(item)}>{item.isPublished ? "Unpublish" : "Publish"}</Button>
              <Button size="sm" variant="danger" onClick={() => remove(item.id)}>Delete</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
