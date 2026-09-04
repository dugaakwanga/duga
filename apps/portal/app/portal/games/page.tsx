"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Badge, Button, Field, Input, Textarea, Select, Modal, Alert, Spinner, EmptyState, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";
import { FunGameLauncher, recommendedGameFor } from "@/components/FunGames";
import { ThemedGameLauncher, THEMES, themeFor } from "@/components/GameEngines";

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
  kind: string;
  gameUrl: string | null;
  difficulty: string;
  rewardPoints: number;
  durationMinutes: number;
  validDays: number;
  validUntil: string | null;
  targetClassGroupIds: unknown;
  targetStudentIds: unknown;
  isPublished: boolean;
  assignedCount?: number;
  playedCount?: number;
  avgScore?: number;
  myProgress?: GameProgressRow[];
  teacher?: { user: { firstName: string; lastName: string } };
}

interface GameQuestionRow {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  order: number;
}

interface LiveSessionRow {
  id: string;
  startsAt: string;
  endsAt: string;
  _count: { participants: number };
}

interface InviteRow {
  id: string;
  guestName: string | null;
  guestEmail: string;
  status: string;
  score: number | null;
  createdAt: string;
}

interface GameDetail extends GameItem {
  questions: GameQuestionRow[];
  liveSessions: LiveSessionRow[];
  invites: InviteRow[];
}

interface QuestionDraft {
  question: string;
  options: string[];
  correctIndex: number;
  score: number;
}

const CSV_TEMPLATE = `question,optionA,optionB,optionC,optionD,correct,score
"What is the capital of Nigeria?","Lagos","Abuja","Kano","Ibadan",B,1
"7 + 5 = ?","10","11","12","13",C,1
`;

function downloadGameCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "game-questions-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Small, dependency-free CSV parser (quoted-field aware) — same shape as the
// CBT and admissions-test bulk imports.
function parseGameCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

const OPTION_LETTERS = ["A", "B", "C", "D"];

