/** The alien roster and how each kind behaves. Called by Game every step. Pure, no DOM. */

import { lineOfSight, moveCircle } from "./map.js";

/**
 * speed px/s, r radius, bite: contact damage (per `biteRate` seconds), credits on death,
 * aggro: distance at which a sleeping alien wakes up (it also wakes when shot or when it sees you).
 */
export const ALIENS = {
  crawler: { name: "Bọ Gai", hp: 20, speed: 96, r: 7, bite: 7, biteRate: 0.7, credits: 4, score: 10, aggro: 260 },
  spitter: { name: "Nhện Phun Axit", hp: 36, speed: 58, r: 9, bite: 6, biteRate: 1, credits: 10, score: 25, aggro: 300, spit: { damage: 11, speed: 175, rate: 1.7, range: 230, keep: 120 } },
  brute: { name: "Giáp Xác Khổng Lồ", hp: 190, speed: 48, r: 14, bite: 15, biteRate: 1, credits: 30, score: 80, aggro: 280, charge: { windup: 0.7, speed: 235, time: 0.85, damage: 26, range: 170, rest: 2.4 } },
  exploder: { name: "Túi Nổ", hp: 26, speed: 80, r: 9, bite: 0, biteRate: 1, credits: 8, score: 20, aggro: 280, blast: { fuse: 0.45, radius: 62, damage: 34, trigger: 34 } },
  queen: { name: "Nữ Hoàng Tổ", hp: 2600, speed: 42, r: 30, bite: 24, biteRate: 1, credits: 600, score: 5000, aggro: 9999, boss: true },
};

export const NEST = { hp: 280, r: 16, period: 2.6, cap: 5, wake: 360, credits: 100, score: 300 };

let nextId = 1;

export function createAlien(kind, x, y, extra = {}) {
  const type = ALIENS[kind];
  return {
    id: nextId++,
    kind,
    x,
    y,
    r: type.r,
    hp: type.hp,
    maxHp: type.hp,
    angle: 0,
    awake: false,
    state: "move",
    t: 0,
    cd: 0,
    biteCd: 0,
    vx: 0,
    vy: 0,
    hurt: 0,
    ...extra,
  };
}

export function createNest(x, y) {
  return { id: nextId++, x, y, r: NEST.r, hp: NEST.hp, maxHp: NEST.hp, active: false, timer: 1 + ((x + y) % 7) / 7, hurt: 0 };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Steering: straight at the player when seen and close, otherwise down the flow field. */
function chaseDir(game, alien) {
  const p = game.player;
  const d = dist(alien, p);
  if (d < 220 && lineOfSight(game.map, alien.x, alien.y, p.x, p.y)) {
    return { x: (p.x - alien.x) / (d || 1), y: (p.y - alien.y) / (d || 1) };
  }
  return game.flow.direction(alien.x, alien.y) ?? { x: 0, y: 0 };
}

function walk(game, alien, dir, speed, dt) {
  // Separation keeps swarms from stacking into one blob.
  let sx = 0;
  let sy = 0;
  for (const other of game.aliens) {
    if (other === alien) continue;
    const dx = alien.x - other.x;
    const dy = alien.y - other.y;
    const min = alien.r + other.r;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 < min * min) {
      const d = Math.sqrt(d2);
      sx += (dx / d) * (min - d);
      sy += (dy / d) * (min - d);
    }
  }
  const mx = dir.x * speed * dt + sx * 0.25 + alien.vx * dt;
  const my = dir.y * speed * dt + sy * 0.25 + alien.vy * dt;
  alien.vx *= 0.86;
  alien.vy *= 0.86;
  if (dir.x || dir.y) alien.angle = Math.atan2(dir.y, dir.x);
  return moveCircle(game.map, alien, mx, my);
}

function bite(game, alien, type) {
  const p = game.player;
  if (alien.biteCd > 0 || !type.bite) return;
  if (dist(alien, p) <= alien.r + p.r + 3) {
    alien.biteCd = type.biteRate;
    game.hurtPlayer(type.bite, alien);
  }
}

