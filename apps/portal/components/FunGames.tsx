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
// Shared game chrome (score, title, back).
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Match
// ---------------------------------------------------------------------------
const MEMORY_EMOJIS = ["🍎", "🍌", "🍇", "🍓", "🍉", "🍍"];

interface MemoryCard {
  id: number;
  emoji: string;
}

function MemoryGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [cards] = useState<MemoryCard[]>(() => shuffle([...MEMORY_EMOJIS, ...MEMORY_EMOJIS].map((emoji, id) => ({ id, emoji }))));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (matched.length === MEMORY_EMOJIS.length && !doneRef.current) {
      doneRef.current = true;
      onFinish(clampScore(100 - (moves - MEMORY_EMOJIS.length) * 8));
    }
  }, [matched, moves, onFinish]);

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
        }, 350);
      } else {
        window.setTimeout(() => setFlipped([]), 700);
      }
    }
  }

  return (
    <GameFrame
      title="Memory Match"
      right={<span style={{ fontSize: 13, fontWeight: 700 }}>Moves: {moves}</span>}
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>Flip two cards to find each matching pair.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, maxWidth: 340, margin: "0 auto" }}>
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
                fontSize: 26,
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

interface SnakeState {
  snake: Array<[number, number]>;
  dir: [number, number];
  food: [number, number];
  eaten: number;
  running: boolean;
  finished: boolean;
}

function SnakeGame({ onFinish }: { onFinish: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SnakeState>({ snake: [[10, 10]], dir: [1, 0], food: [15, 10], eaten: 0, running: true, finished: false });
  const [eaten, setEaten] = useState(0);
  const [status, setStatus] = useState("Use the arrow keys to move");

  const finish = useCallback(
    (score: number) => {
      const s = stateRef.current;
      if (s.finished) return;
      s.finished = true;
      s.running = false;
      onFinish(clampScore(score));
    },
    [onFinish],
  );

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
        finish(s.eaten * 12);
        return;
      }
      const ate = next[0] === s.food[0] && next[1] === s.food[1];
      s.snake = [next, ...s.snake];
      if (ate) {
        s.eaten += 1;
        setEaten(s.eaten);
        s.food = randomFood(s.snake);
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
    const iv = window.setInterval(tick, 130);
    draw();
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish]);

  function setDir(next: [number, number]) {
    const s = stateRef.current;
    const [dx, dy] = s.dir;
    if (next[0] === -dx && next[1] === -dy) return;
    s.dir = next;
  }

  return (
    <GameFrame
      title="Snake"
      right={<span style={{ fontSize: 13, fontWeight: 700 }}>🍎 {eaten}</span>}
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>{status}</p>
      <div style={{ display: "grid", placeItems: "center" }}>
        <canvas
          ref={canvasRef}
          width={GRID * CELL}
          height={GRID * CELL}
          style={{ border: "1px solid var(--duga-border)", borderRadius: 12, background: "#f8fafc", touchAction: "none" }}
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

function BalloonPop({ onFinish }: { onFinish: (score: number) => void }) {
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [popped, setPopped] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const doneRef = useRef(false);
  const idRef = useRef(0);
  const poppedRef = useRef(0);

  useEffect(() => {
    poppedRef.current = popped;
  }, [popped]);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setBalloons((prev) => {
        let next = prev.map((b) => ({ ...b, y: b.y - 2 }));
        if (Math.random() < 0.5 && prev.length < 14) {
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
          window.setTimeout(() => onFinish(clampScore(poppedRef.current * 5)), 200);
        }
        return next <= 0 ? 0 : next;
      });
    }, 80);
    return () => window.clearInterval(iv);
  }, [onFinish]);

  function pop(id: number) {
    setBalloons((prev) => prev.filter((b) => b.id !== id));
    setPopped((p) => p + 1);
  }

  return (
    <GameFrame
      title="Balloon Pop"
      right={
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          🎈 {popped} · ⏱ {timeLeft.toFixed(1)}s
        </span>
      }
    >
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
// Tic-Tac-Toe (vs computer)
// ---------------------------------------------------------------------------
type TCell = "X" | "O" | null;

function TicTacToe({ onFinish }: { onFinish: (score: number) => void }) {
  const [board, setBoard] = useState<TCell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [status, setStatus] = useState("You are X — tap a square to start");
  const doneRef = useRef(false);

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

  const end = useCallback(
    (result: TCell) => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (result === "X") onFinish(100);
      else if (result === "O") onFinish(25);
      else onFinish(55);
    },
    [onFinish],
  );

  function computerMove(b: TCell[]) {
    const empty = b.map((c, i) => (c ? -1 : i)).filter((i): i is number => i >= 0);
    if (empty.length === 0) return;
    // Win if possible, else block, else random.
    const tryCell = (mark: TCell): number | null => {
      for (const i of empty) {
        const copy = [...b];
        copy[i] = mark;
        if (winner(copy) === mark) return i;
      }
      return null;
    };
    const pick = tryCell("O") ?? tryCell("X") ?? empty[Math.floor(Math.random() * empty.length)] ?? empty[0]!;
    const next = [...b];
    next[pick] = "O";
    setBoard(next);
    const w = winner(next);
    if (w) end(w);
    else if (next.every((c) => c)) end(null);
    else setTurn("X");
  }

  function play(index: number) {
    if (board[index] || turn !== "X" || doneRef.current) return;
    const next = [...board];
    next[index] = "X";
    setBoard(next);
    const w = winner(next);
    if (w) {
      end(w);
      setStatus("You win!");
      return;
    }
    if (next.every((c) => c)) {
      end(null);
      setStatus("It's a draw!");
      return;
    }
    setTurn("O");
    setStatus("Computer is thinking…");
    window.setTimeout(() => computerMove(next), 450);
  }

  return (
    <GameFrame title="Tic-Tac-Toe" right={<span style={{ fontSize: 13, fontWeight: 700 }}>{turn === "X" ? "Your turn" : "Computer"}</span>}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--duga-muted)" }}>{status}</p>
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
const SCRAMBLE_WORDS = ["SCHOOL", "GARDEN", "PLAYER", "MUSIC", "TIGER", "BANANA", "ROCKET", "WINDOW"];

function ScrambleGame({ onFinish }: { onFinish: (score: number) => void }) {
  const [round, setRound] = useState(0);
  const [tiles, setTiles] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [correct, setCorrect] = useState(0);
  const [status, setStatus] = useState("Tap the letters in order to build the word.");
  const doneRef = useRef(false);
  const word = SCRAMBLE_WORDS[round % SCRAMBLE_WORDS.length]!;

  useEffect(() => {
    setTiles(shuffle(word.split("")));
    setPicked([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  function tryWord() {
    const answer = picked.map((i) => tiles[i]).join("");
    if (answer === word) {
      const next = correct + 1;
      setCorrect(next);
      if (round + 1 >= 3) {
        doneRef.current = true;
        onFinish(clampScore((next / 3) * 100));
      } else {
        setRound((r) => r + 1);
        setStatus("Correct! Next word.");
      }
    } else {
      setStatus("Not quite — try again.");
      setPicked([]);
    }
  }

  function giveUp() {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinish(clampScore((correct / 3) * 100));
  }

  return (
    <GameFrame
      title="Word Scramble"
      right={<span style={{ fontSize: 13, fontWeight: 700 }}>Round {round + 1}/3 · {correct} ✓</span>}
    >
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
      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
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
        Pick a real game to play. When it ends you&apos;ll get a score out of 100.
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