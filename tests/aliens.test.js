import test from "node:test";
import assert from "node:assert/strict";
import { ALIENS, NEST, QUEEN } from "../src/core/aliens.js";
import { TILE } from "../src/core/constants.js";
import { input, makeGame, room, run } from "./support/helpers.js";

test("a crawler finds its way around a wall and bites", () => {
  const rows = [
    "############",
    "#@.........#",
    "#.########.#",
    "#........c.#",
    "#E.........#",
    "############",
  ];
  const game = makeGame(rows);
  game.aliens[0].awake = true;
  game.invincible = true;
  run(game, 6);
  assert.ok(game.stats.damageTaken >= ALIENS.crawler.bite, "reached and bit the player");
  const bites = game.stats.damageTaken / ALIENS.crawler.bite;
  run(game, 1.4);
  assert.ok(game.stats.damageTaken / ALIENS.crawler.bite - bites <= 2.01, "bites have a cooldown");
});

test("sleeping aliens wake when they see the player, not through walls", () => {
  const rows = [
    "##############",
    "#@...........#",
    "#######.######",
    "#.....c......#",
    "#E...........#",
    "##############",
  ];
  const game = makeGame(rows);
  run(game, 2);
  assert.equal(game.aliens[0].awake, false, "out of sight behind the wall");
  run(game, 0.2, input({ fire: false }));
  const g2 = makeGame(room(14, 3, { "1,2": "@", "8,2": "c", "14,2": "E" }));
  run(g2, 0.1);
  assert.equal(g2.aliens[0].awake, true);
});

test("a spitter keeps its distance and spits only with line of sight", () => {
  const game = makeGame(room(24, 5, { "2,3": "@", "12,3": "s", "24,3": "E" }));
  game.invincible = true;
  const s = game.aliens[0];
  s.awake = true;
  run(game, 1, () => input({ aim: 0 }));
  const d = Math.hypot(s.x - game.player.x, s.y - game.player.y);
  assert.ok(d >= ALIENS.spitter.spit.keep - 20, `stays back (${d.toFixed(0)} px)`);
  run(game, 4);
  assert.ok(game.stats.damageTaken > 0, "acid hit");

  const blocked = makeGame(["##########", "#@..#..s.#", "#...#....#", "#E..#....#", "##########"]);
  blocked.aliens[0].awake = true;
  run(blocked, 0.5);
  assert.equal(blocked.spits.length, 0);
});

test("a brute roars, charges in a straight line, and is stunned by a wall", () => {
  const game = makeGame(room(24, 5, { "3,3": "@", "12,3": "b", "24,3": "E" }));
  game.invincible = true;
  const b = game.aliens[0];
  b.awake = true;
  const events = [];
  for (let i = 0; i < 60 * 3; i += 1) {
    game.update(input({ move: { x: 0, y: -1 } }), 1 / 60);
    events.push(...game.takeEvents().map((e) => e.type));
    if (b.state === "stunned") break;
  }
  assert.ok(events.includes("brute-roar"), "telegraphs");
  assert.ok(events.indexOf("brute-roar") < events.indexOf("brute-charge"), "roar first");
  assert.ok(events.includes("thud") || game.stats.damageTaken >= ALIENS.brute.charge.damage, "hit a wall or the player");
});

test("dashing sideways dodges a brute's charge", () => {
  const game = makeGame(room(24, 7, { "4,4": "@", "10,4": "b", "24,4": "E" }));
  const b = game.aliens[0];
  b.awake = true;
  let dodged = false;
  for (let i = 0; i < 60 * 4; i += 1) {
    const dash = b.state === "charge" && !dodged;
    if (dash) dodged = true;
    game.update(input({ move: { x: 0, y: dash ? 1 : 0 }, dash }), 1 / 60);
    if (dodged && b.state !== "charge") break;
  }
  assert.ok(dodged);
  assert.equal(game.stats.damageTaken, 0);
});

test("an exploder lights its fuse near the player and the blast hurts aliens too", () => {
  const game = makeGame(room(20, 5, { "2,3": "@", "8,3": "x", "9,2": "c", "20,3": "E" }));
  game.invincible = true;
  for (const a of game.aliens) a.awake = true;
  game.aliens[1].hp = 5;
  const types = [];
  for (let i = 0; i < 60 * 3; i += 1) {
    game.update(input({}), 1 / 60);
    types.push(...game.takeEvents().map((e) => e.type));
  }
  assert.ok(types.includes("fuse"));
  assert.ok(types.includes("explode"));
  assert.ok(game.stats.damageTaken > 0);
  assert.equal(game.aliens.length, 0, "the blast also killed the crawler");
});

test("nests sleep until the player is near, hatch on a timer, and cap their brood", () => {
  const rows = room(40, 5, { "1,3": "@", "38,3": "N", "40,3": "E" });
  const game = makeGame(rows);
  run(game, 6);
  assert.equal(game.aliens.length, 0, "asleep: too far");
  game.player.x = 30 * TILE;
  game.invincible = true;
  run(game, NEST.period * 3);
  assert.ok(game.aliens.length >= 2, "hatching");
  for (const a of game.aliens) a.awake = false;
  run(game, NEST.period * (NEST.cap + 4));
  assert.ok(game.aliens.filter((a) => a.nest === game.nests[0].id).length <= NEST.cap);
});

test("nests hatch the mission's mix", () => {
  const game = makeGame(room(30, 5, { "1,3": "@", "28,3": "N", "30,3": "E" }), { mix: { spitter: 1 } });
  game.player.x = 20 * TILE;
  game.invincible = true;
  run(game, NEST.period * 3);
  assert.ok(game.aliens.length > 0 && game.aliens.every((a) => a.kind === "spitter"));
});

test("the queen cycles spray → brood → spray → charge", () => {
  const game = makeGame(room(30, 15, { "2,8": "@", "20,8": "Q", "30,8": "E" }));
  game.invincible = true;
  const types = [];
  let brood = 0;
  for (let i = 0; i < 60 * 14; i += 1) {
    game.update(input({}), 1 / 60);
    types.push(...game.takeEvents().map((e) => e.type).filter((t) => t.startsWith("queen-")));
    brood = Math.max(brood, game.aliens.filter((a) => a.kind !== "queen").length);
  }
  assert.deepEqual(types.slice(0, 4), ["queen-spray", "queen-brood", "queen-spray", "queen-charge"]);
  assert.ok(brood >= QUEEN.brood.count, "brood hatched");
});

test("the queen's acid fan leaves gaps wider than the player at range", () => {
  const { shots, spread } = QUEEN.spray;
  const gapAngle = spread / (shots - 1);
  const at = 220;
  const gap = 2 * at * Math.sin(gapAngle / 2) - 2 * 4;
  assert.ok(gap > 2 * 9 + 2, `gap ${gap.toFixed(1)} px`);
});
