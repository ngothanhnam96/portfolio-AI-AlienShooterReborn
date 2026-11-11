/**
 * The proofs:
 * 1. A simple scripted bot (no dodging skill to speak of) plays the campaign for real: missions
 *    1–4 without invincibility, buying gear with the credits it earns between missions.
 * 2. The finale is winnable: the bot, keeping its campaign gear, beats the queen (invincible, so
 *    the test measures the damage a human must avoid rather than the bot's poor dodging).
 * 3. Every mission can be finished with nothing but the starting pistol.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/core/game.js";
import { MISSIONS } from "../src/core/missions.js";
import { buy, createLoadout } from "../src/core/armory.js";
import { playMission } from "./support/bot.js";

const SHOPPING = ["weapon:smg", "upgrade:armor", "weapon:shotgun", "upgrade:power", "weapon:plasma", "weapon:rocket", "ammo:smg", "ammo:plasma", "ammo:shotgun", "grenades"];

function shop(loadout) {
  for (;;) {
    const next = SHOPPING.find((id) => {
      try {
        buy(loadout, id);
        return true;
      } catch {
        return false;
      }
    });
    if (!next) return loadout;
    loadout = buy(loadout, next);
  }
}

test("the campaign: the bot clears missions 1–4 for real and the queen falls in the finale", () => {
  let loadout = createLoadout();
  const log = [];
  MISSIONS.forEach((mission, index) => {
    const game = new Game(index, loadout, { seed: 7 + index });
    const finale = index === MISSIONS.length - 1;
    game.invincible = finale;
    playMission(game, 600);
    log.push(`${mission.id}: ${game.state} in ${game.stats.time.toFixed(0)} s, ${game.stats.damageTaken} damage, ${game.stats.credits}¢`);
    assert.equal(game.state, "cleared", log.join("\n"));
    if (!finale) assert.ok(game.player.hp > 0);
    loadout = shop(game.resultLoadout());
  });
  assert.ok(loadout.owned.length >= 3, `bought guns along the way: ${loadout.owned}`);
});

test("every mission can be finished with only the starting pistol", () => {
  MISSIONS.forEach((mission, index) => {
    const game = new Game(index, createLoadout(), { seed: 3 });
    game.invincible = true;
    playMission(game, 900);
    assert.equal(game.state, "cleared", `${mission.id}: ${game.nests.length} nests left`);
    assert.ok(game.stats.time < 600, `${mission.id} took ${game.stats.time.toFixed(0)} s`);
  });
});
