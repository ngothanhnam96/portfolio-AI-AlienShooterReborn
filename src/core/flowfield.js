/**
 * Flow field: one breadth-first search from the player's tile gives every floor tile its walking
 * distance to the player, so hundreds of aliens can path around walls for the price of one search.
 */

import { TILE } from "./constants.js";

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
];

/** Binary min-heap of [priority, x, y]. */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(p, x, y) {
    const a = this.items;
    a.push([p, x, y]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class FlowField {
  constructor(map) {
    this.map = map;
    this.dist = new Float64Array(map.w * map.h).fill(Infinity);
    this.target = null;
  }

  /** Dijkstra with 8 directions; diagonals never cut a wall corner. */
  update(tx, ty) {
    const { map, dist } = this;
    if (this.target && this.target.tx === tx && this.target.ty === ty) return false;
    this.target = { tx, ty };
    dist.fill(Infinity);
    if (map.isSolid(tx, ty)) return true;
    const heap = new MinHeap();
    heap.push(0, tx, ty);
    dist[map.index(tx, ty)] = 0;
    while (heap.size) {
      const [d, x, y] = heap.pop();
      if (d > dist[map.index(x, y)]) continue;
      for (const [dx, dy, cost] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (map.isSolid(nx, ny)) continue;
        if (dx && dy && (map.isSolid(x + dx, y) || map.isSolid(x, y + dy))) continue;
        const nd = d + cost;
        const i = map.index(nx, ny);
        if (nd < dist[i]) {
          dist[i] = nd;
          heap.push(nd, nx, ny);
        }
      }
    }
    return true;
  }

  distanceAt(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (this.map.isSolid(tx, ty)) return Infinity;
    return this.dist[this.map.index(tx, ty)];
  }

  /** Unit vector toward the neighbouring tile closest to the target, or null if unreachable. */
  direction(x, y) {
    const { map, dist } = this;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (map.isSolid(tx, ty)) return null;
    const here = dist[map.index(tx, ty)];
    if (!Number.isFinite(here)) return null;
    let best = null;
    let bestD = here;
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (map.isSolid(nx, ny)) continue;
      if (dx && dy && (map.isSolid(tx + dx, ty) || map.isSolid(tx, ty + dy))) continue;
      const d = dist[map.index(nx, ny)];
      if (d < bestD) {
        bestD = d;
        best = [nx, ny];
      }
    }
    if (!best) return here === 0 ? { x: 0, y: 0 } : null;
    const gx = (best[0] + 0.5) * TILE - x;
    const gy = (best[1] + 0.5) * TILE - y;
    const len = Math.hypot(gx, gy) || 1;
    return { x: gx / len, y: gy / len };
  }
}
