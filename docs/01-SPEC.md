# 01 · Specification

## Goal

An original top-down twin-stick shooter for the browser: one soldier against swarms of aliens in
a dark research station, with guns to buy between missions and a boss at the end. Desktop and
mobile, no install, no dependencies, Vietnamese UI.

## Game loop

Title → mission briefing → mission (intro card → play) → destroy every nest → the exit opens →
reach it → results → armoury → next mission … → the Hive Queen → victory.
Dying fails the mission: retry it with the gear you had when you set out.

## Functional requirements

| ID    | Requirement |
|-------|-------------|
| FR-1  | Move in any direction (diagonals not faster), aim independently through 360°, hold to fire. |
| FR-2  | Dodge roll: a short burst of speed with invulnerability, then a cooldown. |
| FR-3  | 6 weapons with their own rate, spread, pellets, pierce, range and splash; ammo per gun (the pistol is infinite); an empty gun switches to the pistol. Switching with 1–6, Q/E or the mouse wheel. |
| FR-4  | Grenades: thrown along the aim, bounce off walls, explode after a fuse. Explosive barrels chain. |
| FR-5  | Aliens: crawler (swarms), spitter (acid at range, keeps distance), brute (telegraphed charge, stunned by walls), exploder (fuse, area blast that hurts aliens too). They path around walls and wake when they see or hear the player. |
| FR-6  | Nests sleep until the player is near, then hatch aliens from the mission's mix on a timer, up to a cap. |
| FR-7  | Objective: destroy every nest (and the queen in the last mission) to open the exit; reach the exit to clear the mission. |
| FR-8  | The Hive Queen: acid fan, brood of crawlers and exploders, charge; faster and wider below half health; a boss health bar. |
| FR-9  | Pickups: medkits (only used when hurt), ammo crates, credits, grenades; aliens sometimes drop ammo or medkits. |
| FR-10 | Credits from kills, nests, pickups and a clear bonus; armoury: guns (with ammo), ammo refills, grenades, armour and damage upgrades with limits. |
| FR-11 | HUD: health, weapon and ammo, grenades, credits, objective; minimap with nests and exit; result screen with time, kills, accuracy, damage taken and credits. |
| FR-12 | Pause (also when the tab is hidden), sound and music toggles, progress saved on the device. |
| FR-13 | Controls: keyboard + mouse, two touch sticks with grenade, roll and weapon buttons, gamepad. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NFR-1 | Zero runtime dependencies, no build step, static hosting. |
| NFR-2 | Original name, characters, aliens, missions, art and music. |
| NFR-3 | Deterministic core: seeded RNG and fixed 60 Hz steps. |
| NFR-4 | Every map provably sound (everything reachable); the campaign provably winnable by a scripted bot. |
| NFR-5 | Up to 140 aliens at once at 60 fps: one flow-field search per player tile change serves them all. |
| NFR-6 | Playable on a phone in landscape. |
