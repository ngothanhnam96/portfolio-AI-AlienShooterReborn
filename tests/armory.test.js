import test from "node:test";
import assert from "node:assert/strict";
import { BASE_HP, UPGRADES, buy, cloneLoadout, createLoadout, damageMul, maxHp, offers, restoreLoadout } from "../src/core/armory.js";
import { GRENADE, WEAPONS } from "../src/core/weapons.js";

test("a new soldier: pistol, 3 grenades, no credits, mission 1 open", () => {
  const l = createLoadout();
  assert.deepEqual(l.owned, ["pistol"]);
  assert.equal(l.ammo.pistol, Infinity);
  assert.equal(l.grenades, 3);
  assert.equal(maxHp(l), BASE_HP);
  assert.equal(damageMul(l), 1);
  assert.equal(l.unlocked, 1);
});

test("offers: guns not owned, ammo for guns owned, grenades, upgrades; affordability", () => {
  const l = { ...createLoadout(), credits: 260 };
  const list = offers(l);
  assert.ok(list.find((o) => o.id === "weapon:smg").affordable);
  assert.ok(!list.find((o) => o.id === "weapon:rocket").affordable);
  assert.ok(!list.some((o) => o.id === "ammo:smg"));
  assert.ok(list.some((o) => o.id === "upgrade:armor") && list.some((o) => o.id === "grenades"));
});

test("buying a gun comes with ammo; ammo, grenades and upgrades stack up to their limits", () => {
  let l = { ...createLoadout(), credits: 10000 };
  l = buy(l, "weapon:smg");
  assert.ok(l.owned.includes("smg"));
  assert.equal(l.ammo.smg, WEAPONS.smg.pickup * 2);
  assert.equal(l.credits, 10000 - WEAPONS.smg.price);
  l = buy(l, "ammo:smg");
  assert.equal(l.ammo.smg, WEAPONS.smg.pickup * 4);
  while (offers(l).find((o) => o.id === "ammo:smg").affordable) l = buy(l, "ammo:smg");
  assert.equal(l.ammo.smg, WEAPONS.smg.maxAmmo);
  assert.throws(() => buy(l, "ammo:smg"), /maxed/);
  l = buy(l, "grenades");
  l = buy(l, "grenades");
  assert.equal(l.grenades, GRENADE.max);
  for (let i = 0; i < UPGRADES.armor.prices.length; i += 1) l = buy(l, "upgrade:armor");
  assert.equal(maxHp(l), BASE_HP + 75);
  assert.throws(() => buy(l, "upgrade:armor"), /maxed/);
  l = buy(l, "upgrade:power");
  assert.ok(Math.abs(damageMul(l) - 1.15) < 1e-9);
});

test("buying needs credits, a real offer, and never touches the original", () => {
  const l = createLoadout();
  assert.throws(() => buy(l, "weapon:smg"), /Not enough/);
  assert.throws(() => buy({ ...l, credits: 9999 }, "weapon:laser"), /Unknown/);
  const rich = { ...l, credits: 1000 };
  const copy = cloneLoadout(rich);
  buy(rich, "weapon:smg");
  assert.deepEqual(rich, copy);
});

test("restoring saves: valid fields kept, junk dropped, the pistol's infinite ammo restored", () => {
  assert.deepEqual(restoreLoadout(null), createLoadout());
  const saved = JSON.parse(JSON.stringify({ ...createLoadout(), credits: 1234, owned: ["pistol", "smg", "laser"], ammo: { smg: 99999, plasma: 12 }, grenades: 50, armor: 2, unlocked: 4 }));
  const l = restoreLoadout(saved);
  assert.equal(l.credits, 1234);
  assert.deepEqual(l.owned, ["pistol", "smg"]);
  assert.equal(l.ammo.pistol, Infinity);
  assert.equal(l.ammo.smg, 0, "out-of-range ammo dropped");
  assert.equal(l.ammo.plasma, 12);
  assert.equal(l.grenades, createLoadout().grenades);
  assert.equal(l.armor, 2);
  assert.equal(l.unlocked, 4);
});
