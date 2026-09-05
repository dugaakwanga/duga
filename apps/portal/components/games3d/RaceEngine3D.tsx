"use client";

// Fuel Rush's real 3D engine — same race rules/pacing as the 2D RaceEngine
// (shared constants imported from GameEngines.tsx), but rendered as an
// actual low-poly 3D scene with React Three Fiber instead of absolutely
// positioned SVG. The simulation advances every rendered frame (not a fixed
// 100ms tick) and every mesh position is mutated directly via refs inside
// useFrame — no React re-render for the 60fps motion — so lane changes and
// forward motion read as smooth, continuous movement rather than steps.
// Only discrete events (a boost gate opening, a crash, the finish) go
// through React state, since those drive the HTML HUD overlay.

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  RACE_BASE_SPEED,
  RACE_BOOST_JUMP,
  RACE_CRASH_PENALTY,
  RACE_LOOKAHEAD,
  QuestionPrompt,
  feedbackBanner,
  questionSecondsFor,
  ChevronSVG,
  type EngineProps,
  type EngineAnswer,
  type EngineOutcome,
  type RaceOpponent,
  type RaceObstacle,
  type RaceGate,
} from "../GameEngines";

const LANE_X = [-2.6, 0, 2.6];
const PROGRESS_TO_Z = 1.15; // world units of forward distance per 1% of race
const CULL_BEHIND_PCT = -3; // stop rendering something once this far behind the player

function relZ(atProgress: number, playerProgress: number): number {
  return -(atProgress - playerProgress) * PROGRESS_TO_Z;
}

// ---------------------------------------------------------------------------
// Procedural low-poly meshes — flat boxes/cylinders/cones, no external
// assets, so there's nothing to download beyond the three.js/fiber code
// itself (dynamically imported once, lazily, from GameEngines.tsx).
// ---------------------------------------------------------------------------
function Car3D({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[1.1, 0.42, 2.15]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.72, -0.12]}>
        <boxGeometry args={[0.78, 0.3, 0.95]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {[
        [-0.58, 0.2, 0.72],
        [0.58, 0.2, 0.72],
        [-0.58, 0.2, -0.72],
        [0.58, 0.2, -0.72],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.24, 14]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
    </group>
  );
}

