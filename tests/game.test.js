import test from "node:test";
import assert from "node:assert/strict";
import { DASH, DYING_TIME, Game, INTRO_TIME, MEDKIT_HEAL, NO_INPUT, PICKUP_CREDITS, missionBonus } from "../src/core/game.js";
import { createLoadout } from "../src/core/armory.js";
import { MISSIONS } from "../src/core/missions.js";
import { TILE, DT } from "../src/core/constants.js";
import { GRENADE } from "../src/core/weapons.js";
import { mulberry32 } from "../src/core/rng.js";
import { input, makeGame, room, run } from "./support/helpers.js";

test("intro: input is ignored, then play starts", () => {
  const game = new Game(0, createLoadout());
  assert.equal(game.state, "intro");
  const { x } = game.player;
  run(game, INTRO_TIME - 0.1, input({ move: { x: 1, y: 0 } }));
  assert.equal(game.player.x, x);
  run(game, 0.2);
  assert.equal(game.state, "playing");
});

test("movement is normalised; diagonals are not faster", () => {
  const a = makeGame(room(20, 20, { "10,10": "@", "20,20": "E" }));
  const b = makeGame(room(20, 20, { "10,10": "@", "20,20": "E" }));
  const start = { x: a.player.x, y: a.player.y };
  run(a, 0.5, input({ move: { x: 1, y: 0 } }));
  run(b, 0.5, input({ move: { x: 1, y: 1 } }));
  const da = Math.hypot(a.player.x - start.x, a.player.y - start.y);
  const db = Math.hypot(b.player.x - start.x, b.player.y - start.y);
  assert.ok(Math.abs(da - db) < 1);
});

test("dash: a fast burst with invulnerability, then a cooldown", () => {
  const game = makeGame(room(30, 5, { "2,3": "@", "30,3": "E" }));
  const x0 = game.player.x;
  run(game, DASH.time, input({ dash: true, move: { x: 1, y: 0 } }));
  assert.ok(game.player.x - x0 > DASH.speed * DASH.time * 0.8);
  game.player.dashT = 0.1;
  assert.equal(game.hurtPlayer(50, { x: 0, y: 0 }), false, "invulnerable while dashing");
  game.player.dashT = 0;
  const x1 = game.player.x;
  run(game, 0.2, input({ dash: false }));
  run(game, 0.2, input({ dash: true }));
  assert.ok(game.player.x - x1 < 10, "cooldown: no second dash");
});

test("dying: hp to zero → dying → failed; the start loadout is untouched for a retry", () => {
  const loadout = { ...createLoadout(), credits: 77 };
  const game = makeGame(room(10, 3, { "1,2": "@", "10,2": "E" }), { loadout });
  game.loadout.credits += 500;
  game.hurtPlayer(1000, { x: 0, y: 0 });
  assert.equal(game.state, "dying");
  assert.equal(game.player.alive, false);
  run(game, DYING_TIME + 0.1);
  assert.equal(game.state, "failed");
  assert.equal(game.startLoadout.credits, 77);
  assert.equal(loadout.credits, 77, "the caller's loadout is never touched");
});

test("objective: the exit stays shut until every nest is destroyed, then clears the mission", () => {
  const game = makeGame(room(12, 3, { "1,2": "@", "6,2": "N", "12,2": "E" }));
  game.invincible = true;
  game.player.x = game.map.exit.x;
  game.player.y = game.map.exit.y;
  run(game, 0.2);
  assert.equal(game.state, "playing", "locked");
  game.damageNest(game.nests[0], 9999);
  assert.ok(game.exitOpen);
  run(game, 0.1);
  assert.equal(game.state, "cleared");
});

test("the exit also waits for the queen", () => {
  const game = makeGame(room(20, 9, { "1,5": "@", "10,5": "Q", "20,5": "E" }));
  game.invincible = true;
  assert.equal(game.nests.length, 0);
  game.updateExitLock();
  assert.equal(game.exitOpen, false);
  game.damageAlien(game.queen, 99999);
  assert.ok(game.exitOpen);
  assert.equal(game.queen, null);
});

test("nests take damage from shots and pay out", () => {
  const game = makeGame(room(14, 3, { "1,2": "@", "8,2": "N", "14,2": "E" }));
  game.invincible = true;
  game.nests[0].timer = 999;
  run(game, 12, input({ fire: true, aim: 0 }));
  assert.equal(game.nests.length, 0);
  assert.ok(game.loadout.credits >= 100);
});

