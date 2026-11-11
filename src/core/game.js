/**
 * One mission: player, aliens, nests, shots, pickups, objective. Fixed-step and deterministic
 * (seeded RNG); the UI feeds an input snapshot and drains events for sound and particles.
 */

import { TILE } from "./constants.js";
import { mulberry32 } from "./rng.js";
import { GameMap, moveCircle } from "./map.js";
import { FlowField } from "./flowfield.js";
import { ALIENS, NEST, createAlien, createNest, updateAlien } from "./aliens.js";
import { GRENADE, WEAPONS, WEAPON_ORDER, fireWeapon } from "./weapons.js";
import { MISSIONS } from "./missions.js";
import { cloneLoadout, damageMul, maxHp } from "./armory.js";

export const PLAYER = { r: 9, speed: 128, muzzle: 15 };
export const DASH = { time: 0.2, speed: 390, cooldown: 1.1 };
export const INTRO_TIME = 2.2;
export const DYING_TIME = 1.8;
export const MEDKIT_HEAL = 35;
export const BARREL = { hp: 15, r: 9, radius: 72, damage: 80 };
export const PICKUP_CREDITS = 40;
/** Paid when a mission is cleared: grows with each mission. */
export const missionBonus = (index) => 150 + 50 * index;
export const DROPS = { ammo: 0.07, medkit: 0.025 };
export const MAX_ALIENS = 140;

export const NO_INPUT = { move: { x: 0, y: 0 }, aim: 0, fire: false, grenade: false, dash: false, weapon: null, cycle: 0 };

export class Game {
  /**
   * @param {number} missionIndex
   * @param {object} loadout from armory.js (copied; the original is never touched)
   * @param {object} options seed; mission: a custom mission object (tests use small maps)
   */
  constructor(missionIndex, loadout, { seed = 1, mission = null } = {}) {
    this.missionIndex = missionIndex;
    this.mission = mission ?? MISSIONS[missionIndex];
    this.map = new GameMap(this.mission.map);
    this.flow = new FlowField(this.map);
    this.rng = mulberry32(seed);
    this.startLoadout = cloneLoadout(loadout);
    this.loadout = cloneLoadout(loadout);
    this.events = [];
    this.state = "intro";
    this.stateTime = 0;
    this.time = 0;
    this.invincible = false; // tests and the e2e check only
    this.stats = { kills: 0, shots: 0, hits: 0, damageTaken: 0, credits: 0, time: 0 };
    this.prev = { grenade: false, dash: false };

    const { start } = this.map;
    this.player = {
      x: start.x, y: start.y, r: PLAYER.r, angle: 0,
      hp: maxHp(loadout), maxHp: maxHp(loadout), alive: true,
      weapon: "pistol", fireCd: 0, dashT: 0, dashCd: 0, kx: 0, ky: 0, hurt: 0, moving: false,
    };
    this.aliens = this.map.aliens.map((a) => createAlien(a.kind, a.x, a.y));
    if (this.map.queen) this.aliens.push(createAlien("queen", this.map.queen.x, this.map.queen.y, { awake: false }));
    this.nests = this.map.nests.map((n) => createNest(n.x, n.y));
    this.barrels = this.map.barrels.map((b) => ({ x: b.x, y: b.y, r: BARREL.r, hp: BARREL.hp }));
    this.pickups = this.map.pickups.map((p) => ({ x: p.x, y: p.y, kind: p.kind }));
    this.shots = [];
    this.spits = [];
    this.grenades = [];
    this.exitOpen = false;
    this.flow.update(start.tx, start.ty);
    this.emit({ type: "mission-start", mission: this.mission.id });
  }

  emit(event) {
    this.events.push(event);
  }

  takeEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  get queen() {
    return this.aliens.find((a) => a.kind === "queen" && a.hp > 0) ?? null;
  }

  get nestsLeft() {
    return this.nests.length;
  }

  setState(state) {
    this.state = state;
    this.stateTime = 0;
    this.emit({ type: "state", state });
  }

  pause() {
    if (this.state === "playing" || this.state === "intro") {
      this.resumeTo = this.state;
      this.setState("paused");
    } else if (this.state === "paused") {
      this.setState(this.resumeTo ?? "playing");
    }
  }

  /** The loadout to keep after a cleared mission: what was spent is gone, credits earned are added. */
  resultLoadout() {
    const out = cloneLoadout(this.loadout);
    out.credits += missionBonus(this.missionIndex);
    out.unlocked = Math.max(out.unlocked, Math.min(MISSIONS.length, this.missionIndex + 2));
    return out;
  }