function Cone3D() {
  return (
    <group>
      <mesh position={[0, 0.32, 0]}>
        <coneGeometry args={[0.26, 0.64, 12]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <torusGeometry args={[0.15, 0.032, 8, 16]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

const DASH_COUNT = 22;
const DASH_SPACING = 3.4;
const DASH_CYCLE = DASH_COUNT * DASH_SPACING;

// Scrolling lane-divider dashes — purely cosmetic "we are moving" cue.
// Repositioned every frame by the same distance the world has scrolled,
// wrapped with modulo so the strip of dashes appears endless.
function LaneDivider({ x, offsetRef }: { x: number; offsetRef: React.MutableRefObject<number> }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    for (let i = 0; i < DASH_COUNT; i++) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      const base = i * DASH_SPACING;
      let z = -(((base + offsetRef.current) % DASH_CYCLE));
      if (z > 2) z -= DASH_CYCLE;
      mesh.position.z = z;
    }
  });
  return (
    <>
      {Array.from({ length: DASH_COUNT }, (_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={[x, 0.02, -i * DASH_SPACING]}>
          <boxGeometry args={[0.1, 0.02, 1.6]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
    </>
  );
}

interface SceneProps {
  questions: EngineProps["questions"];
  sessionExpiresAt?: number;
  onProgress?: EngineProps["onProgress"];
  vehicleColor: string;
  onHud: (hud: { playerProgress: number; position: number; feedback: "correct" | "wrong" | "crash" | null; boosted: boolean }) => void;
  onGate: (idx: number | null) => void;
  onFinish: (answers: EngineAnswer[], outcome: EngineOutcome, correct: number) => void;
  answerSignal: { qIdx: number; selectedIndex: number } | null;
  onAnswerConsumed: () => void;
  registerMoveLane: (fn: (dir: -1 | 1) => void) => void;
}

function Scene({ questions, sessionExpiresAt, onProgress, vehicleColor, onHud, onGate, onFinish, answerSignal, onAnswerConsumed, registerMoveLane }: SceneProps) {
  const total = questions.length;
  const { camera } = useThree();

  const playerProgressRef = useRef(0);
  const playerLaneRef = useRef(1);
  const currentXRef = useRef(LANE_X[1]!);
  const scrollOffsetRef = useRef(0);
  const activeGateRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const answersRef = useRef<EngineAnswer[]>([]);
  const correctRef = useRef(0);

  const opponentsRef = useRef<RaceOpponent[]>([
    { id: "o1", lane: 0, progress: 0, speed: RACE_BASE_SPEED * (0.86 + Math.random() * 0.18), color: "#2563eb", name: "Rival 1" },
    { id: "o2", lane: 2, progress: 0, speed: RACE_BASE_SPEED * (0.86 + Math.random() * 0.18), color: "#16a34a", name: "Rival 2" },
  ]);
  const obstaclesRef = useRef<RaceObstacle[]>(
    total === 0
      ? []
      : Array.from({ length: total }, (_, i) => {
          const gap = 90 / (total + 1);
          return { id: `ob${i}`, lane: Math.floor(Math.random() * 3), atProgress: gap * (i + 1) - gap * 0.4, hit: false };
        }),
  );
  const gatesRef = useRef<RaceGate[]>(
    total === 0
      ? []
      : Array.from({ length: total }, (_, i) => {
          const gap = 90 / (total + 1);
          return { id: `g${i}`, atProgress: gap * (i + 1), questionIndex: i, consumed: false };
        }),
  );

  const carRef = useRef<THREE.Group>(null);
  const opponentRefs = useRef<(THREE.Group | null)[]>([]);
  const obstacleRefs = useRef<(THREE.Group | null)[]>([]);
  const gateRefs = useRef<(THREE.Mesh | null)[]>([]);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onHudRef = useRef(onHud);
  onHudRef.current = onHud;
  const onGateRef = useRef(onGate);
  onGateRef.current = onGate;

  const hudThrottleRef = useRef(0);

  const finish = useCallback(
    (outcome: EngineOutcome) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onFinishRef.current(answersRef.current, outcome, correctRef.current);
    },
    [],
  );

  function moveLane(dir: -1 | 1) {
    if (doneRef.current || activeGateRef.current !== null) return;
    playerLaneRef.current = Math.max(0, Math.min(2, playerLaneRef.current + dir));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveLane(-1);
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveLane(1);
    }
    window.addEventListener("keydown", onKey);
    registerMoveLane(moveLane);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const t = window.setTimeout(() => finish("timeup"), Math.max(0, sessionExpiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [sessionExpiresAt, finish]);

  // Handle an answer coming from the HTML question overlay above the canvas.
  useEffect(() => {
    if (!answerSignal) return;
    const { qIdx, selectedIndex } = answerSignal;
    if (activeGateRef.current !== qIdx) {
      onAnswerConsumed();
      return;
    }
    const q = questions[qIdx]!;
    answersRef.current.push({ questionId: q.id, selectedIndex });
    const isCorrect = selectedIndex === q.correctIndex;
    let crashFlag: "correct" | "wrong" = "wrong";
    if (isCorrect) {
      correctRef.current += 1;
      playerProgressRef.current = Math.min(100, playerProgressRef.current + RACE_BOOST_JUMP);
      crashFlag = "correct";
    }
    activeGateRef.current = null;
    onGateRef.current(null);
    onHudRef.current({ playerProgress: playerProgressRef.current, position: 1, feedback: crashFlag, boosted: isCorrect });
    window.setTimeout(() => onHudRef.current({ playerProgress: playerProgressRef.current, position: 1, feedback: null, boosted: false }), 750);
    if (playerProgressRef.current >= 100) window.setTimeout(() => finish("won"), 300);
    onAnswerConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerSignal]);

  // Fixed-timestep accumulator: the game LOGIC (speed balance, when gates
  // and obstacles trigger) always advances in exact 100ms steps — matching
  // the proven 2D engine's pacing precisely regardless of the host's actual
  // frame rate — while rendering (lane easing, camera, mesh positions)
  // still runs every real frame for smoothness. Without this, naively
  // multiplying by the raw per-frame delta makes the race run at whatever
  // rate frames happen to arrive: rock-solid on a fast device, but visibly
  // slower anywhere frames come less often than every 100ms (a throttled
  // background tab, a slow device, or — as caught during testing — this
  // project's own automated browser tooling, which doesn't paint on a
  // steady clock the way a real device does).
  const FIXED_STEP = 0.1;
  // Generous on purpose: frames aren't guaranteed to arrive every ~16ms —
  // a loaded device, a throttled tab, or (as measured while building this)
  // this project's own automated browser tooling can all leave gaps of a
  // second or more between rendered frames. Whenever a frame does arrive,
  // it should fully catch the simulation up to real elapsed time rather
  // than silently crediting less than actually passed — that's what was
  // making the race feel slow in testing even though the code "looked"
  // like it ran at the right speed. A true multi-minute backgrounding
  // still only catches up 8s worth before the rest is dropped, which is
  // the right call anyway — nobody wants a race to finish itself while
  // their phone was locked.
  const MAX_STEPS_PER_FRAME = 80;
  const accumulatorRef = useRef(0);

  function simStep(step: number) {
    // Opponents always advance, even while a question is open — matches the
    // 2D engine's "rivals keep moving" pressure during a boost gate.
    let anyOpponentFinished = false;
    for (const o of opponentsRef.current) {
      o.progress = Math.min(100, o.progress + o.speed * step);
      if (o.progress >= 100) anyOpponentFinished = true;
    }
    if (anyOpponentFinished) {
      finish("lost");
      return;
    }

    if (activeGateRef.current === null) {
      playerProgressRef.current = Math.min(100, playerProgressRef.current + RACE_BASE_SPEED * step);
      scrollOffsetRef.current += RACE_BASE_SPEED * step * PROGRESS_TO_Z;
      onProgressRef.current?.({ correct: correctRef.current, answered: answersRef.current.length, gaugeOrStep: playerProgressRef.current });

      let crashed = false;
      for (const ob of obstaclesRef.current) {
        if (!ob.hit && ob.lane === playerLaneRef.current && Math.abs(ob.atProgress - playerProgressRef.current) < 1.3) {
          ob.hit = true;
          crashed = true;
        }
      }
      if (crashed) {
        playerProgressRef.current = Math.max(0, playerProgressRef.current - RACE_CRASH_PENALTY);
        onHudRef.current({ playerProgress: playerProgressRef.current, position: 1, feedback: "crash", boosted: false });
        window.setTimeout(() => onHudRef.current({ playerProgress: playerProgressRef.current, position: 1, feedback: null, boosted: false }), 600);
      }

      const gate = gatesRef.current.find((g) => !g.consumed && playerProgressRef.current >= g.atProgress);
      if (gate) {
        gate.consumed = true;
        activeGateRef.current = gate.questionIndex;
        onGateRef.current(gate.questionIndex);
      }

      if (playerProgressRef.current >= 100) {
        finish("won");
      }
    }
  }

  useFrame((_, rawDelta) => {
    if (doneRef.current) return;
    const delta = Math.min(rawDelta, 8); // only guards against a truly pathological stall (e.g. minutes backgrounded)

    accumulatorRef.current += delta;
    let steps = 0;
    while (accumulatorRef.current >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME && !doneRef.current) {
      simStep(FIXED_STEP);
      accumulatorRef.current -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulatorRef.current = 0; // drop the rest rather than spiral
    if (doneRef.current) return;

    // Smooth lane change: damp the car's current X toward its target lane.
    const targetX = LANE_X[playerLaneRef.current]!;
    currentXRef.current = THREE.MathUtils.damp(currentXRef.current, targetX, 9, delta);
    if (carRef.current) {
      carRef.current.position.x = currentXRef.current;
      const lean = THREE.MathUtils.clamp((targetX - currentXRef.current) * -0.35, -0.28, 0.28);
      carRef.current.rotation.z = THREE.MathUtils.damp(carRef.current.rotation.z, lean, 10, delta);
    }

    // Camera partially follows the car's lane position for a subtle,
    // game-feel chase-cam rather than a rigid 1:1 lock.
    const camX = currentXRef.current * 0.32;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, camX, 6, delta);
    camera.position.y = 3.5;
    camera.position.z = 7.2;
    camera.lookAt(currentXRef.current * 0.55, 0.8, -6);

    // Imperatively reposition every scrolling mesh — no React re-render.
    opponentsRef.current.forEach((o, i) => {
      const grp = opponentRefs.current[i];
      if (!grp) return;
      const rel = o.progress - playerProgressRef.current;
      if (rel < CULL_BEHIND_PCT || rel > RACE_LOOKAHEAD) {
        grp.visible = false;
        return;
      }
      grp.visible = true;
      grp.position.set(LANE_X[o.lane]!, 0, relZ(o.progress, playerProgressRef.current));
    });
    obstaclesRef.current.forEach((ob, i) => {
      const grp = obstacleRefs.current[i];
      if (!grp) return;
      const rel = ob.atProgress - playerProgressRef.current;
      if (ob.hit || rel < CULL_BEHIND_PCT || rel > RACE_LOOKAHEAD) {
        grp.visible = false;
        return;
      }
      grp.visible = true;
      grp.position.set(LANE_X[ob.lane]!, 0, relZ(ob.atProgress, playerProgressRef.current));
    });
    gatesRef.current.forEach((g, i) => {
      const mesh = gateRefs.current[i];
      if (!mesh) return;
      const rel = g.atProgress - playerProgressRef.current;
      if (g.consumed || rel < CULL_BEHIND_PCT || rel > RACE_LOOKAHEAD) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.z = relZ(g.atProgress, playerProgressRef.current);
      mesh.scale.y = 1 + Math.sin(performance.now() / 220) * 0.12;
    });

    // Throttle the HUD text updates (position + % of race) to ~8/sec —
    // plenty smooth for text, far cheaper than 60 React re-renders/sec.
    hudThrottleRef.current += delta;
    if (hudThrottleRef.current > 0.12) {
      hudThrottleRef.current = 0;
      const racers = [{ id: "you", progress: playerProgressRef.current }, ...opponentsRef.current.map((o) => ({ id: o.id, progress: o.progress }))].sort((a, b) => b.progress - a.progress);
      const position = racers.findIndex((r) => r.id === "you") + 1;
      onHudRef.current({ playerProgress: playerProgressRef.current, position, feedback: null, boosted: false });
    }
  });

  if (total === 0) return null;

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 10, 4]} intensity={0.9} />
      <fog attach="fog" args={["#1e293b", 14, 46]} />
      <color attach="background" args={["#0f172a"]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -40]}>
        <planeGeometry args={[9.5, 150]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-5.3, -0.01, -40]}>
        <planeGeometry args={[2, 150]} />
        <meshStandardMaterial color="#166534" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5.3, -0.01, -40]}>
        <planeGeometry args={[2, 150]} />
        <meshStandardMaterial color="#166534" />
      </mesh>

      <LaneDivider x={-1.3} offsetRef={scrollOffsetRef} />
      <LaneDivider x={1.3} offsetRef={scrollOffsetRef} />

      <group ref={carRef} position={[LANE_X[1]!, 0, 0]}>
        <Car3D color={vehicleColor} />
      </group>

      {opponentsRef.current.map((o, i) => (
        <group key={o.id} ref={(el) => { opponentRefs.current[i] = el; }} position={[LANE_X[o.lane]!, 0, -999]}>
          <Car3D color={o.color} />
        </group>
      ))}

      {obstaclesRef.current.map((ob, i) => (
        <group key={ob.id} ref={(el) => { obstacleRefs.current[i] = el; }} position={[LANE_X[ob.lane]!, 0, -999]}>
          <Cone3D />
        </group>
      ))}

      {gatesRef.current.map((g, i) => (
        <mesh key={g.id} ref={(el) => { gateRefs.current[i] = el; }} position={[0, 1.6, -999]}>
          <boxGeometry args={[8.6, 1.4, 0.18]} />
          <meshStandardMaterial color="#facc15" emissive="#eab308" emissiveIntensity={0.5} />
        </mesh>
      ))}
    </>
  );
}

