import { DT } from "../../src/core/constants.js";
import { Game, NO_INPUT } from "../../src/core/game.js";
import { createLoadout } from "../../src/core/armory.js";

/** A small custom mission around `rows`, already past the intro. */
export function makeGame(rows, { loadout = createLoadout(), mix = { crawler: 1 }, nestRate = 1, seed = 1 } = {}) {
  const mission = { id: "test", name: "Test", brief: "", tip: "", mix, nestRate, theme: "cargo", dark: 0.5, map: rows };
  const game = new Game(0, loadout, { seed, mission });
  run(game, 2.3);
  game.takeEvents();
  return game;
}

/** Advance `seconds` with a fixed input (object or function returning one). */
export function run(game, seconds, input = NO_INPUT) {
  for (let f = 0; f < Math.round(seconds / DT); f += 1) {
    game.update(typeof input === "function" ? input() : { ...NO_INPUT, ...input }, DT);
  }
  return game;
}

export const input = (over) => ({ ...NO_INPUT, ...over });

/** Open room of w × h floor with walls around it; place chars at [x, y] (1-based inside walls). */
export function room(w, h, marks = {}) {
  const rows = [];
  for (let y = 0; y < h + 2; y += 1) {
    let row = "";
    for (let x = 0; x < w + 2; x += 1) {
      const edge = x === 0 || y === 0 || x === w + 1 || y === h + 1;
      row += edge ? "#" : marks[`${x},${y}`] ?? ".";
    }
    rows.push(row);
  }
  return rows;
}
