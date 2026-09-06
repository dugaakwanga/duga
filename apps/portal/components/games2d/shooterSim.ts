// Pure simulation for the horde-shooter — no React, no Canvas, no timers.
// The component drives it once per animation frame and renders from its
// state; a headless test drives it with a fixed timestep. Keeping it pure is
// what makes the game loop verifiable without a browser (rAF pauses on hidden
// tabs, so the live loop can't be exercised in a headless preview).

export const START_AMMO = 6;
export const BULLETS_PER_ANSWER = 4;
export const QUESTIONS_PER_RELOAD = 3;
export const BASE_HP = 5;
export const FIRE_COOLDOWN_MS = 260;
export const BULLET_SPEED = 620; // px/sec
export const ENEMY_RADIUS = 15;
export const PLAYER_Y_FRAC = 0.86;
export const BASE_LINE_FRAC = 0.9;

export interface Enemy {
  id: number;
  x: number;
  y: number;
  hp: number;
  speed: number;
  hitFlash: number;
  wobble: number;
}
export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
}

export type ShooterPhase = "fight" | "reload" | "over";

export interface ShooterState {
  phase: ShooterPhase;
  ammo: number;
  hp: number;
  kills: number;
  enemies: Enemy[];
  bullets: Bullet[];
  particles: Particle[];
  nextId: number;
  lastFireMs: number;
  spawnAccMs: number;
  shake: number;
  // Set once the question bank is exhausted: no new enemies spawn, so the
  // player makes a "final stand" against the enemies already on the field —
  // clear them to win, get overrun (no ammo left to answer for) to lose.
  spawnStopped: boolean;
}

export interface ShooterConfig {
  spawnEveryMs: number;
  enemySpeed: number; // px/sec toward the base
  enemyColor: string;
}

export interface Dims {
  w: number;
  h: number;
}

export interface StepResult {
  emptied: boolean; // ran dry this step (ammo 0 and no bullets in flight)
  overrun: boolean; // base HP hit 0 this step
  cleared: boolean; // final stand won: no spawns left and the field is clear
}

export function createShooterState(): ShooterState {
  return {
    phase: "fight",
    ammo: START_AMMO,
    hp: BASE_HP,
    kills: 0,
    enemies: [],
    bullets: [],
    particles: [],
    nextId: 1,
    lastFireMs: 0,
    spawnAccMs: 0,
    shake: 0,
    spawnStopped: false,
  };
}

type Rng = () => number;

