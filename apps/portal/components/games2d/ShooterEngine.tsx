"use client";

// A real top-down horde-shooter, adapted to the DUGA question model:
//   • The defender at the bottom auto-fires at the nearest enemy in the
//     advancing horde; every shot spends one bullet.
//   • When bullets run out, combat freezes and a RELOAD panel shows up to
//     3 questions on a per-question countdown ("limited time that counts").
//     Each correct answer refills BULLETS_PER_ANSWER bullets; wrong/timeout
//     gives none — so the number you answer decides how much you reload.
//   • Score is enemies defeated (shown live). The official leaderboard score
//     is still graded server-side from the submitted answers, like every
//     other themed game, so it can't be spoofed from the client.
//   • Lose if the horde overruns the base (HP hits 0); win when the question
//     bank is exhausted and you're still standing.
//
// All game rules live in the pure `shooterSim` module so they can be tested
// headlessly; this component only drives it per rAF frame and renders it.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  QuestionPrompt,
  questionSecondsFor,
  type EngineProps,
  type EngineAnswer,
  type EngineOutcome,
} from "../GameEngines";
import {
  createShooterState,
  stepShooter,
  BASE_HP,
  START_AMMO,
  BULLETS_PER_ANSWER,
  QUESTIONS_PER_RELOAD,
  ENEMY_RADIUS,
  PLAYER_Y_FRAC,
  BASE_LINE_FRAC,
  type ShooterState,
} from "./shooterSim";