export function updateAlien(game, alien, dt) {
  const type = ALIENS[alien.kind];
  const p = game.player;
  alien.cd = Math.max(0, alien.cd - dt);
  alien.biteCd = Math.max(0, alien.biteCd - dt);
  alien.hurt = Math.max(0, alien.hurt - dt);
  alien.t += dt;

  if (!alien.awake) {
    const d = dist(alien, p);
    if (d < type.aggro && (d < 90 || lineOfSight(game.map, alien.x, alien.y, p.x, p.y))) alien.awake = true;
    else return;
  }
  if (!p.alive) {
    walk(game, alien, { x: 0, y: 0 }, 0, dt);
    return;
  }

  switch (alien.kind) {
    case "crawler":
      walk(game, alien, chaseDir(game, alien), type.speed, dt);
      bite(game, alien, type);
      break;
    case "spitter":
      updateSpitter(game, alien, type, dt);
      break;
    case "brute":
      updateBrute(game, alien, type, dt);
      break;
    case "exploder":
      updateExploder(game, alien, type, dt);
      break;
    case "queen":
      updateQueen(game, alien, type, dt);
      break;
    default:
      break;
  }
}

function updateSpitter(game, alien, type, dt) {
  const p = game.player;
  const d = dist(alien, p);
  const sees = d < type.spit.range && lineOfSight(game.map, alien.x, alien.y, p.x, p.y);
  if (sees) {
    const ax = (p.x - alien.x) / d;
    const ay = (p.y - alien.y) / d;
    alien.angle = Math.atan2(ay, ax);
    // Back off when too close, otherwise circle slowly.
    const dir = d < type.spit.keep ? { x: -ax, y: -ay } : { x: -ay * 0.5, y: ax * 0.5 };
    walk(game, alien, dir, type.speed, dt);
    alien.angle = Math.atan2(ay, ax);
    if (alien.cd <= 0) {
      alien.cd = type.spit.rate * (0.8 + game.rng() * 0.4);
      game.spawnSpit(alien.x + ax * alien.r, alien.y + ay * alien.r, alien.angle, type.spit.speed, type.spit.damage);
    }
  } else {
    walk(game, alien, chaseDir(game, alien), type.speed, dt);
  }
  bite(game, alien, type);
}

function updateBrute(game, alien, type, dt) {
  const p = game.player;
  const c = type.charge;
  if (alien.state === "windup") {
    if (alien.t >= c.windup) {
      alien.state = "charge";
      alien.t = 0;
      game.emit({ type: "brute-charge", x: alien.x, y: alien.y });
    }
    walk(game, alien, { x: 0, y: 0 }, 0, dt);
    return;
  }
  if (alien.state === "charge") {
    const dir = { x: Math.cos(alien.angle), y: Math.sin(alien.angle) };
    const { hitX, hitY } = walk(game, alien, dir, c.speed, dt);
    if (alien.biteCd <= 0 && dist(alien, p) <= alien.r + p.r + 4) {
      alien.biteCd = 0.8;
      game.hurtPlayer(c.damage, alien, { knock: 260, angle: alien.angle });
    }
    if (hitX || hitY || alien.t >= c.time) {
      alien.state = hitX || hitY ? "stunned" : "move";
      alien.t = 0;
      alien.cd = c.rest;
      if (hitX || hitY) game.emit({ type: "thud", x: alien.x, y: alien.y });
    }
    return;
  }
  if (alien.state === "stunned") {
    if (alien.t >= 0.9) {
      alien.state = "move";
      alien.t = 0;
    }
    return;
  }
  const d = dist(alien, p);
  if (alien.cd <= 0 && d < c.range && d > 40 && lineOfSight(game.map, alien.x, alien.y, p.x, p.y)) {
    alien.state = "windup";
    alien.t = 0;
    alien.angle = Math.atan2(p.y - alien.y, p.x - alien.x);
    game.emit({ type: "brute-roar", x: alien.x, y: alien.y });
    return;
  }
  walk(game, alien, chaseDir(game, alien), type.speed, dt);
  bite(game, alien, type);
}

