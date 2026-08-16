"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type GameKind = "memory" | "snake" | "balloon" | "ttt" | "scramble";

export const GAME_CHOICES: Array<{ kind: GameKind; label: string; emoji: string; desc: string }> = [
  { kind: "memory", label: "Memory Match", emoji: "🃏", desc: "Flip the cards and find every matching pair." },
  { kind: "snake", label: "Snake", emoji: "🐍", desc: "Eat the food, grow longer and don't crash." },
  { kind: "balloon", label: "Balloon Pop", emoji: "🎈", desc: "Pop as many balloons as you can before time runs out." },
  { kind: "ttt", label: "Tic-Tac-Toe", emoji: "⭕", desc: "Beat the computer on a 3×3 grid." },
  { kind: "scramble", label: "Word Scramble", emoji: "🔤", desc: "Unscramble the letters to build the word." },
];

// Which game a game category suggests first (players can still pick any).
export function recommendedGame(category: string): GameKind {
  switch (category) {
    case "MEMORY":
      return "memory";
    case "MATH":
      return "snake";
    case "WORD":
      return "scramble";
    case "PUZZLE":
      return "ttt";
    default:
      return "balloon";
  }
}

// Deterministic game suggestion seeded by the game record (id/title) so each
// educational game consistently launches a DIFFERENT mini-game instead of every
// game in a category always replaying the same one. ~60% prefer the category
// match, the rest rotate through the other games.
export function recommendedGameFor(category: string, seed: string): GameKind {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const preferred = recommendedGame(category);
  if (h % 10 < 6) return preferred;
  const others = GAME_CHOICES.map((g) => g.kind).filter((k) => k !== preferred);
  return others[h % others.length] ?? preferred;
}

function clampScore(score: number): number {
  return Math.max(10, Math.min(100, Math.round(score)));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Shared game chrome (score, title, level, back).
// ---------------------------------------------------------------------------
function GameFrame({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
      </div>
      {children}
    </div>
  );
}

function LevelBadge({ level }: { level: number }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 800,
        color: "#fff",
        background: "linear-gradient(135deg, #f59e0b, #ef4444)",
        padding: "3px 10px",
        borderRadius: 999,
        boxShadow: "0 2px 6px rgba(245,158,11,.35)",
        whiteSpace: "nowrap",
      }}
    >
      Level {level}
    </span>
  );
}