export function ShooterEngine({ theme, questions, difficulty, sessionExpiresAt, onProgress, onFinish }: EngineProps) {
  const total = questions.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const qSeconds = questionSecondsFor(difficulty);

  const [hud, setHud] = useState({ ammo: START_AMMO, kills: 0, hp: BASE_HP });
  const [phase, setPhase] = useState<"fight" | "reload" | "over">("fight");
  const [flash, setFlash] = useState<"reload" | "breach" | null>(null);
  const [reloadIdx, setReloadIdx] = useState(0);
  const [batchTick, setBatchTick] = useState(0);
  const reloadBatchRef = useRef<number[]>([]);

  // Real CC0 top-down sprites (Kenney) loaded once and drawn rotated to face
  // the right way — player up-field, zombies down toward the base.
  const spritesRef = useRef<{ player: HTMLImageElement; zombieA: HTMLImageElement; zombieB: HTMLImageElement } | null>(null);
  useEffect(() => {
    const mk = (src: string) => {
      const img = new Image();
      img.src = src;
      return img;
    };
    spritesRef.current = {
      player: mk("/games/shooter/player.png"),
      zombieA: mk("/games/shooter/zombie_a.png"),
      zombieB: mk("/games/shooter/zombie_b.png"),
    };
  }, []);

  const simRef = useRef<ShooterState>(createShooterState());
  const questionsUsedRef = useRef(0);
  const answersRef = useRef<EngineAnswer[]>([]);
  const correctRef = useRef(0);
  const overRef = useRef(false);
  const hudAccRef = useRef(0);

  const enemyColor = theme.vehicleColor ?? "#ef4444";
  const spawnEveryMs = difficulty === "hard" ? 900 : difficulty === "easy" ? 1500 : 1150;
  const enemySpeed = difficulty === "hard" ? 26 : difficulty === "easy" ? 16 : 20;

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finish = useCallback((outcome: EngineOutcome) => {
    if (overRef.current) return;
    overRef.current = true;
    simRef.current.phase = "over";
    setPhase("over");
    onFinishRef.current(answersRef.current, outcome, correctRef.current);
  }, []);

  const beginReload = useCallback(() => {
    // No questions left → no reload is possible. Spawning has already stopped
    // (set when the last batch was answered), so the loop resolves this into a
    // win (field cleared) or a loss (overrun) on its own — nothing to do here.
    if (questionsUsedRef.current >= total) return;
    const start = questionsUsedRef.current;
    const batch: number[] = [];
    for (let i = start; i < Math.min(start + QUESTIONS_PER_RELOAD, total); i++) batch.push(i);
    reloadBatchRef.current = batch;
    questionsUsedRef.current = start + batch.length;
    simRef.current.phase = "reload";
    setReloadIdx(0);
    setBatchTick((t) => t + 1);
    setPhase("reload");
    setFlash("reload");
    window.setTimeout(() => setFlash(null), 700);
  }, [total]);

  const onReloadAnswer = useCallback(
    (selectedIndex: number) => {
      const batch = reloadBatchRef.current;
      const localIdx = reloadIdx;
      const qIdx = batch[localIdx];
      if (qIdx === undefined) return;
      const q = questions[qIdx]!;
      answersRef.current.push({ questionId: q.id, selectedIndex });
      if (selectedIndex === q.correctIndex) {
        correctRef.current += 1;
        simRef.current.ammo += BULLETS_PER_ANSWER;
      }
      if (localIdx + 1 < batch.length) {
        setReloadIdx(localIdx + 1);
      } else {
        simRef.current.phase = "fight";
        setPhase("fight");
        // Bank exhausted → stop spawning; the player now clears whatever is
        // left on the field (win) with the ammo they just earned, or gets
        // overrun (lose) if they answered too little to reload.
        if (questionsUsedRef.current >= total) simRef.current.spawnStopped = true;
      }
    },
    [reloadIdx, questions, total],
  );

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const t = window.setTimeout(() => finish("timeup"), Math.max(0, sessionExpiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [sessionExpiresAt, finish]);

  const beginReloadRef = useRef(beginReload);
  beginReloadRef.current = beginReload;
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (total === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let last = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const c = canvasRef.current;
      const wrap = wrapRef.current;
      if (!c || !wrap) return;
      const w = wrap.clientWidth;
      const h = Math.round(w * 0.72);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const cx = c.getContext("2d");
      if (cx) cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const c = canvasRef.current;
      const cx = c?.getContext("2d");
      if (!c || !cx) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const w = c.clientWidth;
      const h = c.clientHeight;
      const s = simRef.current;

      const res = stepShooter(s, dt, now, { w, h }, { spawnEveryMs, enemySpeed, enemyColor });
      if (res.overrun) finishRef.current("lost");
      else if (res.cleared) finishRef.current("won");
      else if (res.emptied) beginReloadRef.current();

      hudAccRef.current += dt;
      if (hudAccRef.current > 0.2) {
        hudAccRef.current = 0;
        setHud({ ammo: s.ammo, kills: s.kills, hp: s.hp });
        onProgressRef.current?.({ correct: correctRef.current, answered: answersRef.current.length, gaugeOrStep: s.kills });
      }

      draw(cx, w, h, s, enemyColor, spritesRef.current);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  function fireManual() {
    // A tap just nudges the fire cooldown so the next frame fires immediately.
    simRef.current.lastFireMs = 0;
  }

  if (total === 0) {
    return <div style={{ padding: 20, textAlign: "center", color: "#fff", background: theme.bg, borderRadius: 16, fontWeight: 700 }}>This game has no questions yet.</div>;
  }

  const currentBatchQ = phase === "reload" ? questions[reloadBatchRef.current[reloadIdx] ?? -1] : null;
  const ammoMax = START_AMMO + BULLETS_PER_ANSWER * QUESTIONS_PER_RELOAD;
  const ammoPct = Math.max(0, Math.min(100, (hud.ammo / ammoMax) * 100));

  return (
    <div style={{ display: "grid", gap: 10, padding: 16, borderRadius: 16, background: theme.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>
        <span>Defeated: {hud.kills}</span>
        <span style={{ display: "flex", gap: 3 }}>
          {Array.from({ length: BASE_HP }, (_, i) => (
            <span key={i} style={{ opacity: i < hud.hp ? 1 : 0.25 }}>♥</span>
          ))}
        </span>
      </div>

      <div ref={wrapRef} style={{ position: "relative", borderRadius: 14, overflow: "hidden", lineHeight: 0 }}>
        <canvas ref={canvasRef} onPointerDown={fireManual} style={{ width: "100%", display: "block", touchAction: "manipulation", cursor: "crosshair" }} />
        {flash && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ background: flash === "breach" ? "rgba(220,38,38,.85)" : "rgba(17,24,39,.8)", color: "#fff", fontWeight: 900, fontSize: 18, padding: "8px 18px", borderRadius: 999 }}>
              {flash === "breach" ? "BASE HIT!" : "RELOAD!"}
            </span>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
          <span>Ammo</span>
          <span>{hud.ammo} bullets</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.25)", overflow: "hidden" }}>
          <div style={{ width: `${ammoPct}%`, height: "100%", background: hud.ammo <= 0 ? "#ef4444" : "#fde047", transition: "width .15s ease" }} />
        </div>
      </div>

      {phase === "reload" && currentBatchQ ? (
        <div style={{ display: "grid", gap: 8 }} key={`${batchTick}-${reloadIdx}`}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 12.5, textAlign: "center" }}>
            RELOAD — answer fast! Each correct answer = {BULLETS_PER_ANSWER} bullets ({reloadIdx + 1} of {reloadBatchRef.current.length})
          </div>
          <QuestionPrompt key={currentBatchQ.id} q={currentBatchQ} seconds={qSeconds} onAnswer={onReloadAnswer} />
        </div>
      ) : phase === "fight" ? (
        <div style={{ textAlign: "center", color: "#fff", fontSize: 12.5, opacity: 0.9 }}>
          Auto-firing at the horde — tap the field to fire faster. Bullets refill by answering when you run dry.
        </div>
      ) : null}
    </div>
  );
}

