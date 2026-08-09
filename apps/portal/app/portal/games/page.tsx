"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Button, Field, Input, Textarea, Select, Modal, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface GameProgressRow {
  id: string;
  plays: number;
  bestScore: number;
  rewardPoints: number;
  completed: boolean;
  lastPlayedAt: string | null;
}

interface GameItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  gameUrl: string | null;
  difficulty: string;
  rewardPoints: number;
  targetClassGroupIds: unknown;
  targetStudentIds: unknown;
  isPublished: boolean;
  assignedCount?: number;
  playedCount?: number;
  avgScore?: number;
  myProgress?: GameProgressRow[];
  teacher?: { user: { firstName: string; lastName: string } };
}

interface ApiList {
  role: string;
  mode?: string;
  items: GameItem[];
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

export default function GamesPage() {
  const [list, setList] = useState<ApiList | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selClassIds, setSelClassIds] = useState<string[]>([]);
  const [selStudentIds, setSelStudentIds] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [btn, setBtn] = useState<Record<string, boolean>>({});

  const isManager = list?.role === "manage";
  const studentsOfSelected = Object.values(rosters).flat();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, cs] = await Promise.all([
        api<ApiList>("games"),
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
      await api("games", {
        method: "POST",
        body: {
          title: form.title,
          description: form.description || undefined,
          category: form.category ?? "QUIZ",
          gameUrl: form.gameUrl || undefined,
          difficulty: form.difficulty ?? "MEDIUM",
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

  async function action(item: GameItem, act: "publish" | "unpublish" | "delete") {
    setBtn((b) => ({ ...b, [`${act}-${item.id}`]: true }));
    try {
      if (act === "delete") {
        if (!confirm(`Delete "${item.title}"?`)) return;
        await api(`games/${item.id}`, { method: "DELETE" });
      } else if (act === "publish") {
        await api(`games/${item.id}/publish`, { method: "POST" });
      } else if (act === "unpublish") {
        await api(`games/${item.id}/unpublish`, { method: "POST" });
      }
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBtn((b) => ({ ...b, [`${act}-${item.id}`]: false }));
    }
  }

  async function logScore(item: GameItem) {
    const score = Number(scores[item.id] ?? "");
    if (!score && score !== 0) return alert("Enter your score");
    setBtn((b) => ({ ...b, [`play-${item.id}`]: true }));
    try {
      await api(`games/${item.id}/play`, { method: "POST", body: { score } });
      setScores((s) => ({ ...s, [item.id]: "" }));
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBtn((b) => ({ ...b, [`play-${item.id}`]: false }));
    }
  }

  return (
    <div>
      <PageHeader
        title="Educational Games"
        subtitle={isManager ? "Create and assign fun educational games, then track scores and reward points." : "Play the games your teachers assign and earn reward points."}
        actions={isManager ? <Button onClick={() => { setForm({}); setOpen(true); }}><Icon name="plus" size={16} /> New game</Button> : undefined}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : !list || list.items.length === 0 ? (
        <EmptyState title="No games yet" hint={isManager ? "Create one using the New game button." : "Your teachers haven" + "t assigned you any games yet."} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
          {list.items.map((item) => {
            const prog = (item.myProgress ?? [])[0];
            return (
              <Card key={item.id} title={item.title}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <Badge tone="info">{item.category}</Badge>
                  <Badge tone="neutral">{item.difficulty}</Badge>
                  <Badge tone="accent">⭐ {item.rewardPoints} pts</Badge>
                  {isManager ? (
                    <>
                      <Badge tone={item.isPublished ? "success" : "neutral"}>{item.isPublished ? "Published" : "Draft"}</Badge>
                      <Badge tone="neutral">{item.assignedCount ?? 0} assigned · {item.playedCount ?? 0} played · avg {item.avgScore ?? 0}</Badge>
                    </>
                  ) : prog ? (
                    <Badge tone={prog.completed ? "success" : "warning"}>
                      {prog.plays} play(s) · best {prog.bestScore} · {prog.rewardPoints} pts
                    </Badge>
                  ) : null}
                </div>
                <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px" }}>{item.description ?? ""}</p>

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
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {item.gameUrl && (
                      <a href={item.gameUrl} target="_blank" rel="noreferrer" className="duga-btn duga-btn--accent duga-btn--sm">▶ Play</a>
                    )}
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Input type="number" placeholder="My score" style={{ width: 110 }} value={scores[item.id] ?? ""} onChange={(e) => setScores((s) => ({ ...s, [item.id]: e.target.value }))} />
                      <Button size="sm" variant="outline" loading={btn[`play-${item.id}`]} onClick={() => logScore(item)}>Submit score</Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {isManager && (
        <Modal open={open} onClose={() => setOpen(false)} title="Create educational game" wide>
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Title" required>
              <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Category">
                <Select value={form.category ?? "QUIZ"} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="QUIZ">Quiz</option>
                  <option value="MATH">Math game</option>
                  <option value="WORD">Word / spelling</option>
                  <option value="MEMORY">Memory</option>
                  <option value="PUZZLE">Puzzle</option>
                </Select>
              </Field>
              <Field label="Difficulty">
                <Select value={form.difficulty ?? "MEDIUM"} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </Select>
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Game link">
                <Input value={form.gameUrl ?? ""} onChange={(e) => setForm({ ...form, gameUrl: e.target.value })} placeholder="https://…" />
              </Field>
              <Field label="Reward points">
                <Input type="number" value={form.rewardPoints ?? ""} onChange={(e) => setForm({ ...form, rewardPoints: e.target.value })} placeholder="10" />
              </Field>
            </div>
            <Field label="Description">
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Assign to classes" hint="Choose one or more classes for this game.">
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
              <Field label="Also assign to specific students">
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
                <option value="1">Yes — assign now</option>
                <option value="0">No — save as draft</option>
              </Select>
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Create game</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}