function parseGameQuestionsCsv(text: string): { questions: QuestionDraft[]; errors: string[] } {
  const rows = parseGameCsv(text);
  if (rows.length === 0) return { questions: [], errors: ["The file is empty."] };
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const looksLikeHeader = header[0] === "question";
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  const questions: QuestionDraft[] = [];
  const errors: string[] = [];
  dataRows.forEach((row, i) => {
    const lineNo = i + (looksLikeHeader ? 2 : 1);
    const [question, optA, optB, optC, optD, correctRaw, scoreRaw] = row.map((f) => f.trim());
    if (!question) { errors.push(`Row ${lineNo}: missing question text.`); return; }
    const options = [optA, optB, optC, optD].filter((o): o is string => !!o && o.length > 0);
    if (options.length < 2) { errors.push(`Row ${lineNo}: needs at least 2 non-empty options.`); return; }
    const letter = (correctRaw ?? "").toUpperCase();
    const correctIndex = OPTION_LETTERS.indexOf(letter);
    if (correctIndex < 0 || correctIndex >= options.length) {
      errors.push(`Row ${lineNo}: "correct" must be a letter (A-D) matching one of the filled-in options.`);
      return;
    }
    const score = Number(scoreRaw);
    questions.push({ question, options, correctIndex, score: Number.isFinite(score) && score > 0 ? score : 1 });
  });
  return { questions, errors };
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
  // Manage modal (questions + live sessions + invites), manager-only
  const [managing, setManaging] = useState<GameDetail | null>(null);
  const [manageLoading, setManageLoading] = useState(false);
  const [newQ, setNewQ] = useState<QuestionDraft>({ question: "", options: ["", "", "", ""], correctIndex: 0, score: 1 });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [liveForm, setLiveForm] = useState<{ startsAt: string; endsAt: string }>({ startsAt: "", endsAt: "" });
  const [saving, setSaving] = useState(false);
  // Student "invite a friend" modal
  const [inviteTarget, setInviteTarget] = useState<GameItem | null>(null);
  const [inviteForm, setInviteForm] = useState<{ guestName: string; guestEmail: string }>({ guestName: "", guestEmail: "" });
  const [inviteLink, setInviteLink] = useState<string>("");
  const [myInvites, setMyInvites] = useState<InviteRow[] | null>(null);
  const [invitesOpen, setInvitesOpen] = useState(false);

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
      const created = await api<GameItem>("games", {
        method: "POST",
        body: {
          title: form.title,
          description: form.description || undefined,
          category: form.category ?? "QUIZ",
          kind: form.kind ?? THEMES[0]!.key,
          gameUrl: form.gameUrl || undefined,
          difficulty: form.difficulty ?? "MEDIUM",
          rewardPoints: form.rewardPoints ? Number(form.rewardPoints) : 0,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : 15,
          validDays: form.validDays ? Number(form.validDays) : 7,
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
      // Themed games need a question bank before students can actually play
      // them — jump straight into managing questions instead of leaving the
      // teacher to hunt for the button.
      if (created.kind && created.kind !== "classic") await openManage(created);
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
      kind: item.kind ?? THEMES[0]!.key,
      gameUrl: item.gameUrl ?? "",
      difficulty: item.difficulty ?? "MEDIUM",
      rewardPoints: item.rewardPoints != null ? String(item.rewardPoints) : "0",
      durationMinutes: item.durationMinutes != null ? String(item.durationMinutes) : "15",
      validDays: item.validDays != null ? String(item.validDays) : "7",
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
          kind: form.kind ?? THEMES[0]!.key,
          gameUrl: form.gameUrl || undefined,
          difficulty: form.difficulty ?? "MEDIUM",
          rewardPoints: form.rewardPoints ? Number(form.rewardPoints) : 0,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : 15,
          validDays: form.validDays ? Number(form.validDays) : 7,
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

  // ThemedGameLauncher already submits the score itself (server-graded from
  // the answers array) before calling onFinish — this just closes the modal
  // and refreshes, unlike completeBuiltInGame which still owns the API call.
  function completeThemedGame() {
    setPlaying(null);
    setPreview(false);
    if (!preview) load();
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

  async function openManage(item: GameItem) {
    setManageLoading(true);
    try {
      const detail = await api<GameDetail>(`games/${item.id}`);
      setManaging(detail);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setManageLoading(false);
    }
  }

  async function refreshManaging() {
    if (!managing) return;
    const detail = await api<GameDetail>(`games/${managing.id}`);
    setManaging(detail);
  }

  async function addQuestion() {
    if (!managing) return;
    if (!newQ.question.trim() || newQ.options.filter((o) => o.trim()).length < 2) {
      return alert("A question and at least two options are required");
    }
    setSaving(true);
    try {
      await api(`games/${managing.id}/addQuestion`, {
        method: "POST",
        body: { question: newQ.question, options: newQ.options.filter((o) => o.trim()), correctIndex: newQ.correctIndex, score: newQ.score },
      });
      setNewQ({ question: "", options: ["", "", "", ""], correctIndex: 0, score: 1 });
      await refreshManaging();
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleImportQuestionsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !managing) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const { questions: imported, errors } = parseGameQuestionsCsv(String(reader.result ?? ""));
      setImportErrors(errors);
      if (imported.length === 0) return;
      setSaving(true);
      try {
        const d = await api<{ count: number }>(`games/${managing.id}/bulkAddQuestions`, { method: "POST", body: { questions: imported } });
        await refreshManaging();
        load();
        alert(`Imported ${d.count} question(s).${errors.length ? ` ${errors.length} row(s) skipped — see below.` : ""}`);
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setSaving(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function deleteQuestion(q: GameQuestionRow) {
    if (!managing || !confirm("Delete this question?")) return;
    try {
      await api(`games/${managing.id}/deleteQuestion`, { method: "POST", body: { questionId: q.id } });
      await refreshManaging();
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function scheduleLive() {
    if (!managing) return;
    if (!liveForm.startsAt || !liveForm.endsAt) return alert("Choose a start and end time");
    setSaving(true);
    try {
      await api(`games/${managing.id}/scheduleLiveSession`, { method: "POST", body: { startsAt: new Date(liveForm.startsAt).toISOString(), endsAt: new Date(liveForm.endsAt).toISOString() } });
      setLiveForm({ startsAt: "", endsAt: "" });
      await refreshManaging();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteLive(sessionId: string) {
    if (!confirm("Cancel this live session?")) return;
    try {
      await api("games/deleteLiveSession", { method: "POST", body: { sessionId } });
      await refreshManaging();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function openInvite(item: GameItem) {
    setInviteTarget(item);
    setInviteForm({ guestName: "", guestEmail: "" });
    setInviteLink("");
  }

  async function sendInvite() {
    if (!inviteTarget) return;
    if (!inviteForm.guestEmail.trim()) return alert("Enter your friend's email");
    setSaving(true);
    try {
      const res = await api<{ path: string }>(`games/${inviteTarget.id}/createInvite`, { method: "POST", body: inviteForm });
      setInviteLink(`${window.location.origin}${res.path}`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function openMyInvites() {
    setInvitesOpen(true);
    try {
      const res = await api<InviteRow[]>("games/myInvites");
      setMyInvites(res);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function copyInviteLink(invite: InviteRow) {
    try {
      const res = await api<{ path: string }>(`games/${invite.id}/resendInviteLink`, { method: "POST" });
      const url = `${window.location.origin}${res.path}`;
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      alert(`Link copied:\n${url}`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const leaderboardActions = (
    <div style={{ display: "flex", gap: 8 }}>
      <Button variant="outline" onClick={() => openLeaderboard()}><Icon name="trophy" size={16} /> Leaderboard</Button>
      {isManager && (
        <Button onClick={() => { setForm({ publish: "1" }); setOpen(true); }}><Icon name="plus" size={16} /> New game</Button>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Educational Games"
        subtitle={isManager ? "Create and assign fun educational games, then track scores and reward points." : isParent ? "Games assigned to your children. Parents can review them but do not play or earn rewards." : "Play the games your teachers assign and earn reward points."}
        actions={
          isManager ? (
            leaderboardActions
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              {!isParent && <Button variant="outline" onClick={openMyInvites}>My invites</Button>}
              <Button variant="outline" onClick={() => openLeaderboard()}><Icon name="trophy" size={16} /> Leaderboard</Button>
            </div>
          )
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <Spinner size={28} />
      ) : !list || list.items.length === 0 ? (
        <EmptyState title="No games yet" hint={isManager ? "Create one using the New game button." : "Your teachers haven" + "t assigned you any games yet."} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,280px),1fr))", gap: 16 }}>
          {list.items.map((item) => {
            const prog = (item.myProgress ?? [])[0];
            return (
              <Card key={item.id} title={item.title}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <Badge tone="info">{item.category}</Badge>
                  <Badge tone="neutral">{item.difficulty}</Badge>
                  {item.kind && item.kind !== "classic" && <Badge tone="accent">{themeFor(item.kind).emoji} {themeFor(item.kind).title}</Badge>}
                  {!isParent && <Badge tone="accent">⭐ {item.rewardPoints} pts</Badge>}
                  {isManager ? (
                    <>
                      <Badge tone={item.isPublished ? "success" : "neutral"}>{item.isPublished ? "Published" : "Draft"}</Badge>
                      <Badge tone="neutral">⏱ {item.durationMinutes} min · {item.validDays} day(s) valid</Badge>
                      {item.validUntil && new Date(item.validUntil).getTime() < Date.now() && (
                        <Badge tone="danger">Expired</Badge>
                      )}
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
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button size="sm" variant="outline" onClick={() => { setPreview(true); setPlaying(item); }}>Preview play</Button>
                    {item.kind && item.kind !== "classic" && (
                      <Button size="sm" variant="outline" loading={manageLoading} onClick={() => openManage(item)}>Questions & live</Button>
                    )}
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
                    <>
                      <Badge tone="neutral">⏱ {item.durationMinutes} min play</Badge>
                      {item.validUntil && new Date(item.validUntil).getTime() < Date.now() && <Badge tone="danger">Expired</Badge>}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Button size="sm" variant="accent" onClick={() => { setPlaying(item); }}>▶ Play a game</Button>
                    <Button size="sm" variant="outline" onClick={() => openInvite(item)}>👋 Invite a friend</Button>
                    {item.gameUrl && (
                      <a href={item.gameUrl} target="_blank" rel="noreferrer" className="duga-btn duga-btn--outline duga-btn--sm">Open linked game</a>
                    )}
                    {(!item.kind || item.kind === "classic") && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Input type="number" placeholder="My score" style={{ width: 110 }} value={scores[item.id] ?? ""} onChange={(e) => setScores((s) => ({ ...s, [item.id]: e.target.value }))} />
                        <Button size="sm" variant="outline" loading={btn[`play-${item.id}`]} onClick={() => logScore(item)}>Submit score</Button>
                      </div>
                    )}
                    </div>
                    </>
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
            <Field label="Game style" hint="Students answer real questions to survive/win — pick which game they play it through.">
              <Select value={form.kind ?? THEMES[0]!.key} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {THEMES.map((t) => (
                  <option key={t.key} value={t.key}>{t.title}</option>
                ))}
              </Select>
            </Field>
            {form.kind && (
              <Alert tone="info">{themeFor(form.kind).tagline}</Alert>
            )}
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
              <Field label="Play duration (minutes)" hint="How long a student may play in one session.">
                <Input type="number" min={1} value={form.durationMinutes ?? ""} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} placeholder="15" />
              </Field>
              <Field label="Valid for (days)" hint="How many days the game stays available after publishing.">
                <Input type="number" min={1} value={form.validDays ?? ""} onChange={(e) => setForm({ ...form, validDays: e.target.value })} placeholder="7" />
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
        {playing && playing.kind && playing.kind !== "classic" ? (
          <ThemedGameLauncher
            key={`${playing.id}-${preview ? "preview" : "play"}`}
            gameId={playing.id}
            preview={preview}
            onFinish={completeThemedGame}
          />
        ) : playing ? (
          <FunGameLauncher
            key={`${playing.id}-${preview ? "preview" : "play"}`}
            initialKind={recommendedGameFor(playing.category, playing.id)}
            durationMinutes={preview ? undefined : playing.durationMinutes}
            preview={preview}
            onFinish={completeBuiltInGame}
          />
        ) : null}
      </Modal>

      {/* Manage modal (manager only): questions bank, CSV import, live sessions */}
      <Modal open={!!managing} onClose={() => setManaging(null)} title={managing ? `Manage — ${managing.title}` : ""} wide>
        {managing && (
          <div style={{ display: "grid", gap: 20 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <strong>Questions ({managing.questions.length})</strong>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button size="sm" variant="ghost" onClick={downloadGameCsvTemplate}><Icon name="reports" size={14} /> Download CSV template</Button>
                  <label className="duga-btn duga-btn--sm duga-btn--outline" style={{ cursor: "pointer" }}>
                    <Icon name="plus" size={14} /> Import CSV
                    <input type="file" accept=".csv,text/csv" onChange={handleImportQuestionsFile} style={{ display: "none" }} />
                  </label>
                </div>
              </div>
              {importErrors.length > 0 && (
                <Alert tone="warning">
                  {importErrors.length} row(s) in the CSV couldn&apos;t be imported and were skipped:
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {importErrors.slice(0, 8).map((err, i) => <li key={i} style={{ fontSize: 12.5 }}>{err}</li>)}
                    {importErrors.length > 8 && <li style={{ fontSize: 12.5 }}>…and {importErrors.length - 8} more.</li>}
                  </ul>
                </Alert>
              )}
              {managing.questions.length === 0 ? (
                <p style={{ color: "var(--duga-muted)", fontSize: 13.5 }}>No questions yet — add one below or import a CSV. Students can&apos;t play until at least one question is added.</p>
              ) : (
                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                  {managing.questions.map((q, qi) => (
                    <div key={q.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{qi + 1}. {q.question}</div>
                        <Button size="sm" variant="ghost" onClick={() => deleteQuestion(q)}>Delete</Button>
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 12.5 }}>
                        {q.options.map((o, oi) => (
                          <span key={oi} style={{ color: oi === q.correctIndex ? "var(--duga-success,#1a7f37)" : "var(--duga-muted)", fontWeight: oi === q.correctIndex ? 700 : 400 }}>
                            {oi === q.correctIndex ? "✓ " : ""}{o}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ border: "1px dashed var(--duga-border)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
                <Field label="New question">
                  <Textarea rows={2} value={newQ.question} onChange={(e) => setNewQ({ ...newQ, question: e.target.value })} />
                </Field>
                {newQ.options.map((opt, oi) => (
                  <div key={oi} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Input
                      placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      value={opt}
                      onChange={(e) => {
                        const options = [...newQ.options];
                        options[oi] = e.target.value;
                        setNewQ({ ...newQ, options });
                      }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, whiteSpace: "nowrap" }}>
                      <input type="radio" checked={newQ.correctIndex === oi} onChange={() => setNewQ({ ...newQ, correctIndex: oi })} /> Correct
                    </label>
                  </div>
                ))}
                <Button size="sm" onClick={addQuestion} loading={saving}>Add question</Button>
              </div>
            </div>

            <div>
              <strong>Live sessions</strong>
              <p style={{ fontSize: 12.5, color: "var(--duga-muted)", margin: "4px 0 10px" }}>
                Students who open this game during a scheduled window see each other&apos;s live score. Outside any window, they just play solo.
              </p>
              {managing.liveSessions.length > 0 && (
                <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  {managing.liveSessions.map((s) => {
                    const isNow = new Date(s.startsAt).getTime() <= Date.now() && Date.now() <= new Date(s.endsAt).getTime();
                    return (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, border: "1px solid var(--duga-border)", borderRadius: 8, padding: "6px 10px" }}>
                        <span>{new Date(s.startsAt).toLocaleString()} → {new Date(s.endsAt).toLocaleTimeString()} {isNow && <Badge tone="success">Live now</Badge>} · {s._count.participants} joined</span>
                        <Button size="sm" variant="ghost" onClick={() => deleteLive(s.id)}>Cancel</Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="duga-form-grid">
                <Field label="Starts">
                  <Input type="datetime-local" value={liveForm.startsAt} onChange={(e) => setLiveForm({ ...liveForm, startsAt: e.target.value })} />
                </Field>
                <Field label="Ends">
                  <Input type="datetime-local" value={liveForm.endsAt} onChange={(e) => setLiveForm({ ...liveForm, endsAt: e.target.value })} />
                </Field>
              </div>
              <Button size="sm" variant="outline" onClick={scheduleLive} loading={saving}>Schedule live session</Button>
            </div>

            <div>
              <strong>Student invites ({managing.invites.length})</strong>
              {managing.invites.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--duga-muted)", marginTop: 6 }}>No students have invited a friend to this game yet.</p>
              ) : (
                <table className="duga-table" style={{ marginTop: 8 }}>
                  <thead><tr><th>Guest</th><th>Status</th><th>Score</th></tr></thead>
                  <tbody>
                    {managing.invites.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.guestName || inv.guestEmail}</td>
                        <td><Badge tone={inv.status === "PLAYED" ? "success" : "neutral"}>{inv.status}</Badge></td>
                        <td>{inv.score ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Student "invite a friend" modal */}
      <Modal open={!!inviteTarget} onClose={() => setInviteTarget(null)} title={inviteTarget ? `Invite a friend — ${inviteTarget.title}` : ""}>
        {inviteTarget && (
          <div style={{ display: "grid", gap: 12 }}>
            {inviteLink ? (
              <>
                <Alert tone="success">Invite created! Share this link — your friend gets one 10-minute trial, no account needed.</Alert>
                <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
                <Button onClick={() => { navigator.clipboard?.writeText(inviteLink).catch(() => undefined); }}>Copy link</Button>
              </>
            ) : (
              <>
                <Field label="Friend's name">
                  <Input value={inviteForm.guestName} onChange={(e) => setInviteForm({ ...inviteForm, guestName: e.target.value })} placeholder="Optional" />
                </Field>
                <Field label="Friend's email" required>
                  <Input type="email" value={inviteForm.guestEmail} onChange={(e) => setInviteForm({ ...inviteForm, guestEmail: e.target.value })} placeholder="friend@example.com" />
                </Field>
                <Alert tone="info">Your friend gets one free 10-minute trial of this game — no portal account needed. Each person can only be invited once.</Alert>
                <Button onClick={sendInvite} loading={saving}>Send invite</Button>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Student's own sent invites */}
      <Modal open={invitesOpen} onClose={() => setInvitesOpen(false)} title="My invites">
        {!myInvites ? (
          <Spinner size={22} />
        ) : myInvites.length === 0 ? (
          <EmptyState title="No invites sent yet" hint="Use “Invite a friend” on any game you're playing." />
        ) : (
          <table className="duga-table">
            <thead><tr><th>Guest</th><th>Status</th><th>Score</th><th></th></tr></thead>
            <tbody>
              {myInvites.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.guestName || inv.guestEmail}</td>
                  <td><Badge tone={inv.status === "PLAYED" ? "success" : "neutral"}>{inv.status}</Badge></td>
                  <td>{inv.score ?? "—"}</td>
                  <td>{inv.status !== "PLAYED" && <Button size="sm" variant="ghost" onClick={() => copyInviteLink(inv)}>Copy link</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
