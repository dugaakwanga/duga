"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Card, Badge, Button, Select, Field, Input, Textarea, Modal, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  targetSection?: string | null;
  targetClassGroupId?: string | null;
  targetLevelId?: string | null;
  targetRole?: string | null;
  isPinned: boolean;
  createdAt: string;
  isRead: boolean;
  readCount?: number;
  author: { firstName: string; lastName: string; role: string };
}

interface LevelOption { id: string; name: string; section: string }
interface ClassOption { id: string; name: string; level: { id: string; name: string; section: string }; session: { name: string } }
interface Reader { id: string; readAt: string; user: { firstName: string; lastName: string; role: string } }

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner", ADMIN: "Admin", BURSAR: "Bursar", TEACHER: "Teacher", STUDENT: "Student", PARENT: "Parent",
};

function audienceLabel(a: Announcement): string {
  switch (a.audience) {
    case "EVERYONE": return "Everyone";
    case "SECTION": return `Section: ${a.targetSection ? a.targetSection.toLowerCase() : "—"}`;
    case "CLASS": return "Selected class";
    case "LEVEL": return "Selected level";
    case "ROLE": return `Role: ${a.targetRole ? ROLE_LABEL[a.targetRole] : "—"}`;
    default: return a.audience;
  }
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    audience: "EVERYONE",
    targetSection: "",
    targetClassGroupId: "",
    targetLevelId: "",
    targetRole: "STUDENT",
    isPinned: false,
  });

  // Detail / receipts
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receiptsFor, setReceiptsFor] = useState<Announcement | null>(null);
  const [receipts, setReceipts] = useState<{ reads: Reader[]; readCount: number; audienceSize: number } | null>(null);
  const [receiptsLoading, setReceiptsLoading] = useState(false);

  async function load() {
    const [d, roleData] = await Promise.all([
      api<{ items: Announcement[] }>("messages/announcements"),
      api<{ items: ClassOption[]; levels: LevelOption[]; role: string }>("classes").catch(() => null),
    ]);
    setItems(d.items);
    if (roleData) {
      setClasses(roleData.items);
      setLevels(roleData.levels);
      setRole(roleData.role);
    }
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setCanManage(role === "OWNER" || role === "ADMIN" || role === "BURSAR" || role === "TEACHER");
  }, [role]);

  const pinned = useMemo(() => items.filter((a) => a.isPinned), [items]);
  const rest = useMemo(() => items.filter((a) => !a.isPinned), [items]);
  const ordered = [...pinned, ...rest];

  async function toggleExpand(a: Announcement) {
    const next = expanded === a.id ? null : a.id;
    setExpanded(next);
    if (next && !a.isRead) {
      try {
        await api(`messages/${a.id}/markAnnouncementRead`, { method: "POST", body: {} });
        setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, isRead: true } : x)));
      } catch { /* non-fatal */ }
    }
  }

  async function submit() {
    if (!form.title.trim() || !form.body.trim()) return alert("Title and message are required");
    setComposing(true);
    try {
      const body: Record<string, unknown> = { title: form.title, body: form.body, audience: form.audience, isPinned: form.isPinned };
      if (form.audience === "SECTION") body.targetSection = form.targetSection;
      if (form.audience === "CLASS") body.targetClassGroupId = form.targetClassGroupId;
      if (form.audience === "LEVEL") body.targetLevelId = form.targetLevelId;
      if (form.audience === "ROLE") body.targetRole = form.targetRole;
      await api("messages/postAnnouncement", { method: "POST", body });
      setComposeOpen(false);
      setForm({ title: "", body: "", audience: "EVERYONE", targetSection: "", targetClassGroupId: "", targetLevelId: "", targetRole: "STUDENT", isPinned: false });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setComposing(false);
    }
  }

  async function openReceipts(a: Announcement) {
    setReceiptsFor(a);
    setReceiptsLoading(true);
    setReceipts(null);
    try {
      const d = await api<{ reads: Reader[]; readCount: number; audienceSize: number }>(`messages/${a.id}/announcementReads`, { method: "POST", body: {} });
      setReceipts(d);
    } catch (e) {
      alert((e as Error).message);
      setReceiptsFor(null);
    } finally {
      setReceiptsLoading(false);
    }
  }

  async function removeAnnouncement(a: Announcement) {
    if (!window.confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    try {
      await api(`messages/${a.id}/deleteAnnouncement`, { method: "POST", body: {} });
      setItems((prev) => prev.filter((x) => x.id !== a.id));
      if (expanded === a.id) setExpanded(null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const sectionLevels = levels.filter((l) => !form.targetSection || l.section === form.targetSection);

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="School-wide notices and updates."
        actions={canManage ? <Button onClick={() => setComposeOpen(true)}><Icon name="plus" size={14} /> New announcement</Button> : undefined}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : ordered.length === 0 ? (
        <EmptyState title="No announcements" hint={canManage ? "Post the first announcement to your school." : "Announcements for you will appear here."} />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {ordered.map((a) => (
            <Card key={a.id} pad={false}>
              <button
                onClick={() => toggleExpand(a)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", width: "100%",
                  textAlign: "left", background: "none", border: "none", cursor: "pointer",
                }}
              >
                <div style={{ marginTop: 4 }}>
                  <Icon name={a.isRead ? "check" : "notifications"} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{a.title}</strong>
                    {a.isPinned && <Badge tone="accent">pinned</Badge>}
                    <Badge tone="info">{audienceLabel(a)}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--duga-muted)", marginTop: 4 }}>
                    {a.author.firstName} {a.author.lastName} · {ROLE_LABEL[a.author.role] ?? a.author.role} · {new Date(a.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {canManage && a.readCount !== undefined && (
                    <Badge tone={a.readCount > 0 ? "success" : "neutral"}>{a.readCount} read</Badge>
                  )}
                  <Icon name="more" size={16} />
                </div>
              </button>
              {expanded === a.id && (
                <div style={{ borderTop: "1px solid var(--duga-border)", padding: "14px 16px 16px" }}>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>{a.body}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    {canManage && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openReceipts(a)}>Read receipts</Button>
                        <Button size="sm" variant="ghost" onClick={() => removeAnnouncement(a)}>Delete</Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Compose modal */}
      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="New announcement" wide>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Title" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mid-term break on Friday" />
          </Field>
          <Field label="Message" required>
            <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the announcement…" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Audience" required>
              <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                <option value="EVERYONE">Everyone</option>
                <option value="SECTION">Whole section</option>
                <option value="LEVEL">Whole level</option>
                <option value="CLASS">One class</option>
                <option value="ROLE">A role</option>
              </Select>
            </Field>
            {form.audience === "SECTION" && (
              <Field label="Section" required>
                <Select value={form.targetSection} onChange={(e) => setForm({ ...form, targetSection: e.target.value })}>
                  <option value="">Select…</option>
                  <option value="SECONDARY">Secondary</option>
                  <option value="PRIMARY">Primary</option>
                </Select>
              </Field>
            )}
            {form.audience === "LEVEL" && (
              <Field label="Level" required>
                <Select value={form.targetLevelId} onChange={(e) => setForm({ ...form, targetLevelId: e.target.value })}>
                  <option value="">Select…</option>
                  {sectionLevels.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} ({l.section.toLowerCase()})</option>
                  ))}
                </Select>
              </Field>
            )}
            {form.audience === "CLASS" && (
              <Field label="Class" required>
                <Select value={form.targetClassGroupId} onChange={(e) => setForm({ ...form, targetClassGroupId: e.target.value })}>
                  <option value="">Select…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.level.name} {c.name} ({c.session.name})</option>
                  ))}
                </Select>
              </Field>
            )}
            {form.audience === "ROLE" && (
              <Field label="Role" required>
                <Select value={form.targetRole} onChange={(e) => setForm({ ...form, targetRole: e.target.value })}>
                  <option value="STUDENT">Students</option>
                  <option value="PARENT">Parents</option>
                </Select>
              </Field>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
            <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} />
            Pin to the top of the announcements list
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button variant="ghost" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={composing}>Post announcement</Button>
          </div>
        </div>
      </Modal>

      {/* Read receipts modal */}
      <Modal open={!!receiptsFor} onClose={() => setReceiptsFor(null)} title={receiptsFor ? `Read receipts — ${receiptsFor.title}` : ""} wide>
        {receiptsLoading ? (
          <Spinner size={22} />
        ) : receipts ? (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <Badge tone="success">{receipts.readCount} read</Badge>
              <Badge tone="neutral">{receipts.audienceSize} in audience</Badge>
              <Badge tone={receipts.audienceSize ? (receipts.readCount / receipts.audienceSize >= 0.8 ? "success" : "warning") : "neutral"}>
                {receipts.audienceSize ? `${Math.round((receipts.readCount / receipts.audienceSize) * 100)}% reached` : "—"}
              </Badge>
            </div>
            {receipts.reads.length === 0 ? (
              <EmptyState title="No one has read it yet" hint="Reach shows after people open the announcement." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {receipts.reads.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 12px", background: "var(--duga-surface-2, #f7f9fc)", borderRadius: 8 }}>
                    <span style={{ fontWeight: 600 }}>{r.user.firstName} {r.user.lastName}</span>
                    <span style={{ fontSize: 12, color: "var(--duga-muted)" }}>
                      {ROLE_LABEL[r.user.role] ?? r.user.role} · {new Date(r.readAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState title="Could not load receipts" />
        )}
      </Modal>
    </div>
  );
}