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
  /** Which drawn scene the gauge mechanic renders. "car" is the fully
   * illustrated race (Fuel Rush); "traveller" is a themed generic drawn
   * shape for the games that don't have a bespoke illustration yet. */
  sceneKind?: "car" | "traveller";
  vehicleColor?: string;
}

export const THEMES: ThemeConfig[] = [
  { key: "fuelRush", title: "Fuel Rush", emoji: "🏎️", tagline: "Race two rivals — dodge cones and hit boost gates with fast right answers to surge ahead.", mechanic: "gauge", gaugeLabel: "Fuel", playerEmoji: "🏎️", hazardEmoji: "⛽", bg: "linear-gradient(135deg,#f97316,#ea580c)", winMessage: "You crossed the finish line first!", loseMessage: "A rival crossed the finish line first.", sceneKind: "car", vehicleColor: "#ef4444" },
  { key: "deepSeaDive", title: "Deep Sea Dive", emoji: "🤿", tagline: "Oxygen is dropping fast — answer right to find your next breath of air.", mechanic: "gauge", gaugeLabel: "Oxygen", playerEmoji: "🤿", hazardEmoji: "🫧", bg: "linear-gradient(135deg,#0ea5e9,#0369a1)", winMessage: "You found the treasure and surfaced safely!", loseMessage: "You ran out of oxygen.", sceneKind: "traveller", vehicleColor: "#facc15" },
  { key: "desertCaravan", title: "Desert Caravan", emoji: "🐫", tagline: "Water is running low crossing the dunes — find the next oasis.", mechanic: "gauge", gaugeLabel: "Water", playerEmoji: "🐫", hazardEmoji: "🏜️", bg: "linear-gradient(135deg,#eab308,#b45309)", winMessage: "You reached the next town!", loseMessage: "Your caravan ran dry.", sceneKind: "traveller", vehicleColor: "#a16207" },
  { key: "marathonStamina", title: "Marathon Stamina", emoji: "🏃", tagline: "Your energy is fading — grab an energy gel with every right answer.", mechanic: "gauge", gaugeLabel: "Stamina", playerEmoji: "🏃", hazardEmoji: "💧", bg: "linear-gradient(135deg,#22c55e,#15803d)", winMessage: "You crossed the finish line first!", loseMessage: "You hit the wall and dropped out.", sceneKind: "traveller", vehicleColor: "#f97316" },
  { key: "pirateSeaBattle", title: "Pirate Sea Battle", emoji: "🏴‍☠️", tagline: "Cannon fire is cracking your hull — patch it up before it's too late.", mechanic: "gauge", gaugeLabel: "Hull", playerEmoji: "🏴‍☠️", hazardEmoji: "💣", bg: "linear-gradient(135deg,#334155,#0f172a)", winMessage: "You sank the enemy ship!", loseMessage: "Your ship went down.", sceneKind: "traveller", vehicleColor: "#78350f" },
  { key: "alienTurretDefense", title: "Alien Turret Defense", emoji: "👾", tagline: "Ammo is low — reload the turret by answering before the next wave.", mechanic: "gauge", gaugeLabel: "Ammo", playerEmoji: "🛰️", hazardEmoji: "👾", bg: "linear-gradient(135deg,#7c3aed,#4c1d95)", winMessage: "The alien fleet retreated!", loseMessage: "Your turret ran dry.", sceneKind: "traveller", vehicleColor: "#a3e635" },
  { key: "zombieShooterStandoff", title: "Zombie Shooter Standoff", emoji: "🧟", tagline: "The horde is closing in and you're low on ammo — reload fast.", mechanic: "gauge", gaugeLabel: "Ammo", playerEmoji: "🔫", hazardEmoji: "🧟", bg: "linear-gradient(135deg,#4d7c0f,#1a2e05)", winMessage: "You held the line!", loseMessage: "You were overrun.", sceneKind: "traveller", vehicleColor: "#84cc16" },
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
// Drawn scene pieces (SVG) — no emoji standing in for game objects. A single
// <style> tag (injected once) carries the CSS keyframes the scenes animate
// with (wheel spin, road-dash scroll, exhaust puff).
// ---------------------------------------------------------------------------
let sceneStylesInjected = false;
function SceneStyles() {
  if (sceneStylesInjected) return null;
  sceneStylesInjected = true;
  return (
    <style>{`
      @keyframes duga-road-scroll { from { background-position-x: 0; } to { background-position-x: -64px; } }
      @keyframes duga-wheel-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes duga-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes duga-puff { 0% { opacity: .55; transform: translate(0,0) scale(.4); } 100% { opacity: 0; transform: translate(-22px,-6px) scale(1.3); } }
    `}</style>
  );
}

function CarSVG({ color, driving }: { color: string; driving: boolean }) {
  return (
    <svg viewBox="0 0 220 110" width="118" height="59" style={{ filter: "drop-shadow(0 5px 4px rgba(0,0,0,.35))", overflow: "visible" }}>
      <ellipse cx="110" cy="99" rx="92" ry="7" fill="rgba(0,0,0,.28)" />
      {/* chassis */}
      <rect x="15" y="55" width="190" height="34" rx="14" fill={color} />
      {/* cabin */}
      <path d="M55 55 L76 23 Q81 16 90 16 H148 Q158 16 163 23 L184 55 Z" fill={color} />
      {/* windshield + rear window */}
      <path d="M83 50 L97 25 H143 L157 50 Z" fill="#bfe3fb" opacity=".92" />
      <line x1="120" y1="25" x2="120" y2="50" stroke="rgba(15,23,42,.3)" strokeWidth="2" />
      {/* racing stripe */}
      <rect x="15" y="67" width="190" height="7" fill="#fff" opacity=".85" />
      {/* lights */}
      <ellipse cx="202" cy="70" rx="6" ry="7" fill="#fef08a" />
      <rect x="14" y="61" width="6" height="9" rx="2" fill="#dc2626" />
      {/* wheels */}
      <g transform="translate(163,90)" style={driving ? { animation: "duga-wheel-spin .5s linear infinite", transformOrigin: "0 0" } : undefined}>
        <circle r="19" fill="#111827" />
        <circle r="10" fill="#9ca3af" />
        <circle r="3.5" fill="#4b5563" />
        <rect x="-2" y="-19" width="4" height="10" fill="#6b7280" />
        <rect x="-2" y="9" width="4" height="10" fill="#6b7280" />
      </g>
      <g transform="translate(52,90)" style={driving ? { animation: "duga-wheel-spin .5s linear infinite", transformOrigin: "0 0" } : undefined}>
        <circle r="19" fill="#111827" />
        <circle r="10" fill="#9ca3af" />
        <circle r="3.5" fill="#4b5563" />
        <rect x="-2" y="-19" width="4" height="10" fill="#6b7280" />
        <rect x="-2" y="9" width="4" height="10" fill="#6b7280" />
      </g>
      {driving && (
        <g>
          <circle cx="2" cy="80" r="6" fill="#cbd5e1" style={{ animation: "duga-puff .6s ease-out infinite" }} />
          <circle cx="2" cy="80" r="5" fill="#e2e8f0" style={{ animation: "duga-puff .6s ease-out .2s infinite" }} />
        </g>
      )}
    </svg>
  );
}

// A generic drawn "traveller" used by gauge-mechanic themes that don't yet
// have a bespoke vehicle illustration (submarine, wagon, runner, ship...).
// Still a real drawn shape, never an emoji — a rounded capsule with a
// porthole/eye detail and a short trail, reads fine on any track/backdrop.
function TravellerSVG({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 160 90" width="96" height="54" style={{ filter: "drop-shadow(0 5px 4px rgba(0,0,0,.35))" }}>
      <ellipse cx="80" cy="78" rx="60" ry="6" fill="rgba(0,0,0,.25)" />
      <path d="M20 55 Q20 25 60 25 H110 Q140 25 140 50 Q140 65 110 65 H45 Q20 65 20 55 Z" fill={color} />
      <circle cx="105" cy="43" r="14" fill="#bfe3fb" opacity=".9" />
      <circle cx="105" cy="43" r="14" fill="none" stroke="rgba(15,23,42,.35)" strokeWidth="2" />
      <path d="M18 52 Q4 50 2 45" stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}

// Car Rush gets a fully illustrated road (sky, hills, lane dashes, finish
// line). The other gauge-mechanic themes reuse the same track mechanics
// (position, finish line, motion animation) on a themed backdrop with the
// generic drawn traveller shape, tinted per theme — still a real drawn
// shape, never an emoji.
function TrackScene({ theme, progressPct, driving, finished }: { theme: ThemeConfig; progressPct: number; driving: boolean; finished: boolean }) {
  const left = 8 + Math.min(100, progressPct) * 0.74;
  const isCar = theme.sceneKind === "car";
  return (
    <div
      style={{
        position: "relative",
        height: 132,
        borderRadius: 14,
        overflow: "hidden",
        background: isCar ? "linear-gradient(180deg,#7dd3fc 0%,#bae6fd 42%,#57534e 42%,#3f3a37 100%)" : theme.bg,
      }}
    >
      <SceneStyles />
      {isCar ? (
        <>
          <div style={{ position: "absolute", top: 10, right: 18, width: 24, height: 24, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 18px 4px #fde68a99" }} />
          <div style={{ position: "absolute", left: -20, right: -20, top: 44, height: 26, background: "radial-gradient(ellipse at 30% 100%, #16a34a99, transparent 70%), radial-gradient(ellipse at 70% 100%, #15803d99, transparent 70%)" }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 20% 20%, rgba(255,255,255,.12), transparent 55%)" }} />
      )}
      {/* path + travel dashes */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: isCar ? "58%" : "62%",
          height: 5,
          background: `repeating-linear-gradient(90deg,${isCar ? "#facc15" : "rgba(255,255,255,.65)"} 0 28px,transparent 28px 64px)`,
          animation: driving ? "duga-road-scroll .55s linear infinite" : undefined,
        }}
      />
      {/* finish line */}
      <div style={{ position: "absolute", right: 14, top: isCar ? "42%" : "46%", bottom: 0, width: 6, background: "repeating-linear-gradient(180deg,#111 0 6px,#fff 6px 12px)" }} />
      {/* traveller */}
      <div style={{ position: "absolute", left: `${left}%`, bottom: 8, transition: "left 1s linear", animation: driving && !finished ? "duga-bob .3s ease-in-out infinite" : undefined }}>
        {isCar ? <CarSVG color={theme.vehicleColor ?? "#ef4444"} driving={driving && !finished} /> : <TravellerSVG color={theme.vehicleColor ?? "#f59e0b"} />}
      </div>
    </div>
  );
}

function GasStationSVG() {
  return (
    <svg viewBox="0 0 220 120" width="96" height="52" style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,.3))" }}>
      <rect x="8" y="14" width="204" height="14" rx="3" fill="#dc2626" />
      <rect x="22" y="28" width="9" height="72" fill="#9ca3af" />
      <rect x="189" y="28" width="9" height="72" fill="#9ca3af" />
      <rect x="92" y="48" width="36" height="52" rx="5" fill="#1d4ed8" />
      <rect x="98" y="56" width="24" height="12" fill="#fff" />
      <path d="M128 62 Q150 62 150 80 L150 92" stroke="#374151" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// Generic "resupply" icon (a crate + gauge dial) for the gauge-mechanic
// themes that aren't a literal fuel stop.
function SupplyStopSVG() {
  return (
    <svg viewBox="0 0 120 100" width="70" height="52" style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,.3))" }}>
      <rect x="20" y="35" width="80" height="55" rx="4" fill="#92400e" />
      <rect x="20" y="35" width="80" height="14" fill="#78350f" />
      <line x1="20" y1="62" x2="100" y2="62" stroke="#78350f" strokeWidth="3" />
      <line x1="60" y1="35" x2="60" y2="90" stroke="#78350f" strokeWidth="3" />
      <circle cx="60" cy="24" r="14" fill="#fff" opacity=".9" />
      <path d="M60 14 v10 l7 4" stroke="#111827" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function FuelGaugeDial({ value, label }: { value: number; label: string }) {
  const angle = -90 + Math.max(0, Math.min(100, value)) / 100 * 180;
  const needleColor = value < 25 ? "#dc2626" : value < 55 ? "#b45309" : "#166534";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg viewBox="0 0 120 66" width="104" height="58">
        <path d="M8 60 A52 52 0 0 1 42 12" fill="none" stroke="#dc2626" strokeWidth="11" strokeLinecap="round" />
        <path d="M42 12 A52 52 0 0 1 78 12" fill="none" stroke="#f59e0b" strokeWidth="11" strokeLinecap="round" />
        <path d="M78 12 A52 52 0 0 1 112 60" fill="none" stroke="#22c55e" strokeWidth="11" strokeLinecap="round" />
        <g transform={`rotate(${angle} 60 60)`} style={{ transition: "transform .5s cubic-bezier(.34,1.56,.64,1)" }}>
          <line x1="60" y1="60" x2="60" y2="22" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="60" y1="60" x2="60" y2="22" stroke={needleColor} strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <circle cx="60" cy="60" r="6" fill="#1f2937" />
      </svg>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.4)", letterSpacing: ".02em" }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.4)" }}>{Math.round(value)}%</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Race engine (Fuel Rush): an actual controllable top-down race against two
// AI rivals. Arrow keys / on-screen buttons change lanes to dodge cones;
// hitting one costs ground. Periodic "boost gates" pause the player (rivals
// keep moving!) and pose a question — answer fast and correctly for an
// instant forward surge, miss it and get nothing while the field closes in.
// First to the line wins.
// ---------------------------------------------------------------------------
const LANE_X = [18, 50, 82];
const RACE_BASE_SPEED = 4.4; // % of race per second
const RACE_BOOST_JUMP = 15; // instant progress gain on a correct answer
const RACE_CRASH_PENALTY = 7;
const RACE_LOOKAHEAD = 34; // relative progress rendered ahead of the player

function CarTopDownSVG({ color, boosted }: { color: string; boosted?: boolean }) {
  return (
    <svg viewBox="0 0 60 104" width="46" height="80" style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,.35))", overflow: "visible" }}>
      {boosted && (
        <>
          <rect x="13" y="88" width="8" height="20" rx="2" fill="#93c5fd" opacity=".85" />
          <rect x="39" y="88" width="8" height="20" rx="2" fill="#93c5fd" opacity=".85" />
        </>
      )}
      <rect x="10" y="8" width="40" height="80" rx="14" fill={color} />
      <rect x="16" y="20" width="28" height="20" rx="4" fill="#bfe3fb" opacity=".92" />
      <rect x="16" y="58" width="28" height="14" rx="3" fill="rgba(15,23,42,.4)" />
      <rect x="3" y="14" width="9" height="18" rx="2" fill="#111827" />
      <rect x="48" y="14" width="9" height="18" rx="2" fill="#111827" />
      <rect x="3" y="66" width="9" height="18" rx="2" fill="#111827" />
      <rect x="48" y="66" width="9" height="18" rx="2" fill="#111827" />
      <rect x="23" y="4" width="14" height="6" rx="2" fill="#fef08a" />
    </svg>
  );
}