export function RaceEngine3D({ theme, questions, difficulty, sessionExpiresAt, onProgress, onFinish }: EngineProps) {
  const total = questions.length;
  const [hud, setHud] = useState({ playerProgress: 0, position: 1, feedback: null as "correct" | "wrong" | "crash" | null, boosted: false });
  const [activeGateIdx, setActiveGateIdx] = useState<number | null>(null);
  const [answerSignal, setAnswerSignal] = useState<{ qIdx: number; selectedIndex: number } | null>(null);
  const qSeconds = questionSecondsFor(difficulty);
  const moveLaneRef = useRef<(dir: -1 | 1) => void>(() => {});

  if (total === 0) {
    return <div style={{ padding: 20, textAlign: "center", color: "#fff", background: theme.bg, borderRadius: 16, fontWeight: 700 }}>This game has no questions yet.</div>;
  }

  const q = activeGateIdx !== null ? questions[activeGateIdx] : null;
  const positionLabel = hud.position === 1 ? "1st place" : hud.position === 2 ? "2nd place" : "3rd place";

  function onAnswer(selectedIndex: number) {
    if (activeGateIdx === null) return;
    setAnswerSignal({ qIdx: activeGateIdx, selectedIndex });
  }

  return (
    <div style={{ display: "grid", gap: 10, padding: 16, borderRadius: 16, background: theme.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{positionLabel}</span>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{Math.round(hud.playerProgress)}% of race</span>
      </div>
      <div style={{ height: 320, borderRadius: 14, overflow: "hidden" }}>
        <Canvas camera={{ position: [0, 3.5, 7.2], fov: 55, near: 0.1, far: 100 }} dpr={[1, 1.5]}>
          <Scene
            questions={questions}
            sessionExpiresAt={sessionExpiresAt}
            onProgress={onProgress}
            vehicleColor={theme.vehicleColor ?? "#ef4444"}
            onHud={setHud}
            onGate={setActiveGateIdx}
            onFinish={onFinish}
            answerSignal={answerSignal}
            onAnswerConsumed={() => setAnswerSignal(null)}
            registerMoveLane={(fn) => { moveLaneRef.current = fn; }}
          />
        </Canvas>
      </div>
      <div style={feedbackBanner(hud.feedback === "crash" ? "wrong" : hud.feedback)}>
        {hud.feedback === "correct" ? "Speed boost — surging ahead!" : hud.feedback === "wrong" ? "No boost this time — they're catching up!" : hud.feedback === "crash" ? "Hit a cone — lost some ground!" : ""}
      </div>
      {activeGateIdx !== null && q ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 12.5, textAlign: "center" }}>BOOST GATE — answer fast to surge ahead! (rivals keep moving)</div>
          <QuestionPrompt key={q.id} q={q} seconds={qSeconds} onAnswer={onAnswer} />
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
          <button type="button" onClick={() => moveLaneRef.current(-1)} className="duga-btn" style={{ width: 60, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Move left">
            <ChevronSVG dir="left" />
          </button>
          <button type="button" onClick={() => moveLaneRef.current(1)} className="duga-btn" style={{ width: 60, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Move right">
            <ChevronSVG dir="right" />
          </button>
        </div>
      )}
    </div>
  );
}