function updateExploder(game, alien, type, dt) {
  const b = type.blast;
  if (alien.state === "fuse") {
    walk(game, alien, { x: 0, y: 0 }, 0, dt);
    if (alien.t >= b.fuse) game.killAlien(alien, { silent: true });
    return;
  }
  walk(game, alien, chaseDir(game, alien), type.speed, dt);
  if (dist(alien, game.player) < b.trigger) {
    alien.state = "fuse";
    alien.t = 0;
    game.emit({ type: "fuse", x: alien.x, y: alien.y });
  }
}

/** The queen cycles: acid spray → brood → charge, faster and wider below half health. */
export const QUEEN = {
  pause: 1.6,
  spray: { volleys: 3, gap: 0.35, shots: 9, spread: 1.1, speed: 165, damage: 13 },
  brood: { count: 5, cap: 14 },
  charge: { windup: 0.9, speed: 250, time: 1.1, damage: 30 },
};

function updateQueen(game, alien, type, dt) {
  const p = game.player;
  const angry = alien.hp < alien.maxHp / 2;
  const toPlayer = Math.atan2(p.y - alien.y, p.x - alien.x);
  switch (alien.state) {
    case "move":
    default: {
      walk(game, alien, chaseDir(game, alien), type.speed * (angry ? 1.3 : 1), dt);
      bite(game, alien, type);
      if (alien.t >= QUEEN.pause * (angry ? 0.7 : 1)) {
        alien.turn = (alien.turn ?? -1) + 1;
        alien.state = ["spray", "brood", "spray", "charge"][alien.turn % 4];
        alien.t = 0;
        alien.volley = 0;
        alien.angle = toPlayer;
        game.emit({ type: "queen-" + alien.state, x: alien.x, y: alien.y });
      }
      break;
    }
    case "spray": {
      const s = QUEEN.spray;
      walk(game, alien, { x: 0, y: 0 }, 0, dt);
      const volleys = s.volleys + (angry ? 1 : 0);
      if (alien.t >= s.gap * (alien.volley + 1) - 0.0001 && alien.volley < volleys) {
        const shots = s.shots + (angry ? 4 : 0);
        const offset = alien.volley % 2 ? s.spread / shots / 2 : 0;
        for (let i = 0; i < shots; i += 1) {
          const a = toPlayer + (i / (shots - 1) - 0.5) * s.spread * (angry ? 1.4 : 1) + offset;
          game.spawnSpit(alien.x + Math.cos(a) * alien.r, alien.y + Math.sin(a) * alien.r, a, s.speed, s.damage);
        }
        alien.volley += 1;
      }
      if (alien.volley >= volleys && alien.t >= s.gap * volleys + 0.4) {
        alien.state = "move";
        alien.t = 0;
      }
      break;
    }
    case "brood": {
      walk(game, alien, { x: 0, y: 0 }, 0, dt);
      if (alien.t >= 0.6 && !alien.spawned) {
        alien.spawned = true;
        const room = QUEEN.brood.cap - game.aliens.filter((a) => a.kind !== "queen").length;
        const count = Math.min(room, QUEEN.brood.count + (angry ? 3 : 0));
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * Math.PI * 2;
          game.spawnAlien(i % 4 === 3 ? "exploder" : "crawler", alien.x + Math.cos(a) * (alien.r + 10), alien.y + Math.sin(a) * (alien.r + 10));
        }
      }
      if (alien.t >= 1.2) {
        alien.spawned = false;
        alien.state = "move";
        alien.t = 0;
      }
      break;
    }
    case "charge": {
      const c = QUEEN.charge;
      if (alien.t < c.windup) {
        alien.angle = toPlayer;
        walk(game, alien, { x: 0, y: 0 }, 0, dt);
        break;
      }
      const { hitX, hitY } = walk(game, alien, { x: Math.cos(alien.angle), y: Math.sin(alien.angle) }, c.speed * (angry ? 1.15 : 1), dt);
      if (alien.biteCd <= 0 && dist(alien, p) <= alien.r + p.r + 4) {
        alien.biteCd = 1;
        game.hurtPlayer(c.damage, alien, { knock: 300, angle: alien.angle });
      }
      if (hitX || hitY || alien.t >= c.windup + c.time) {
        if (hitX || hitY) game.emit({ type: "thud", x: alien.x, y: alien.y, big: true });
        alien.state = "move";
        alien.t = 0;
      }
      break;
    }
  }
}
