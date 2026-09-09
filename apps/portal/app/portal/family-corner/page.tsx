"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Alert, Spinner, EmptyState, Button, Modal, Field, Input, Select, Textarea, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

type Category = "RECIPES" | "PARENTING_TIPS" | "CHILD_HEALTH" | "STUDY_SUPPORT" | "FUN_ACTIVITIES";

interface ContentItem {
  id: string;
  category: Category;
  title: string;
  body: string;
  imageUrl: string | null;
  isPublished: boolean;
  createdAt: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  RECIPES: "Recipes",
  PARENTING_TIPS: "Parenting Tips",
  CHILD_HEALTH: "Child Health & Wellness",
  STUDY_SUPPORT: "Study Support",
  FUN_ACTIVITIES: "Fun & Activities",
};

const CATEGORY_ICON: Record<Category, string> = {
  RECIPES: "🍲",
  PARENTING_TIPS: "💛",
  CHILD_HEALTH: "🩺",
  STUDY_SUPPORT: "📚",
  FUN_ACTIVITIES: "🎨",
};

export default function FamilyCornerPage() {
  const [role, setRole] = useState("");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | "ALL">("ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [openItem, setOpenItem] = useState<ContentItem | null>(null);

  const isManager = role === "OWNER" || role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ role: string; items: ContentItem[] }>("familyCorner");
      setRole(d.role);
      setItems(d.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ category: "PARENTING_TIPS", isPublished: "true" });
    setOpen(true);
  }

  function openEdit(item: ContentItem) {
    setEditing(item);
    setForm({ category: item.category, title: item.title, body: item.body, imageUrl: item.imageUrl ?? "", isPublished: String(item.isPublished) });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const body = { ...form, isPublished: form.isPublished === "true" };
      if (editing) await api(`familyCorner/${editing.id}`, { method: "PATCH", body });
      else await api("familyCorner", { method: "POST", body });
      setOpen(false);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: ContentItem) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await api(`familyCorner/${item.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  const categories = Object.keys(CATEGORY_LABEL) as Category[];
  const filtered = activeCategory === "ALL" ? items : items.filter((i) => i.category === activeCategory);

  return (
    <div>
      <PageHeader
        title="Family Corner"
        subtitle={isManager ? "Recipes, parenting tips and more for families to enjoy — publish what parents see here." : "A little something for you — recipes, tips and ideas for your family."}
        actions={isManager ? <Button onClick={openCreate}><Icon name="plus" size={16} /> Add content</Button> : undefined}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <Button size="sm" variant={activeCategory === "ALL" ? "accent" : "outline"} onClick={() => setActiveCategory("ALL")}>All</Button>
        {categories.map((c) => (
          <Button key={c} size="sm" variant={activeCategory === c ? "accent" : "outline"} onClick={() => setActiveCategory(c)}>
            {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}
          </Button>
        ))}
      </div>

      {loading ? (
        <Spinner size={28} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing here yet" hint={isManager ? "Add the first piece of content with the button above." : "Check back soon — new content is added regularly."} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
          {filtered.map((item) => (
            <Card key={item.id} className="classes-card">
              {item.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.title} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8, marginBottom: 10 }} />
              )}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <Badge tone="accent">{CATEGORY_ICON[item.category]} {CATEGORY_LABEL[item.category]}</Badge>
                {isManager && !item.isPublished && <Badge tone="neutral">Draft</Badge>}
              </div>
              <strong style={{ fontSize: 15, lineHeight: 1.3, display: "block", marginBottom: 6 }}>{item.title}</strong>
              <p style={{ fontSize: 13, color: "var(--duga-muted)", margin: "0 0 10px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {item.body}
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" variant="outline" onClick={() => setOpenItem(item)}>Read more</Button>
                {isManager && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(item)}>Delete</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!openItem} onClose={() => setOpenItem(null)} title={openItem?.title ?? ""} wide>
        {openItem && (
          <>
            {openItem.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={openItem.imageUrl} alt={openItem.title} style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 8, marginBottom: 14 }} />
            )}
            <Badge tone="accent">{CATEGORY_ICON[openItem.category]} {CATEGORY_LABEL[openItem.category]}</Badge>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 14 }}>{openItem.body}</p>
          </>
        )}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit content" : "Add content"} wide>
        <Field label="Category" required>
          <Select value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Title" required>
          <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Image URL (optional)">
          <Input value={form.imageUrl ?? ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Content" required>
          <Textarea rows={10} value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={form.isPublished ?? "true"} onChange={(e) => setForm({ ...form, isPublished: e.target.value })}>
            <option value="true">Published — parents can see this</option>
            <option value="false">Draft — hidden from parents</option>
          </Select>
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
