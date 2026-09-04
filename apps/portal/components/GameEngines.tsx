"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { formatClock, ButtonDuga } from "./FunGames";
import { api } from "@/lib/client/api";

// ---------------------------------------------------------------------------
// 20 themed games, built on 3 shared mechanics so each has genuinely
// different visuals/narrative while sharing one tested engine per mechanic:
//   - "gauge": a resource (fuel/oxygen/water/ammo/hull/stamina) drains over
//     time and on wrong answers; correct answers under time pressure refill
//     it. Lose if it hits zero.
//   - "escape": a threat closes in over time and on wrong answers; correct
//     answers push it back. Lose if it catches you.
//   - "climb": each correct answer is one discrete step of visible progress;
//     wrong answers just cost the question's time. Win by reaching the top
//     before the questions or the clock run out.
// ---------------------------------------------------------------------------

export type ThemeKind =
  | "fuelRush" | "deepSeaDive" | "desertCaravan" | "marathonStamina" | "pirateSeaBattle"
  | "alienTurretDefense" | "zombieShooterStandoff"
  | "zombieCorridor" | "volcanoEscape" | "iceCaveFlood" | "reactorMeltdown"
  | "bridgeBuilder" | "balloonAscent" | "rocketCountdown" | "jungleVineSwing"
  | "robotRepair" | "timeMachineFix" | "castleDefense" | "chefsRush" | "skyJump";

type Mechanic = "gauge" | "escape" | "climb";

export interface ThemeConfig {
  key: ThemeKind;
  title: string;
  emoji: string;
  tagline: string;
  mechanic: Mechanic;
  gaugeLabel: string;
  playerEmoji: string;
  hazardEmoji: string;
  bg: string;
  winMessage: string;
  loseMessage: string;
}

