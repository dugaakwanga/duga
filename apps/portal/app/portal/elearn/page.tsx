"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Button, Field, Input, Textarea, Select, Modal, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface ProgressRow {
  id: string;
  status: string;
  pointsEarned: number;
  completedAt: string | null;
}

interface ContentItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  url: string | null;
  body: string | null;
  rewardPoints: number;
  targetClassGroupIds: unknown;
  targetStudentIds: unknown;
  isPublished: boolean;
  completedCount?: number;
  assignedCount?: number;
  totalReward?: number;
  myProgress?: ProgressRow[];
  teacher?: { user: { firstName: string; lastName: string } };
}

interface ApiList {
  role: string;
  mode?: string;
  items: ContentItem[];
}

interface ClassOption {
  id: string;
  name: string;
  level: { name: string };
  _count: { students: number };
}

interface RosterStudent {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}

export default function ElearnPage() {
  const [list, setList] = useState<ApiList | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selClassIds, setSelClassIds] = useState<string[]>([]);
  const [selStudentIds, setSelStudentIds] = useState<string[]>([]);
  const [btn, setBtn] = useState<Record<string, boolean>>({});

  const isManager = list?.role === "manage";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, cs] = await Promise.all([
        api<ApiList>("elearn"),
        api<ClassOption[]>("teacher/classes", { method: "POST" }),
      ]);
      setList(data);
      setClasses(cs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadRosterForClasses(idList: string[]) {
    const next: Record<string, RosterStudent[]> = { ...rosters };
    for (const cid of idList) {
      if (!next[cid]) {
        try {
          const res = await api<{ roster: RosterStudent[] }>("teacher/roster", { method: "POST", body: { classGroupId: cid } });
          next[cid] = res.roster;
        } catch {
          next[cid] = [];
        }
      }
    }
    setRosters(next);
  }

  async function create() {
    if (!form.title) return alert("Enter a title");
    const classIds = selClassIds;
    const studentIds = selStudentIds;
    if (classIds.length === 0 && studentIds.length === 0) return alert("Assign to at least one class or student");
    try {
      await api("elearn", {
        method: "POST",
        body: {
          title: form.title,
          description: form.description || undefined,
          category: form.category ?? "VIDEO",
          url: form.url || undefined,
          body: form.body || undefined,
          rewardPoints: form.rewardPoints ? Number(form.rewardPoints) : 0,
          targetClassGroupIds: classIds,
          targetStudentIds: studentIds,
          isPublished: form.publish === "1",
        },
      });
      setOpen(false);
      setForm({});
      setSelClassIds([]);
      setSelStudentIds([]);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function action(item: ContentItem, act: "publish" | "unpublish" | "delete" | "start" | "complete") {
    setBtn((b) => ({ ...b, [`${act}-${item.id}`]: true }));
    try {
      if (act === "delete") {
        if (!confirm(`Delete "${item.title}"?`)) return;
        await api(`elearn/${item.id}`, { method: "DELETE" });
      } else if (act === "publish") {
        await api(`elearn/${item.id}/publish`, { method: "POST" });
      } else if (act === "unpublish") {
        await api(`elearn/${item.id}/unpublish`, { method: "POST" });
      } else if (act === "start") {
        await api(`elearn/${item.id}/start`, { method: "POST" });
      } else if (act === "complete") {
        await api(`elearn/${item.id}/complete`, { method: "POST" });
      }
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBtn((b) => ({ ...b, [`${act}-${item.id}`]: false }));
    }
  }

  const studentsOfSelected = Object.values(rosters).flat();

  return (
    <div>
      <PageHeader
        title="Online Learning & Rewards"
        subtitle={isManager ? "Assign learning content to classes or students and track reward points." : "Earn reward points by completing the content your teachers assign you."}
        actions={isManager ? <Button onClick={() => { setForm({}); setOpen(true); }}><Icon name="plus" size={16} /> New content</Button> : undefined}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : !list || list.items.length === 0 ? (
        <EmptyState title="No learning content" hint={isManager ? "Assign new content using the New content button." : "Your teachers haven" + "t assigned you any content yet."} />
      ) : (
        <>
          {!isManager && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>My reward points</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: "var(--duga-accent)" }}>
                  {list.items.reduce((acc, c) => acc + (c.totalReward ?? 0), 0)} ⭐
                </span>
              </div>
            </Card>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
            {list.items.map((item) => {
              const prog = (item.myProgress ?? [])[0];
              return (
                <Card key={item.id} title={item.title}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    <Badge tone="info">{item.category}</Badge>
                    <Badge tone="accent">⭐ {item.rewardPoints} pts</Badge>
                    {isManager ? (
                      <>
                        <Badge tone={item.isPublished ? "success" : "neutral"}>{item.isPublished ? "Published" : "Draft"}</Badge>
                        <Badge tone="neutral">{item.assignedCount ?? 0} assigned · {item.completedCount ?? 0} done</Badge>
                      </>
                    ) : prog ? (
                      <Badge tone={prog.status === "COMPLETED" ? "success" : prog.status === "STARTED" ? "warning" : "neutral"}>
                        {prog.status === "COMPLETED" ? `Done · ${prog.pointsEarned} pts` : prog.status}
                      </Badge>
                    ) : null}
                  </div>
                  <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px" }}>{item.description ?? item.body ?? ""}</p>
                  {item.body && item.body !== item.description && <div style={{ fontSize: 13, color: "var(--duga-ink-2)", whiteSpace: "pre-wrap", marginBottom: 8 }}>{item.body}</div>}

                  {isManager ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      {item.isPublished ? (
                        <Button size="sm" variant="ghost" loading={btn[`unpublish-${item.id}`]} onClick={() => action(item, "unpublish")}>Unpublish</Button>
                      ) : (
                        <Button size="sm" variant="accent" loading={btn[`publish-${item.id}`]} onClick={() => action(item, "publish")}>Publish & assign</Button>
                      )}
                      <Button size="sm" variant="danger" loading={btn[`delete-${item.id}`]} onClick={() => action(item, "delete")}>Delete</Button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">Open content</a>
                      )}
                      {prog?.status === "COMPLETED" ? (
                        <Badge tone="success">Completed</Badge>
                      ) : (
                        <>
                          {prog?.status !== "STARTED" && (
                            <Button size="sm" variant="outline" loading={btn[`start-${item.id}`]} onClick={() => action(item, "start")}>Start</Button>
                          )}
                          <Button size="sm" variant="accent" loading={btn[`complete-${item.id}`]} onClick={() => action(item, "complete")}>
                            {prog?.status === "STARTED" ? "Mark complete" : "Complete"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {isManager && (
        <Modal open={open} onClose={() => setOpen(false)} title="Assign online content" wide>
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Title" required>
              <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Category">
                <Select value={form.category ?? "VIDEO"} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="VIDEO">Video</option>
                  <option value="ARTICLE">Article / reading</option>
                  <option value="LINK">Website link</option>
                  <option value="PDF">PDF / worksheet</option>
                  <option value="EXERCISE">Exercise</option>
                  <option value="REWARD">Reward</option>
                </Select>
              </Field>
              <Field label="Reward points">
                <Input type="number" value={form.rewardPoints ?? ""} onChange={(e) => setForm({ ...form, rewardPoints: e.target.value })} placeholder="10" />
              </Field>
            </div>
            <Field label="Link (optional)">
              <Input value={form.url ?? ""} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="Instructions">
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Assign to classes" hint="Choose one or more classes the content is for.">
              <Select
                multiple
                value={selClassIds}
                onChange={(e) => {
                  const ids = Array.from(e.target.selectedOptions, (o) => o.value);
                  setSelClassIds(ids);
                  loadRosterForClasses(ids);
                }}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.level.name} {c.name} ({c._count.students})</option>
                ))}
              </Select>
            </Field>
            {studentsOfSelected.length > 0 && (
              <Field label="Also assign to specific students" hint="Optional — pick extra individual students.">
                <Select
                  multiple
                  value={selStudentIds}
                  onChange={(e) => setSelStudentIds(Array.from(e.target.selectedOptions, (o) => o.value))}
                >
                  {studentsOfSelected.map((s) => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.admissionNumber})</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Publish immediately">
              <Select value={form.publish ?? "1"} onChange={(e) => setForm({ ...form, publish: e.target.value })}>
                <option value="1">Yes — assign and notify students</option>
                <option value="0">No — save as draft</option>
              </Select>
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Assign content</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}