function LevelUpFlash({ show, note }: { show: boolean; note?: string }) {
  if (!show) return null;
  return (
    <div
      style={{
        textAlign: "center",
        fontSize: 15,
        fontWeight: 800,
        color: "#b45309",
        background: "#fef3c7",
        border: "1px solid #fcd34d",
        borderRadius: 10,
        padding: "8px 12px",
      }}
    >
      ⭐ Level up! {note ?? "It gets harder — keep going!"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Match
// ---------------------------------------------------------------------------
const MEMORY_POOL = ["🍎", "🍌", "🍇", "🍓", "🍉", "🍍", "🥕", "🌽"];
const MEMORY_MAX_LEVEL = 3;

interface MemoryCard {
  id: number;
  emoji: string;
}

function pairsForLevel(level: number): number {
  return level + 2; // 3, 4, 5 pairs
}

function makeMemoryCards(level: number): MemoryCard[] {
  const emojis = MEMORY_POOL.slice(0, pairsForLevel(level));
  return shuffle([...emojis, ...emojis].map((emoji, id) => ({ id, emoji })));
}

function memoryTotalPairs(): number {
  let total = 0;
  for (let l = 1; l <= MEMORY_MAX_LEVEL; l++) total += pairsForLevel(l);
  return total;
}

function MemoryGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [level, setLevel] = useState(1);
  const [pairs, setPairs] = useState(() => pairsForLevel(1));
  const [cards, setCards] = useState<MemoryCard[]>(() => makeMemoryCards(1));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [levelUp, setLevelUp] = useState(false);
  const levelRef = useRef(1);
  const matchesRef = useRef(0);
  const doneRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    if (matched.length === 0) return;
    if (matched.length === pairs * 2 && !doneRef.current) {
      matchesRef.current += pairs;
      if (levelRef.current >= MEMORY_MAX_LEVEL) {
        doneRef.current = true;
        onFinishRef.current(clampScore((matchesRef.current / memoryTotalPairs()) * 100));
      } else {
        const nextLevel = levelRef.current + 1;
        levelRef.current = nextLevel;
        setLevel(nextLevel);
        setPairs(pairsForLevel(nextLevel));
        setCards(makeMemoryCards(nextLevel));
        setMatched([]);
        setFlipped([]);
        setMoves(0);
        setLevelUp(true);
        window.setTimeout(() => setLevelUp(false), 1100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched]);

  function flip(id: number) {
    if (flipped.includes(id) || matched.includes(id) || flipped.length === 2) return;
    const next = [...flipped, id];
    setFlipped(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const a = next[0]!;
      const b = next[1]!;
      const first = cards[a]!;
      const second = cards[b]!;
      if (first.emoji === second.emoji) {
        window.setTimeout(() => {
          setMatched((m) => [...m, a, b]);
          setFlipped([]);
        }, 300);
      } else {
        window.setTimeout(() => setFlipped([]), 650);
      }
    }
  }

  return (
    <GameFrame
      title="Memory Match"
      right={
        <>
          <LevelBadge level={level} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Moves: {moves}</span>
        </>
      }
    >
      <LevelUpFlash show={levelUp} note="More pairs to find!" />
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>Flip two cards to find each matching pair.</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${level >= 3 ? 5 : 4}, minmax(44px, 1fr))`, gap: 8, maxWidth: 360, margin: "0 auto" }}>
        {cards.map((card, index) => {
          const isUp = flipped.includes(index) || matched.includes(index);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => flip(index)}
              aria-label={isUp ? card.emoji : "Hidden card"}
              style={{
                aspectRatio: "1",
                fontSize: 24,
                borderRadius: 10,
                border: `1px solid ${matched.includes(index) ? "var(--duga-gold)" : "var(--duga-border)"}`,
                background: isUp ? "#ffffff" : "linear-gradient(135deg, var(--duga-primary), var(--duga-gold))",
                color: "#fff",
                cursor: "pointer",
                boxShadow: matched.includes(index) ? "0 0 0 2px var(--duga-gold)" : undefined,
              }}
            >
              {isUp ? card.emoji : ""}
            </button>
          );
        })}
      </div>
    </GameFrame>
  );
}

// ---------------------------------------------------------------------------
// Snake
// ---------------------------------------------------------------------------
const GRID = 20;
const CELL = 16;
const SNAKE_LEVEL_EATEN = 5;

interface SnakeState {
  snake: Array<[number, number]>;
  dir: [number, number];
  food: [number, number];
  eaten: number;
  level: number;
  running: boolean;
  finished: boolean;
}

function SnakeGame({ onFinish }: { onFinish: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SnakeState>({ snake: [[10, 10]], dir: [1, 0], food: [15, 10], eaten: 0, level: 1, running: true, finished: false });
  const [eaten, setEaten] = useState(0);
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState("Use the arrow keys to move");
  const [levelUp, setLevelUp] = useState(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finish = useCallback((score: number) => {
    const s = stateRef.current;
    if (s.finished) return;
    s.finished = true;
    s.running = false;
    onFinishRef.current(clampScore(score));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function randomFood(snake: Array<[number, number]>): [number, number] {
      for (let attempt = 0; attempt < 500; attempt++) {
        const cell: [number, number] = [Math.floor(Math.random() * GRID), Math.floor(Math.random() * GRID)];
        if (!snake.some(([x, y]) => x === cell[0] && y === cell[1])) return cell;
      }
      return [0, 0];
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, GRID * CELL, GRID * CELL);
      const s = stateRef.current;
      s.snake.forEach(([x, y], index) => {
        ctx.fillStyle = index === 0 ? "var(--duga-primary, #1e3a8a)" : "#2563eb";
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      });
      ctx.fillStyle = "var(--duga-gold, #d4af37)";
      ctx.fillRect(s.food[0] * CELL + 3, s.food[1] * CELL + 3, CELL - 6, CELL - 6);
    }

    function tick() {
      const s = stateRef.current;
      if (!s.running) return;
      const head = s.snake[0]!;
      const next: [number, number] = [head[0] + s.dir[0], head[1] + s.dir[1]];
      const hitWall = next[0] < 0 || next[0] >= GRID || next[1] < 0 || next[1] >= GRID;
      const hitSelf = s.snake.some(([x, y]) => x === next[0] && y === next[1]);
      if (hitWall || hitSelf) {
        finish(s.eaten * 12 + (s.level - 1) * 15);
        return;
      }
      const ate = next[0] === s.food[0] && next[1] === s.food[1];
      s.snake = [next, ...s.snake];
      if (ate) {
        s.eaten += 1;
        setEaten(s.eaten);
        s.food = randomFood(s.snake);
        if (s.eaten % SNAKE_LEVEL_EATEN === 0) {
          s.level += 1;
          setLevel(s.level);
          setLevelUp(true);
          window.setTimeout(() => setLevelUp(false), 1000);
        }
      } else {
        s.snake.pop();
      }
      draw();
    }

    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      const [dx, dy] = s.dir;
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
      };
      const next = map[e.key.toLowerCase()];
      if (!next) return;
      e.preventDefault();
      if (next[0] === -dx && next[1] === -dy) return;
      s.dir = next;
      setStatus("Good luck!");
    };
    window.addEventListener("keydown", onKey);
    const iv = window.setInterval(tick, Math.max(60, 140 - (stateRef.current.level - 1) * 20));
    draw();
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish, level]);

  function setDir(next: [number, number]) {
    const s = stateRef.current;
    const [dx, dy] = s.dir;
    if (next[0] === -dx && next[1] === -dy) return;
    s.dir = next;
  }

  return (
    <GameFrame
      title="Snake"
      right={
        <>
          <LevelBadge level={level} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>🍎 {eaten}</span>
        </>
      }
    >
      <LevelUpFlash show={levelUp} note="Speed increases!" />
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>{status}</p>
      <div style={{ display: "grid", placeItems: "center" }}>
        <canvas
          ref={canvasRef}
          width={GRID * CELL}
          height={GRID * CELL}
          style={{ border: "1px solid var(--duga-border)", borderRadius: 12, background: "#f8fafc", touchAction: "none", maxWidth: "100%" }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 48px)", gap: 6, justifyContent: "center" }}>
        <span />
        <button type="button" className="duga-btn duga-btn--outline duga-btn--sm" onClick={() => setDir([0, -1])}>▲</button>
        <span />
        <button type="button" className="duga-btn duga-btn--outline duga-btn--sm" onClick={() => setDir([-1, 0])}>◀</button>
        <span />
        <button type="button" className="duga-btn duga-btn--outline duga-btn--sm" onClick={() => setDir([1, 0])}>▶</button>
        <span />
        <button type="button" className="duga-btn duga-btn--outline duga-btn--sm" onClick={() => setDir([0, 1])}>▼</button>
        <span />
      </div>
    </GameFrame>
  );
}

// ---------------------------------------------------------------------------
// Balloon Pop
// ---------------------------------------------------------------------------
interface Balloon {
  id: number;
  x: number;
  y: number;
  color: string;
  r: number;
}

const BALLOON_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899"];
const BALLOON_LEVEL_POP = 10;

function BalloonPop({ onFinish }: { onFinish: (score: number) => void }) {
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [popped, setPopped] = useState(0);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(30);
  const [levelUp, setLevelUp] = useState(false);
  const doneRef = useRef(false);
  const idRef = useRef(0);
  const poppedRef = useRef(0);
  const levelRef = useRef(1);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    poppedRef.current = popped;
  }, [popped]);

  useEffect(() => {
    const spawnEvery = Math.max(60, 125 - levelRef.current * 12);
    const maxBalloons = 9 + levelRef.current * 2;
    const speed = 2 + (levelRef.current - 1);
    const iv = window.setInterval(() => {
      setBalloons((prev) => {
        let next = prev.map((b) => ({ ...b, y: b.y - speed }));
        if (Math.random() < 0.55 && prev.length < maxBalloons) {
          idRef.current += 1;
          next = [
            ...next,
            {
              id: idRef.current,
              x: 12 + Math.random() * 82,
              y: 105,
              color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)] ?? "#ef4444",
              r: 18 + Math.random() * 10,
            },
          ];
        }
        return next.filter((b) => b.y > -30);
      });
      setTimeLeft((t) => {
        if (t <= 0) return 0;
        const next = t - 0.1;
        if (next <= 0 && !doneRef.current) {
          doneRef.current = true;
          window.clearInterval(iv);
          window.setTimeout(() => onFinishRef.current(clampScore(poppedRef.current * 5 + (levelRef.current - 1) * 12)), 200);
        }
        return next <= 0 ? 0 : next;
      });
    }, spawnEvery);
    return () => window.clearInterval(iv);
  }, [level]);

  function pop(id: number) {
    setBalloons((prev) => prev.filter((b) => b.id !== id));
    setPopped((p) => {
      const next = p + 1;
      poppedRef.current = next;
      if (next % BALLOON_LEVEL_POP === 0) {
        levelRef.current += 1;
        setLevel(levelRef.current);
        setLevelUp(true);
        window.setTimeout(() => setLevelUp(false), 1000);
      }
      return next;
    });
  }

  return (
    <GameFrame
      title="Balloon Pop"
      right={
        <>
          <LevelBadge level={level} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>🎈 {popped} · ⏱ {timeLeft.toFixed(1)}s</span>
        </>
      }
    >
      <LevelUpFlash show={levelUp} note="Balloons come faster!" />
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>Click the balloons to pop them before they float away!</p>
      <div
        style={{
          position: "relative",
          height: 300,
          borderRadius: 12,
          border: "1px solid var(--duga-border)",
          background: "linear-gradient(180deg, #eff6ff, #fdf2f8)",
          overflow: "hidden",
        }}
      >
        {balloons.map((b) => (
          <button
            key={b.id}
            type="button"
            aria-label="Pop a balloon"
            onClick={() => pop(b.id)}
            style={{
              position: "absolute",
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: b.r * 2,
              height: b.r * 2.4,
              borderRadius: "50%",
              background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${b.color})`,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(15,23,42,0.15)",
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </div>
    </GameFrame>
  );
}

// ---------------------------------------------------------------------------
// Tic-Tac-Toe (vs computer, best of 5 with escalating difficulty)
// ---------------------------------------------------------------------------
type TCell = "X" | "O" | null;
const TTT_WINS_TO_FINISH = 3;
const TTT_MAX_ROUNDS = 5;

function TicTacToe({ onFinish }: { onFinish: (score: number) => void }) {
  const [board, setBoard] = useState<TCell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [status, setStatus] = useState("You are X — tap a square to start");
  const [wins, setWins] = useState(0);
  const [level, setLevel] = useState(1);
  const [levelUp, setLevelUp] = useState(false);
  const doneRef = useRef(false);
  const winsRef = useRef(0);
  const roundsRef = useRef(0);
  const levelRef = useRef(1);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  function winner(b: TCell[]): TCell {
    const lines: Array<[number, number, number]> = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    for (const [a, c, d] of lines) {
      const cell = b[a];
      if (cell && cell === b[c] && cell === b[d]) return cell;
    }
    return null;
  }

  function endRound(result: TCell) {
    if (doneRef.current) return;
    roundsRef.current += 1;
    if (result === "X") {
      winsRef.current += 1;
      setWins(winsRef.current);
      if (winsRef.current >= TTT_WINS_TO_FINISH || roundsRef.current >= TTT_MAX_ROUNDS) {
        doneRef.current = true;
        onFinishRef.current(clampScore(winsRef.current * 30 + 10));
        return;
      }
      levelRef.current += 1;
      setLevel(levelRef.current);
      setLevelUp(true);
      window.setTimeout(() => setLevelUp(false), 1000);
      setStatus(`You win! Level ${levelRef.current} — the computer plays smarter now.`);
    } else if (result === "O") {
      setStatus("The computer wins this round — try again!");
    } else {
      setStatus("It's a draw! Next round.");
    }
    if (roundsRef.current >= TTT_MAX_ROUNDS) {
      doneRef.current = true;
      onFinishRef.current(clampScore(winsRef.current * 30 + 10));
      return;
    }
    window.setTimeout(() => {
      setBoard(Array(9).fill(null));
      setTurn("X");
    }, 800);
  }

  function computerMove(b: TCell[]) {
    const empty = b.map((c, i) => (c ? -1 : i)).filter((i): i is number => i >= 0);
    if (empty.length === 0) return;
    const lvl = levelRef.current;
    let pick: number | null = null;
    if (lvl >= 2) {
      // Win if possible.
      for (const i of empty) {
        const copy = [...b];
        copy[i] = "O";
        if (winner(copy) === "O") { pick = i; break; }
      }
    }
    if (pick === null && lvl >= 3) {
      // Block the player's winning move.
      for (const i of empty) {
        const copy = [...b];
        copy[i] = "X";
        if (winner(copy) === "X") { pick = i; break; }
      }
    }
    if (pick === null && lvl >= 4) {
      const center = empty.includes(4) ? 4 : null;
      if (center !== null) pick = center;
    }
    if (pick === null) pick = empty[Math.floor(Math.random() * empty.length)] ?? empty[0]!;
    const next = [...b];
    next[pick] = "O";
    setBoard(next);
    const w = winner(next);
    if (w) endRound(w);
    else if (next.every((c) => c)) endRound(null);
    else setTurn("X");
  }

  function play(index: number) {
    if (board[index] || turn !== "X" || doneRef.current) return;
    const next = [...board];
    next[index] = "X";
    setBoard(next);
    const w = winner(next);
    if (w) {
      endRound(w);
      return;
    }
    if (next.every((c) => c)) {
      endRound(null);
      return;
    }
    setTurn("O");
    setStatus("Computer is thinking…");
    window.setTimeout(() => computerMove(next), 450);
  }

  return (
    <GameFrame
      title="Tic-Tac-Toe"
      right={
        <>
          <LevelBadge level={level} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{turn === "X" ? "Your turn" : "Computer"}</span>
        </>
      }
    >
      <LevelUpFlash show={levelUp} note="The computer plays smarter now." />
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>{status}</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--duga-primary)" }}>You: {wins}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--duga-muted)" }}>Best of 5</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 6, justifyContent: "center" }}>
        {board.map((cell, index) => (
          <button
            key={index}
            type="button"
            onClick={() => play(index)}
            disabled={!!cell || turn !== "X"}
            style={{
              width: 72,
              height: 72,
              fontSize: 30,
              fontWeight: 800,
              borderRadius: 10,
              border: "1px solid var(--duga-border)",
              background: cell ? (cell === "X" ? "var(--duga-primary)" : "#f97316") : "#fff",
              color: "#fff",
              cursor: cell ? "default" : "pointer",
            }}
          >
            {cell}
          </button>
        ))}
      </div>
    </GameFrame>
  );
}