export const THEMES: ThemeConfig[] = [
  { key: "fuelRush", title: "Fuel Rush", emoji: "🏎️", tagline: "Your tank is draining — answer fast at every pit stop to refuel.", mechanic: "gauge", gaugeLabel: "Fuel", playerEmoji: "🏎️", hazardEmoji: "⛽", bg: "linear-gradient(135deg,#f97316,#ea580c)", winMessage: "You crossed the finish line!", loseMessage: "You ran out of fuel." },
  { key: "deepSeaDive", title: "Deep Sea Dive", emoji: "🤿", tagline: "Oxygen is dropping fast — answer right to find your next breath of air.", mechanic: "gauge", gaugeLabel: "Oxygen", playerEmoji: "🤿", hazardEmoji: "🫧", bg: "linear-gradient(135deg,#0ea5e9,#0369a1)", winMessage: "You found the treasure and surfaced safely!", loseMessage: "You ran out of oxygen." },
  { key: "desertCaravan", title: "Desert Caravan", emoji: "🐫", tagline: "Water is running low crossing the dunes — find the next oasis.", mechanic: "gauge", gaugeLabel: "Water", playerEmoji: "🐫", hazardEmoji: "🏜️", bg: "linear-gradient(135deg,#eab308,#b45309)", winMessage: "You reached the next town!", loseMessage: "Your caravan ran dry." },
  { key: "marathonStamina", title: "Marathon Stamina", emoji: "🏃", tagline: "Your energy is fading — grab an energy gel with every right answer.", mechanic: "gauge", gaugeLabel: "Stamina", playerEmoji: "🏃", hazardEmoji: "💧", bg: "linear-gradient(135deg,#22c55e,#15803d)", winMessage: "You crossed the finish line first!", loseMessage: "You hit the wall and dropped out." },
  { key: "pirateSeaBattle", title: "Pirate Sea Battle", emoji: "🏴‍☠️", tagline: "Cannon fire is cracking your hull — patch it up before it's too late.", mechanic: "gauge", gaugeLabel: "Hull", playerEmoji: "🏴‍☠️", hazardEmoji: "💣", bg: "linear-gradient(135deg,#334155,#0f172a)", winMessage: "You sank the enemy ship!", loseMessage: "Your ship went down." },
  { key: "alienTurretDefense", title: "Alien Turret Defense", emoji: "👾", tagline: "Ammo is low — reload the turret by answering before the next wave.", mechanic: "gauge", gaugeLabel: "Ammo", playerEmoji: "🛰️", hazardEmoji: "👾", bg: "linear-gradient(135deg,#7c3aed,#4c1d95)", winMessage: "The alien fleet retreated!", loseMessage: "Your turret ran dry." },
  { key: "zombieShooterStandoff", title: "Zombie Shooter Standoff", emoji: "🧟", tagline: "The horde is closing in and you're low on ammo — reload fast.", mechanic: "gauge", gaugeLabel: "Ammo", playerEmoji: "🔫", hazardEmoji: "🧟", bg: "linear-gradient(135deg,#4d7c0f,#1a2e05)", winMessage: "You held the line!", loseMessage: "You were overrun." },
  { key: "zombieCorridor", title: "Zombie Corridor", emoji: "🏃‍♂️", tagline: "Zombies are gaining on you down the hallway — answer to pull ahead.", mechanic: "escape", gaugeLabel: "Distance", playerEmoji: "🏃‍♂️", hazardEmoji: "🧟", bg: "linear-gradient(135deg,#57534e,#1c1917)", winMessage: "You escaped through the exit!", loseMessage: "The zombies caught you." },
  { key: "volcanoEscape", title: "Volcano Escape", emoji: "🌋", tagline: "Lava is rising beneath you — climb to the next platform to stay ahead.", mechanic: "escape", gaugeLabel: "Lava level", playerEmoji: "🧗", hazardEmoji: "🌋", bg: "linear-gradient(135deg,#dc2626,#7c2d12)", winMessage: "You reached safety at the summit!", loseMessage: "The lava caught up with you." },
  { key: "iceCaveFlood", title: "Ice Cave Flood", emoji: "🧊", tagline: "The cave is flooding — melt a path out before the water reaches the top.", mechanic: "escape", gaugeLabel: "Water level", playerEmoji: "⛏️", hazardEmoji: "🌊", bg: "linear-gradient(135deg,#38bdf8,#0c4a6e)", winMessage: "You escaped the flooding cave!", loseMessage: "The water reached the ceiling." },
  { key: "reactorMeltdown", title: "Reactor Meltdown", emoji: "☢️", tagline: "The reactor is overloading — redirect power before it blows.", mechanic: "escape", gaugeLabel: "Overload", playerEmoji: "🧑‍🔧", hazardEmoji: "☢️", bg: "linear-gradient(135deg,#facc15,#78350f)", winMessage: "You shut it down just in time!", loseMessage: "The reactor melted down." },
  { key: "bridgeBuilder", title: "Bridge Builder", emoji: "🌉", tagline: "Lay one plank at a time — every right answer gets you across the chasm.", mechanic: "climb", gaugeLabel: "Planks laid", playerEmoji: "🚶", hazardEmoji: "🕳️", bg: "linear-gradient(135deg,#78716c,#292524)", winMessage: "You made it across the bridge!", loseMessage: "You ran out of time on the bridge." },
  { key: "balloonAscent", title: "Balloon Ascent", emoji: "🎈", tagline: "Answer right to add hot air and climb to your target altitude.", mechanic: "climb", gaugeLabel: "Altitude", playerEmoji: "🎈", hazardEmoji: "☁️", bg: "linear-gradient(135deg,#38bdf8,#818cf8)", winMessage: "You reached the target altitude!", loseMessage: "Time ran out before you reached the top." },
  { key: "rocketCountdown", title: "Rocket Countdown", emoji: "🚀", tagline: "Build thrust with every right answer before the launch window closes.", mechanic: "climb", gaugeLabel: "Thrust", playerEmoji: "🚀", hazardEmoji: "🔥", bg: "linear-gradient(135deg,#1e293b,#020617)", winMessage: "Liftoff — you made it to orbit!", loseMessage: "The launch window closed." },
  { key: "jungleVineSwing", title: "Jungle Vine Swing", emoji: "🐒", tagline: "Time each swing right to make it through the canopy.", mechanic: "climb", gaugeLabel: "Vines crossed", playerEmoji: "🐒", hazardEmoji: "🌴", bg: "linear-gradient(135deg,#16a34a,#14532d)", winMessage: "You swung all the way through the jungle!", loseMessage: "You fell before reaching the end." },
  { key: "robotRepair", title: "Robot Repair", emoji: "🤖", tagline: "Fix one part per right answer before the self-destruct timer hits zero.", mechanic: "climb", gaugeLabel: "Parts fixed", playerEmoji: "🤖", hazardEmoji: "⚙️", bg: "linear-gradient(135deg,#64748b,#1e293b)", winMessage: "Fully repaired with time to spare!", loseMessage: "The countdown reached zero." },
  { key: "timeMachineFix", title: "Time Machine Fix", emoji: "⏳", tagline: "Stabilize the glitching timeline one right answer at a time.", mechanic: "climb", gaugeLabel: "Timeline stability", playerEmoji: "🧑‍🔬", hazardEmoji: "🌀", bg: "linear-gradient(135deg,#a855f7,#312e81)", winMessage: "The timeline is stable again!", loseMessage: "The timeline collapsed." },
  { key: "castleDefense", title: "Castle Defense", emoji: "🏰", tagline: "Patch the wall with every right answer before the siege breaks through.", mechanic: "climb", gaugeLabel: "Wall repaired", playerEmoji: "🏰", hazardEmoji: "🗡️", bg: "linear-gradient(135deg,#78350f,#292524)", winMessage: "The siege was repelled!", loseMessage: "The castle walls fell." },
  { key: "chefsRush", title: "Chef's Rush", emoji: "👨‍🍳", tagline: "Plate one dish per right answer before the dinner rush timer ends.", mechanic: "climb", gaugeLabel: "Dishes served", playerEmoji: "🍳", hazardEmoji: "⏲️", bg: "linear-gradient(135deg,#f59e0b,#b45309)", winMessage: "You cleared the whole order list!", loseMessage: "The kitchen timer ran out." },
  { key: "skyJump", title: "Sky Jump", emoji: "🪂", tagline: "Deploy each checkpoint with a right answer on the way down.", mechanic: "climb", gaugeLabel: "Checkpoints", playerEmoji: "🪂", hazardEmoji: "🌬️", bg: "linear-gradient(135deg,#0ea5e9,#1e3a8a)", winMessage: "Perfect landing!", loseMessage: "You couldn't deploy in time." },
];

