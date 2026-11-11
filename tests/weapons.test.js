import test from "node:test";
import assert from "node:assert/strict";
import { WEAPONS, WEAPON_ORDER, fireWeapon } from "../src/core/weapons.js";
import { mulberry32 } from "../src/core/rng.js";
import { createLoadout } from "../src/core/armory.js";
import { input, makeGame, room, run } from "./support/helpers.js";

const all = () => ({ ...createLoadout(), owned: [...WEAPON_ORDER], ammo: { pistol: Infinity, smg: 400, shotgun: 80, flamer: 600, plasma: 120, rocket: 30 } });

test("every weapon is well formed and the pistol never runs dry", () => {
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    assert.equal(w.id, id);
    assert.ok(w.rate > 0 && w.damage > 0 && w.speed > 0 && w.pellets >= 1);
    if (id !== "pistol") assert.ok(w.price > 0 && w.ammoPrice > 0 && w.pickup > 0 && Number.isFinite(w.maxAmmo));
  }
  assert.equal(WEAPONS.pistol.maxAmmo, Infinity);
  assert.equal(WEAPONS.pistol.price, 0);
});

test("the shotgun fans 8 pellets across its spread; damage upgrades scale every shot and splash", () => {
  const shots = fireWeapon(WEAPONS.shotgun, 0, 0, 0, mulberry32(1));
  assert.equal(shots.length, 8);
  const angles = shots.map((s) => Math.atan2(s.vy, s.vx));
  assert.ok(Math.max(...angles) - Math.min(...angles) > 0.25);
  assert.ok(Math.max(...angles.map(Math.abs)) <= WEAPONS.shotgun.spread);
  const [rocket] = fireWeapon(WEAPONS.rocket, 0, 0, 0, mulberry32(1), 1.3);
  assert.equal(rocket.damage, 40 * 1.3);
  assert.ok(Math.abs(rocket.splash.damage - 90 * 1.3) < 1e-9);
});

test("rate of fire: the SMG fires about 3× as often as the pistol", () => {
  const shots = (weapon) => {
    const game = makeGame(room(20, 5, { "1,3": "@", "20,3": "E" }), { loadout: all() });
    run(game, 0.2, input({ weapon }));
    const before = game.stats.shots;
    run(game, 3, input({ fire: true, aim: Math.PI }));
    return game.stats.shots - before;
  };
  const pistol = shots("pistol");
  const smg = shots("smg");
  assert.ok(pistol >= 10 && pistol <= 12, `pistol ${pistol}`);
  assert.ok(smg / pistol > 2.8, `smg ${smg} vs pistol ${pistol}`);
});

test("ammo: each trigger pull costs one round; empty guns switch to the pistol; locked guns can't be picked", () => {
  const loadout = { ...all(), ammo: { ...all().ammo, rocket: 2 } };
  const game = makeGame(room(20, 5, { "1,3": "@", "20,3": "E" }), { loadout });
  run(game, 0.2, input({ weapon: "rocket" }));
  assert.equal(game.player.weapon, "rocket");
  run(game, 2.5, input({ fire: true, aim: Math.PI }));
  assert.equal(game.loadout.ammo.rocket, 0);
  assert.equal(game.player.weapon, "pistol");
  run(game, 0.1, input({ weapon: "rocket" }));
  assert.equal(game.player.weapon, "pistol", "no ammo: can't switch back");
  const poor = makeGame(room(8, 3, { "1,2": "@", "8,2": "E" }));
  run(poor, 0.1, input({ weapon: "plasma" }));
  assert.equal(poor.player.weapon, "pistol", "not owned");
  run(poor, 0.1, input({ cycle: 1 }));
  assert.equal(poor.player.weapon, "pistol", "cycling with one gun stays put");
});

test("plasma pierces a line of aliens; the flamer burns every alien it touches; rockets splash", () => {
  const line = (weapon, kinds = "ccccc") => {
    const marks = { "1,3": "@", "20,3": "E" };
    [...kinds].forEach((k, i) => (marks[`${6 + i},3`] = k));
    const game = makeGame(room(20, 5, marks), { loadout: all() });
    for (const a of game.aliens) a.awake = false;
    run(game, 0.2, input({ weapon }));
    run(game, weapon === "flamer" ? 0.5 : 0.3, input({ fire: true, aim: 0 }));
    run(game, 0.6);
    return game;
  };
  assert.ok(line("plasma").stats.kills >= 4, "one bolt through four crawlers");
  assert.ok(line("pistol").stats.kills <= 1);
  assert.ok(line("rocket").stats.kills >= 3, "splash");
});
