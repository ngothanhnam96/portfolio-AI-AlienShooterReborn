import test from "node:test";
import assert from "node:assert/strict";
import { GameMap, circleHitsWall, lineOfSight, moveCircle } from "../src/core/map.js";
import { TILE } from "../src/core/constants.js";

const rows = [
  "#########",
  "#@..c..N#",
  "#..###..#",
  "#h.#B#.E#",
  "#########",
];

test("the parser reads every legend character", () => {
  const map = new GameMap(rows);
  assert.equal(map.w, 9);
  assert.equal(map.h, 5);
  assert.deepEqual([map.start.tx, map.start.ty], [1, 1]);
  assert.deepEqual([map.exit.tx, map.exit.ty], [7, 3]);
  assert.equal(map.nests.length, 1);
  assert.deepEqual(map.aliens.map((a) => a.kind), ["crawler"]);
  assert.deepEqual(map.pickups.map((p) => p.kind), ["medkit"]);
  assert.equal(map.barrels.length, 1);
  assert.equal(map.start.x, 1.5 * TILE);
  assert.ok(map.isSolid(4, 2) && !map.isSolid(4, 1));
  assert.ok(map.isSolid(-1, 0) && map.isSolid(99, 1), "outside the map is wall");
});

test("the parser rejects maps without a start or exit, and unknown characters", () => {
  assert.throws(() => new GameMap(["###", "#E#", "###"]), /start/);
  assert.throws(() => new GameMap(["###", "#@#", "###"]), /exit/);
  assert.throws(() => new GameMap(["####", "#@E?", "####"]), /Unknown/);
});

test("a circle slides along a wall instead of entering it", () => {
  const map = new GameMap(rows);
  const body = { x: 3.5 * TILE, y: 1.5 * TILE, r: 9 };
  // Push down-right onto the wall block at (3..5, 2): x keeps moving, y stops at the wall.
  for (let i = 0; i < 10; i += 1) {
    moveCircle(map, body, 2, 2);
    assert.ok(!circleHitsWall(map, body.x, body.y, body.r));
    assert.ok(body.y <= 2 * TILE - body.r + 0.01, "never inside the wall row");
  }
  assert.ok(body.x >= 3.5 * TILE + 19.9, "slid right along the wall");
});

test("fast movers do not tunnel through walls", () => {
  const map = new GameMap(rows);
  const body = { x: 1.5 * TILE, y: 1.5 * TILE, r: 4 };
  moveCircle(map, body, 0, 200);
  assert.ok(body.y < 4 * TILE, "stopped by the floor wall");
  assert.ok(!circleHitsWall(map, body.x, body.y, body.r));
});

test("line of sight is blocked by walls", () => {
  const map = new GameMap(rows);
  assert.ok(lineOfSight(map, 1.5 * TILE, 1.5 * TILE, 7.5 * TILE, 1.5 * TILE));
  assert.ok(!lineOfSight(map, 1.5 * TILE, 3.5 * TILE, 7.5 * TILE, 3.5 * TILE));
});
