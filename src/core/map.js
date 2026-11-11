/** ASCII maps: parsing, tile queries, collision and line of sight. Pure, no DOM. */

import { TILE } from "./constants.js";

/**
 * Legend
 *   #  wall          .  floor        @  player start   E  exit (opens when every nest is gone)
 *   N  alien nest    Q  queen        B  explosive barrel
 *   c  crawler       s  spitter      b  brute          x  exploder
 *   h  medkit        a  ammo crate   $  credits        g  grenades
 * Everything except "#" (and spaces, which are void) is floor.
 */
export const ALIEN_CHARS = { c: "crawler", s: "spitter", b: "brute", x: "exploder" };
export const PICKUP_CHARS = { h: "medkit", a: "ammo", $: "credits", g: "grenades" };

export class GameMap {
  constructor(rows) {
    const width = Math.max(...rows.map((r) => r.length));
    this.rows = rows.map((r) => r.padEnd(width, " "));
    this.w = width;
    this.h = rows.length;
    this.solid = new Uint8Array(this.w * this.h);
    this.start = null;
    this.exit = null;
    this.nests = [];
    this.aliens = [];
    this.pickups = [];
    this.barrels = [];
    this.queen = null;
    for (let ty = 0; ty < this.h; ty += 1) {
      for (let tx = 0; tx < this.w; tx += 1) {
        const ch = this.rows[ty][tx];
        const at = { tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
        if (ch === "#" || ch === " ") this.solid[ty * this.w + tx] = 1;
        else if (ch === "@") this.start = at;
        else if (ch === "E") this.exit = at;
        else if (ch === "N") this.nests.push(at);
        else if (ch === "Q") this.queen = at;
        else if (ch === "B") this.barrels.push(at);
        else if (ALIEN_CHARS[ch]) this.aliens.push({ ...at, kind: ALIEN_CHARS[ch] });
        else if (PICKUP_CHARS[ch]) this.pickups.push({ ...at, kind: PICKUP_CHARS[ch] });
        else if (ch !== ".") throw new Error(`Unknown map character "${ch}" at ${tx},${ty}`);
      }
    }
    if (!this.start) throw new Error("Map has no start (@)");
    if (!this.exit) throw new Error("Map has no exit (E)");
  }

  get pixelW() {
    return this.w * TILE;
  }

  get pixelH() {
    return this.h * TILE;
  }

  /** Outside the map counts as wall. */
  isSolid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.solid[ty * this.w + tx] === 1;
  }

  solidAt(x, y) {
    return this.isSolid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  index(tx, ty) {
    return ty * this.w + tx;
  }
}

/**
 * Move a circle by (dx, dy), one axis at a time, stopping at walls so it slides along them.
 * Steps are kept under half a tile so fast movers never tunnel.
 */
export function moveCircle(map, body, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE / 3)));
  let hitX = false;
  let hitY = false;
  for (let i = 0; i < steps; i += 1) {
    const nx = body.x + dx / steps;
    if (!circleHitsWall(map, nx, body.y, body.r)) body.x = nx;
    else hitX = true;
    const ny = body.y + dy / steps;
    if (!circleHitsWall(map, body.x, ny, body.r)) body.y = ny;
    else hitY = true;
  }
  return { hitX, hitY };
}

export function circleHitsWall(map, x, y, r) {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (!map.isSolid(tx, ty)) continue;
      const cx = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
      const cy = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}

/** True when nothing solid lies on the straight segment between two points. */
export function lineOfSight(map, x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist / (TILE / 4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (map.solidAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}
