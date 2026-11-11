/**
 * Canvas renderer: pre-drawn map, persistent splat decals, code-drawn sprites, a flashlight
 * lighting pass and a minimap. Reads game state, never changes it.
 */

import { TILE, VIEW_W, VIEW_H } from "../core/constants.js";
import { ALIENS } from "../core/aliens.js";
import { WEAPONS } from "../core/weapons.js";

export const THEMES = {
  cargo: { floor: "#2c3440", floor2: "#323b48", line: "#3c4756", wall: "#56606e", wallTop: "#7a8696", wallFront: "#363d48", accent: "#f2b134" },
  lab: { floor: "#cfd8dc", floor2: "#c3ced3", line: "#aebcc3", wall: "#6f8b94", wallTop: "#9fb8c0", wallFront: "#4f666e", accent: "#33c3c9" },
  reactor: { floor: "#2a2620", floor2: "#312c25", line: "#3f382e", wall: "#5c5040", wallTop: "#867659", wallFront: "#3a3228", accent: "#ffcc33" },
  hydro: { floor: "#1d2a22", floor2: "#22322a", line: "#2c4033", wall: "#3c5a45", wallTop: "#5d8467", wallFront: "#26382b", accent: "#7be37b" },
  hive: { floor: "#2a1d2e", floor2: "#311f36", line: "#40274a", wall: "#4d2e55", wallTop: "#744382", wallFront: "#2e1a34", accent: "#d65cff" },
};

const ALIEN_COLORS = {
  crawler: { body: "#7a3b2e", dark: "#4a2019", light: "#b0603f", eye: "#ffdf5d" },
  spitter: { body: "#3f6b2f", dark: "#24401b", light: "#8fdc4a", eye: "#e6ff6b" },
  brute: { body: "#5a5468", dark: "#35303f", light: "#8e86a3", eye: "#ff4d4d" },
  exploder: { body: "#a8b83a", dark: "#6c7820", light: "#eaff7a", eye: "#ffffff" },
  queen: { body: "#4b2a5c", dark: "#2a1535", light: "#9a5cc0", eye: "#ff3b6b" },
};

// Particles --------------------------------------------------------------------------------------

export class Particles {
  constructor() {
    this.items = [];
  }

  add(p) {
    if (this.items.length > 900) this.items.shift();
    this.items.push({ vx: 0, vy: 0, drag: 0.9, size: 2, life: 0.4, shape: "dot", ...p, age: 0 });
  }

  burst(x, y, color, count, speed, extra = {}) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, size: 1 + Math.random() * 2, life: 0.3 + Math.random() * 0.3, ...extra });
    }
  }

  explosion(x, y, radius) {
    this.add({ x, y, shape: "ring", color: "#ffe9a8", size: radius, life: 0.35 });
    this.add({ x, y, shape: "flash", color: "#fff1c4", size: radius * 0.9, life: 0.18, light: radius * 2.2 });
    this.burst(x, y, "#ffb347", 18, radius * 3, { life: 0.5, size: 3 });
    this.burst(x, y, "#ff6a2a", 12, radius * 2, { life: 0.6, size: 3 });
    for (let i = 0; i < 8; i += 1) {
      const a = Math.random() * Math.PI * 2;
      this.add({ x: x + Math.cos(a) * radius * 0.3, y: y + Math.sin(a) * radius * 0.3, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, shape: "smoke", color: "#3a3a3a", size: 8 + Math.random() * 8, life: 0.9 + Math.random() * 0.6, drag: 0.94 });
    }
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
    }
    this.items = this.items.filter((p) => p.age < p.life);
  }
}

