/**
 * A simple scripted player for the proofs: walk (by its own flow field) to the nearest nest, the
 * queen, then the exit; shoot the nearest visible alien, else the target; switch to the best gun
 * with ammo; dash when something is close; throw a grenade when swarmed.
 */
import { TILE, DT } from "../../src/core/constants.js";
import { FlowField } from "../../src/core/flowfield.js";
import { lineOfSight } from "../../src/core/map.js";
import { WEAPON_ORDER } from "../../src/core/weapons.js";

export function createBot(game) {
  const route = new FlowField(game.map);
  let frame = 0;
  let stuck = 0;
  let last = { x: game.player.x, y: game.player.y };

  function target() {
    const p = game.player;
    const queen = game.queen;
    const goals = [...game.nests];
    if (!goals.length && queen) goals.push(queen);
    if (!goals.length) return game.map.exit;
    goals.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    return goals[0];
  }

  return function think() {
    frame += 1;
    const p = game.player;
    const goal = target();
    route.update(Math.floor(goal.x / TILE), Math.floor(goal.y / TILE));
    // Route search runs from the goal, so walk *down* its distances from the player's tile.
    const step = route.direction(p.x, p.y) ?? { x: 0, y: 0 };

    // Threat: nearest living alien in sight.
    let threat = null;
    let threatD = Infinity;
    for (const a of game.aliens) {
      if (!a.awake && a.kind !== "queen") continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < 260 && d < threatD && lineOfSight(game.map, p.x, p.y, a.x, a.y)) {
        threat = a;
        threatD = d;
      }
    }
    const goalD = Math.hypot(goal.x - p.x, goal.y - p.y);
    const seesGoal = goal !== game.map.exit && goalD < 280 && lineOfSight(game.map, p.x, p.y, goal.x, goal.y);
    const aimAt = threat ?? (seesGoal ? goal : null);
    const aim = aimAt ? Math.atan2(aimAt.y - p.y, aimAt.x - p.x) : Math.atan2(step.y, step.x);

    // Back away from close threats while shooting, otherwise follow the route.
    let move = step;
    if (threat && threatD < 60) move = { x: -(threat.x - p.x) / threatD, y: -(threat.y - p.y) / threatD };
    else if (seesGoal && goalD < 90 && !threat) move = { x: 0, y: 0 };

    // Unstick: if barely moved for a second, dash along the route.
    if (frame % 60 === 0) {
      stuck = Math.hypot(p.x - last.x, p.y - last.y) < 8 && (move.x || move.y) ? stuck + 1 : 0;
      last = { x: p.x, y: p.y };
    }

    const best = [...WEAPON_ORDER].reverse().find((id) => id !== "flamer" && game.loadout.owned.includes(id) && game.loadout.ammo[id] > 0);
    const swarm = game.aliens.filter((a) => Math.hypot(a.x - p.x, a.y - p.y) < 90).length;
    return {
      move,
      aim,
      fire: Boolean(aimAt),
      grenade: swarm >= 6 && frame % 30 === 0,
      dash: (threat && threatD < 30) || stuck > 1 ? frame % 20 === 0 : false,
      weapon: best ?? "pistol",
      cycle: 0,
    };
  };
}

/** Play a mission with the bot until cleared or `seconds` run out. */
export function playMission(game, seconds = 600) {
  const think = createBot(game);
  for (let f = 0; f < seconds / DT; f += 1) {
    game.update(game.state === "playing" ? think() : undefined, DT);
    if (game.state === "cleared" || game.state === "failed") break;
  }
  return game;
}
