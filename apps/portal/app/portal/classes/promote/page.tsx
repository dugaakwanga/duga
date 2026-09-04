"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader, Badge, Alert, Spinner, Button, Field, Select, Input, Icon } from "@duga/ui";
import { api } from "@/lib/client/api";

interface Level { id: string; name: string; section: string; order: number }
interface Session { id: string; name: string }
interface PlanStudent { id: string; name: string; admissionNumber: string }
interface PlanClass {
  id: string;
  name: string;
  levelId: string;
  levelName: string;
  order: number;
  section: string;
  students: PlanStudent[];
  nextLevelId: string | null;
  nextLevelName: string | null;
  suggestedTargetClassGroupId: string | null;
  suggestedTargetName: string;
  topLevel: boolean;
}
interface PlanResponse {
  fromSession: { id: string; name: string };
  toSession: { id: string; name: string };
  classes: PlanClass[];
}

interface RowState {
  targetLevelId: string;
  targetClassName: string;
  repeatClassName: string;
  repeatIds: Set<string>;
}

export default function PromoteStudentsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fromSessionId, setFromSessionId] = useState("");
  const [toSessionId, setToSessionId] = useState("");
  const [building, setBuilding] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ studentsMoved: number; studentsSkipped: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ sessions: Session[]; levels: Level[]; role: string }>("classes");
        setSessions(d.sessions);
        setLevels(d.levels);
        setRole(d.role);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isAdmin = role === "OWNER" || role === "ADMIN";
  const totalStudents = useMemo(() => plan?.classes.reduce((sum, c) => sum + c.students.length, 0) ?? 0, [plan]);

  async function buildPlan() {
    if (!fromSessionId || !toSessionId) return;
    setBuilding(true);
    setError(null);
    setResult(null);
    try {
      const p = await api<PlanResponse>("promotion/plan", { method: "POST", body: { fromSessionId, toSessionId } });
      setPlan(p);
      const initial: Record<string, RowState> = {};
      for (const cls of p.classes) {
        initial[cls.id] = {
          targetLevelId: cls.nextLevelId ?? cls.levelId,
          targetClassName: cls.suggestedTargetName,
          repeatClassName: cls.name,
          repeatIds: new Set(),
        };
      }
      setRows(initial);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  function toggleRepeat(classId: string, studentId: string) {
    setRows((prev) => {
      const row = prev[classId];
      if (!row) return prev;
      const next = new Set(row.repeatIds);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return { ...prev, [classId]: { ...row, repeatIds: next } };
    });
  }

  function updateRow(classId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [classId]: { ...prev[classId]!, ...patch } }));
  }

  async function apply() {
    if (!plan) return;
    const moves: { targetLevelId: string; targetClassName: string; studentIds: string[] }[] = [];
    for (const cls of plan.classes) {
      const row = rows[cls.id];
      if (!row) continue;
      const repeatIds = [...row.repeatIds];
      const promoteIds = cls.students.map((s) => s.id).filter((id) => !row.repeatIds.has(id));
      if (repeatIds.length) {
        moves.push({ targetLevelId: cls.levelId, targetClassName: row.repeatClassName.trim() || cls.name, studentIds: repeatIds });
      }
      if (promoteIds.length && !cls.topLevel) {
        moves.push({ targetLevelId: row.targetLevelId, targetClassName: row.targetClassName.trim() || cls.name, studentIds: promoteIds });
      }
    }
    if (moves.length === 0) {
      alert("Nothing to apply — every class is either empty or top-level with no repeats marked.");
      return;
    }
    if (!confirm(`Move ${moves.reduce((n, m) => n + m.studentIds.length, 0)} student record(s) into ${plan.toSession.name}? This can be reviewed afterwards but is not a one-click undo.`)) return;
    setApplying(true);
    setError(null);
    try {
      const res = await api<{ studentsMoved: number; studentsSkipped: number }>("promotion/apply", {
        method: "POST",
        body: { toSessionId: plan.toSession.id, moves },
      });
      setResult(res);
      setPlan(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  if (!loading && !isAdmin) {
    return (
      <div>
        <PageHeader title="Promote students" />
        <Alert tone="danger">Only the proprietor or school admin can promote students.</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Promote students"
        subtitle="Move a session's students up to the next class. Nothing is applied until you review and confirm below."
        actions={<Button variant="ghost" onClick={() => router.push("/portal/classes")}><Icon name="back" size={14} /> Back to Classes</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {result && (
        <Alert tone="success">
          Done — {result.studentsMoved} student(s) moved into {plan?.toSession.name ?? "the new session"}.
          {result.studentsSkipped > 0 ? ` (${result.studentsSkipped} skipped — already moved or no longer active.)` : ""}
        </Alert>
      )}
      {loading ? (
        <Spinner size={28} />
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          <Card title="1. Choose sessions">
            {sessions.length < 2 && <Alert tone="warning">You need at least two sessions (the current one and the one to promote into) — add one under Classes → Sessions first.</Alert>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="From session (current)" required>
                <Select value={fromSessionId} onChange={(e) => { setFromSessionId(e.target.value); setPlan(null); }}>
                  <option value="">Select…</option>
                  {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="To session (new)" required>
                <Select value={toSessionId} onChange={(e) => { setToSessionId(e.target.value); setPlan(null); }}>
                  <option value="">Select…</option>
                  {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Button onClick={buildPlan} loading={building} disabled={!fromSessionId || !toSessionId || fromSessionId === toSessionId}>
                Build promotion plan
              </Button>
            </div>
          </Card>

          {plan && (
            <Card title={`2. Review — ${plan.fromSession.name} → ${plan.toSession.name}`}>
              <div style={{ fontSize: 13, color: "var(--duga-muted)", marginBottom: 14 }}>
                {totalStudents} student(s) across {plan.classes.length} class(es). Nothing has been changed yet — adjust the targets below, mark any repeats, then apply.
              </div>
              <div style={{ display: "grid", gap: 14 }}>
                {plan.classes.map((cls) => {
                  const row = rows[cls.id];
                  if (!row) return null;
                  const sectionLevels = levels.filter((l) => l.section === cls.section).sort((a, b) => a.order - b.order);
                  return (
                    <div key={cls.id} style={{ border: "1px solid var(--duga-border)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                          {cls.levelName} {cls.name} <span style={{ fontWeight: 500, color: "var(--duga-muted)" }}>({cls.students.length} students)</span>
                        </div>
                        {cls.topLevel ? (
                          <Badge tone="warning">Top level — no next class</Badge>
                        ) : (
                          <Badge tone="accent">→ {cls.nextLevelName}</Badge>
                        )}
                      </div>

                      {cls.topLevel ? (
                        <Alert tone="warning">
                          This is the highest level in {cls.section}. There&apos;s no automatic next class — students here will keep their current class assignment unless marked to repeat below. Handle graduating students separately.
                        </Alert>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                          <Field label="Promote to level">
                            <Select value={row.targetLevelId} onChange={(e) => updateRow(cls.id, { targetLevelId: e.target.value })}>
                              {sectionLevels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </Select>
                          </Field>
                          <Field label="Class name in new session">
                            <Input value={row.targetClassName} onChange={(e) => updateRow(cls.id, { targetClassName: e.target.value })} />
                          </Field>
                        </div>
                      )}

                      {row.repeatIds.size > 0 && (
                        <Field label={`Repeat class name (for ${row.repeatIds.size} marked below)`}>
                          <Input value={row.repeatClassName} onChange={(e) => updateRow(cls.id, { repeatClassName: e.target.value })} style={{ maxWidth: 220 }} />
                        </Field>
                      )}

                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--duga-muted)" }}>
                          Students ({cls.students.length}) — tick to mark as repeating this level
                        </summary>
                        <div style={{ display: "grid", gap: 4, marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
                          {cls.students.map((s) => (
                            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                              <input type="checkbox" checked={row.repeatIds.has(s.id)} onChange={() => toggleRepeat(cls.id, s.id)} />
                              <span>{s.name}</span>
                              <span style={{ color: "var(--duga-muted)" }}>{s.admissionNumber}</span>
                              {row.repeatIds.has(s.id) && <Badge tone="neutral">Repeats</Badge>}
                            </label>
                          ))}
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                <Button variant="accent" onClick={apply} loading={applying}>Apply promotion</Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
