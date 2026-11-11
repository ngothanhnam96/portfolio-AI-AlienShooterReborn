# 👾 Hive Breach — Phá Tổ Ngoại Tinh

An original top-down twin-stick shooter for the browser. Research station Kepler-9 has gone
silent and its corridors are crawling with aliens. Fight through five missions, destroy every
nest, take down the Hive Queen, and get out alive.

Zero dependencies, no build step, no image or sound files: the station, the soldier, every alien
and the lighting are drawn in code on a canvas, and the sound and music are synthesised with
WebAudio.

## Features

- **Twin-stick shooting**: move with WASD, aim with the mouse, hold to fire; a dodge roll with
  invulnerability frames; grenades that bounce off walls.
- **6 weapons**: P-9 pistol (infinite ammo), Vespa SMG, Sấm Rền shotgun (8-pellet fan),
  Hỏa Long flamethrower (burns through crowds), Tinh Vân plasma (pierces 4 aliens), Thiên Lôi
  rockets (splash damage).
- **5 alien types plus a boss**: Bọ Gai crawlers that swarm, acid-spitting Nhện Phun Axit that
  keep their distance, armoured Giáp Xác brutes that roar and then charge, Túi Nổ exploders
  whose blast also kills other aliens, pulsing nests that keep hatching, and the Nữ Hoàng Tổ
  (Hive Queen) with an acid fan, a brood of young and a charge.
- **5 missions** with their own map and look: cargo bay, bio-lab, reactor, hydroponics (almost
  dark) and the hive core. Destroy every nest to open the exit, then reach it.
- **Flashlight lighting**, acid and scorch marks that stay on the floor, muzzle flashes, screen
  shake, and a minimap that shows the nests and the exit.
- **Armoury between missions**: spend credits from kills, nests and pickups on guns, ammo,
  grenades, armour (+25 max HP per level) and damage upgrades (+15% per level). Progress is saved.
- **Controls**: keyboard + mouse, two touch sticks on phones (left half moves, right half aims and
  fires), and gamepad.

## Run it

```bash
npm start    # http://127.0.0.1:5173
npm test     # 52 tests, no dependencies
```

Requires Node 20+. GitHub Pages deploys on every push to `main` (see
[docs/05-DEPLOY.md](docs/05-DEPLOY.md)).

## What the tests prove

- **The campaign can be won**: a simple scripted bot plays missions 1–4 *without* invincibility,
  buying gear between missions with the credits it earned, then beats the Hive Queen.
- **Every mission can be finished with only the starting pistol.**
- **Every map is sound**: rectangular, walled in, every nest, pickup, alien and the exit
  reachable from the start, and no nest or alien right next to the start.
- Alien behaviour: crawlers path around walls, spitters keep their distance and need line of
  sight, a dodge roll avoids a brute's charge, exploders hurt their own kind, nests sleep until
  you come close and stop hatching at their cap, and the queen's acid fan leaves gaps you can
  slip through.
- Two minutes of random input on every mission never puts anyone inside a wall, and the same seed
  with the same inputs always replays the same way.

## Docs

| | |
|---|---|
| [01-SPEC](docs/01-SPEC.md) | Goal, game loop, requirements |
| [02-DESIGN](docs/02-DESIGN.md) | Architecture, flow field, weapons, aliens, economy, rendering |
| [03-TASKS](docs/03-TASKS.md) | Done and backlog |
| [04-TESTING](docs/04-TESTING.md) | Test suites, proofs, browser check |
| [05-DEPLOY](docs/05-DEPLOY.md) | Local, CI, GitHub Pages |

## Originality

Hive Breach is an original game in the top-down alien shooter genre. Its name, station, soldier,
aliens, missions, art and music were made for this project; it does not use names, characters,
levels or assets from any existing game.

## License

[CC0 1.0](LICENSE), public domain.
