import test from "node:test";
import assert from "node:assert/strict";
import { GameMap } from "../src/core/map.js";
import { FlowField } from "../src/core/flowfield.js";
import { TILE } from "../src/core/constants.js";

const rows = [
  "##########",
  "#@.......#",
  "#.######.#",
  "#.#E...#.#",
  "#.#....#.#",
  "#...####.#",
  "##########",
];

const center = (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });

test("distances: 1 per straight step, about 1.41 per diagonal", () => {
  const map = new GameMap(rows);
  const f = new FlowField(map);
  f.update(1, 1);
  assert.equal(f.distanceAt(center(1, 1).x, center(1, 1).y), 0);
  assert.equal(f.distanceAt(center(5, 1).x, center(5, 1).y), 4);
  assert.equal(f.distanceAt(center(2, 5).x, center(2, 5).y), 5, "the wall corner forbids the diagonal shortcut");
  const open = new FlowField(new GameMap(["######", "#@...#", "#....#", "#...E#", "######"]));
  open.update(1, 1);
  assert.ok(Math.abs(open.distanceAt(center(3, 3).x, center(3, 3).y) - 2 * 1.414) < 1e-9);
  assert.equal(f.distanceAt(0, 0), Infinity, "walls have no distance");
});

test("diagonals never cut a wall corner", () => {
  const map = new GameMap(["#####", "#@..#", "##.##", "#..E#", "#####"]);
  const f = new FlowField(map);
  f.update(1, 1);
  // (1,3) is reached around the corner via (2,2): 1 + 1.414 + 1.414 would cut corners; must be ≥ 3.
  assert.ok(f.distanceAt(center(1, 3).x, center(1, 3).y) >= 3);
});

test("following the field from anywhere reaches the target, around walls", () => {
  const map = new GameMap(rows);
  const f = new FlowField(map);
  f.update(4, 4); // inside the inner room
  let p = center(8, 5);
  for (let i = 0; i < 400; i += 1) {
    const d = f.direction(p.x, p.y);
    if (!d || (d.x === 0 && d.y === 0)) break;
    p = { x: p.x + d.x * 4, y: p.y + d.y * 4 };
    assert.ok(!map.solidAt(p.x, p.y), "never walks into a wall");
  }
  assert.equal(Math.floor(p.x / TILE), 4);
  assert.equal(Math.floor(p.y / TILE), 4);
});

test("unreachable tiles give no direction; re-targeting the same tile is free", () => {
  const map = new GameMap(["#######", "#@.#..#", "#..#.E#", "#######"]);
  const f = new FlowField(map);
  assert.equal(f.update(1, 1), true);
  assert.equal(f.direction(center(5, 1).x, center(5, 1).y), null);
  assert.equal(f.update(1, 1), false, "same target: nothing recomputed");
});