  update(input = NO_INPUT, dt) {
    this.stateTime += dt;
    if (this.state === "paused" || this.state === "cleared" || this.state === "failed") return;
    if (this.state === "intro") {
      if (this.stateTime >= INTRO_TIME) this.setState("playing");
      return;
    }
    this.time += dt;
    if (this.state === "playing") {
      this.stats.time += dt;
      this.updatePlayer(input, dt);
    }
    const p = this.player;
    this.flow.update(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    for (const alien of [...this.aliens]) if (alien.hp > 0) updateAlien(this, alien, dt);
    this.updateNests(dt);
    this.updateShots(dt);
    this.updateSpits(dt);
    this.updateGrenades(dt);
    this.aliens = this.aliens.filter((a) => a.hp > 0);
    if (this.state === "playing") {
      this.collectPickups();
      this.checkExit();
    }
    if (this.state === "dying" && this.stateTime >= DYING_TIME) this.setState("failed");
  }

  // Player -------------------------------------------------------------------------------------

  updatePlayer(input, dt) {
    const p = this.player;
    p.angle = input.aim;
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.hurt = Math.max(0, p.hurt - dt);

    // Weapon choice
    if (input.weapon && this.loadout.owned.includes(input.weapon) && this.hasAmmo(input.weapon)) this.switchTo(input.weapon);
    if (input.cycle) {
      const usable = WEAPON_ORDER.filter((id) => this.loadout.owned.includes(id) && this.hasAmmo(id));
      const i = usable.indexOf(p.weapon);
      this.switchTo(usable[(i + input.cycle + usable.length) % usable.length]);
    }

    // Movement and dash
    let mx = input.move.x;
    let my = input.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (input.dash && !this.prev.dash && p.dashCd <= 0) {
      const dir = len > 0.1 ? Math.atan2(my, mx) : p.angle;
      p.dashT = DASH.time;
      p.dashCd = DASH.cooldown;
      p.dashAngle = dir;
      this.emit({ type: "dash", x: p.x, y: p.y });
    }
    let vx = mx * PLAYER.speed;
    let vy = my * PLAYER.speed;
    if (p.dashT > 0) {
      p.dashT -= dt;
      vx = Math.cos(p.dashAngle) * DASH.speed;
      vy = Math.sin(p.dashAngle) * DASH.speed;
    }
    vx += p.kx;
    vy += p.ky;
    p.kx *= 0.85;
    p.ky *= 0.85;
    p.moving = len > 0.1;
    moveCircle(this.map, p, vx * dt, vy * dt);

    // Shooting
    if (input.fire && p.fireCd <= 0 && p.dashT <= 0) this.fire();

    // Grenade
    if (input.grenade && !this.prev.grenade && this.loadout.grenades > 0 && p.dashT <= 0) {
      this.loadout.grenades -= 1;
      const a = p.angle;
      this.grenades.push({ x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12, r: 4, vx: Math.cos(a) * GRENADE.speed, vy: Math.sin(a) * GRENADE.speed, t: 0 });
      this.emit({ type: "throw", x: p.x, y: p.y });
    }
    this.prev = { grenade: input.grenade, dash: input.dash };
  }

  hasAmmo(id) {
    return this.loadout.ammo[id] > 0;
  }

  switchTo(id) {
    if (!id || id === this.player.weapon) return;
    this.player.weapon = id;
    this.player.fireCd = Math.max(this.player.fireCd, 0.15);
    this.emit({ type: "switch", weapon: id });
  }

  fire() {
    const p = this.player;
    const weapon = WEAPONS[p.weapon];
    p.fireCd = weapon.rate;
    const mx = p.x + Math.cos(p.angle) * PLAYER.muzzle;
    const my = p.y + Math.sin(p.angle) * PLAYER.muzzle;
    this.shots.push(...fireWeapon(weapon, mx, my, p.angle, this.rng, damageMul(this.loadout)));
    this.stats.shots += 1;
    if (Number.isFinite(this.loadout.ammo[weapon.id])) this.loadout.ammo[weapon.id] -= 1;
    this.emit({ type: "shoot", weapon: weapon.id, x: mx, y: my, angle: p.angle });
    if (!this.hasAmmo(weapon.id)) {
      this.emit({ type: "empty", weapon: weapon.id });
      this.switchTo("pistol");
    }
  }

  hurtPlayer(damage, source, { knock = 120, angle = null } = {}) {
    const p = this.player;
    if (!p.alive || this.state !== "playing" || p.dashT > 0) return false;
    this.stats.damageTaken += damage;
    const a = angle ?? Math.atan2(p.y - source.y, p.x - source.x);
    p.kx += Math.cos(a) * knock;
    p.ky += Math.sin(a) * knock;
    p.hurt = 0.25;
    this.emit({ type: "hurt", x: p.x, y: p.y, damage });
    if (this.invincible) return true;
    p.hp = Math.max(0, p.hp - damage);
    if (p.hp <= 0) {
      p.alive = false;
      this.emit({ type: "player-death", x: p.x, y: p.y });
      this.setState("dying");
    }
    return true;
  }

  // Aliens and nests ----------------------------------------------------------------------------

  spawnAlien(kind, x, y) {
    if (this.aliens.length >= MAX_ALIENS) return null;
    const alien = createAlien(kind, x, y, { awake: true });
    if (!this.map.solidAt(x, y)) this.aliens.push(alien);
    return alien;
  }

  spawnSpit(x, y, angle, speed, damage) {
    this.spits.push({ x, y, r: 4, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage, life: 3 });
    this.emit({ type: "spit", x, y });
  }

  updateNests(dt) {
    const p = this.player;
    for (const nest of this.nests) {
      nest.hurt = Math.max(0, nest.hurt - dt);
      if (!nest.active) {
        if (Math.hypot(nest.x - p.x, nest.y - p.y) < NEST.wake) {
          nest.active = true;
          this.emit({ type: "nest-wake", x: nest.x, y: nest.y });
        } else continue;
      }
      if (!p.alive) continue;
      nest.timer -= dt;
      if (nest.timer > 0) continue;
      nest.timer = NEST.period * this.mission.nestRate * (0.85 + this.rng() * 0.3);
      const alive = this.aliens.filter((a) => a.nest === nest.id).length;
      if (alive >= NEST.cap) continue;
      const kind = this.pickKind();
      const a = this.rng() * Math.PI * 2;
      const alien = this.spawnAlien(kind, nest.x + Math.cos(a) * (nest.r + 6), nest.y + Math.sin(a) * (nest.r + 6));
      if (alien) {
        alien.nest = nest.id;
        this.emit({ type: "hatch", x: nest.x, y: nest.y, kind });
      }
    }
  }

  pickKind() {
    const entries = Object.entries(this.mission.mix);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.rng() * total;
    for (const [kind, w] of entries) {
      roll -= w;
      if (roll <= 0) return kind;
    }
    return entries[0][0];
  }

  damageAlien(alien, damage, { kx = 0, ky = 0 } = {}) {
    if (alien.hp <= 0) return;
    alien.hp -= damage;
    alien.hurt = 0.1;
    alien.awake = true;
    const heavy = ALIENS[alien.kind].boss ? 0.1 : alien.kind === "brute" ? 0.3 : 1;
    alien.vx += kx * heavy;
    alien.vy += ky * heavy;
    if (ALIENS[alien.kind].boss) this.emit({ type: "boss-hit", x: alien.x, y: alien.y });
    if (alien.hp <= 0) this.killAlien(alien);
  }

  killAlien(alien, { silent = false } = {}) {
    const type = ALIENS[alien.kind];
    alien.hp = 0;
    this.stats.kills += 1;
    this.loadout.credits += type.credits;
    this.stats.credits += type.credits;
    this.emit({ type: "alien-death", kind: alien.kind, x: alien.x, y: alien.y, credits: type.credits, silent });
    if (alien.kind === "exploder") {
      const b = type.blast;
      this.explode(alien.x, alien.y, b.radius, b.damage, { hurtsPlayer: true, kind: "acid" });
    }
    if (type.boss) {
      this.emit({ type: "queen-death", x: alien.x, y: alien.y });
      for (const a of this.aliens) if (a !== alien && a.hp > 0) this.killAlien(a, { silent: true });
      this.updateExitLock();
      return;
    }
    // Drops
    const roll = this.rng();
    if (roll < DROPS.ammo && this.loadout.owned.length > 1) this.pickups.push({ x: alien.x, y: alien.y, kind: "ammo", dropped: true });
    else if (roll < DROPS.ammo + DROPS.medkit) this.pickups.push({ x: alien.x, y: alien.y, kind: "medkit", dropped: true });
  }

  damageNest(nest, damage) {
    if (nest.hp <= 0) return;
    nest.hp -= damage;
    nest.hurt = 0.1;
    nest.active = true;
    if (nest.hp > 0) return;
    this.nests = this.nests.filter((n) => n !== nest);
    this.loadout.credits += NEST.credits;
    this.stats.credits += NEST.credits;
    this.emit({ type: "nest-death", x: nest.x, y: nest.y, credits: NEST.credits, left: this.nests.length });
    this.updateExitLock();
  }

  updateExitLock() {
    const queenAlive = this.aliens.some((a) => a.kind === "queen" && a.hp > 0);
    if (!this.exitOpen && this.nests.length === 0 && !queenAlive) {
      this.exitOpen = true;
      this.emit({ type: "exit-open", x: this.map.exit.x, y: this.map.exit.y });
    }
  }

  damageBarrel(barrel, damage) {
    if (barrel.hp <= 0) return;
    barrel.hp -= damage;
    if (barrel.hp > 0) return;
    this.barrels = this.barrels.filter((b) => b !== barrel);
    this.explode(barrel.x, barrel.y, BARREL.radius, BARREL.damage, { hurtsPlayer: true, kind: "barrel" });
  }

  /** Area damage with linear falloff to half at the edge. Chains through barrels. */
  explode(x, y, radius, damage, { hurtsPlayer = false, kind = "blast" } = {}) {
    this.emit({ type: "explode", x, y, radius, kind });
    const falloff = (d) => damage * (1 - 0.5 * (d / radius));
    for (const alien of this.aliens) {
      const d = Math.hypot(alien.x - x, alien.y - y) - alien.r;
      if (d < radius && alien.hp > 0) {
        const a = Math.atan2(alien.y - y, alien.x - x);
        this.damageAlien(alien, falloff(Math.max(0, d)), { kx: Math.cos(a) * 200, ky: Math.sin(a) * 200 });
      }
    }
    for (const nest of [...this.nests]) {
      const d = Math.hypot(nest.x - x, nest.y - y) - nest.r;
      if (d < radius) this.damageNest(nest, falloff(Math.max(0, d)));
    }
    for (const barrel of [...this.barrels]) {
      if (Math.hypot(barrel.x - x, barrel.y - y) < radius) this.damageBarrel(barrel, BARREL.hp);
    }
    if (hurtsPlayer) {
      const p = this.player;
      const d = Math.hypot(p.x - x, p.y - y) - p.r;
      if (d < radius) this.hurtPlayer(Math.round(falloff(Math.max(0, d)) * 0.5), { x, y }, { knock: 220 });
    }
  }

  // Projectiles ---------------------------------------------------------------------------------

  updateShots(dt) {
    const keep = [];
    for (const s of this.shots) {
      s.life -= dt;
      let alive = s.life > 0;
      const steps = 2;
      for (let i = 0; i < steps && alive; i += 1) {
        s.x += (s.vx * dt) / steps;
        s.y += (s.vy * dt) / steps;
        if (this.map.solidAt(s.x, s.y)) {
          alive = false;
          if (s.splash) this.explode(s.x - s.vx * 0.01, s.y - s.vy * 0.01, s.splash.radius, s.splash.damage, { kind: "rocket" });
          else this.emit({ type: "spark", x: s.x - s.vx * 0.006, y: s.y - s.vy * 0.006, weapon: s.weapon });
          break;
        }
        alive = this.shotHits(s);
      }
      if (alive) keep.push(s);
      else if (s.life <= 0 && s.splash) this.explode(s.x, s.y, s.splash.radius, s.splash.damage, { kind: "rocket" });
    }
    this.shots = keep;
  }

  /** Returns false when the shot is used up. */
  shotHits(s) {
    for (const alien of this.aliens) {
      if (alien.hp <= 0 || s.hit.has(alien.id)) continue;
      if ((alien.x - s.x) ** 2 + (alien.y - s.y) ** 2 > (alien.r + s.r) ** 2) continue;
      s.hit.add(alien.id);
      this.stats.hits += 1;
      const speed = Math.hypot(s.vx, s.vy) || 1;
      this.emit({ type: "hit", x: s.x, y: s.y, kind: alien.kind, weapon: s.weapon });
      if (s.splash) {
        this.explode(s.x, s.y, s.splash.radius, s.splash.damage + s.damage, { kind: "rocket" });
        return false;
      }
      this.damageAlien(alien, s.damage, { kx: (s.vx / speed) * 60, ky: (s.vy / speed) * 60 });
      s.pierce -= 1;
      if (s.pierce <= 0) return false;
    }
    for (const nest of this.nests) {
      if ((nest.x - s.x) ** 2 + (nest.y - s.y) ** 2 > (nest.r + s.r) ** 2) continue;
      if (s.hit.has(nest.id)) continue;
      s.hit.add(nest.id);
      this.stats.hits += 1;
      this.emit({ type: "hit", x: s.x, y: s.y, kind: "nest", weapon: s.weapon });
      if (s.splash) {
        this.explode(s.x, s.y, s.splash.radius, s.splash.damage + s.damage, { kind: "rocket" });
        return false;
      }
      this.damageNest(nest, s.damage);
      return false;
    }
    for (const barrel of this.barrels) {
      if ((barrel.x - s.x) ** 2 + (barrel.y - s.y) ** 2 > (barrel.r + s.r) ** 2) continue;
      this.damageBarrel(barrel, s.damage);
      return false;
    }
    return true;
  }

  updateSpits(dt) {
    const p = this.player;
    const keep = [];
    for (const s of this.spits) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0) continue;
      if (this.map.solidAt(s.x, s.y)) {
        this.emit({ type: "splat", x: s.x, y: s.y });
        continue;
      }
      if (p.alive && (p.x - s.x) ** 2 + (p.y - s.y) ** 2 <= (p.r + s.r) ** 2 && p.dashT <= 0) {
        this.hurtPlayer(s.damage, s, { knock: 80, angle: Math.atan2(s.vy, s.vx) });
        this.emit({ type: "splat", x: s.x, y: s.y });
        continue;
      }
      keep.push(s);
    }
    this.spits = keep;
  }

  updateGrenades(dt) {
    const keep = [];
    for (const g of this.grenades) {
      g.t += dt;
      const { hitX, hitY } = moveCircle(this.map, g, g.vx * dt, g.vy * dt);
      if (hitX) g.vx *= -0.5;
      if (hitY) g.vy *= -0.5;
      const drag = Math.pow(0.12, dt);
      g.vx *= drag;
      g.vy *= drag;
      if (g.t >= GRENADE.fuse) this.explode(g.x, g.y, GRENADE.radius, GRENADE.damage * damageMul(this.loadout), { kind: "grenade" });
      else keep.push(g);
    }
    this.grenades = keep;
  }

  // Pickups and objective -------------------------------------------------------------------------

  collectPickups() {
    const p = this.player;
    this.pickups = this.pickups.filter((item) => {
      if ((item.x - p.x) ** 2 + (item.y - p.y) ** 2 > (p.r + 9) ** 2) return true;
      const got = this.applyPickup(item);
      if (got) this.emit({ type: "pickup", kind: item.kind, x: item.x, y: item.y, text: got });
      return !got;
    });
  }

  /** Returns a short label, or null if the item is not useful right now (it stays on the floor). */
  applyPickup(item) {
    const p = this.player;
    const l = this.loadout;
    switch (item.kind) {
      case "medkit":
        if (p.hp >= p.maxHp) return null;
        p.hp = Math.min(p.maxHp, p.hp + MEDKIT_HEAL);
        return `+${MEDKIT_HEAL} máu`;
      case "credits":
        l.credits += PICKUP_CREDITS;
        this.stats.credits += PICKUP_CREDITS;
        return `+${PICKUP_CREDITS} ¢`;
      case "grenades":
        if (l.grenades >= GRENADE.max) return null;
        l.grenades = Math.min(GRENADE.max, l.grenades + 2);
        return "+2 lựu đạn";
      case "ammo": {
        const guns = l.owned.filter((id) => id !== "pistol" && l.ammo[id] < WEAPONS[id].maxAmmo);
        if (!guns.length) {
          if (l.grenades >= GRENADE.max) return null;
          l.grenades += 1;
          return "+1 lựu đạn";
        }
        const id = guns.includes(p.weapon) ? p.weapon : guns[Math.floor(this.rng() * guns.length)];
        const w = WEAPONS[id];
        l.ammo[id] = Math.min(w.maxAmmo, l.ammo[id] + w.pickup);
        return `+${w.pickup} đạn ${w.short}`;
      }
      default:
        return null;
    }
  }

  checkExit() {
    if (!this.exitOpen) return;
    const { exit } = this.map;
    const p = this.player;
    if (Math.hypot(exit.x - p.x, exit.y - p.y) < TILE * 0.7) {
      this.emit({ type: "mission-clear", mission: this.mission.id });
      this.setState("cleared");
    }
  }
}