export function themeFor(kind: string): ThemeConfig {
  return THEMES.find((t) => t.key === kind) ?? THEMES[0]!;
}

// ---------------------------------------------------------------------------
// Difficulty tuning: how many seconds per question, and how fast the
// gauge/threat moves each second while a question is on screen.
// ---------------------------------------------------------------------------
function questionSecondsFor(difficulty: string): number {
  return difficulty === "HARD" ? 8 : difficulty === "EASY" ? 16 : 12;
}
function drainRateFor(difficulty: string): number {
  return difficulty === "HARD" ? 3.2 : difficulty === "EASY" ? 1.6 : 2.3;
}

export interface EngineQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface EngineAnswer {
  questionId: string;
  selectedIndex: number;
}

export type EngineOutcome = "won" | "lost" | "timeup";

interface EngineProps {
  theme: ThemeConfig;
  questions: EngineQuestion[];
  difficulty: string;
  sessionExpiresAt?: number;
  onProgress?: (info: { correct: number; answered: number; gaugeOrStep: number }) => void;
  onFinish: (answers: EngineAnswer[], outcome: EngineOutcome, correct: number) => void;
}

// ---------------------------------------------------------------------------
// Shared: one question with a per-question countdown bar. Times out to a
// "wrong answer" (selectedIndex -1) if nothing is picked in time.
// ---------------------------------------------------------------------------
function QuestionPrompt({ q, seconds, onAnswer }: { q: EngineQuestion; seconds: number; onAnswer: (selectedIndex: number) => void }) {
  const [left, setLeft] = useState(seconds);
  const answeredRef = useRef(false);

  useEffect(() => {
    answeredRef.current = false;
    setLeft(seconds);
    // Only update this component's own countdown here — calling onAnswer
    // (which sets state in the parent engine) from inside setLeft's updater
    // would update a different component while React is mid-render for this
    // one. The timeout is instead handled by the effect below, once `left`
    // actually reaches 0.
    const iv = window.setInterval(() => {
      setLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id, seconds]);

  useEffect(() => {
    if (left === 0 && !answeredRef.current) {
      answeredRef.current = true;
      onAnswer(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  function pick(i: number) {
    if (answeredRef.current) return;
    answeredRef.current = true;
    onAnswer(i);
  }

  const pct = Math.max(0, Math.min(100, (left / seconds) * 100));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.35)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct < 30 ? "#dc2626" : "#22c55e", transition: "width 1s linear" }} />
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.4)" }}>{q.question}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {q.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => pick(i)}
            style={{
              textAlign: "left",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.5)",
              background: "rgba(255,255,255,.92)",
              color: "#1f2937",
              fontWeight: 600,
              fontSize: 13.5,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function GaugeBar({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  const color = value < 25 ? "#dc2626" : value < 55 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.4)" }}>
        <span>{emoji} {label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div style={{ height: 14, borderRadius: 999, background: "rgba(255,255,255,.3)", overflow: "hidden", border: "1px solid rgba(255,255,255,.4)" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, background: color, transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

function feedbackBanner(state: "correct" | "wrong" | null): CSSProperties {
  return {
    textAlign: "center",
    fontWeight: 800,
    fontSize: 13,
    padding: "5px 10px",
    borderRadius: 8,
    background: state === "correct" ? "rgba(34,197,94,.85)" : state === "wrong" ? "rgba(220,38,38,.85)" : "transparent",
    color: "#fff",
    opacity: state ? 1 : 0,
    transition: "opacity .3s ease",
    minHeight: 26,
  };
}

// ---------------------------------------------------------------------------
// Gauge engine: fuel/oxygen/water/ammo/hull/stamina drains over time and on
// wrong answers; correct answers refill it. Lose at 0, win by clearing every
// question while still alive.
// ---------------------------------------------------------------------------
function GaugeEngine({ theme, questions, difficulty, sessionExpiresAt, onProgress, onFinish }: EngineProps) {
  const [gauge, setGauge] = useState(65);
  const [qi, setQi] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const answersRef = useRef<EngineAnswer[]>([]);
  const statsRef = useRef({ correct: 0, done: false });
  const gaugeRef = useRef(65);
  const drainRate = drainRateFor(difficulty);
  const qSeconds = questionSecondsFor(difficulty);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finish = useCallback((outcome: EngineOutcome) => {
    if (statsRef.current.done) return;
    statsRef.current.done = true;
    onFinishRef.current(answersRef.current, outcome, statsRef.current.correct);
  }, []);

  // Passive drain tick.
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (statsRef.current.done) return;
      gaugeRef.current = Math.max(0, gaugeRef.current - drainRate);
      setGauge(gaugeRef.current);
      onProgressRef.current?.({ correct: statsRef.current.correct, answered: answersRef.current.length, gaugeOrStep: gaugeRef.current });
      if (gaugeRef.current <= 0) finish("lost");
    }, 1000);
    return () => window.clearInterval(iv);
  }, [drainRate, finish]);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const t = window.setTimeout(() => finish("timeup"), Math.max(0, sessionExpiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [sessionExpiresAt, finish]);

  function onAnswer(selectedIndex: number) {
    if (statsRef.current.done) return;
    const q = questions[qi]!;
    answersRef.current.push({ questionId: q.id, selectedIndex });
    const isCorrect = selectedIndex === q.correctIndex;
    if (isCorrect) {
      gaugeRef.current = Math.min(100, gaugeRef.current + 22);
      statsRef.current.correct += 1;
      setFeedback("correct");
    } else {
      gaugeRef.current = Math.max(0, gaugeRef.current - 18);
      setFeedback("wrong");
    }
    setGauge(gaugeRef.current);
    window.setTimeout(() => setFeedback(null), 500);
    if (gaugeRef.current <= 0) {
      window.setTimeout(() => finish("lost"), 350);
      return;
    }
    if (qi + 1 >= questions.length) {
      window.setTimeout(() => finish("won"), 350);
      return;
    }
    window.setTimeout(() => setQi((v) => v + 1), 450);
  }

  const q = questions[qi];
  return (
    <div style={{ display: "grid", gap: 14, padding: 16, borderRadius: 16, background: theme.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 30 }}>{theme.playerEmoji}</span>
        <span style={{ fontSize: 22 }}>{theme.hazardEmoji}</span>
      </div>
      <GaugeBar label={theme.gaugeLabel} value={gauge} emoji="⛽" />
      <div style={feedbackBanner(feedback)}>{feedback === "correct" ? "Refilled!" : feedback === "wrong" ? "Lost some — keep going!" : ""}</div>
      {q && <QuestionPrompt key={q.id} q={q} seconds={qSeconds} onAnswer={onAnswer} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Escape engine: a threat closes in over time and on wrong answers; correct
// answers push it back. Lose if it reaches 100 (caught); win by clearing
// every question first.
// ---------------------------------------------------------------------------
function EscapeEngine({ theme, questions, difficulty, sessionExpiresAt, onProgress, onFinish }: EngineProps) {
  const [threat, setThreat] = useState(15);
  const [qi, setQi] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const answersRef = useRef<EngineAnswer[]>([]);
  const statsRef = useRef({ correct: 0, done: false });
  const threatRef = useRef(15);
  const closeRate = drainRateFor(difficulty);
  const qSeconds = questionSecondsFor(difficulty);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finish = useCallback((outcome: EngineOutcome) => {
    if (statsRef.current.done) return;
    statsRef.current.done = true;
    onFinishRef.current(answersRef.current, outcome, statsRef.current.correct);
  }, []);

  useEffect(() => {
    const iv = window.setInterval(() => {
      if (statsRef.current.done) return;
      threatRef.current = Math.min(100, threatRef.current + closeRate);
      setThreat(threatRef.current);
      onProgressRef.current?.({ correct: statsRef.current.correct, answered: answersRef.current.length, gaugeOrStep: 100 - threatRef.current });
      if (threatRef.current >= 100) finish("lost");
    }, 1000);
    return () => window.clearInterval(iv);
  }, [closeRate, finish]);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const t = window.setTimeout(() => finish("timeup"), Math.max(0, sessionExpiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [sessionExpiresAt, finish]);

  function onAnswer(selectedIndex: number) {
    if (statsRef.current.done) return;
    const q = questions[qi]!;
    answersRef.current.push({ questionId: q.id, selectedIndex });
    const isCorrect = selectedIndex === q.correctIndex;
    if (isCorrect) {
      threatRef.current = Math.max(0, threatRef.current - 24);
      statsRef.current.correct += 1;
      setFeedback("correct");
    } else {
      threatRef.current = Math.min(100, threatRef.current + 16);
      setFeedback("wrong");
    }
    setThreat(threatRef.current);
    window.setTimeout(() => setFeedback(null), 500);
    if (threatRef.current >= 100) {
      window.setTimeout(() => finish("lost"), 350);
      return;
    }
    if (qi + 1 >= questions.length) {
      window.setTimeout(() => finish("won"), 350);
      return;
    }
    window.setTimeout(() => setQi((v) => v + 1), 450);
  }

  const q = questions[qi];
  return (
    <div style={{ display: "grid", gap: 14, padding: 16, borderRadius: 16, background: theme.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 30 }}>{theme.playerEmoji}</span>
        <span style={{ fontSize: 22 + Math.round(threat / 8) }}>{theme.hazardEmoji}</span>
      </div>
      <GaugeBar label={theme.gaugeLabel ?? "Danger"} value={100 - threat} emoji="🏃" />
      <div style={feedbackBanner(feedback)}>{feedback === "correct" ? "You pulled ahead!" : feedback === "wrong" ? "It's catching up!" : ""}</div>
      {q && <QuestionPrompt key={q.id} q={q} seconds={qSeconds} onAnswer={onAnswer} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Climb engine: each correct answer is one discrete step of visible
// progress; a wrong answer/timeout just wastes the question's time. Win by
// reaching the top before the session clock runs out.
// ---------------------------------------------------------------------------
function ClimbEngine({ theme, questions, sessionExpiresAt, onProgress, onFinish }: EngineProps) {
  const total = questions.length;
  const [step, setStep] = useState(0);
  const [qi, setQi] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const answersRef = useRef<EngineAnswer[]>([]);
  const statsRef = useRef({ correct: 0, done: false });
  const qSeconds = 14;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finish = useCallback((outcome: EngineOutcome) => {
    if (statsRef.current.done) return;
    statsRef.current.done = true;
    onFinishRef.current(answersRef.current, outcome, statsRef.current.correct);
  }, []);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const t = window.setTimeout(() => finish("timeup"), Math.max(0, sessionExpiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [sessionExpiresAt, finish]);

  function onAnswer(selectedIndex: number) {
    if (statsRef.current.done) return;
    const q = questions[qi]!;
    answersRef.current.push({ questionId: q.id, selectedIndex });
    const isCorrect = selectedIndex === q.correctIndex;
    let nextStep = step;
    if (isCorrect) {
      nextStep = step + 1;
      setStep(nextStep);
      statsRef.current.correct += 1;
      setFeedback("correct");
    } else {
      setFeedback("wrong");
    }
    onProgressRef.current?.({ correct: statsRef.current.correct, answered: answersRef.current.length, gaugeOrStep: Math.round((nextStep / total) * 100) });
    window.setTimeout(() => setFeedback(null), 500);
    if (nextStep >= total) {
      window.setTimeout(() => finish("won"), 350);
      return;
    }
    if (qi + 1 >= questions.length) {
      window.setTimeout(() => finish(nextStep >= total ? "won" : "timeup"), 350);
      return;
    }
    window.setTimeout(() => setQi((v) => v + 1), 450);
  }

  const q = questions[qi];
  const pct = total > 0 ? Math.round((step / total) * 100) : 0;
  return (
    <div style={{ display: "grid", gap: 14, padding: 16, borderRadius: 16, background: theme.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 30 }}>{theme.playerEmoji}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{step}/{total}</span>
      </div>
      <GaugeBar label={theme.gaugeLabel} value={pct} emoji="⬆️" />
      <div style={feedbackBanner(feedback)}>{feedback === "correct" ? "Progress!" : feedback === "wrong" ? "No progress this round." : ""}</div>
      {q && <QuestionPrompt key={q.id} q={q} seconds={qSeconds} onAnswer={onAnswer} />}
    </div>
  );
}

export function ThemedGameEngine(props: EngineProps) {
  if (props.theme.mechanic === "gauge") return <GaugeEngine {...props} />;
  if (props.theme.mechanic === "escape") return <EscapeEngine {...props} />;
  return <ClimbEngine {...props} />;
}

// ---------------------------------------------------------------------------
// Result screen — shared across the themed launcher and the outsider trial
// page, since both need the same win/lose messaging.
// ---------------------------------------------------------------------------
export function ThemedResult({
  theme,
  outcome,
  score,
  actions,
}: {
  theme: ThemeConfig;
  outcome: EngineOutcome;
  score: number;
  actions?: React.ReactNode;
}) {
  const won = outcome === "won";
  return (
    <div style={{ display: "grid", gap: 14, textAlign: "center", padding: 20, borderRadius: 16, background: theme.bg }}>
      <div style={{ fontSize: 40 }}>{won ? "🏆" : theme.hazardEmoji}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{won ? theme.winMessage : theme.loseMessage}</div>
      <div style={{ fontSize: 42, fontWeight: 900, color: "#fff" }}>{score}<span style={{ fontSize: 18 }}>/100</span></div>
      {actions}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Launcher: fetches the game's question bank from the server, offers to join
// a teacher-scheduled live session if one is running right now, plays the
// round, submits the answers for server-side grading, and shows the result.
// Mirrors FunGameLauncher's contract (onFinish(score)) so games/page.tsx can
// treat both the same way.
// ---------------------------------------------------------------------------
interface StartResponse {
  id: string;
  title: string;
  kind: string;
  difficulty: string;
  durationMinutes: number;
  rewardPoints: number;
  questions: EngineQuestion[];
  liveSession: { id: string; endsAt: string } | null;
}

interface LiveParticipant {
  studentId: string;
  name: string;
  score: number;
  progressPct: number;
  finishedAt: string | null;
}

export function ThemedGameLauncher({
  gameId,
  preview,
  onFinish,
}: {
  gameId: string;
  preview?: boolean;
  onFinish: (score: number) => void;
}) {
  const [data, setData] = useState<StartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveChoice, setLiveChoice] = useState<"pending" | "joined" | "skipped">("pending");
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [liveBoard, setLiveBoard] = useState<LiveParticipant[]>([]);
  const [result, setResult] = useState<{ score: number; outcome: EngineOutcome } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  // Guards against a double-fire of onFinish for the same round (e.g. React
  // StrictMode's dev-only double effect invocation can otherwise produce two
  // concurrent /play submissions for one playthrough).
  const finishedRoundRef = useRef(-1);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api<StartResponse>(`games/${gameId}/start`, { method: "POST" })
      .then((d) => {
        setData(d);
        setLiveChoice(d.liveSession ? "pending" : "skipped");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [gameId, roundKey]);

  const lastPing = useRef(0);
  const handleProgress = useCallback(
    (info: { correct: number; answered: number; gaugeOrStep: number }) => {
      if (!liveSessionId) return;
      const now = Date.now();
      if (now - lastPing.current < 2500) return;
      lastPing.current = now;
      api<{ participants: LiveParticipant[] }>("games/pingLive", { method: "POST", body: { sessionId: liveSessionId, score: info.correct * 10, progressPct: info.gaugeOrStep }, loading: false })
        .then((r) => setLiveBoard(r.participants))
        .catch(() => undefined);
    },
    [liveSessionId],
  );

  async function joinLive() {
    if (!data?.liveSession) return;
    try {
      await api(`games/${gameId}/joinLive`, { method: "POST" });
      setLiveSessionId(data.liveSession.id);
      setLiveChoice("joined");
    } catch (e) {
      alert((e as Error).message);
      setLiveChoice("skipped");
    }
  }

  async function handleFinish(answers: EngineAnswer[], outcome: EngineOutcome, correct: number) {
    if (finishedRoundRef.current === roundKey) return;
    finishedRoundRef.current = roundKey;
    if (preview) {
      setResult({ score: Math.max(0, Math.min(100, correct * 10)), outcome });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ score: number }>(`games/${gameId}/play`, { method: "POST", body: { answers } });
      setResult({ score: res.score, outcome });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div style={{ padding: 30, textAlign: "center" }}>Loading game…</div>;
  if (error || !data) return <div style={{ padding: 20, color: "#dc2626", fontWeight: 700 }}>{error ?? "Could not load this game."}</div>;

  const theme = themeFor(data.kind);

  if (result) {
    return (
      <ThemedResult
        theme={theme}
        outcome={result.outcome}
        score={result.score}
        actions={
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <ButtonDuga onClick={() => { setResult(null); setLiveChoice(data.liveSession ? "pending" : "skipped"); setLiveSessionId(null); setRoundKey((k) => k + 1); }}>▶ Play again</ButtonDuga>
            <ButtonDuga variant="ghost" onClick={() => onFinish(result.score)}>{preview ? "Close preview" : "Finish"}</ButtonDuga>
          </div>
        }
      />
    );
  }

  if (data.liveSession && liveChoice === "pending") {
    return (
      <div style={{ display: "grid", gap: 14, textAlign: "center", padding: 24, borderRadius: 16, background: theme.bg }}>
        <div style={{ fontSize: 30 }}>🔴</div>
        <div style={{ color: "#fff", fontWeight: 800 }}>A live session for this game is running right now — play alongside classmates and see each other's live progress?</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <ButtonDuga onClick={joinLive}>Join live</ButtonDuga>
          <ButtonDuga variant="ghost" onClick={() => setLiveChoice("skipped")}>Play solo</ButtonDuga>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {liveChoice === "joined" && liveBoard.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, fontWeight: 700 }}>
          {liveBoard.map((p) => (
            <span key={p.studentId} style={{ padding: "3px 9px", borderRadius: 999, background: "var(--duga-surface-2,#f1f5f9)" }}>
              {p.name.split(" ")[0]}: {p.score}
            </span>
          ))}
        </div>
      )}
      <ThemedGameEngine
        key={roundKey}
        theme={theme}
        questions={data.questions}
        difficulty={data.difficulty}
        sessionExpiresAt={Date.now() + data.durationMinutes * 60_000}
        onProgress={liveChoice === "joined" ? handleProgress : undefined}
        onFinish={handleFinish}
      />
      {submitting && <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--duga-muted)" }}>Submitting…</div>}
    </div>
  );
}

export { formatClock, ButtonDuga };
