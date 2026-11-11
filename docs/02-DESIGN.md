# 02 · Design

## Architecture

```text
src/main.js  (loop, HUD, panels, events → sounds / particles / floor decals)
   ├── src/ui/    render (canvas, lighting, minimap) · input · audio · storage · analytics
   └── src/core/  pure, no DOM, unit-tested
         game ── aliens ── flowfield ── map
           ├── weapons
           ├── missions (ASCII maps)
           └── armory (loadout, shop)
```

`main.js` feeds an input snapshot `{ move, aim, fire, grenade, dash, weapon, cycle }` into
`game.update(input, 1/60)` at a fixed 60 Hz and drains `game.takeEvents()` (`shoot`, `hit`,
`alien-death`, `explode`, `nest-death`, `exit-open`, …). All randomness goes through a seeded
`mulberry32`.

## Maps

ASCII, 24 px tiles; legend in `src/core/map.js` (`#` wall, `@` start, `E` exit, `N` nest, `Q` queen,
`B` barrel, `c s b x` aliens, `h a $ g` pickups). Bodies are circles; `moveCircle` moves one axis
at a time in sub-steps (no tunnelling) so things slide along walls.

## Flow field

Every time the player enters a new tile, one Dijkstra search (binary heap, 8 directions, no
cutting wall corners) gives every floor tile its walking distance to the player. Each alien
steps to its lowest neighbour, or heads straight at the player when it can see them within
220 px. A separation push stops swarms collapsing into one blob. The test bot uses a second
field aimed at its current goal.

## Weapons

| Weapon | Rate (s) | Damage | Notes | Price |
|--------|----------|--------|-------|-------|
| P-9 pistol | 0.26 | 12 | infinite ammo | start |
| Vespa SMG | 0.075 | 8 | 400 max | 250 |
| Sấm Rền shotgun | 0.65 | 9 × 8 pellets | 0.36 rad fan | 450 |
| Hỏa Long flamethrower | 0.035 | 2.4 | short range, burns through everything | 650 |
| Tinh Vân plasma | 0.28 | 30 | pierces 4 | 900 |
| Thiên Lôi rockets | 0.85 | 40 + 90 splash | radius 64 | 1200 |
| Grenade | — | 110 | radius 74, 1.1 s fuse, bounces | 60 per 3 |

Explosions fall off linearly to half damage at the edge. The player's own rockets and grenades
don't hurt the player; barrels and exploders do (at half strength).

## Aliens

| Alien | HP | Speed | Attack | Credits |
|-------|----|-------|--------|---------|
| Bọ Gai crawler | 20 | 96 | bite 7 / 0.7 s | 4 |
| Nhện Phun Axit spitter | 36 | 58 | acid 11 at ≤ 230 px with sight, backs off inside 120 px | 10 |
| Giáp Xác brute | 190 | 48 | roar 0.7 s → charge 235 px/s for 0.85 s (26) → stunned if it hits a wall | 30 |
| Túi Nổ exploder | 26 | 80 | 0.45 s fuse within 34 px → blast 34 in 62 px, hurts aliens | 8 |
| Nest | 280 | — | hatches every ~2.6 s within 360 px, up to 5 alive | 100 |
| Nữ Hoàng Tổ | 2600 | 42 | spray (3 volleys of 9) → brood (5) → spray → charge; below half: +1 volley, +4 shots, +3 brood, faster | 600 |

## Economy

Credits from kills, nests, pickups (40) and a clear bonus of 150 + 50 × mission index.
Armour: +25 max HP per level (250 / 400 / 600). Damage: +15% per level (300 / 500 / 800).
Medkits heal 35. Aliens drop ammo (7%, only if you own a second gun) or a medkit (2.5%).
Failing a mission returns you to the loadout you set out with.

## Rendering

- The whole map is drawn once to an off-screen canvas (floor plates, wall tops with a lit edge,
  dark front faces and shadows), and a second off-screen canvas collects acid splats and scorch
  marks for the whole mission.
- Sprites are drawn with canvas paths: rotated soldier with a gun per weapon, legged aliens with
  animated legs, pulsing nests with a health ring.
- Lighting: a dark overlay (`mission.dark`) with holes cut for the flashlight cone, a halo, muzzle
  flashes, explosions, nests, plasma, flames and the exit.
- Camera follows the player with a lead toward the aim; a minimap shows nests, queen and exit.

## Input

Keyboard + mouse (aim = angle from the soldier to the crosshair), touch (left half: move stick,
right half: aim stick that fires while pushed; buttons for grenade, roll, weapon), gamepad
(left stick move, right stick aim and fire, triggers, A roll, X/Y weapon).
