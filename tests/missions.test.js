import test from "node:test";
import assert from "node:assert/strict";
import { MISSIONS, missionMap } from "../src/core/missions.js";
import { FlowField } from "../src/core/flowfield.js";
import { ALIENS } from "../src/core/aliens.js";

test("five missions with unique ids and valid nest mixes", () => {
  assert.equal(MISSIONS.length, 5);
  assert.equal(new Set(MISSIONS.map((m) => m.id)).size, 5);
  for (const m of MISSIONS) {
    for (const kind of Object.keys(m.mix)) assert.ok(ALIENS[kind] && !ALIENS[kind].boss, `${m.id}: ${kind}`);
    assert.ok(m.brief.length > 20 && m.tip.length > 20);
    assert.ok(m.dark > 0 && m.dark < 1);
  }
});

MISSIONS.forEach((mission, index) => {
  test(`${mission.id}: rectangular, walled in, and everything reachable from the start`, () => {
    const map = missionMap(index);
    for (const row of mission.map) assert.equal(row.length, map.w, "all rows the same width");
    for (let x = 0; x < map.w; x += 1) assert.ok(map.isSolid(x, 0) && map.isSolid(x, map.h - 1), "top and bottom walls");
    for (let y = 0; y < map.h; y += 1) assert.ok(map.isSolid(0, y) && map.isSolid(map.w - 1, y), "side walls");
    assert.ok(map.nests.length >= 2);
    const f = new FlowField(map);
    f.update(map.start.tx, map.start.ty);
    const things = [map.exit, ...map.nests, ...map.pickups, ...map.aliens, ...map.barrels, ...(map.queen ? [map.queen] : [])];
    for (const t of things) assert.ok(Number.isFinite(f.dist[map.index(t.tx, t.ty)]), `unreachable at ${t.tx},${t.ty}`);
    // No nest right next to the start, and no alien within 6 tiles of it.
    for (const n of map.nests) assert.ok(f.dist[map.index(n.tx, n.ty)] >= 10, `nest at ${n.tx},${n.ty} too close`);
    for (const a of map.aliens) assert.ok(f.dist[map.index(a.tx, a.ty)] >= 6, `alien at ${a.tx},${a.ty} too close`);
    assert.ok(map.pickups.some((p) => p.kind === "medkit"), "at least one medkit");
  });
});

test("only the last mission has the queen", () => {
  MISSIONS.forEach((m, i) => assert.equal(Boolean(missionMap(i).queen), i === MISSIONS.length - 1, m.id));
});