// Advances the whole simulation by dt seconds. Returns edge signals the
// caller acts on (open the reload panel, or end the game). Mutates `s`.
export function stepShooter(s: ShooterState, dt: number, now: number, dims: Dims, cfg: ShooterConfig, rng: Rng = Math.random): StepResult {
  const result: StepResult = { emptied: false, overrun: false, cleared: false };
  if (s.phase === "over") {
    stepParticles(s, dt);
    return result;
  }

  const { w, h } = dims;
  const px = w / 2;
  const py = h * PLAYER_Y_FRAC;
  const baseLine = h * BASE_LINE_FRAC;
  const fighting = s.phase === "fight";

  // Spawning and firing only happen while fighting. Enemy movement, breaches,
  // bullet travel and collisions run in BOTH phases — so the horde keeps
  // advancing while you reload, which is the whole tension: answer fast and
  // get back to shooting before they reach the base, or get overrun.
  // Spawn continuously (in both fight and reload) until the bank is exhausted,
  // so neglecting to answer lets the horde build up while you can't shoot —
  // that accumulation is exactly what punishes a player who doesn't reload.
  if (!s.spawnStopped) {
    s.spawnAccMs += dt * 1000;
    if (s.spawnAccMs >= cfg.spawnEveryMs) {
      s.spawnAccMs = 0;
      const lanes = 5;
      const lane = 1 + Math.floor(rng() * (lanes - 2));
      s.enemies.push({
        id: s.nextId++,
        x: (w / lanes) * (lane + 0.5) + (rng() - 0.5) * 20,
        y: -ENEMY_RADIUS,
        hp: 1,
        speed: cfg.enemySpeed * (0.85 + rng() * 0.4),
        hitFlash: 0,
        wobble: rng() * Math.PI * 2,
      });
    }
  }

  if (fighting) {
    // auto-fire at the enemy nearest the base
    if (s.ammo > 0 && now - s.lastFireMs >= FIRE_COOLDOWN_MS) {
      let target: Enemy | null = null;
      let bestY = -Infinity;
      for (const e of s.enemies) {
        if (e.y > bestY) {
          bestY = e.y;
          target = e;
        }
      }
      if (target) {
        const dx = target.x - px;
        const dy = target.y - py;
        const d = Math.hypot(dx, dy) || 1;
        s.bullets.push({ id: s.nextId++, x: px, y: py - 18, vx: (dx / d) * BULLET_SPEED, vy: (dy / d) * BULLET_SPEED });
        s.ammo -= 1;
        s.lastFireMs = now;
        for (let i = 0; i < 5; i++) {
          s.particles.push({ x: px, y: py - 22, vx: (rng() - 0.5) * 90, vy: -rng() * 120 - 40, life: 0.22, max: 0.22, color: "#fde68a", r: 2 + rng() * 2 });
        }
        s.shake = Math.min(s.shake + 1.5, 5);
      }
    }
  }

  // move enemies + wobble (slightly slower while reloading, so it's tense but
  // still winnable when you answer promptly)
  const speedScale = fighting ? 1 : 0.6;
  for (const e of s.enemies) {
    e.y += e.speed * speedScale * dt;
    e.wobble += dt * 6;
    e.x += Math.sin(e.wobble) * 6 * dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
  }

  // breaches
  const survivors: Enemy[] = [];
  for (const e of s.enemies) {
    if (e.y >= baseLine) {
      s.hp -= 1;
      s.shake = 8;
      for (let i = 0; i < 8; i++) {
        s.particles.push({ x: e.x, y: baseLine, vx: (rng() - 0.5) * 160, vy: (rng() - 0.5) * 160, life: 0.4, max: 0.4, color: "#f87171", r: 2 + rng() * 2 });
      }
    } else {
      survivors.push(e);
    }
  }
  s.enemies = survivors;

  // bullets move + collide
  const liveBullets: Bullet[] = [];
  for (const b of s.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < -20 || b.x < -20 || b.x > w + 20) continue;
    let hit = false;
    for (const e of s.enemies) {
      if (Math.hypot(e.x - b.x, e.y - b.y) < ENEMY_RADIUS + 3) {
        e.hp -= 1;
        e.hitFlash = 0.12;
        hit = true;
        if (e.hp <= 0) {
          s.kills += 1;
          for (let i = 0; i < 10; i++) {
            s.particles.push({ x: e.x, y: e.y, vx: (rng() - 0.5) * 200, vy: (rng() - 0.5) * 200, life: 0.45, max: 0.45, color: cfg.enemyColor, r: 2 + rng() * 3 });
          }
        }
        break;
      }
    }
    if (!hit) liveBullets.push(b);
  }
  s.bullets = liveBullets;
  s.enemies = s.enemies.filter((e) => e.hp > 0);

  stepParticles(s, dt);

  if (s.hp <= 0) {
    result.overrun = true;
  } else if (s.spawnStopped && s.enemies.length === 0 && s.bullets.length === 0) {
    result.cleared = true;
  } else if (fighting && s.ammo <= 0 && s.bullets.length === 0) {
    result.emptied = true;
  }
  return result;
}

function stepParticles(s: ShooterState, dt: number) {
  const live: Particle[] = [];
  for (const p of s.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 260 * dt;
    live.push(p);
  }
  s.particles = live;
}