function ConeSVG() {
  return (
    <svg viewBox="0 0 40 46" width="28" height="32" style={{ filter: "drop-shadow(0 3px 3px rgba(0,0,0,.3))" }}>
      <polygon points="20,4 33,40 7,40" fill="#f97316" stroke="#c2410c" strokeWidth="1.5" />
      <rect x="10" y="24" width="20" height="5" fill="#fff" />
      <rect x="5" y="38" width="30" height="6" rx="1.5" fill="#9a3412" />
    </svg>
  );
}

function ChevronSVG({ dir }: { dir: "left" | "right" }) {
  const points = dir === "left" ? "24,6 9,20 24,34" : "9,6 24,20 9,34";
  return (
    <svg viewBox="0 0 33 40" width="20" height="24">
      <polyline points={points} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface RaceOpponent {
  id: string;
  lane: number;
  progress: number;
  speed: number;
  color: string;
  name: string;
}
interface RaceObstacle {
  id: string;
  lane: number;
  atProgress: number;
  hit: boolean;
}
interface RaceGate {
  id: string;
  atProgress: number;
  questionIndex: number;
  consumed: boolean;
}

function RaceEngine({ theme, questions, difficulty, sessionExpiresAt, onProgress, onFinish }: EngineProps) {
  const total = questions.length;
  const [playerLane, setPlayerLane] = useState(1);
  const [playerProgress, setPlayerProgress] = useState(0);
  const [opponents, setOpponents] = useState<RaceOpponent[]>(() => [
    { id: "o1", lane: 0, progress: 0, speed: RACE_BASE_SPEED * (0.86 + Math.random() * 0.18), color: "#2563eb", name: "Rival 1" },
    { id: "o2", lane: 2, progress: 0, speed: RACE_BASE_SPEED * (0.86 + Math.random() * 0.18), color: "#16a34a", name: "Rival 2" },
  ]);
  const [obstacles, setObstacles] = useState<RaceObstacle[]>(() => {
    if (total === 0) return [];
    const gap = 90 / (total + 1);
    return Array.from({ length: total }, (_, i) => ({ id: `ob${i}`, lane: Math.floor(Math.random() * 3), atProgress: gap * (i + 1) - gap * 0.4, hit: false }));
  });
  const [gates] = useState<RaceGate[]>(() => {
    if (total === 0) return [];
    const gap = 90 / (total + 1);
    return Array.from({ length: total }, (_, i) => ({ id: `g${i}`, atProgress: gap * (i + 1), questionIndex: i, consumed: false }));
  });
  const [activeGateIdx, setActiveGateIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "crash" | null>(null);
  const [boosted, setBoosted] = useState(false);

  const answersRef = useRef<EngineAnswer[]>([]);
  const statsRef = useRef({ correct: 0, done: false });
  const playerProgressRef = useRef(0);
  const playerLaneRef = useRef(1);
  const opponentsRef = useRef(opponents);
  const obstaclesRef = useRef(obstacles);
  const gatesRef = useRef(gates);
  const activeGateRef = useRef<number | null>(null);
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

  function moveLane(dir: -1 | 1) {
    if (statsRef.current.done || activeGateRef.current !== null) return;
    playerLaneRef.current = Math.max(0, Math.min(2, playerLaneRef.current + dir));
    setPlayerLane(playerLaneRef.current);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveLane(-1);
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveLane(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (total === 0) return;
    const TICK_MS = 100;
    const iv = window.setInterval(() => {
      if (statsRef.current.done) return;

      opponentsRef.current = opponentsRef.current.map((o) => ({ ...o, progress: Math.min(100, o.progress + o.speed * (TICK_MS / 1000)) }));
      setOpponents(opponentsRef.current);
      if (opponentsRef.current.some((o) => o.progress >= 100)) {
        finish("lost");
        return;
      }

      if (activeGateRef.current === null) {
        playerProgressRef.current = Math.min(100, playerProgressRef.current + RACE_BASE_SPEED * (TICK_MS / 1000));
        setPlayerProgress(playerProgressRef.current);
        onProgressRef.current?.({ correct: statsRef.current.correct, answered: answersRef.current.length, gaugeOrStep: playerProgressRef.current });

        let crashed = false;
        obstaclesRef.current = obstaclesRef.current.map((ob) => {
          if (!ob.hit && ob.lane === playerLaneRef.current && Math.abs(ob.atProgress - playerProgressRef.current) < 1.6) {
            crashed = true;
            return { ...ob, hit: true };
          }
          return ob;
        });
        if (crashed) {
          playerProgressRef.current = Math.max(0, playerProgressRef.current - RACE_CRASH_PENALTY);
          setPlayerProgress(playerProgressRef.current);
          setObstacles(obstaclesRef.current);
          setFeedback("crash");
          window.setTimeout(() => setFeedback(null), 600);
        }

        const gate = gatesRef.current.find((g) => !g.consumed && playerProgressRef.current >= g.atProgress);
        if (gate) {
          gate.consumed = true;
          activeGateRef.current = gate.questionIndex;
          setActiveGateIdx(gate.questionIndex);
        }

        if (playerProgressRef.current >= 100) {
          finish("won");
        }
      }
    }, TICK_MS);
    return () => window.clearInterval(iv);
  }, [total, finish]);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const t = window.setTimeout(() => finish("timeup"), Math.max(0, sessionExpiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [sessionExpiresAt, finish]);

  function onAnswer(selectedIndex: number) {
    if (statsRef.current.done || activeGateRef.current === null) return;
    const qIdx = activeGateRef.current;
    const q = questions[qIdx]!;
    answersRef.current.push({ questionId: q.id, selectedIndex });
    const isCorrect = selectedIndex === q.correctIndex;
    if (isCorrect) {
      statsRef.current.correct += 1;
      playerProgressRef.current = Math.min(100, playerProgressRef.current + RACE_BOOST_JUMP);
      setPlayerProgress(playerProgressRef.current);
      setFeedback("correct");
      setBoosted(true);
      window.setTimeout(() => setBoosted(false), 800);
    } else {
      setFeedback("wrong");
    }
    window.setTimeout(() => setFeedback(null), 700);
    activeGateRef.current = null;
    setActiveGateIdx(null);
    if (playerProgressRef.current >= 100) window.setTimeout(() => finish("won"), 300);
  }

  if (total === 0) {
    return <div style={{ padding: 20, textAlign: "center", color: "#fff", background: theme.bg, borderRadius: 16, fontWeight: 700 }}>This game has no questions yet.</div>;
  }

  const q = activeGateIdx !== null ? questions[activeGateIdx] : null;
  const racers = [{ id: "you", progress: playerProgress }, ...opponents.map((o) => ({ id: o.id, progress: o.progress }))].sort((a, b) => b.progress - a.progress);
  const position = racers.findIndex((r) => r.id === "you") + 1;
  const positionLabel = position === 1 ? "1st place" : position === 2 ? "2nd place" : "3rd place";

  function relTop(entityProgress: number): number {
    const rel = entityProgress - playerProgress;
    return Math.max(-10, Math.min(96, 82 - (rel / RACE_LOOKAHEAD) * 76));
  }

  return (
    <div style={{ display: "grid", gap: 10, padding: 16, borderRadius: 16, background: theme.bg }}>
      <SceneStyles />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{positionLabel}</span>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{Math.round(playerProgress)}% of race</span>
      </div>
      <div style={{ position: "relative", height: 260, borderRadius: 14, overflow: "hidden", background: "linear-gradient(180deg,#334155,#1e293b)" }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${(LANE_X[i]! + LANE_X[i + 1]!) / 2}%`,
              top: 0,
              bottom: 0,
              width: 3,
              background: "repeating-linear-gradient(180deg,#fff 0 14px,transparent 14px 28px)",
              opacity: 0.5,
              animation: activeGateIdx === null ? "duga-road-scroll .4s linear infinite" : undefined,
            }}
          />
        ))}
        {obstacles
          .filter((o) => !o.hit && o.atProgress - playerProgress > -3 && o.atProgress - playerProgress < RACE_LOOKAHEAD)
          .map((o) => (
            <div key={o.id} style={{ position: "absolute", left: `${LANE_X[o.lane]}%`, top: `${relTop(o.atProgress)}%`, transform: "translate(-50%,-50%)", transition: "top .1s linear" }}>
              <ConeSVG />
            </div>
          ))}
        {opponents.map((o) => (
          <div key={o.id} style={{ position: "absolute", left: `${LANE_X[o.lane]}%`, top: `${relTop(o.progress)}%`, transform: "translate(-50%,-50%)", transition: "top .1s linear" }}>
            <CarTopDownSVG color={o.color} />
          </div>
        ))}
        {gates
          .filter((g) => !g.consumed)
          .slice(0, 1)
          .map((g) => {
            const top = relTop(g.atProgress);
            if (top < -8) return null;
            return (
              <div key={g.id} style={{ position: "absolute", left: 0, right: 0, top: `${top}%`, height: 10, background: "linear-gradient(90deg,#facc15,#fde047,#facc15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: "#78350f" }}>?</span>
              </div>
            );
          })}
        <div style={{ position: "absolute", left: `${LANE_X[playerLane]}%`, top: "82%", transform: "translate(-50%,-50%)", transition: "left .18s ease" }}>
          <CarTopDownSVG color={theme.vehicleColor ?? "#ef4444"} boosted={boosted} />
        </div>
      </div>
      <div style={feedbackBanner(feedback === "crash" ? "wrong" : feedback)}>
        {feedback === "correct" ? "Speed boost — surging ahead!" : feedback === "wrong" ? "No boost this time — they're catching up!" : feedback === "crash" ? "Hit a cone — lost some ground!" : ""}
      </div>
      {activeGateIdx !== null && q ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 12.5, textAlign: "center" }}>BOOST GATE — answer fast to surge ahead! (rivals keep moving)</div>
          <QuestionPrompt key={q.id} q={q} seconds={qSeconds} onAnswer={onAnswer} />
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
          <button type="button" onClick={() => moveLane(-1)} className="duga-btn" style={{ width: 60, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Move left">
            <ChevronSVG dir="left" />
          </button>
          <button type="button" onClick={() => moveLane(1)} className="duga-btn" style={{ width: 60, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Move right">
            <ChevronSVG dir="right" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gauge engine (the other 6 gauge-mechanic themes): the traveller moves on
// its own (resource draining, visibly advancing) with no question on screen
// at all — that only appears once the resource gets critical and there's a
// stop. Answer correctly and fast: full refill, big jump forward, resume.
// Answer wrong/late: only a token refill and little progress — two misses
// in a row and it runs out for good.
// ---------------------------------------------------------------------------
const PIT_STOP_THRESHOLD = 32;

function GaugeEngine({ theme, questions, difficulty, sessionExpiresAt, onProgress, onFinish }: EngineProps) {
  const total = questions.length;
  const [phase, setPhase] = useState<"driving" | "pitstop">("driving");
  const [gauge, setGauge] = useState(100);
  const [qi, setQi] = useState(0);
  const [position, setPosition] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const answersRef = useRef<EngineAnswer[]>([]);
  const statsRef = useRef({ correct: 0, done: false, misses: 0 });
  const gaugeRef = useRef(100);
  const positionRef = useRef(0);
  const phaseRef = useRef<"driving" | "pitstop">("driving");
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

  // Drive tick: only runs while actually driving — fuel drains and the car
  // creeps toward the next pit stop's position on the track.
  useEffect(() => {
    if (total === 0) return;
    const iv = window.setInterval(() => {
      if (statsRef.current.done || phaseRef.current !== "driving") return;
      gaugeRef.current = Math.max(0, gaugeRef.current - drainRate);
      setGauge(gaugeRef.current);
      const nextCheckpoint = Math.min(100, ((qi + 1) / total) * 100);
      positionRef.current = Math.min(Math.max(0, nextCheckpoint - 2), positionRef.current + 1.4);
      setPosition(positionRef.current);
      onProgressRef.current?.({ correct: statsRef.current.correct, answered: answersRef.current.length, gaugeOrStep: gaugeRef.current });
      if (gaugeRef.current <= PIT_STOP_THRESHOLD) {
        phaseRef.current = "pitstop";
        setPhase("pitstop");
      }
    }, 1000);
    return () => window.clearInterval(iv);
  }, [drainRate, qi, total]);

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
    const nextCheckpoint = Math.min(100, ((qi + 1) / total) * 100);
    if (isCorrect) {
      gaugeRef.current = 100;
      statsRef.current.correct += 1;
      statsRef.current.misses = 0;
      positionRef.current = nextCheckpoint;
      setFeedback("correct");
    } else {
      gaugeRef.current = Math.max(0, gaugeRef.current + 8);
      statsRef.current.misses += 1;
      positionRef.current = Math.min(nextCheckpoint, positionRef.current + (nextCheckpoint - positionRef.current) * 0.4);
      setFeedback("wrong");
    }
    setGauge(gaugeRef.current);
    setPosition(positionRef.current);
    window.setTimeout(() => setFeedback(null), 600);

    if (!isCorrect && statsRef.current.misses >= 2) {
      window.setTimeout(() => finish("lost"), 500);
      return;
    }
    const nextQi = qi + 1;
    if (nextQi >= total) {
      positionRef.current = 100;
      setPosition(100);
      window.setTimeout(() => finish("won"), 500);
      return;
    }
    window.setTimeout(() => {
      setQi(nextQi);
      phaseRef.current = "driving";
      setPhase("driving");
    }, 700);
  }

  if (total === 0) {
    return <div style={{ padding: 20, textAlign: "center", color: "#fff", background: theme.bg, borderRadius: 16, fontWeight: 700 }}>This game has no questions yet.</div>;
  }

  const q = questions[qi];
  const finished = statsRef.current.done;
  const isCar = theme.sceneKind === "car";
  return (
    <div style={{ display: "grid", gap: 12, padding: 16, borderRadius: 16, background: theme.bg }}>
      <TrackScene theme={theme} progressPct={position} driving={phase === "driving"} finished={finished} />
      <FuelGaugeDial value={gauge} label={theme.gaugeLabel} />
      <div style={feedbackBanner(feedback)}>{feedback === "correct" ? `${theme.gaugeLabel} restored — moving again!` : feedback === "wrong" ? `Missed it — ${theme.gaugeLabel.toLowerCase()} still critical!` : ""}</div>
      {phase === "pitstop" && q ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isCar ? <GasStationSVG /> : <SupplyStopSVG />}
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 12.5 }}>{isCar ? "PIT STOP" : "CRITICAL"} — answer fast to recover!</span>
          </div>
          <QuestionPrompt key={q.id} q={q} seconds={qSeconds} onAnswer={onAnswer} />
        </div>
      ) : (
        <div style={{ textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 13, opacity: 0.85 }}>{isCar ? "Cruising" : "Moving on"} — {theme.gaugeLabel.toLowerCase()} dropping…</div>
      )}
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
  if (props.theme.mechanic === "gauge" && props.theme.sceneKind === "car") return <RaceEngine {...props} />;
  if (props.theme.mechanic === "gauge") return <GaugeEngine {...props} />;
  if (props.theme.mechanic === "escape") return <EscapeEngine {...props} />;
  return <ClimbEngine {...props} />;
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 100 100" width="56" height="56" style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,.3))" }}>
      <path d="M20 18 H80 V38 Q80 60 50 60 Q20 60 20 38 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="3" />
      <path d="M20 22 H6 Q6 42 26 46" fill="none" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
      <path d="M80 22 H94 Q94 42 74 46" fill="none" stroke="#b45309" strokeWidth="4" strokeLinecap="round" />
      <rect x="44" y="60" width="12" height="14" fill="#b45309" />
      <rect x="30" y="74" width="40" height="10" rx="2" fill="#92400e" />
      <path d="M50 26 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1 Z" fill="#fef3c7" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 100 100" width="52" height="52" style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,.3))" }}>
      <circle cx="50" cy="50" r="42" fill="#7f1d1d" stroke="#fecaca" strokeWidth="5" />
      <rect x="26" y="43" width="48" height="14" rx="3" fill="#fecaca" />
    </svg>
  );
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
      <div style={{ display: "flex", justifyContent: "center" }}>{won ? <TrophyIcon /> : <StopIcon />}</div>
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
        <div style={{ color: "#fff", fontWeight: 800 }}>A live session for this game is running right now — play alongside classmates and see each other&apos;s live progress?</div>
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