test("pickups: medkits only when hurt, credits, ammo for the gun in hand, grenades capped", () => {
  const loadout = { ...createLoadout(), owned: ["pistol", "smg"], ammo: { ...createLoadout().ammo, smg: 10 } };
  const game = makeGame(room(12, 3, { "1,2": "@", "2,2": "h", "3,2": "$", "4,2": "a", "5,2": "g", "12,2": "E" }), { loadout });
  run(game, 0.1, input({ weapon: "smg" }));
  run(game, 1.2, input({ move: { x: 1, y: 0 } }));
  assert.equal(game.pickups.length, 1, "the medkit stays: full health");
  assert.equal(game.loadout.credits, PICKUP_CREDITS);
  assert.ok(game.loadout.ammo.smg > 10);
  assert.equal(game.loadout.grenades, 5);
  game.player.hp = 50;
  run(game, 1.2, input({ move: { x: -1, y: 0 } }));
  assert.equal(game.player.hp, 50 + MEDKIT_HEAL);
  assert.equal(game.pickups.length, 0);
});

test("barrels explode, chain, and hurt everything nearby", () => {
  const game = makeGame(room(20, 3, { "1,2": "@", "10,2": "B", "12,2": "B", "11,1": "c", "13,3": "c", "20,2": "E" }));
  for (const a of game.aliens) a.awake = false;
  game.damageBarrel(game.barrels[0], 99);
  run(game, 0.05);
  assert.equal(game.barrels.length, 0, "chain reaction");
  assert.equal(game.aliens.length, 0);
});

test("grenades fly, bounce, and blow up after the fuse", () => {
  const game = makeGame(room(20, 5, { "2,3": "@", "9,3": "N", "20,3": "E" }));
  game.nests[0].hp = 60;
  game.nests[0].timer = 999;
  run(game, 0.05, input({ grenade: true, aim: 0 }));
  run(game, 0.2, input({ grenade: true, aim: 0 }));
  assert.equal(game.grenades.length, 1, "held: only one throw");
  assert.equal(game.loadout.grenades, 2);
  run(game, GRENADE.fuse + 0.1);
  assert.equal(game.grenades.length, 0);
  assert.equal(game.nests.length, 0, "the blast destroyed the nest");
});

test("clearing a mission pays a bonus and unlocks the next", () => {
  const game = makeGame(room(8, 3, { "1,2": "@", "8,2": "E" }));
  game.loadout.credits = 10;
  const out = game.resultLoadout();
  assert.equal(out.credits, 10 + missionBonus(0));
  assert.equal(out.unlocked, 2);
});

test("pause freezes everything", () => {
  const game = makeGame(room(12, 3, { "1,2": "@", "8,2": "c", "12,2": "E" }));
  game.aliens[0].awake = true;
  game.pause();
  const before = JSON.stringify([game.player.x, game.aliens[0].x, game.time]);
  run(game, 1, input({ move: { x: 1, y: 0 } }));
  assert.equal(JSON.stringify([game.player.x, game.aliens[0].x, game.time]), before);
  game.pause();
  assert.equal(game.state, "playing");
});

test("same seed and inputs replay identically", () => {
  const play = () => {
    const game = new Game(1, createLoadout(), { seed: 42 });
    const rng = mulberry32(9);
    for (let i = 0; i < 60 * 25; i += 1) {
      game.update({ ...NO_INPUT, move: { x: rng() * 2 - 1, y: rng() * 2 - 1 }, aim: rng() * 6.28, fire: rng() < 0.7, dash: rng() < 0.05 }, DT);
    }
    return JSON.stringify([game.player, game.aliens.map((a) => [a.kind, a.x, a.y, a.hp]), game.stats]);
  };
  assert.equal(play(), play());
});

test("two minutes of random input on every mission never breaks the game", () => {
  MISSIONS.forEach((mission, index) => {
    const loadout = { ...createLoadout(), owned: ["pistol", "smg", "shotgun", "flamer", "plasma", "rocket"], ammo: { pistol: Infinity, smg: 400, shotgun: 80, flamer: 600, plasma: 120, rocket: 30 }, grenades: 9 };
    const game = new Game(index, loadout, { seed: index + 1 });
    game.invincible = true;
    const rng = mulberry32(index + 100);
    for (let i = 0; i < 60 * 120; i += 1) {
      game.update({ ...NO_INPUT, move: { x: rng() * 2 - 1, y: rng() * 2 - 1 }, aim: rng() * 6.28, fire: rng() < 0.8, dash: rng() < 0.03, grenade: rng() < 0.01, cycle: rng() < 0.01 ? 1 : 0 }, DT);
      const p = game.player;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${mission.id}: player position`);
      assert.ok(!game.map.isSolid(Math.floor(p.x / TILE), Math.floor(p.y / TILE)), `${mission.id}: player inside a wall`);
    }
    assert.ok(game.aliens.length <= 140);
    for (const a of game.aliens) assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && !game.map.solidAt(a.x, a.y), `${mission.id}: ${a.kind} inside a wall`);
  });
});