// ---------------------------------------------------------------------------
// Word Scramble
// ---------------------------------------------------------------------------
const SCRAMBLE_WORDS = ["SCHOOL", "GARDEN", "PLAYER", "MUSIC", "TIGER", "BANANA", "ROCKET", "WINDOW", "ELEPHANT"];
const SCRAMBLE_WORDS_PER_LEVEL = 3;
const SCRAMBLE_LEVELS = Math.ceil(SCRAMBLE_WORDS.length / SCRAMBLE_WORDS_PER_LEVEL);

function ScrambleGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [level, setLevel] = useState(1);
  const [round, setRound] = useState(0);
  const [tiles, setTiles] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [correct, setCorrect] = useState(0);
  const [status, setStatus] = useState("Tap the letters in order to build the word.");
  const [levelUp, setLevelUp] = useState(false);
  const doneRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const word = SCRAMBLE_WORDS[(level - 1) * SCRAMBLE_WORDS_PER_LEVEL + round] ?? SCRAMBLE_WORDS[0]!;

  useEffect(() => {
    setTiles(shuffle(word.split("")));
    setPicked([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, level]);

  function tryWord() {
    const answer = picked.map((i) => tiles[i]).join("");
    if (answer !== word) {
      setStatus("Not quite — try again.");
      setPicked([]);
      return;
    }
    const nextCorrect = correct + 1;
    setCorrect(nextCorrect);
    const lastOfLevel = round + 1 >= SCRAMBLE_WORDS_PER_LEVEL;
    const lastLevel = level >= SCRAMBLE_LEVELS;
    if (lastOfLevel && lastLevel) {
      doneRef.current = true;
      onFinishRef.current(clampScore((nextCorrect / SCRAMBLE_WORDS.length) * 100));
    } else if (lastOfLevel) {
      setLevel((l) => l + 1);
      setRound(0);
      setLevelUp(true);
      window.setTimeout(() => setLevelUp(false), 1100);
      setStatus(`Level ${level + 1}! Longer words now.`);
    } else {
      setRound((r) => r + 1);
      setStatus("Correct! Next word.");
    }
  }

  function giveUp() {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinishRef.current(clampScore((correct / SCRAMBLE_WORDS.length) * 100));
  }

  return (
    <GameFrame
      title="Word Scramble"
      right={
        <>
          <LevelBadge level={level} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Round {round + 1}/3 · {correct} ✓</span>
        </>
      }
    >
      <LevelUpFlash show={levelUp} note="The words are getting longer." />
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>{status}</p>
      <div style={{ minHeight: 40, border: "1px dashed var(--duga-border)", borderRadius: 10, padding: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        {picked.map((i) => (
          <button key={i} type="button" onClick={() => setPicked((p) => p.filter((x) => x !== i))} style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid var(--duga-border)", background: "#fff", fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
            {tiles[i]}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {tiles.map((tile, index) => {
          const used = picked.includes(index);
          return (
            <button key={`${index}-${tile}`} type="button" disabled={used} onClick={() => !used && setPicked((p) => [...p, index])} style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid var(--duga-border)", background: used ? "#e2e8f0" : "#fff", fontWeight: 800, fontSize: 18, cursor: used ? "default" : "pointer" }}>
              {tile}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <ButtonDuga onClick={tryWord} disabled={picked.length !== word.length}>
          Check word
        </ButtonDuga>
        <ButtonDuga onClick={giveUp} variant="ghost">
          Give up
        </ButtonDuga>
      </div>
    </GameFrame>
  );
}

// Tiny local button so FunGames.tsx stays self-contained (avoids pulling the
// whole @duga/ui Modal/Button graph into every game play).
function ButtonDuga({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "ghost";
}) {
  const base: CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--duga-primary)",
    background: variant === "ghost" ? "#fff" : "var(--duga-primary)",
    color: variant === "ghost" ? "var(--duga-primary)" : "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontFamily: "inherit",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={base}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Launcher: pick a game, play it, see the score, play again or finish.
// ---------------------------------------------------------------------------
export function FunGameLauncher({
  initialKind,
  preview,
  onFinish,
}: {
  initialKind?: GameKind;
  preview?: boolean;
  onFinish: (score: number) => void;
}) {
  const [kind, setKind] = useState<GameKind | null>(initialKind ?? null);
  const [result, setResult] = useState<number | null>(null);
  const [roundKey, setRoundKey] = useState(0);

  function gameEnded(score: number) {
    setResult(score);
  }

  function playAgain() {
    setResult(null);
    setRoundKey((k) => k + 1);
  }

  if (result !== null) {
    return (
      <div style={{ display: "grid", gap: 14, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--duga-primary-ink)" }}>
          {preview ? "Preview complete" : "Game over — nice play!"}
        </div>
        <div style={{ fontSize: 42, fontWeight: 900, color: "var(--duga-gold)" }}>{result}<span style={{ fontSize: 18 }}>/100</span></div>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--duga-muted)" }}>
          {preview ? "This was a preview — your score was not recorded." : "Your score will be recorded when you finish."}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <ButtonDuga onClick={playAgain}>▶ Play again</ButtonDuga>
          <ButtonDuga onClick={() => { setKind(null); setResult(null); }}>Choose another game</ButtonDuga>
          <ButtonDuga onClick={() => onFinish(result)}>{preview ? "Close preview" : "Finish & record score"}</ButtonDuga>
        </div>
      </div>
    );
  }

  if (kind) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <button type="button" className="duga-btn duga-btn--ghost duga-btn--sm" style={{ justifySelf: "start" }} onClick={() => { setKind(null); setResult(null); }}>
          ← All games
        </button>
        {kind === "memory" && <MemoryGame key={`memory-${roundKey}`} onFinish={gameEnded} />}
        {kind === "snake" && <SnakeGame key={`snake-${roundKey}`} onFinish={gameEnded} />}
        {kind === "balloon" && <BalloonPop key={`balloon-${roundKey}`} onFinish={gameEnded} />}
        {kind === "ttt" && <TicTacToe key={`ttt-${roundKey}`} onFinish={gameEnded} />}
        {kind === "scramble" && <ScrambleGame key={`scramble-${roundKey}`} onFinish={gameEnded} />}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--duga-muted)" }}>
        Pick a real game to play. Games have levels — finish each level to push your score higher.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {GAME_CHOICES.map((g) => (
          <button
            key={g.kind}
            type="button"
            onClick={() => { setKind(g.kind); setResult(null); setRoundKey(0); }}
            style={{
              textAlign: "left",
              padding: 14,
              borderRadius: 12,
              border: "1px solid var(--duga-border)",
              background: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "transform .15s ease, box-shadow .15s ease",
            }}
          >
            <div style={{ fontSize: 26 }}>{g.emoji}</div>
            <div style={{ fontWeight: 800, fontSize: 13.5, margin: "6px 0 2px", color: "var(--duga-primary-ink)" }}>{g.label}</div>
            <div style={{ fontSize: 12, color: "var(--duga-muted)", lineHeight: 1.4 }}>{g.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}