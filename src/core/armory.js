/** The player's gear between missions: credits, guns, ammo, grenades, upgrades. Plain data. */

import { GRENADE, WEAPONS, WEAPON_ORDER } from "./weapons.js";

export const BASE_HP = 100;
export const UPGRADES = {
  armor: { name: "Giáp composite", icon: "🛡️", perLevel: 25, prices: [250, 400, 600], text: (n) => `+${n} máu tối đa` },
  power: { name: "Đạn xuyên giáp", icon: "💥", perLevel: 0.15, prices: [300, 500, 800], text: (n) => `+${Math.round(n * 100)}% sát thương` },
};

export function createLoadout() {
  return {
    credits: 0,
    owned: ["pistol"],
    ammo: Object.fromEntries(WEAPON_ORDER.map((id) => [id, id === "pistol" ? Infinity : 0])),
    grenades: 3,
    armor: 0,
    power: 0,
    unlocked: 1, // missions available
  };
}

export const maxHp = (loadout) => BASE_HP + UPGRADES.armor.perLevel * loadout.armor;
export const damageMul = (loadout) => 1 + UPGRADES.power.perLevel * loadout.power;

/** Deep copy (Infinity survives, unlike JSON). */
export function cloneLoadout(loadout) {
  return { ...loadout, owned: [...loadout.owned], ammo: { ...loadout.ammo } };
}

/** Saved data → a valid loadout. Unknown or broken fields fall back to the defaults. */
export function restoreLoadout(saved) {
  const fresh = createLoadout();
  if (!saved || typeof saved !== "object") return fresh;
  const int = (v, min, max, fallback) => (Number.isInteger(v) && v >= min && v <= max ? v : fallback);
  const owned = ["pistol", ...(Array.isArray(saved.owned) ? saved.owned : []).filter((id) => WEAPONS[id] && id !== "pistol")];
  const ammo = { ...fresh.ammo };
  for (const id of WEAPON_ORDER) {
    if (id === "pistol") continue;
    ammo[id] = int(saved.ammo?.[id], 0, WEAPONS[id].maxAmmo, 0);
  }
  return {
    credits: int(saved.credits, 0, 1e7, 0),
    owned: [...new Set(owned)],
    ammo,
    grenades: int(saved.grenades, 0, GRENADE.max, fresh.grenades),
    armor: int(saved.armor, 0, UPGRADES.armor.prices.length, 0),
    power: int(saved.power, 0, UPGRADES.power.prices.length, 0),
    unlocked: int(saved.unlocked, 1, 99, 1),
  };
}

/** Everything the armoury can sell right now, with price and whether it is affordable. */
export function offers(loadout) {
  const list = [];
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    if (id === "pistol") continue;
    if (!loadout.owned.includes(id)) {
      list.push({ id: `weapon:${id}`, kind: "weapon", weapon: id, name: w.name, price: w.price, text: `Kèm ${w.pickup * 2} đạn` });
    } else {
      const full = loadout.ammo[id] >= w.maxAmmo;
      list.push({ id: `ammo:${id}`, kind: "ammo", weapon: id, name: `Đạn ${w.short}`, price: w.ammoPrice, text: full ? "Đã đầy" : `+${w.pickup * 2} viên (${loadout.ammo[id]}/${w.maxAmmo})`, maxed: full });
    }
  }
  list.push({
    id: "grenades", kind: "grenades", name: `Lựu đạn ×${GRENADE.pack}`, price: GRENADE.price,
    text: `${loadout.grenades}/${GRENADE.max}`, maxed: loadout.grenades >= GRENADE.max,
  });
  for (const [key, up] of Object.entries(UPGRADES)) {
    const level = loadout[key];
    const maxed = level >= up.prices.length;
    list.push({
      id: `upgrade:${key}`, kind: "upgrade", upgrade: key, name: `${up.icon} ${up.name}${maxed ? "" : ` cấp ${level + 1}`}`,
      price: maxed ? 0 : up.prices[level], text: maxed ? "Tối đa" : up.text(up.perLevel), maxed,
    });
  }
  return list.map((o) => ({ ...o, affordable: !o.maxed && loadout.credits >= o.price }));
}

export function buy(loadout, offerId) {
  const offer = offers(loadout).find((o) => o.id === offerId);
  if (!offer) throw new Error(`Unknown offer ${offerId}`);
  if (offer.maxed) throw new Error(`${offerId} is maxed out`);
  if (loadout.credits < offer.price) throw new Error(`Not enough credits for ${offerId}`);
  const next = cloneLoadout(loadout);
  next.credits -= offer.price;
  if (offer.kind === "weapon") {
    next.owned.push(offer.weapon);
    next.ammo[offer.weapon] = WEAPONS[offer.weapon].pickup * 2;
  } else if (offer.kind === "ammo") {
    const w = WEAPONS[offer.weapon];
    next.ammo[offer.weapon] = Math.min(w.maxAmmo, next.ammo[offer.weapon] + w.pickup * 2);
  } else if (offer.kind === "grenades") {
    next.grenades = Math.min(GRENADE.max, next.grenades + GRENADE.pack);
  } else {
    next[offer.upgrade] += 1;
  }
  return next;
}
