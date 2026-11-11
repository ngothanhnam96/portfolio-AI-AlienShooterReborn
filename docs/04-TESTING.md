# 04 · Testing

`npm test` runs `node --test`: 52 tests in about 4 seconds, no dependencies.

## Suites

| Suite | What it proves |
|-------|----------------|
| `map.test.js` | Legend parsing, errors for missing start/exit or unknown characters, outside = wall, sliding along walls, no tunnelling, line of sight |
| `flowfield.test.js` | Straight and diagonal costs, no cutting wall corners, following the field reaches the target around walls, unreachable tiles, no recompute for the same target |
| `missions.test.js` | 5 missions; each map rectangular, walled in, everything reachable from the start, nests ≥ 10 tiles and aliens ≥ 6 tiles from the start, a medkit on every map; only the last has the queen |
| `weapons.test.js` | Weapon data, shotgun fan, damage upgrades scale shots and splash, rate of fire, ammo use, empty → pistol, locked guns, plasma pierce, rocket splash |
| `aliens.test.js` | Crawler paths around a wall and bites on a cooldown; waking needs sight; spitter keeps distance and needs sight; brute roars then charges and is stunned; a roll dodges the charge; exploder blast hurts aliens; nests sleep, hatch, cap and follow the mission mix; queen attack order; the acid fan has gaps wider than the player at 220 px |
| `game.test.js` | Intro ignores input; normalised diagonals; roll speed, invulnerability and cooldown; death → failed with the start loadout untouched; exit locked until nests (and queen) are gone; shooting nests; pickups; barrel chains; grenades; clear bonus and unlock; pause; deterministic replays; **2 minutes of random input on every mission** |
| `armory.test.js` | New loadout, offers, buying guns/ammo/grenades/upgrades up to their limits, errors, the original never changes, restoring junk saves |
| `proof.test.js` | **The bot clears missions 1–4 without invincibility, shopping between missions, then beats the queen**; **every mission can be cleared with only the pistol** |

## Browser end-to-end check (v0.1.0)

Headless Edge over the DevTools protocol, with real button clicks and the `?debug` hook
(`window.__hbDebug.advance(seconds, input)`; the test bot from `tests/support/bot.js` drives the
soldier):

| Check | Result |
|-------|--------|
| Title, controls, briefing, intro card | ✅ |
| Mission 1 with real input, then the bot destroys both nests, exit opens | ✅ |
| Armoury: buy every gun and armour | ✅ |
| Missions 2–4 with SMG, shotgun, flamethrower and plasma; each theme renders | ✅ |
| Hive core: queen fight with boss bar → victory panel | ✅ |
| Death → "failed" panel → retry with the same gear | ✅ |
| Pause panel | ✅ |
| Phone landscape 844 × 390 with touch controls | ✅ |
| Console errors from the game | none |

## Bugs found while building

| Bug | Fix |
|-----|-----|
| The flow field skipped tiles: 32-bit distances rounded below the 64-bit values being compared | `Float64Array` |
| Exit rooms in the cargo bay and reactor, and side rooms in three maps, had no doorway | Doorways added; the map soundness test now checks every object |
| Rows of different widths in three maps | Normalised; the test checks all rows are the same width |
| Credits per mission were too low for the armoury prices | Higher kill/nest rewards and a clear bonus |
| `game.queen` still returned a dead queen until the next step | Only living queens count |