type Sprites = { player: HTMLImageElement; zombieA: HTMLImageElement; zombieB: HTMLImageElement } | null;

// --- rendering (reads sim state, never mutates it) ---
function draw(cx: CanvasRenderingContext2D, w: number, h: number, s: ShooterState, enemyColor: string, sprites: Sprites) {
  const px = w / 2;
  const py = h * PLAYER_Y_FRAC;
  const baseLine = h * BASE_LINE_FRAC;
  const shake = s.shake;
  s.shake *= 0.82;

  cx.save();
  if (shake > 0.3) cx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  cx.fillStyle = "#2f7d4f";
  cx.fillRect(0, 0, w, h);
  cx.fillStyle = "#3a8f5c";
  for (let i = 0; i < h; i += 26) cx.fillRect(0, i, w, 13);
  cx.fillStyle = "#c9b184";
  cx.fillRect(w * 0.32, 0, w * 0.36, h);
  cx.fillStyle = "#bda574";
  cx.fillRect(w * 0.32, 0, 6, h);
  cx.fillRect(w * 0.68 - 6, 0, 6, h);

  cx.strokeStyle = "rgba(255,255,255,.35)";
  cx.setLineDash([10, 8]);
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(0, baseLine);
  cx.lineTo(w, baseLine);
  cx.stroke();
  cx.setLineDash([]);

  const spritesReady = !!sprites && sprites.player.complete && sprites.zombieA.complete && sprites.zombieB.complete && sprites.zombieA.naturalWidth > 0;

  for (const e of s.enemies) {
    cx.save();
    cx.translate(e.x, e.y);
    // ground shadow
    cx.fillStyle = "rgba(0,0,0,.22)";
    cx.beginPath();
    cx.ellipse(0, ENEMY_RADIUS - 2, ENEMY_RADIUS * 0.85, ENEMY_RADIUS * 0.35, 0, 0, Math.PI * 2);
    cx.fill();
    if (spritesReady && sprites) {
      // zombies shuffle down toward the base: face down (+90°) with a small
      // two-frame walk + sway from the wobble the sim already tracks.
      const frameImg = Math.floor(e.wobble / 0.35) % 2 === 0 ? sprites.zombieA : sprites.zombieB;
      const sway = Math.sin(e.wobble) * 0.12;
      cx.rotate(Math.PI / 2 + sway);
      const eh = ENEMY_RADIUS * 2.5;
      const ew = (frameImg.naturalWidth / frameImg.naturalHeight) * eh;
      cx.drawImage(frameImg, -ew / 2, -eh / 2, ew, eh);
      if (e.hitFlash > 0) {
        cx.globalCompositeOperation = "source-atop";
        cx.fillStyle = "rgba(255,255,255,0.8)";
        cx.fillRect(-ew / 2, -eh / 2, ew, eh);
        cx.globalCompositeOperation = "source-over";
      }
    } else {
      cx.fillStyle = e.hitFlash > 0 ? "#fff" : enemyColor;
      cx.beginPath();
      cx.arc(0, 0, ENEMY_RADIUS, 0, Math.PI * 2);
      cx.fill();
    }
    cx.restore();
  }

  cx.strokeStyle = "#fde047";
  cx.lineWidth = 3;
  cx.lineCap = "round";
  for (const b of s.bullets) {
    const d = Math.hypot(b.vx, b.vy) || 1;
    cx.beginPath();
    cx.moveTo(b.x, b.y);
    cx.lineTo(b.x - (b.vx / d) * 12, b.y - (b.vy / d) * 12);
    cx.stroke();
  }

  for (const p of s.particles) {
    cx.globalAlpha = Math.max(0, p.life / p.max);
    cx.fillStyle = p.color;
    cx.beginPath();
    cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    cx.fill();
  }
  cx.globalAlpha = 1;

  cx.save();
  cx.translate(px, py);
  cx.fillStyle = "rgba(0,0,0,.28)";
  cx.beginPath();
  cx.ellipse(0, 14, 22, 8, 0, 0, Math.PI * 2);
  cx.fill();
  if (spritesReady && sprites) {
    // soldier aims up-field toward the horde: face up (−90°).
    cx.rotate(-Math.PI / 2);
    const ph = 54;
    const pw = (sprites.player.naturalWidth / sprites.player.naturalHeight) * ph;
    cx.drawImage(sprites.player, -pw / 2, -ph / 2, pw, ph);
  } else {
    cx.fillStyle = "#1e40af";
    cx.beginPath();
    cx.arc(0, 0, 17, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = "#334155";
    cx.fillRect(-4, -30, 8, 20);
  }
  cx.restore();

  cx.restore();
}
