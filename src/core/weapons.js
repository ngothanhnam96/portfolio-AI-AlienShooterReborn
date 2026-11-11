/** Guns, grenades and their projectiles. Pure data + one fire function. */

/**
 * rate: seconds between shots. spread: random cone (radians), pellets: shots per trigger pull
 * (fanned evenly across the spread), pierce: aliens a shot passes through, life: seconds before
 * the shot fizzles, splash: area damage on impact. ammo: Infinity for the pistol.
 * pickup: rounds in an ammo crate. price: in the armoury (0 = starting gun).
 */
export const WEAPONS = {
  pistol: { id: "pistol", name: "Súng lục P-9", short: "P-9", key: 1, rate: 0.26, damage: 12, speed: 560, spread: 0.03, pellets: 1, pierce: 1, life: 0.9, maxAmmo: Infinity, pickup: 0, price: 0, color: "#ffe08a" },
  smg: { id: "smg", name: "Tiểu liên Vespa", short: "Vespa", key: 2, rate: 0.075, damage: 8, speed: 600, spread: 0.09, pellets: 1, pierce: 1, life: 0.8, maxAmmo: 400, pickup: 90, price: 250, ammoPrice: 60, color: "#ffd166" },
  shotgun: { id: "shotgun", name: "Súng săn Sấm Rền", short: "Sấm Rền", key: 3, rate: 0.65, damage: 9, speed: 520, spread: 0.36, pellets: 8, pierce: 1, life: 0.34, maxAmmo: 80, pickup: 16, price: 450, ammoPrice: 70, color: "#ffb36b" },
  flamer: { id: "flamer", name: "Phun lửa Hỏa Long", short: "Hỏa Long", key: 4, rate: 0.035, damage: 2.4, speed: 270, spread: 0.24, pellets: 1, pierce: 99, life: 0.4, maxAmmo: 600, pickup: 140, price: 650, ammoPrice: 80, color: "#ff7a2f", flame: true },
  plasma: { id: "plasma", name: "Súng plasma Tinh Vân", short: "Tinh Vân", key: 5, rate: 0.28, damage: 30, speed: 540, spread: 0.02, pellets: 1, pierce: 4, life: 0.9, maxAmmo: 120, pickup: 25, price: 900, ammoPrice: 90, color: "#7ef3ff" },
  rocket: { id: "rocket", name: "Súng rocket Thiên Lôi", short: "Thiên Lôi", key: 6, rate: 0.85, damage: 40, speed: 340, spread: 0, pellets: 1, pierce: 1, life: 1.6, maxAmmo: 30, pickup: 6, price: 1200, ammoPrice: 120, splash: { radius: 64, damage: 90 }, color: "#ff5d5d" },
};

export const WEAPON_ORDER = ["pistol", "smg", "shotgun", "flamer", "plasma", "rocket"];

export const GRENADE = { damage: 110, radius: 74, fuse: 1.1, range: 190, speed: 330, max: 9, price: 60, pack: 3 };

/**
 * Projectiles for one trigger pull from (x, y) toward `angle`. `rng` jitters the spread,
 * `damageMul` comes from armoury upgrades.
 */
export function fireWeapon(weapon, x, y, angle, rng, damageMul = 1) {
  const shots = [];
  for (let i = 0; i < weapon.pellets; i += 1) {
    const fan = weapon.pellets > 1 ? (i / (weapon.pellets - 1) - 0.5) * weapon.spread : 0;
    const jitter = (rng() - 0.5) * (weapon.pellets > 1 ? weapon.spread / weapon.pellets : weapon.spread);
    const a = angle + fan + jitter;
    const speed = weapon.speed * (weapon.flame ? 0.85 + rng() * 0.3 : 1);
    shots.push({
      weapon: weapon.id,
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      damage: weapon.damage * damageMul,
      pierce: weapon.pierce,
      life: weapon.life,
      maxLife: weapon.life,
      r: weapon.flame ? 6 : weapon.id === "rocket" ? 4 : 2.5,
      splash: weapon.splash ? { radius: weapon.splash.radius, damage: weapon.splash.damage * damageMul } : null,
      hit: new Set(),
    });
  }
  return shots;
}