// Renderer -------------------------------------------------------------------------------------------

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const light = document.createElement("canvas");
  light.width = VIEW_W;
  light.height = VIEW_H;
  const lctx = light.getContext("2d");
  let scale = 1;
  let shake = 0;
  let cam = { x: 0, y: 0 };
  let mapLayer = null;
  let decals = null;
  let dctx = null;
  let mapFor = null;

  function resize() {
    const root = document.documentElement;
    const top = canvas.parentElement.getBoundingClientRect().top;
    const box = { width: root.clientWidth, height: root.clientHeight - top };
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(box.width / VIEW_W, box.height / VIEW_H);
    scale = Math.max(1, Math.round(fit * dpr));
    canvas.width = VIEW_W * scale;
    canvas.height = VIEW_H * scale;
    canvas.style.width = `${Math.floor(VIEW_W * fit)}px`;
    canvas.style.height = `${Math.floor(VIEW_H * fit)}px`;
  }

  /** Screen (client) position → world angle from the player, for mouse aiming. */
  function toWorldAngle(game, clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    const wx = ((clientX - box.left) / box.width) * VIEW_W + cam.x;
    const wy = ((clientY - box.top) / box.height) * VIEW_H + cam.y;
    return Math.atan2(wy - game.player.y, wx - game.player.x);
  }

  function prepare(game) {
    const { map } = game;
    const theme = THEMES[game.mission.theme];
    mapLayer = document.createElement("canvas");
    mapLayer.width = map.pixelW;
    mapLayer.height = map.pixelH;
    const m = mapLayer.getContext("2d");
    m.fillStyle = "#07080b";
    m.fillRect(0, 0, map.pixelW, map.pixelH);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let ty = 0; ty < map.h; ty += 1) {
      for (let tx = 0; tx < map.w; tx += 1) {
        const x = tx * TILE;
        const y = ty * TILE;
        if (map.isSolid(tx, ty)) continue;
        m.fillStyle = (tx + ty) % 2 ? theme.floor : theme.floor2;
        m.fillRect(x, y, TILE, TILE);
        m.strokeStyle = theme.line;
        m.lineWidth = 1;
        m.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        if (game.mission.theme === "hive") {
          m.strokeStyle = "rgba(214,92,255,0.18)";
          m.beginPath();
          m.moveTo(x + rnd() * TILE, y);
          m.quadraticCurveTo(x + rnd() * TILE, y + TILE / 2, x + rnd() * TILE, y + TILE);
          m.stroke();
        } else if (rnd() < 0.08) {
          m.fillStyle = theme.line;
          m.fillRect(x + 6, y + 6, TILE - 12, 2);
          m.fillRect(x + 6, y + TILE - 8, TILE - 12, 2);
        } else if (rnd() < 0.04) {
          m.fillStyle = "rgba(0,0,0,0.18)";
          m.beginPath();
          m.arc(x + TILE / 2, y + TILE / 2, 6 + rnd() * 6, 0, Math.PI * 2);
          m.fill();
        }
      }
    }
    // Walls: a lit top face, and a dark front face where the floor is below.
    for (let ty = 0; ty < map.h; ty += 1) {
      for (let tx = 0; tx < map.w; tx += 1) {
        if (!map.isSolid(tx, ty)) continue;
        const touchesFloor = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => !map.isSolid(tx + dx, ty + dy) && tx + dx >= 0 && ty + dy >= 0 && tx + dx < map.w && ty + dy < map.h);
        if (!touchesFloor) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        m.fillStyle = theme.wall;
        m.fillRect(x, y, TILE, TILE);
        m.fillStyle = theme.wallTop;
        m.fillRect(x, y, TILE, TILE - 7);
        m.fillStyle = "rgba(255,255,255,0.08)";
        m.fillRect(x + 2, y + 2, TILE - 4, 2);
        if (!map.isSolid(tx, ty + 1) && ty + 1 < map.h) {
          m.fillStyle = theme.wallFront;
          m.fillRect(x, y + TILE - 7, TILE, 7);
          if ((tx * 7 + ty) % 5 === 0) {
            m.fillStyle = theme.accent;
            m.fillRect(x + 4, y + TILE - 5, 6, 2);
          }
          m.fillStyle = "rgba(0,0,0,0.3)";
          m.fillRect(x, y + TILE, TILE, 5);
        }
      }
    }
    decals = document.createElement("canvas");
    decals.width = map.pixelW;
    decals.height = map.pixelH;
    dctx = decals.getContext("2d");
    mapFor = game;
  }

  function splat(x, y, color, size) {
    if (!dctx) return;
    dctx.fillStyle = color;
    for (let i = 0; i < 5; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * size;
      dctx.globalAlpha = 0.5 + Math.random() * 0.3;
      dctx.beginPath();
      dctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, size * (0.25 + Math.random() * 0.4), 0, Math.PI * 2);
      dctx.fill();
    }
    dctx.globalAlpha = 1;
  }

  function scorch(x, y, radius) {
    if (!dctx) return;
    const g = dctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g;
    dctx.beginPath();
    dctx.arc(x, y, radius, 0, Math.PI * 2);
    dctx.fill();
  }

  function updateCamera(game, dt) {
    const p = game.player;
    const lead = 34;
    const tx = p.x + Math.cos(p.angle) * lead - VIEW_W / 2;
    const ty = p.y + Math.sin(p.angle) * lead - VIEW_H / 2;
    const k = 1 - Math.pow(0.0005, dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.x = Math.max(0, Math.min(game.map.pixelW - VIEW_W, cam.x));
    cam.y = Math.max(0, Math.min(game.map.pixelH - VIEW_H, cam.y));
  }

  function snapCamera(game) {
    cam = { x: game.player.x - VIEW_W / 2, y: game.player.y - VIEW_H / 2 };
    updateCamera(game, 1);
  }

  // Sprites ----------------------------------------------------------------------------------------

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function ellipse(x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function legs(count, length, spread, phase, color, width = 1.4) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < count; i += 1) {
        const base = (i / (count - 1) - 0.5) * spread;
        const swing = Math.sin(phase + i * 2.1 + (side > 0 ? Math.PI : 0)) * 0.25;
        const a = side * (Math.PI / 2) + base * side + swing;
        const kx = Math.cos(a) * length * 0.6;
        const ky = Math.sin(a) * length * 0.6;
        ctx.beginPath();
        ctx.moveTo(base * 4, 0);
        ctx.lineTo(kx, ky);
        ctx.lineTo(kx + Math.cos(a + side * 0.6) * length * 0.5, ky + Math.sin(a + side * 0.6) * length * 0.5);
        ctx.stroke();
      }
    }
  }

  function drawAlien(a, time) {
    const c = ALIEN_COLORS[a.kind];
    const flash = a.hurt > 0;
    ctx.save();
    ctx.translate(a.x, a.y);
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(2, 3, a.r * 1.1, a.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(a.angle);
    const phase = time * (a.kind === "crawler" ? 22 : 12) + a.id;
    const body = flash ? "#ffffff" : c.body;
    switch (a.kind) {
      case "crawler":
        legs(3, 11, 1.4, phase, c.dark);
        ellipse(-3, 0, 6, 4.5, body);
        ellipse(3, 0, 4, 3.5, flash ? "#fff" : c.light);
        ctx.strokeStyle = c.dark;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(6, -2);
        ctx.lineTo(9, -3.5);
        ctx.moveTo(6, 2);
        ctx.lineTo(9, 3.5);
        ctx.stroke();
        circle(5, -1.5, 0.9, c.eye);
        circle(5, 1.5, 0.9, c.eye);
        break;
      case "spitter":
        legs(4, 14, 1.6, phase, c.dark);
        ellipse(-5, 0, 8, 7, body);
        ellipse(-6, 0, 5, 4.5, flash ? "#fff" : c.light);
        ellipse(4, 0, 4.5, 4, c.dark);
        circle(-6, 0, 2 + Math.sin(time * 6 + a.id) * 0.8, "#eaff9a");
        circle(7, -1.5, 1, c.eye);
        circle(7, 1.5, 1, c.eye);
        break;
      case "brute": {
        legs(3, 14, 1.2, phase, c.dark, 2.6);
        const glow = a.state === "windup" ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
        ellipse(-4, 0, 14, 12, body);
        ctx.strokeStyle = c.dark;
        ctx.lineWidth = 1.5;
        for (const x of [-12, -6, 0]) {
          ctx.beginPath();
          ctx.arc(x, 0, 11, -1.1, 1.1);
          ctx.stroke();
        }
        ellipse(8, 0, 7, 8, flash ? "#fff" : c.light);
        // Claws
        ctx.fillStyle = c.dark;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(10, s * 6);
          ctx.lineTo(19, s * 10);
          ctx.lineTo(13, s * 3);
          ctx.fill();
        }
        circle(12, -3, 1.6, glow ? `rgba(255,${80 - glow * 80},60,1)` : c.eye);
        circle(12, 3, 1.6, glow ? `rgba(255,${80 - glow * 80},60,1)` : c.eye);
        break;
      }
      case "exploder": {
        const fuse = a.state === "fuse";
        const pulse = fuse ? 1 + 0.25 * Math.sin(time * 40) : 1 + 0.08 * Math.sin(time * 8 + a.id);
        legs(3, 8, 1.4, phase, c.dark);
        circle(0, 0, 8 * pulse, fuse && Math.sin(time * 40) > 0 ? "#ffffff" : body);
        circle(-1, -1, 5 * pulse, flash ? "#fff" : c.light);
        ctx.strokeStyle = c.dark;
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i += 1) {
          const ang = (i / 5) * Math.PI * 2 + 0.3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(Math.cos(ang + 0.4) * 4, Math.sin(ang + 0.4) * 4, Math.cos(ang) * 7 * pulse, Math.sin(ang) * 7 * pulse);
          ctx.stroke();
        }
        break;
      }
      case "queen": {
        legs(5, 34, 1.8, phase * 0.6, c.dark, 3.2);
        ellipse(-22, 0, 22, 17, flash ? "#fff" : c.dark);
        ellipse(-22, 0, 16, 12, body);
        for (let i = 0; i < 4; i += 1) circle(-30 + i * 6, 0, 2.4, `rgba(255,90,140,${0.5 + 0.4 * Math.sin(time * 4 + i)})`);
        ellipse(4, 0, 16, 14, body);
        ellipse(4, 0, 11, 9, flash ? "#fff" : c.light);
        ellipse(20, 0, 10, 9, c.dark);
        ctx.fillStyle = c.dark;
        for (let i = -2; i <= 2; i += 1) {
          ctx.beginPath();
          ctx.moveTo(14, i * 4);
          ctx.lineTo(4, i * 7 + (i > 0 ? 4 : -4));
          ctx.lineTo(16, i * 4 + 1);
          ctx.fill();
        }
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(26, s * 4);
          ctx.lineTo(38, s * 9);
          ctx.lineTo(29, s * 1);
          ctx.fill();
        }
        circle(24, -3.5, 2.4, c.eye);
        circle(24, 3.5, 2.4, c.eye);
        break;
      }
      default:
        circle(0, 0, a.r, body);
    }
    ctx.restore();
  }

  function drawNest(n, time) {
    const pulse = 1 + 0.06 * Math.sin(time * 3 + n.id);
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(2, 4, 20, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    const hurt = n.hurt > 0;
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2 + n.id;
      circle(Math.cos(a) * 11 * pulse, Math.sin(a) * 9 * pulse, 8, hurt ? "#fff" : "#4d2a4f");
    }
    circle(0, 0, 13 * pulse, hurt ? "#fff" : "#6b3a6b");
    circle(0, 0, 8 * pulse, n.active ? "#8a4b84" : "#5d3559");
    circle(0, 0, 4.5 * pulse, n.active ? `rgba(140,255,120,${0.7 + 0.3 * Math.sin(time * 6)})` : "#5b8a4f");
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + 0.7;
      circle(Math.cos(a) * 7, Math.sin(a) * 6, 2.2, "#c6ff9a");
    }
    // Health ring
    ctx.strokeStyle = "rgba(255,80,120,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * n.hp) / n.maxHp);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(game, time) {
    const p = game.player;
    if (!p.alive) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.dashT > 0) ctx.globalAlpha = 0.55;
    ctx.rotate(p.angle);
    const walk = p.moving ? Math.sin(time * 16) * 3 : 0;
    const flash = p.hurt > 0.15;
    // Boots
    ellipse(-1 + walk, -5, 4, 2.6, "#22272e");
    ellipse(-1 - walk, 5, 4, 2.6, "#22272e");
    // Backpack, body, shoulders
    ellipse(-6, 0, 4, 6, "#3b4a3f");
    ellipse(0, 0, 6.5, 8.5, flash ? "#ffffff" : "#2f6f73");
    ellipse(1, -7, 3.2, 3, flash ? "#ffffff" : "#3f8c90");
    ellipse(1, 7, 3.2, 3, flash ? "#ffffff" : "#3f8c90");
    // Gun
    const weapon = WEAPONS[p.weapon];
    const length = { pistol: 9, smg: 13, shotgun: 15, flamer: 15, plasma: 16, rocket: 18 }[p.weapon] ?? 12;
    const width = { rocket: 4, flamer: 4, plasma: 3.4, shotgun: 3 }[p.weapon] ?? 2.4;
    ctx.fillStyle = "#1d2126";
    ctx.fillRect(2, 1.5, length, width);
    ctx.fillStyle = weapon.color;
    ctx.fillRect(2 + length - 3, 1.5, 3, width);
    ellipse(4, 3, 2.2, 2, "#e0b48a");
    // Helmet
    circle(1, 0, 4.6, flash ? "#ffffff" : "#4a5a52");
    ellipse(3.4, 0, 1.8, 3.2, "#9ef0ff");
    ctx.restore();
  }

  function drawPickup(item, time) {
    const bob = Math.sin(time * 4 + item.x) * 1.2;
    const x = item.x;
    const y = item.y + bob;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(item.x, item.y + 7, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (item.kind === "medkit") {
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(x - 7, y - 6, 14, 12);
      ctx.fillStyle = "#e23b3b";
      ctx.fillRect(x - 1.5, y - 4, 3, 8);
      ctx.fillRect(x - 4, y - 1.5, 8, 3);
    } else if (item.kind === "ammo") {
      ctx.fillStyle = "#4e6b2e";
      ctx.fillRect(x - 8, y - 5, 16, 10);
      ctx.fillStyle = "#f2c94c";
      for (let i = 0; i < 4; i += 1) ctx.fillRect(x - 6 + i * 3.5, y - 3, 2, 6);
    } else if (item.kind === "credits") {
      circle(x, y, 6, "#c9962b");
      circle(x, y, 4.5, "#f5d76e");
      ctx.fillStyle = "#8a6514";
      ctx.font = "bold 7px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("¢", x, y + 0.5);
    } else if (item.kind === "grenades") {
      circle(x - 3, y, 4, "#4c5a2c");
      circle(x + 3, y, 4, "#5a6a33");
      ctx.fillStyle = "#c9c9c9";
      ctx.fillRect(x - 4, y - 5, 2, 2);
      ctx.fillRect(x + 2, y - 5, 2, 2);
    }
  }

  function drawBarrel(b) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(b.x + 2, b.y + 3, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(b.x, b.y, 9, "#a8322c");
    circle(b.x, b.y, 7, "#cf4a3d");
    ctx.strokeStyle = "#f5c542";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.stroke();
    circle(b.x, b.y, 1.6, "#2b0f0d");
  }

  function drawExit(game, time) {
    const { exit } = game.map;
    const open = game.exitOpen;
    const color = open ? "#59f08a" : "#ff4d5e";
    ctx.save();
    ctx.translate(exit.x, exit.y);
    ctx.fillStyle = "#14181d";
    ctx.fillRect(-14, -14, 28, 28);
    ctx.strokeStyle = color;
    ctx.globalAlpha = open ? 0.6 + 0.4 * Math.sin(time * 5) : 0.8;
    ctx.lineWidth = 2;
    ctx.strokeRect(-12, -12, 24, 24);
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i += 1) {
      const y = -6 + i * 6 - (open ? (time * 12) % 6 : 0);
      ctx.beginPath();
      ctx.moveTo(-6, y + 3);
      ctx.lineTo(0, y - 2);
      ctx.lineTo(6, y + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShots(game, time) {
    for (const s of game.shots) {
      const w = WEAPONS[s.weapon];
      const a = Math.atan2(s.vy, s.vx);
      if (w.flame) {
        const t = 1 - s.life / s.maxLife;
        const r = 3 + t * 9;
        ctx.globalAlpha = 0.85 * (1 - t);
        circle(s.x, s.y, r, t < 0.3 ? "#fff3b0" : t < 0.6 ? "#ff9b2f" : "#d4401e");
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);
      if (s.weapon === "plasma") {
        ctx.fillStyle = "rgba(126,243,255,0.35)";
        ctx.fillRect(-12, -3, 16, 6);
        ctx.fillStyle = "#dffcff";
        ctx.fillRect(-8, -1.5, 12, 3);
      } else if (s.weapon === "rocket") {
        ctx.fillStyle = "#c8c8c8";
        ctx.fillRect(-6, -2, 9, 4);
        ctx.fillStyle = "#ff5d5d";
        ctx.fillRect(3, -2, 3, 4);
        ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},80,0.9)`;
        ctx.fillRect(-10, -1.5, 4, 3);
      } else {
        ctx.fillStyle = w.color;
        ctx.fillRect(-7, -0.8, 9, 1.6);
        ctx.fillStyle = "#fffbe6";
        ctx.fillRect(0, -0.8, 2, 1.6);
      }
      ctx.restore();
    }
    for (const s of game.spits) {
      circle(s.x, s.y, 4.4, "rgba(160,255,80,0.35)");
      circle(s.x, s.y, 3, "#a6ff4d");
      circle(s.x - 1, s.y - 1, 1.2, "#f2ffd6");
    }
    for (const g of game.grenades) {
      circle(g.x, g.y, 3.6, "#4c5a2c");
      if (Math.sin(time * (10 + g.t * 30)) > 0) circle(g.x, g.y - 1, 1.2, "#ff3b3b");
    }
  }

  function drawParticles(particles) {
    for (const p of particles.items) {
      const t = p.age / p.life;
      ctx.globalAlpha = Math.max(0, 1 - t);
      if (p.shape === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + t * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === "flash") {
        circle(p.x, p.y, p.size * (1 - t * 0.5), p.color);
      } else if (p.shape === "smoke") {
        ctx.globalAlpha = 0.35 * (1 - t);
        circle(p.x, p.y, p.size * (0.6 + t), p.color);
      } else if (p.shape === "text") {
        ctx.fillStyle = p.color;
        ctx.font = "bold 8px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.shape === "shell") {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 0.5, 2, 1);
      } else {
        circle(p.x, p.y, p.size * (1 - t * 0.5), p.color);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Darkness with a flashlight cone, a halo, and lights from muzzle flashes, explosions, nests. */
  function drawLighting(game, particles, time, flashes) {
    const dark = game.mission.dark;
    lctx.globalCompositeOperation = "source-over";
    lctx.clearRect(0, 0, VIEW_W, VIEW_H);
    lctx.fillStyle = `rgba(4,6,12,${dark})`;
    lctx.fillRect(0, 0, VIEW_W, VIEW_H);
    lctx.globalCompositeOperation = "destination-out";
    const p = game.player;
    const px = p.x - cam.x;
    const py = p.y - cam.y;
    const hole = (x, y, r, strength = 1) => {
      const g = lctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.arc(x, y, r, 0, Math.PI * 2);
      lctx.fill();
    };
    hole(px, py, 70, 0.95);
    if (p.alive) {
      const len = 260;
      const half = 0.42;
      const g = lctx.createRadialGradient(px, py, 10, px, py, len);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.7, "rgba(0,0,0,0.75)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.moveTo(px, py);
      lctx.arc(px, py, len, p.angle - half, p.angle + half);
      lctx.closePath();
      lctx.fill();
    }
    for (const n of game.nests) hole(n.x - cam.x, n.y - cam.y, n.active ? 46 : 30, 0.6);
    hole(game.map.exit.x - cam.x, game.map.exit.y - cam.y, 40, game.exitOpen ? 0.8 : 0.45);
    for (const s of game.shots) if (s.weapon === "plasma" || s.weapon === "flamer" || s.weapon === "rocket") hole(s.x - cam.x, s.y - cam.y, s.weapon === "flamer" ? 26 : 30, 0.5);
    for (const s of game.spits) hole(s.x - cam.x, s.y - cam.y, 14, 0.5);
    for (const f of flashes) hole(f.x - cam.x, f.y - cam.y, f.r, 0.9);
    for (const q of particles.items) if (q.light) hole(q.x - cam.x, q.y - cam.y, q.light * (1 - q.age / q.life), 1);
    ctx.drawImage(light, 0, 0);
  }

  function drawMinimap(game) {
    const { map } = game;
    const w = 86;
    const k = w / map.pixelW;
    const h = map.pixelH * k;
    const x0 = VIEW_W - w - 6;
    const y0 = 6;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#05070a";
    ctx.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
    ctx.drawImage(mapLayer, x0, y0, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ff4d8d";
    for (const n of game.nests) ctx.fillRect(x0 + n.x * k - 1.5, y0 + n.y * k - 1.5, 3, 3);
    const q = game.queen;
    if (q) ctx.fillRect(x0 + q.x * k - 2.5, y0 + q.y * k - 2.5, 5, 5);
    ctx.fillStyle = game.exitOpen ? "#59f08a" : "#ff4d5e";
    ctx.fillRect(x0 + game.map.exit.x * k - 2, y0 + game.map.exit.y * k - 2, 4, 4);
    ctx.fillStyle = "#7ef3ff";
    ctx.fillRect(x0 + game.player.x * k - 1.5, y0 + game.player.y * k - 1.5, 3, 3);
  }

  function drawCrosshair(mouse) {
    if (!mouse) return;
    const box = canvas.getBoundingClientRect();
    const x = ((mouse.x - box.left) / box.width) * VIEW_W;
    const y = ((mouse.y - box.top) / box.height) * VIEW_H;
    if (x < 0 || y < 0 || x > VIEW_W || y > VIEW_H) return;
    ctx.strokeStyle = "rgba(160,255,200,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.moveTo(x - 9, y);
    ctx.lineTo(x - 3, y);
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 9, y);
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x, y - 3);
    ctx.moveTo(x, y + 3);
    ctx.lineTo(x, y + 9);
    ctx.stroke();
  }

  function draw(game, particles, time, dt, { flashes = [], mouse = null } = {}) {
    if (mapFor !== game) {
      prepare(game);
      snapCamera(game);
    }
    updateCamera(game, dt);
    shake = Math.max(0, shake - dt);
    const sx = shake ? (Math.random() - 0.5) * shake * 16 : 0;
    const sy = shake ? (Math.random() - 0.5) * shake * 16 : 0;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#07080b";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(Math.round(-cam.x + sx), Math.round(-cam.y + sy));
    ctx.drawImage(mapLayer, 0, 0);
    ctx.drawImage(decals, 0, 0);
    ctx.imageSmoothingEnabled = true;
    drawExit(game, time);
    for (const item of game.pickups) drawPickup(item, time);
    for (const b of game.barrels) drawBarrel(b);
    for (const n of game.nests) drawNest(n, time);
    for (const a of game.aliens) if (a.kind !== "queen") drawAlien(a, time);
    const q = game.queen;
    if (q) drawAlien(q, time);
    drawPlayer(game, time);
    drawShots(game, time);
    drawParticles(particles);
    ctx.restore();
    drawLighting(game, particles, time, flashes);
    drawMinimap(game);
    drawCrosshair(mouse);
  }

  return {
    resize,
    draw,
    splat,
    scorch,
    shake(amount) {
      shake = Math.max(shake, amount);
    },
    toWorldAngle,
    get camera() {
      return cam;
    },
  };
}
