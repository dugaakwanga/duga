"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ThemedGameEngine, ThemedResult, themeFor, formatClock, type EngineAnswer, type EngineOutcome, type EngineQuestion } from "@/components/GameEngines";

interface LoadResponse {
  alreadyPlayed: boolean;
  guestName?: string | null;
  secondsLeft?: number;
  score?: number | null;
  applyUrl?: string;
  loginPath?: string;
  game?: {
    id: string;
    title: string;
    kind: string;
    durationMinutes: number;
    questions: EngineQuestion[];
  };
}

// Public, unauthenticated: a friend of an enrolled student lands here from a
// signed "invite a friend" link — no portal account, one 10-minute trial.
export default function GameInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<{ score: number; outcome: EngineOutcome } | null>(null);
  const [applyUrl, setApplyUrl] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/game-invite/${token}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Could not load this invite");
        return json.data as LoadResponse;
      })
      .then((d) => {
        setData(d);
        if (d.applyUrl) setApplyUrl(d.applyUrl);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  async function finish(answers: EngineAnswer[], outcome: EngineOutcome) {
    try {
      const res = await fetch(`/api/public/game-invite/${token}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not submit your play");
      setResult({ score: json.data.score, outcome });
      if (json.data.applyUrl) setApplyUrl(json.data.applyUrl);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const wrap = (children: React.ReactNode) => (
    <div style={{ maxWidth: 560, margin: "40px auto 60px", padding: "0 16px" }}>{children}</div>
  );

  if (loading) return wrap(<p style={{ textAlign: "center", color: "var(--duga-muted)" }}>Loading…</p>);
  if (error) return wrap(<div style={{ padding: 16, borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontWeight: 700 }}>{error}</div>);
  if (!data) return null;

  const wall = (score: number | null | undefined) => (
    <div style={{ display: "grid", gap: 14, textAlign: "center", padding: 24, borderRadius: 16, background: "linear-gradient(135deg,#1e293b,#0f172a)" }}>
      <div style={{ fontSize: 34 }}>🎓</div>
      {score != null && (
        <div style={{ color: "#fff" }}>
          You scored <strong>{score}</strong>/100!
        </div>
      )}
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>Your free trial is over — loved it?</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {applyUrl && (
          <a href={applyUrl} className="duga-btn duga-btn--accent">
            Apply to enroll
          </a>
        )}
        <a href={data.loginPath || "/login"} className="duga-btn duga-btn--ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.5)" }}>
          Already a student? Log in
        </a>
      </div>
    </div>
  );

  if (data.alreadyPlayed) return wrap(wall(data.score));
  if (result) return wrap(<ThemedResult theme={themeFor(data.game?.kind ?? "classic")} outcome={result.outcome} score={result.score} actions={<div style={{ marginTop: 8 }}>{wall(result.score)}</div>} />);

  const game = data.game!;
  const theme = themeFor(game.kind);

  if (!started) {
    return wrap(
      <div style={{ display: "grid", gap: 14, textAlign: "center", padding: 24, borderRadius: 16, background: theme.bg }}>
        <div style={{ fontSize: 34 }}>{theme.emoji}</div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>{data.guestName ? `Hi ${data.guestName}! ` : ""}You've been invited to try {game.title}</div>
        <p style={{ color: "rgba(255,255,255,.9)", margin: 0 }}>{theme.tagline}</p>
        <p style={{ color: "rgba(255,255,255,.75)", fontSize: 12.5, margin: 0 }}>You have {formatClock(data.secondsLeft ?? game.durationMinutes * 60)} — this is a one-time trial.</p>
        <div>
          <button type="button" onClick={() => setStarted(true)} className="duga-btn duga-btn--accent">▶ Start playing</button>
        </div>
      </div>,
    );
  }

  return wrap(
    <ThemedGameEngine
      theme={theme}
      questions={game.questions}
      difficulty="MEDIUM"
      sessionExpiresAt={Date.now() + (data.secondsLeft ?? game.durationMinutes * 60) * 1000}
      onFinish={finish}
    />,
  );
}
