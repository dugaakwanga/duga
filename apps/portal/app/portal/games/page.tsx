"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Button, Field, Input, Textarea, Select, Modal, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { FunGameLauncher, recommendedGameFor } from "@/components/FunGames";

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

interface LeaderboardRow {
  rank: number;
  studentId: string;
  name: string;
  className: string | null;
  section: string;
  games: number;
  totalScore: number;
  rewardPoints: number;
  plays: number;
  best: number;
}

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export default function GamesPage() {
  const [list, setList] = useState<ApiList | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GameItem | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selClassIds, setSelClassIds] = useState<string[]>([]);
  const [selStudentIds, setSelStudentIds] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [btn, setBtn] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<GameItem | null>(null);
  const [preview, setPreview] = useState(false);
  // Leaderboard modal
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardGame, setBoardGame] = useState("");
  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);

  const isManager = list?.role === "manage";
  const isParent = list?.role === "PARENT";
  const studentsOfSelected = Object.values(rosters).flat();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, cs] = await Promise.all([
        api<ApiList>("games"),
        api<ClassOption[]>("teacher/classes", { method: "POST" }).catch(() => []),
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

  async function openEdit(item: GameItem) {
    const classIds = Array.isArray(item.targetClassGroupIds) ? (item.targetClassGroupIds as string[]).filter(Boolean) : [];
    const studentIds = Array.isArray(item.targetStudentIds) ? (item.targetStudentIds as string[]).filter(Boolean) : [];
    loadRosterForClasses(classIds);
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description ?? "",
      category: item.category ?? "QUIZ",
      gameUrl: item.gameUrl ?? "",
      difficulty: item.difficulty ?? "MEDIUM",
      rewardPoints: item.rewardPoints != null ? String(item.rewardPoints) : "0",
      publish: item.isPublished ? "1" : "0",
    });
    setSelClassIds(classIds);
    setSelStudentIds(studentIds);
    setOpen(true);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!form.title) return alert("Enter a title");
    const classIds = selClassIds;
    const studentIds = selStudentIds;
    try {
      await api(`games/${editing.id}`, {
        method: "PATCH",
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
      setEditing(null);
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

  async function addLibrary() {
    try { const result = await api<{ created: number }>("games/seedLibrary", { method: "POST", body: {} }); alert(`${result.created} game template(s) added.`); load(); } catch (e) { alert((e as Error).message); }
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

  async function completeBuiltInGame(score: number) {
    if (!playing) return;
    if (preview) {
      setPlaying(null);
      setPreview(false);
      return;
    }
    setBtn((b) => ({ ...b, [`play-${playing.id}`]: true }));
    try {
      await api(`games/${playing.id}/play`, { method: "POST", body: { score } });
      setPlaying(null);
      load();
    } catch (e) {
      alert((e as Error).message);
      setPlaying(null);
    } finally {
      setBtn((b) => ({ ...b, [`play-${playing.id}`]: false }));
    }
  }

  async function openLeaderboard(gameId = "") {
    setBoardGame(gameId);
    setBoard(null);
    setBoardOpen(true);
    setBoardLoading(true);
    try {
      const res = await api<{ items: LeaderboardRow[] }>("games/leaderboard", { method: "POST", body: { gameId: gameId || undefined } });
      setBoard(res.items);
    } catch (e) {
      alert((e as Error).message);
      setBoardOpen(false);
    } finally {
      setBoardLoading(false);
    }
  }

  const leaderboardActions = (
    <div style={{ display: "flex", gap: 8 }}>
      <Button variant="outline" onClick={() => openLeaderboard()}><Icon name="trophy" size={16} /> Leaderboard</Button>
      {isManager && (
        <>
          <Button variant="outline" onClick={addLibrary}>Add 20 game templates</Button>
          <Button onClick={() => { setForm({}); setOpen(true); }}><Icon name="plus" size={16} /> New game</Button>
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Educational Games"
        subtitle={isManager ? "Create and assign fun educational games, then track scores and reward points." : isParent ? "Games assigned to your children. Parents can review them but do not play or earn rewards." : "Play the games your teachers assign and earn reward points."}
        actions={isManager ? leaderboardActions : <div style={{ display: "flex", gap: 8 }}><Button variant="outline" onClick={() => openLeaderboard()}><Icon name="trophy" size={16} /> Leaderboard</Button></div>}
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
                  {!isParent && <Badge tone="accent">⭐ {item.rewardPoints} pts</Badge>}
                  {isManager ? (
                    <>
                      <Badge tone={item.isPublished ? "success" : "neutral"}>{item.isPublished ? "Published" : "Draft"}</Badge>
                      <Badge tone="neutral">{item.assignedCount ?? 0} assigned · {item.playedCount ?? 0} played · avg {item.avgScore ?? 0}</Badge>
                    </>
                  ) : prog && !isParent ? (
                    <Badge tone={prog.completed ? "success" : "warning"}>
                      {prog.plays} play(s) · best {prog.bestScore} · {prog.rewardPoints} pts
                    </Badge>
                  ) : null}
                </div>
                <p style={{ fontSize: 13.5, color: "var(--duga-ink-2)", margin: "0 0 8px" }}>{item.description ?? ""}</p>

                {isManager ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="sm" variant="outline" onClick={() => { setPreview(true); setPlaying(item); }}>Preview play</Button>
                    <Button size="sm" variant="outline" onClick={() => openLeaderboard(item.id)}><Icon name="trophy" size={14} /> Board</Button>
                    {item.isPublished ? (
                      <Button size="sm" variant="ghost" loading={btn[`unpublish-${item.id}`]} onClick={() => action(item, "unpublish")}>Unpublish</Button>
                    ) : (
                      <Button size="sm" variant="accent" loading={btn[`publish-${item.id}`]} onClick={() => action(item, "publish")}>Publish & assign</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                    <Button size="sm" variant="danger" loading={btn[`delete-${item.id}`]} onClick={() => action(item, "delete")}>Delete</Button>
                  </div>
                ) : isParent ? (
                  <Badge tone="neutral">Assigned to your child</Badge>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Button size="sm" variant="accent" onClick={() => { setPlaying(item); }}>▶ Play a game</Button>
                    {item.gameUrl && (
                      <a href={item.gameUrl} target="_blank" rel="noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">Open linked game</a>
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
        <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? "Edit educational game" : "Create educational game"} wide>
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Title" required>
              <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div className="duga-form-grid">
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
            <div className="duga-form-grid">
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
            <Button variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={editing ? saveEdit : create}>{editing ? "Save changes" : "Create game"}</Button>
          </div>
        </Modal>
      )}

      <Modal open={boardOpen} onClose={() => setBoardOpen(false)} title="🏆 Leaderboard" wide>
        <div style={{ display: "grid", gap: 12 }}>
          {isManager && (
            <Field label="Game" hint="Filter the board to a single game.">
              <Select value={boardGame} onChange={(e) => openLeaderboard(e.target.value)}>
                <option value="">All games (overall)</option>
                {list?.items.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </Select>
            </Field>
          )}
          {boardLoading ? (
            <Spinner size={24} />
          ) : !board || board.length === 0 ? (
            <EmptyState title="No scores yet" hint="Scores appear here once students play an assigned game." />
          ) : (
            <table className="duga-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Games</th>
                  <th>Best</th>
                  <th>Total points</th>
                </tr>
              </thead>
              <tbody>
                {board.map((row) => (
                  <tr key={row.studentId}>
                    <td><strong>{RANK_MEDALS[row.rank - 1] ?? row.rank}</strong></td>
                    <td>{row.name}<div style={{ fontSize: 12, color: "var(--duga-muted)" }}>{row.section.toLowerCase()}</div></td>
                    <td>{row.className ?? "—"}</td>
                    <td>{row.games}</td>
                    <td>{row.best}</td>
                    <td>{row.rewardPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      <Modal open={!!playing} onClose={() => { setPlaying(null); setPreview(false); }} title={playing ? `${playing.title}${preview ? " — preview" : ""}` : "Play a game"} wide>
        {playing && (
          <FunGameLauncher
            key={`${playing.id}-${preview ? "preview" : "play"}`}
            initialKind={recommendedGameFor(playing.category, playing.id)}
            preview={preview}
            onFinish={completeBuiltInGame}
          />
        )}
      </Modal>
    </div>
  );
}
