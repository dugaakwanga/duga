"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type GameKind = "memory" | "snake" | "balloon" | "ttt" | "scramble";

// Every built-in game progresses through up to 200 levels. The level is shown
// on the game frame ("Level X/200") and difficulty scales as the player levels
// up, so there is always something to aim for.
export const MAX_LEVEL = 200;

export const GAME_CHOICES: Array<{ kind: GameKind; label: string; emoji: string; desc: string }> = [
  { kind: "memory", label: "Memory Match", emoji: "🃏", desc: "Flip the cards and find every matching pair — level by level." },
  { kind: "snake", label: "Snake", emoji: "🐍", desc: "Eat the food, grow longer and don't crash. Speeds up each level." },
  { kind: "balloon", label: "Balloon Pop", emoji: "🎈", desc: "Pop as many balloons as you can before time runs out." },
  { kind: "ttt", label: "Tic-Tac-Toe", emoji: "⭕", desc: "Beat the computer round after round — it gets smarter." },
  { kind: "scramble", label: "Word Scramble", emoji: "🔤", desc: "Unscramble the letters to build the word. Longer words later." },
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

// Props shared by every game: onFinish reports a score; expiresAt (a timestamp,
// ms) is the optional session time limit imposed by the teacher-assigned
// duration. When the session expires mid-round the game ends with its current
// score so nothing is lost.
interface GameProps {
  onFinish: (score: number) => void;
  expiresAt?: number;
}

// If the assigned play duration runs out, force the round to end with the
// current score. `finish` must guard against double-finish (each game does).
function useExpiry(expiresAt: number | undefined, finish: (score: number) => void, scoreNow: () => number) {
  useEffect(() => {
    if (!expiresAt) return;
    const t = window.setTimeout(() => finish(scoreNow()), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, finish]);
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
      Level {Math.min(level, MAX_LEVEL)}/{MAX_LEVEL}
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

function LifeHearts({ lives }: { lives: number }) {
  return (
    <span style={{ fontSize: 14, letterSpacing: 2 }} aria-label={`${lives} lives left`}>
      {"❤️".repeat(Math.max(0, lives))}
      {"🖤".repeat(Math.max(0, 3 - lives))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Memory Match — complete boards to level up; lose a life when you run out of
// moves on a board. Game over when all lives are gone.
// ---------------------------------------------------------------------------
const MEMORY_POOL = ["🍎", "🍌", "🍇", "🍓", "🍉", "🍍", "🥕", "🌽", "🍒", "🥝", "🫐", "🍋"];
const MEMORY_LIVES = 3;

interface MemoryCard {
  id: number;
  emoji: string;
}

function pairsForLevel(level: number): number {
  return Math.min(3 + Math.floor((level - 1) / 5), 8);
}

function makeMemoryCards(level: number): MemoryCard[] {
  const emojis = MEMORY_POOL.slice(0, pairsForLevel(level));
  return shuffle([...emojis, ...emojis].map((emoji, id) => ({ id, emoji })));
}

function MemoryGame({ onFinish, expiresAt }: GameProps) {
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(MEMORY_LIVES);
  const [cards, setCards] = useState<MemoryCard[]>(() => makeMemoryCards(1));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [levelUp, setLevelUp] = useState(false);
  const stateRef = useRef({ level: 1, lives: MEMORY_LIVES, done: false });
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const pairs = pairsForLevel(level);
  const moveBudget = pairs * 4;

  const finish = useCallback((score: number) => {
    const s = stateRef.current;
    if (s.done) return;
    s.done = true;
    onFinishRef.current(score);
  }, []);

  useExpiry(expiresAt, finish, () => {
    const s = stateRef.current;
    return clampScore((s.level - 1) * 10 + 10);
  });

  const boardComplete = useCallback(() => {
    const s = stateRef.current;
    if (s.done) return;
    if (s.level >= MAX_LEVEL) {
      finish(clampScore((s.level - 1) * 10 + 10));
      return;
    }
    s.level += 1;
    setLevel(s.level);
    setCards(makeMemoryCards(s.level));
    setMatched([]);
    setFlipped([]);
    setMoves(0);
    setLevelUp(true);
    window.setTimeout(() => setLevelUp(false), 1100);
  }, [finish]);

  const loseLife = useCallback(() => {
    const s = stateRef.current;
    if (s.done) return;
    s.lives -= 1;
    setLives(s.lives);
    if (s.lives <= 0) {
      finish(clampScore((s.level - 1) * 10 + 10));
      return;
    }
    setCards(makeMemoryCards(s.level));
    setMatched([]);
    setFlipped([]);
    setMoves(0);
  }, [finish]);

  useEffect(() => {
    if (matched.length === 0) return;
    if (matched.length === pairsForLevel(stateRef.current.level) * 2) {
      boardComplete();
    }
  }, [matched, boardComplete]);

  function flip(id: number) {
    const s = stateRef.current;
    if (s.done) return;
    if (flipped.includes(id) || matched.includes(id) || flipped.length === 2) return;
    const next = [...flipped, id];
    setFlipped(next);
    if (next.length === 2) {
      const nextMoves = moves + 1;
      setMoves(nextMoves);
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
        window.setTimeout(() => {
          setFlipped([]);
          if (nextMoves >= moveBudget) loseLife();
        }, 650);
      }
    }
  }

  return (
    <GameFrame
      title="Memory Match"
      right={
        <>
          <LifeHearts lives={lives} />
          <LevelBadge level={level} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Moves: {moves}</span>
        </>
      }
    >
      <LevelUpFlash show={levelUp} note="More pairs to find!" />
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>
        Flip two cards to find each pair. Clear the board to level up — you lose a life if you run out of moves.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${pairs >= 5 ? 5 : 4}, minmax(44px, 1fr))`, gap: 8, maxWidth: 380, margin: "0 auto" }}>
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
// Snake — eat food to grow. Every 5 foods levels you up and speeds the game.
// ---------------------------------------------------------------------------
const GRID = 20;
const CELL = 16;
const LEVEL_FOOD = 5;

interface SnakeState {
  snake: Array<[number, number]>;
  dir: [number, number];
  nextDir: [number, number];
  food: [number, number];
  eaten: number;
  level: number;
  running: boolean;
  finished: boolean;
}

function SnakeGame({ onFinish, expiresAt }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SnakeState>({ snake: [[10, 10], [9, 10], [8, 10]], dir: [1, 0], nextDir: [1, 0], food: [15, 10], eaten: 0, level: 1, running: true, finished: false });
  const speedRef = useRef(140);
  const [eaten, setEaten] = useState(0);
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState("Use arrow keys or WASD to move");
  const [levelUp, setLevelUp] = useState(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finish = useCallback((score: number) => {
    const s = stateRef.current;
    if (s.finished) return;
    s.finished = true;
    s.running = false;
    onFinishRef.current(score);
  }, []);

  useExpiry(expiresAt, finish, () => {
    const s = stateRef.current;
    return clampScore(s.eaten * 6 + (s.level - 1) * 8);
  });

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
        ctx.fillStyle = index === 0 ? "#1e3a8a" : "#2563eb";
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      });
      ctx.fillStyle = "#d4af37";
      ctx.fillRect(s.food[0] * CELL + 3, s.food[1] * CELL + 3, CELL - 6, CELL - 6);
    }

    function tick() {
      const s = stateRef.current;
      if (!s.running) return;
      s.dir = s.nextDir;
      const head = s.snake[0]!;
      const next: [number, number] = [head[0] + s.dir[0], head[1] + s.dir[1]];
      const hitWall = next[0] < 0 || next[0] >= GRID || next[1] < 0 || next[1] >= GRID;
      const hitSelf = s.snake.some(([x, y]) => x === next[0] && y === next[1]);
      if (hitWall || hitSelf) {
        finish(clampScore(s.eaten * 6 + (s.level - 1) * 8));
        return;
      }
      const ate = next[0] === s.food[0] && next[1] === s.food[1];
      s.snake = [next, ...s.snake];
      if (ate) {
        s.eaten += 1;
        setEaten(s.eaten);
        s.food = randomFood(s.snake);
        if (s.eaten % LEVEL_FOOD === 0) {
          const nl = Math.min(MAX_LEVEL, s.level + 1);
          s.level = nl;
          setLevel(nl);
          speedRef.current = Math.max(50, 140 - (nl - 1) * 10);
          setLevelUp(true);
          window.setTimeout(() => setLevelUp(false), 1000);
          if (nl >= MAX_LEVEL) {
            finish(clampScore(s.eaten * 6 + (s.level - 1) * 8));
            return;
          }
        }
      } else {
        s.snake.pop();
      }
      draw();
    }

    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
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
      const [dx, dy] = s.nextDir;
      if (next[0] === -dx && next[1] === -dy) return;
      s.nextDir = next;
      setStatus("Good luck!");
    };
    window.addEventListener("keydown", onKey);

    let timeout: number | undefined;
    function loop() {
      tick();
      if (stateRef.current.running) timeout = window.setTimeout(loop, speedRef.current);
    }
    loop();

    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish]);

  function setDir(next: [number, number]) {
    const s = stateRef.current;
    const [dx, dy] = s.nextDir;
    if (next[0] === -dx && next[1] === -dy) return;
    s.nextDir = next;
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
// Balloon Pop — pop balloons before they float away; time runs out to end.
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

function BalloonPop({ onFinish, expiresAt }: GameProps) {
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

  const finish = useCallback((score: number) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinishRef.current(score);
  }, []);

  useExpiry(expiresAt, finish, () => clampScore(poppedRef.current * 5 + (levelRef.current - 1) * 10));

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
          finish(clampScore(poppedRef.current * 5 + (levelRef.current - 1) * 10));
        }
        return next <= 0 ? 0 : next;
      });
    }, spawnEvery);
    return () => window.clearInterval(iv);
  }, [finish]);

  function pop(id: number) {
    setBalloons((prev) => prev.filter((b) => b.id !== id));
    setPopped((p) => {
      const next = p + 1;
      poppedRef.current = next;
      if (next % BALLOON_LEVEL_POP === 0 && levelRef.current < MAX_LEVEL) {
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
// Tic-Tac-Toe (vs computer). Each level is best of 3 rounds; win a level to
// advance, lose a level and the game is over. The computer plays smarter as
// your level rises.
// ---------------------------------------------------------------------------
type TCell = "X" | "O" | null;
const TTT_WINS_PER_LEVEL = 2;

function TicTacToe({ onFinish, expiresAt }: GameProps) {
  const [board, setBoard] = useState<TCell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [status, setStatus] = useState("You are X — tap a square to start");
  const [wins, setWins] = useState(0);
  const [cpu, setCpu] = useState(0);
  const [level, setLevel] = useState(1);
  const [levelUp, setLevelUp] = useState(false);
  const stateRef = useRef({ done: false, level: 1, wins: 0, cpu: 0 });
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finish = useCallback((score: number) => {
    const s = stateRef.current;
    if (s.done) return;
    s.done = true;
    onFinishRef.current(score);
  }, []);

  useExpiry(expiresAt, finish, () => clampScore(stateRef.current.wins * 25 + (stateRef.current.level - 1) * 10));

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
    const s = stateRef.current;
    if (s.done) return;
    if (result === "X") {
      s.wins += 1;
      setWins(s.wins);
      if (s.wins >= TTT_WINS_PER_LEVEL) {
        if (s.level >= MAX_LEVEL) {
          finish(clampScore(s.wins * 25 + (s.level - 1) * 10));
          return;
        }
        s.level += 1;
        setLevel(s.level);
        setLevelUp(true);
        window.setTimeout(() => setLevelUp(false), 1000);
        s.wins = 0;
        s.cpu = 0;
        setWins(0);
        setCpu(0);
        setStatus(`Level ${s.level}! The computer plays smarter now.`);
      } else {
        setStatus("Nice — one more round to take this level!");
      }
    } else if (result === "O") {
      s.cpu += 1;
      setCpu(s.cpu);
      if (s.cpu >= TTT_WINS_PER_LEVEL) {
        finish(clampScore(s.wins * 25 + (s.level - 1) * 10));
        return;
      }
      setStatus("The computer takes this round — stay sharp!");
    } else {
      setStatus("It's a draw! Next round.");
    }
    window.setTimeout(() => {
      setBoard(Array(9).fill(null));
      setTurn("X");
    }, 700);
  }

  function computerMove(b: TCell[]) {
    const empty = b.map((c, i) => (c ? -1 : i)).filter((i): i is number => i >= 0);
    if (empty.length === 0) return;
    const lvl = stateRef.current.level;
    let pick: number | null = null;
    if (lvl >= 2) {
      for (const i of empty) {
        const copy = [...b];
        copy[i] = "O";
        if (winner(copy) === "O") { pick = i; break; }
      }
    }
    if (pick === null && lvl >= 3) {
      for (const i of empty) {
        const copy = [...b];
        copy[i] = "X";
        if (winner(copy) === "X") { pick = i; break; }
      }
    }
    if (pick === null && lvl >= 4 && empty.includes(4)) pick = 4;
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
    const s = stateRef.current;
    if (board[index] || turn !== "X" || s.done) return;
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
        <span style={{ fontSize: 13, fontWeight: 700, color: "#f97316" }}>Computer: {cpu}</span>
        <span style={{ fontSize: 12, color: "var(--duga-muted)" }}>First to 2 wins takes the level</span>
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
// Word Scramble — unscramble three words per level. Words get longer as your
// level rises; give up (or run out of time) to end the round.
// ---------------------------------------------------------------------------
const SCRAMBLE_WORDS = [
  "CAT", "DOG", "SUN", "FAN", "BAG", "HAT", "BOX", "CUP", "PEN", "BED",
  "TREE", "STAR", "MOON", "FISH", "BIRD", "BOOK", "HOME", "PLAY", "RAIN", "FIRE",
  "APPLE", "BREAD", "CLOUD", "DREAM", "EARTH", "FLOWER", "GARDEN", "HOUSE", "LIGHT", "MUSIC",
  "SCHOOL", "FRIEND", "BANANA", "PENCIL", "ROCKET", "WINDOW", "ELEPHANT", "BUTTERFLY", "CHOCOLATE", "ADVENTURE",
  "UNDERSTAND", "EXPERIENCE", "TECHNOLOGY", "EDUCATION", "KNOWLEDGE", "TREASURE", "DISCOVER", "IMAGINATION", "CELEBRATION", "ACHIEVEMENT",
];
const SCRAMBLE_WORDS_PER_LEVEL = 3;

function ScrambleGame({ onFinish, expiresAt }: GameProps) {
  const [level, setLevel] = useState(1);
  const [round, setRound] = useState(0);
  const [tiles, setTiles] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [correct, setCorrect] = useState(0);
  const [status, setStatus] = useState("Tap the letters in order to build the word.");
  const [levelUp, setLevelUp] = useState(false);
  const stateRef = useRef({ done: false, level: 1, correct: 0 });
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Words get longer as you level up: once the bank is exhausted you stay on
  // the longest words, so the levels keep counting toward 200.
  const wordIndex = Math.min((level - 1) * SCRAMBLE_WORDS_PER_LEVEL + round, SCRAMBLE_WORDS.length - 1);
  const word = SCRAMBLE_WORDS[wordIndex]!;

  const finish = useCallback((score: number) => {
    const s = stateRef.current;
    if (s.done) return;
    s.done = true;
    onFinishRef.current(score);
  }, []);

  useExpiry(expiresAt, finish, () => clampScore(stateRef.current.correct * 6 + (stateRef.current.level - 1) * 8));

  useEffect(() => {
    setTiles(shuffle(word.split("")));
    setPicked([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, level]);

  function tryWord() {
    const s = stateRef.current;
    if (s.done) return;
    const answer = picked.map((i) => tiles[i]).join("");
    if (answer !== word) {
      setStatus("Not quite — try again.");
      setPicked([]);
      return;
    }
    s.correct += 1;
    setCorrect(s.correct);
    if (s.level >= MAX_LEVEL) {
      finish(clampScore(s.correct * 6 + (s.level - 1) * 8));
      return;
    }
    if (round + 1 >= SCRAMBLE_WORDS_PER_LEVEL) {
      s.level += 1;
      setLevel(s.level);
      setRound(0);
      setLevelUp(true);
      window.setTimeout(() => setLevelUp(false), 1100);
      setStatus(`Level ${s.level}! Longer words now.`);
    } else {
      setRound((r) => r + 1);
      setStatus("Correct! Next word.");
    }
  }

  function giveUp() {
    const s = stateRef.current;
    if (s.done) return;
    finish(clampScore(s.correct * 6 + (s.level - 1) * 8));
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
// Launcher: pick a game, play it, see the score, play again or finish. When a
// teacher set a play duration, the whole session is timed and the round ends
// automatically when the time runs out.
// ---------------------------------------------------------------------------
export function FunGameLauncher({
  initialKind,
  preview,
  onFinish,
  durationMinutes,
}: {
  initialKind?: GameKind;
  preview?: boolean;
  onFinish: (score: number) => void;
  durationMinutes?: number;
}) {
  const [kind, setKind] = useState<GameKind | null>(initialKind ?? null);
  const [result, setResult] = useState<number | null>(null);
  const [roundKey, setRoundKey] = useState(0);

  // Session time limit (teacher-assigned duration). Previews are untimed so a
  // manager can test a game fully.
  const sessionSeconds = !preview && durationMinutes && durationMinutes > 0 ? durationMinutes * 60 : 0;
  const [expiresAt] = useState<number>(() => (sessionSeconds > 0 ? Date.now() + sessionSeconds * 1000 : 0));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (sessionSeconds <= 0) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [sessionSeconds]);

  const sessionOver = sessionSeconds > 0 && now >= expiresAt;
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  function gameEnded(score: number) {
    setResult(score);
  }

  function playAgain() {
    if (sessionOver) return;
    setResult(null);
    setRoundKey((k) => k + 1);
  }

  const countdown =
    sessionSeconds > 0 ? (
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 800,
          color: sessionOver ? "#dc2626" : "var(--duga-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        ⏱ {formatClock(remaining)}
      </span>
    ) : null;

  if (result !== null) {
    return (
      <div style={{ display: "grid", gap: 14, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--duga-primary-ink)" }}>
          {preview ? "Preview complete" : sessionOver ? "Time's up — nice play!" : "Game over — nice play!"}
        </div>
        <div style={{ fontSize: 42, fontWeight: 900, color: "var(--duga-gold)" }}>{result}<span style={{ fontSize: 18 }}>/100</span></div>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--duga-muted)" }}>
          {preview ? "This was a preview — your score was not recorded." : "Your score will be recorded when you finish."}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <ButtonDuga onClick={playAgain} disabled={sessionOver}>▶ Play again</ButtonDuga>
          <ButtonDuga onClick={() => { setKind(null); setResult(null); }} disabled={sessionOver}>Choose another game</ButtonDuga>
          <ButtonDuga onClick={() => onFinish(result)}>{preview ? "Close preview" : "Finish & record score"}</ButtonDuga>
        </div>
      </div>
    );
  }

  if (kind) {
    const props = { key: `${kind}-${roundKey}`, onFinish: gameEnded, expiresAt: expiresAt || undefined };
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button type="button" className="duga-btn duga-btn--ghost duga-btn--sm" onClick={() => { setKind(null); setResult(null); }} disabled={sessionOver}>
            ← All games
          </button>
          {countdown}
        </div>
        {kind === "memory" && <MemoryGame {...props} />}
        {kind === "snake" && <SnakeGame {...props} />}
        {kind === "balloon" && <BalloonPop {...props} />}
        {kind === "ttt" && <TicTacToe {...props} />}
        {kind === "scramble" && <ScrambleGame {...props} />}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {countdown && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--duga-muted)" }}>
            Pick a real game to play. Games have up to 200 levels — finish each level to push your score higher.
          </p>
          {countdown}
        </div>
      )}
      {sessionOver ? (
        <div
          style={{
            textAlign: "center",
            padding: 18,
            borderRadius: 12,
            border: "1px dashed #fca5a5",
            background: "#fef2f2",
            fontSize: 14,
            fontWeight: 700,
            color: "#b91c1c",
          }}
        >
          ⏱ Your play session has ended. Close the game to submit your scores.
        </div>
      ) : (
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
      )}
    </div>
  );
}