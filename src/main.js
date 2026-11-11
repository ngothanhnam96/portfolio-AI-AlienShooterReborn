/**
 * UI controller: fixed-step loop, HUD, panels (title, briefing, pause, results, armoury),
 * and game events → sounds, particles and floor decals. Rules live in src/core.
 */

import { DT } from "./core/constants.js";
import { Game, missionBonus } from "./core/game.js";
import { MISSIONS } from "./core/missions.js";
import { WEAPONS } from "./core/weapons.js";
import { ALIENS } from "./core/aliens.js";
import { buy, createLoadout, offers, restoreLoadout } from "./core/armory.js";
import { createInput } from "./ui/input.js";
import { createRenderer, Particles } from "./ui/render.js";
import { isMusicOn, isMuted, playMusic, setMusic, setMuted, sfx } from "./ui/audio.js";
import { load, save } from "./ui/storage.js";
import { initAnalytics, track } from "./ui/analytics.js";

initAnalytics();

const $ = (id) => document.getElementById(id);
const els = {
  canvas: $("screen"), overlay: $("overlay"), panel: $("panel"), toast: $("toast"), banner: $("banner"),
  hpFill: $("hp-fill"), hpText: $("hp-text"), hpBlock: document.querySelector(".hud-block.hp"),
  weaponDot: $("weapon-dot"), weaponName: $("weapon-name"), weaponAmmo: $("weapon-ammo"),
  grenades: $("grenades"), credits: $("credits"), objective: $("objective"),
  boss: $("boss"), bossFill: $("boss-fill"), touch: $("touch"),
};

/** Saved between sessions: progress and gear. JSON drops Infinity, restoreLoadout puts it back. */
let loadout = restoreLoadout(load("loadout", null));
let game = null;
let lastState = null;
let time = 0;
const particles = new Particles();
const flashes = [];
const renderer = createRenderer(els.canvas);
const sounds = new Map(); // throttle: name → last time

setMuted(load("muted", false));
setMusic(load("music", true));
syncSoundButtons();

const input = createInput({
  canvas: els.canvas,
  toWorldAngle: (x, y) => (game ? renderer.toWorldAngle(game, x, y) : 0),
  isPlaying: () => game && ["playing", "intro", "dying"].includes(game.state),
  onCommand(command) {
    sfx.unlock();
    if (command === "pause") togglePause();
    else if (command === "mute") toggleSound();
    else if (command === "music") toggleMusic();
  },
});
input.bindTouch(els.touch);

function saveLoadout() {
  save("loadout", loadout);
}

function throttled(name, gap) {
  const last = sounds.get(name) ?? -1;
  if (time - last < gap) return false;
  sounds.set(name, time);
  return true;
}

// Events → sound, particles, decals -------------------------------------------------------------------

const GORE = { crawler: "#5d8a2a", spitter: "#9be03a", brute: "#6b5c8a", exploder: "#c6e04a", queen: "#a84bd0", nest: "#7a3f7a" };

function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case "shoot": {
        if (throttled(`shoot-${e.weapon}`, e.weapon === "flamer" ? 0.07 : 0.03)) sfx.shoot(e.weapon);
        if (e.weapon !== "flamer") {
          flashes.push({ x: e.x, y: e.y, r: e.weapon === "shotgun" || e.weapon === "rocket" ? 70 : 46, life: 0.05 });
          particles.add({ x: e.x, y: e.y, color: "#fff3b0", size: 3, life: 0.05 });
          const side = e.angle + Math.PI / 2;
          particles.add({ shape: "shell", x: e.x - Math.cos(e.angle) * 8, y: e.y - Math.sin(e.angle) * 8, vx: Math.cos(side) * 60, vy: Math.sin(side) * 60, color: "#d9b44a", life: 0.4 });
        }
        if (e.weapon === "shotgun" || e.weapon === "rocket") renderer.shake(0.08);
        break;
      }
      case "hit":
        if (throttled("hit", 0.04)) sfx.hit();
        particles.burst(e.x, e.y, GORE[e.kind] ?? "#9be03a", 3, 60, { life: 0.25 });
        break;
      case "spark":
        particles.burst(e.x, e.y, e.weapon === "plasma" ? "#7ef3ff" : "#ffe08a", 3, 50, { life: 0.15, size: 1 });
        break;
      case "alien-death": {
        if (throttled("death", 0.05)) sfx.alienDeath(e.kind);
        const color = GORE[e.kind];
        const size = ALIENS[e.kind].r * 1.6;
        renderer.splat(e.x, e.y, color, size);
        particles.burst(e.x, e.y, color, 10, 110, { life: 0.5 });
        if (e.credits) particles.add({ shape: "text", text: `+${e.credits}¢`, x: e.x, y: e.y - 8, vy: -20, color: "#f5d76e", life: 0.8 });
        break;
      }
      case "explode":
        if (throttled("boom", 0.06)) sfx.explode(e.radius > 70);
        particles.explosion(e.x, e.y, e.radius);
        renderer.scorch(e.x, e.y, e.radius * 0.7);
        if (e.kind === "acid") renderer.splat(e.x, e.y, "#c6e04a", e.radius * 0.5);
        renderer.shake(e.radius > 70 ? 0.3 : 0.18);
        break;
      case "hurt":
        if (throttled("hurt", 0.12)) sfx.hurt();
        particles.burst(e.x, e.y, "#ff4d5e", 5, 70, { life: 0.3 });
        renderer.shake(0.1);
        break;
      case "player-death":
        sfx.playerDeath();
        renderer.splat(e.x, e.y, "#8a1c24", 14);
        particles.burst(e.x, e.y, "#ff4d5e", 24, 140, { life: 0.8 });
        renderer.shake(0.4);
        break;
      case "dash":
        sfx.dash();
        particles.burst(e.x, e.y, "#7ef3ff", 6, 40, { life: 0.25 });
        break;
      case "spit":
        if (throttled("spit", 0.08)) sfx.spit();
        break;
      case "splat":
        if (throttled("splat", 0.06)) sfx.splat();
        renderer.splat(e.x, e.y, "#9be03a", 4);
        particles.burst(e.x, e.y, "#a6ff4d", 4, 40, { life: 0.25 });
        break;
      case "hatch":
        if (throttled("hatch", 0.3)) sfx.hatch();
        particles.burst(e.x, e.y, "#c6ff9a", 6, 50, { life: 0.4 });
        break;
      case "nest-wake":
        if (throttled("wake", 1)) sfx.hatch();
        break;
      case "nest-death":
        sfx.nestDeath();
        particles.explosion(e.x, e.y, 60);
        renderer.splat(e.x, e.y, GORE.nest, 26);
        renderer.shake(0.35);
        particles.add({ shape: "text", text: `TỔ ĐÃ DIỆT +${e.credits}¢`, x: e.x, y: e.y - 20, vy: -14, color: "#59f08a", life: 1.4 });
        toast(e.left ? `Còn ${e.left} tổ` : "Đã diệt hết tổ!");
        break;
      case "exit-open":
        sfx.exitOpen();
        toast(game.mission.id === "hive" ? "Nữ Hoàng đã chết! Đến cửa thoát hiểm" : "Cửa thoát hiểm đã mở! Đến điểm sơ tán ▶");
        break;
      case "brute-roar":
        sfx.roar();
        break;
      case "brute-charge":
        renderer.shake(0.1);
        break;
      case "thud":
        sfx.thud();
        renderer.shake(e.big ? 0.35 : 0.2);
        particles.burst(e.x, e.y, "#8e8e8e", 8, 60, { life: 0.4 });
        break;
      case "fuse":
        sfx.empty();
        break;
      case "queen-spray":
      case "queen-brood":
      case "queen-charge":
        if (e.type === "queen-charge") sfx.roar();
        else sfx.spit();
        break;
      case "boss-hit":
        break;
      case "queen-death":
        sfx.explode(true);
        renderer.shake(0.8);
        for (let i = 0; i < 6; i += 1) setTimeout(() => particles.explosion(e.x + (Math.random() - 0.5) * 60, e.y + (Math.random() - 0.5) * 60, 50), i * 160);
        break;
      case "pickup":
        sfx.pickup();
        particles.add({ shape: "text", text: e.text, x: e.x, y: e.y - 8, vy: -18, color: "#7ef3ff", life: 1 });
        break;
      case "throw":
        sfx.throwGrenade();
        break;
      case "switch":
        sfx.switchWeapon();
        break;
      case "empty":
        sfx.empty();
        toast(`Hết đạn ${WEAPONS[e.weapon].short}`);
        break;
      case "mission-start":
        playMusic(game.queen ? "boss" : "mission");
        break;
      case "mission-clear":
        sfx.clear();
        break;
      default:
        break;
    }
  }
}

// HUD ---------------------------------------------------------------------------------------------------

function updateHud() {
  if (!game) return;
  const p = game.player;
  const w = WEAPONS[p.weapon];
  const ratio = p.hp / p.maxHp;
  els.hpFill.style.transform = `scaleX(${Math.max(0, ratio)})`;
  els.hpText.textContent = Math.ceil(p.hp);
  els.hpBlock.classList.toggle("low", ratio < 0.3 && p.alive);
  els.weaponDot.style.background = w.color;
  els.weaponDot.style.color = w.color;
  els.weaponName.textContent = w.name;
  const ammo = game.loadout.ammo[p.weapon];
  els.weaponAmmo.textContent = Number.isFinite(ammo) ? ammo : "∞";
  els.grenades.textContent = game.loadout.grenades;
  els.credits.textContent = game.loadout.credits;
  const q = game.queen;
  els.objective.classList.toggle("open", game.exitOpen);
  els.objective.textContent = game.exitOpen
    ? "▶ Đến cửa thoát hiểm (xanh trên bản đồ)"
    : game.nests.length
      ? `Phá tổ ngoại tinh: còn ${game.nests.length}`
      : q ? "Hạ Nữ Hoàng Tổ" : "";
  const showBoss = q && q.awake;
  els.boss.hidden = !showBoss;
  if (showBoss) els.bossFill.style.transform = `scaleX(${Math.max(0, q.hp / q.maxHp)})`;
}

function toast(text, ms = 1800) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}

function banner(mission, index) {
  els.banner.innerHTML = `<small>Nhiệm vụ ${index + 1}/${MISSIONS.length}</small><strong>${mission.name}</strong><span>Phá ${game.nests.length} tổ${game.queen ? " · hạ Nữ Hoàng" : ""} · đến cửa thoát hiểm</span>`;
  els.banner.hidden = false;
  els.banner.style.animation = "none";
  void els.banner.offsetWidth;
  els.banner.style.animation = "";
  clearTimeout(banner.t);
  banner.t = setTimeout(() => {
    els.banner.hidden = true;
  }, 2300);
}

// Panels ------------------------------------------------------------------------------------------------

function showPanel(html) {
  els.panel.innerHTML = html;
  els.overlay.hidden = false;
  els.panel.querySelector(".btn.primary, .btn")?.focus({ preventScroll: true });
  input.clear();
}

function hidePanel() {
  els.overlay.hidden = true;
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function titleScreen() {
  game = null;
  playMusic("title");
  const list = MISSIONS.map((m, i) => {
    const open = i < loadout.unlocked;
    return `<button class="mission" data-brief="${i}" ${open ? "" : "disabled"}><b>${i + 1}</b><span>${m.name}<br><small>${open ? m.brief.split(".")[0] + "." : "🔒 Hoàn thành nhiệm vụ trước"}</small></span><span>${open ? "▶" : ""}</span></button>`;
  }).join("");
  showPanel(`
    <p class="eyebrow">Trạm nghiên cứu Kepler-9</p>
    <h1>HIVE BREACH</h1>
    <p class="lead">Phá Tổ Ngoại Tinh. Một mình, một khẩu súng, và cả một trạm vũ trụ đầy quái vật. Phá hủy các tổ, hạ Nữ Hoàng và sống sót trở về.</p>
    <div class="buttons">
      <button class="btn primary" data-brief="${Math.min(loadout.unlocked, MISSIONS.length) - 1}">▶ ${loadout.unlocked > 1 ? "Tiếp tục chiến dịch" : "Bắt đầu"}</button>
      <button class="btn" data-armory>🛒 Kho vũ khí (${loadout.credits}¢)</button>
      <button class="btn" data-help>⌨ Điều khiển</button>
    </div>
    <h3>Nhiệm vụ</h3>
    <div class="missions">${list}</div>
    ${loadout.unlocked > 1 ? '<div class="buttons"><button class="btn" data-reset>Chơi lại từ đầu</button></div>' : ""}`);
}

function helpScreen() {
  showPanel(`
    <h2>Điều khiển</h2>
    <dl class="keys">
      <dt>WASD / mũi tên</dt><dd>Di chuyển</dd>
      <dt>Chuột</dt><dd>Ngắm · giữ chuột trái để bắn</dd>
      <dt>Space / Shift</dt><dd>Lăn né (bất tử trong lúc lăn)</dd>
      <dt>Chuột phải / G</dt><dd>Ném lựu đạn</dd>
      <dt>1–6 · Q/E · con lăn</dt><dd>Đổi vũ khí</dd>
      <dt>P / Esc</dt><dd>Tạm dừng · M âm thanh · N nhạc</dd>
      <dt>Cảm ứng</dt><dd>Nửa trái: cần di chuyển · nửa phải: cần ngắm (tự bắn) · nút 💣 » ⇄</dd>
      <dt>Tay cầm</dt><dd>Cần trái di chuyển · cần phải ngắm &amp; bắn · RT bắn · LT lựu đạn · A lăn · Y/X đổi súng</dd>
    </dl>
    <h3>Mục tiêu</h3>
    <p class="muted">Phá mọi tổ (điểm hồng trên bản đồ nhỏ) để mở cửa thoát hiểm, rồi chạy tới đó. Tổ đẻ quái liên tục khi bạn ở gần. Diệt quái và tổ để nhận tín dụng (¢), mua súng và nâng cấp ở Kho vũ khí.</p>
    <div class="buttons"><button class="btn primary" data-title>Quay lại</button></div>`);
}

function briefScreen(index) {
  const m = MISSIONS[index];
  const kinds = Object.keys(m.mix).map((k) => ALIENS[k].name).join(", ");
  showPanel(`
    <p class="eyebrow">Nhiệm vụ ${index + 1}/${MISSIONS.length}</p>
    <h2>${m.name}</h2>
    <p class="lead">${m.brief}</p>
    <p class="muted">Tổ đẻ: ${kinds}${m.id === "hive" ? " · Trùm: Nữ Hoàng Tổ" : ""}</p>
    <p>💡 ${m.tip}</p>
    <div class="buttons">
      <button class="btn primary" data-start="${index}">⚡ Xuất kích</button>
      <button class="btn" data-armory="${index}">🛒 Kho vũ khí (${loadout.credits}¢)</button>
      <button class="btn" data-title>Menu</button>
    </div>`);
}

function armoryScreen(nextIndex) {
  playMusic("shop");
  const owned = loadout.owned.map((id) => {
    const w = WEAPONS[id];
    const ammo = loadout.ammo[id];
    return `<span class="muted">${w.short}: ${Number.isFinite(ammo) ? ammo : "∞"}</span>`;
  }).join(" · ");
  const rows = offers(loadout).map((o) => `
    <div class="offer"><span><b>${o.name}</b><small>${o.text}</small></span>
    <button class="btn${o.affordable ? " primary" : ""}" data-buy="${o.id}" ${o.affordable ? "" : "disabled"}>${o.maxed ? "—" : `${o.price}¢`}</button></div>`).join("");
  showPanel(`
    <p class="eyebrow">Kho vũ khí</p>
    <h2>Trang bị cho nhiệm vụ</h2>
    <p class="credits-big">${loadout.credits}¢</p>
    <p>${owned} · 💣 ${loadout.grenades} · ✚ ${100 + 25 * loadout.armor}</p>
    <div class="shop">${rows}</div>
    <div class="buttons">
      ${nextIndex !== undefined && nextIndex < MISSIONS.length ? `<button class="btn primary" data-brief="${nextIndex}">Tiếp: ${MISSIONS[nextIndex].name} ▶</button>` : ""}
      <button class="btn" data-title>Menu</button>
    </div>`);
  armoryScreen.next = nextIndex;
}

function pauseScreen() {
  showPanel(`
    <h2>Tạm dừng</h2>
    <p class="muted">${game.mission.name} · ${fmtTime(game.stats.time)}</p>
    <div class="buttons">
      <button class="btn primary" data-resume>▶ Tiếp tục</button>
      <button class="btn" data-restart>↻ Chơi lại nhiệm vụ</button>
      <button class="btn" data-help-pause>⌨ Điều khiển</button>
      <button class="btn" data-quit>Thoát ra menu</button>
    </div>`);
}

function clearedScreen() {
  const s = game.stats;
  const index = game.missionIndex;
  const bonus = missionBonus(index);
  const accuracy = s.shots ? Math.min(100, Math.round((s.hits / s.shots) * 100)) : 0;
  loadout = game.resultLoadout();
  saveLoadout();
  track(`hive/clear-${game.mission.id}`);
  const last = index === MISSIONS.length - 1;
  showPanel(`
    <p class="eyebrow">${last ? "Chiến dịch hoàn thành" : "Nhiệm vụ hoàn thành"}</p>
    <h2>${last ? "🏆 Trạm Kepler-9 đã được giải phóng!" : `✔ ${game.mission.name}`}</h2>
    ${last ? '<p class="lead">Nữ Hoàng Tổ đã gục ngã. Bạn là người duy nhất sống sót trở về.</p>' : ""}
    <div class="stats">
      <div class="stat"><b>${fmtTime(s.time)}</b><span>Thời gian</span></div>
      <div class="stat"><b>${s.kills}</b><span>Hạ gục</span></div>
      <div class="stat"><b>${accuracy}%</b><span>Chính xác</span></div>
      <div class="stat"><b>${Math.round(s.damageTaken)}</b><span>Sát thương nhận</span></div>
      <div class="stat"><b>+${s.credits + bonus}¢</b><span>gồm thưởng ${bonus}¢</span></div>
    </div>
    <div class="buttons">
      ${last ? '<button class="btn primary" data-title>Về menu</button>' : `<button class="btn primary" data-armory="${index + 1}">🛒 Kho vũ khí ▶</button><button class="btn" data-brief="${index + 1}">Bỏ qua, xuất kích ngay</button>`}
    </div>`);
}

function failedScreen() {
  track(`hive/fail-${game.mission.id}`);
  showPanel(`
    <p class="eyebrow">Mất tín hiệu</p>
    <h2>☠ Bạn đã hy sinh</h2>
    <p class="muted">${game.mission.name} · còn ${game.nests.length} tổ · ${fmtTime(game.stats.time)}. Trang bị và tín dụng trở về như lúc xuất kích.</p>
    <div class="buttons">
      <button class="btn primary" data-start="${game.missionIndex}">↻ Thử lại</button>
      <button class="btn" data-armory="${game.missionIndex}">🛒 Kho vũ khí</button>
      <button class="btn" data-title>Menu</button>
    </div>`);
}

// Flow ---------------------------------------------------------------------------------------------------

function startMission(index) {
  hidePanel();
  game = new Game(index, loadout, { seed: (Math.random() * 2 ** 31) | 0 });
  if (window.__hbDebug) window.__hbDebug.game = game;
  particles.items = [];
  lastState = game.state;
  handleEvents(game.takeEvents());
  banner(game.mission, index);
  track(`hive/start-${game.mission.id}`);
  updateHud();
}

function onStateChange(state) {
  if (state === "paused") pauseScreen();
  else if (state === "playing" && !els.overlay.hidden) hidePanel();
  else if (state === "cleared") clearedScreen();
  else if (state === "failed") failedScreen();
}

function togglePause() {
  if (!game) return;
  if (["playing", "intro", "paused"].includes(game.state)) {
    game.pause();
    handleEvents(game.takeEvents());
  }
}

function syncSoundButtons() {
  $("sound-btn").textContent = isMuted() ? "🔇" : "🔊";
  $("music-btn").classList.toggle("off", !isMusicOn());
}

function toggleSound() {
  setMuted(!isMuted());
  save("muted", isMuted());
  syncSoundButtons();
}

function toggleMusic() {
  setMusic(!isMusicOn());
  save("music", isMusicOn());
  syncSoundButtons();
}

els.panel.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  sfx.unlock();
  const d = b.dataset;
  if (d.brief !== undefined) briefScreen(Number(d.brief));
  else if (d.start !== undefined) startMission(Number(d.start));
  else if (d.armory !== undefined) armoryScreen(d.armory === "" ? undefined : Number(d.armory));
  else if (d.buy) {
    loadout = buy(loadout, d.buy);
    saveLoadout();
    sfx.buy();
    track("hive/buy");
    armoryScreen(armoryScreen.next);
  } else if ("title" in d) titleScreen();
  else if ("help" in d) helpScreen();
  else if ("helpPause" in d) {
    helpScreen();
    els.panel.querySelector("[data-title]").outerHTML = '<button class="btn primary" data-resume>▶ Tiếp tục</button>';
  } else if ("resume" in d) togglePause();
  else if ("restart" in d) startMission(game.missionIndex);
  else if ("quit" in d) titleScreen();
  else if ("reset" in d) {
    if (window.confirm("Xóa tiến trình và trang bị để chơi lại từ đầu?")) {
      loadout = createLoadout();
      saveLoadout();
      titleScreen();
    }
  }
});

$("pause-btn").addEventListener("click", () => togglePause());
$("sound-btn").addEventListener("click", () => toggleSound());
$("music-btn").addEventListener("click", () => toggleMusic());
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game && (game.state === "playing" || game.state === "intro")) togglePause();
});

const coarse = window.matchMedia("(pointer: coarse)");
const syncTouch = () => document.body.classList.toggle("touch-ui", coarse.matches);
coarse.addEventListener?.("change", syncTouch);
syncTouch();

window.addEventListener("resize", () => renderer.resize());
renderer.resize();

// Loop ----------------------------------------------------------------------------------------------------

function tick(snapshot) {
  if (!game) return;
  game.update(snapshot, DT);
  handleEvents(game.takeEvents());
  particles.update(DT);
  for (const f of flashes) f.life -= DT;
  while (flashes.length && flashes[0].life <= 0) flashes.shift();
  time += DT;
  if (game.state !== lastState) {
    lastState = game.state;
    onStateChange(game.state);
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    if (game) {
      acc += elapsed;
      while (acc >= DT) {
        tick(input.snapshot());
        acc -= DT;
      }
      renderer.draw(game, particles, time, elapsed, { flashes, mouse: input.mouse });
      updateHud();
    }
  } finally {
    requestAnimationFrame(frame);
  }
}

titleScreen();
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has("debug")) {
  // Browser e2e checks only: headless browsers throttle animation frames, so time is advanced by hand.
  window.__hbDebug = {
    game,
    get loadout() {
      return loadout;
    },
    setLoadout(l) {
      loadout = restoreLoadout(l);
      saveLoadout();
    },
    advance(seconds, held = {}) {
      for (let f = 0; f < Math.round(seconds / DT); f += 1) {
        const snap = { move: { x: 0, y: 0 }, aim: game?.player.angle ?? 0, fire: false, grenade: false, dash: false, weapon: null, cycle: 0, ...(typeof held === "function" ? held() : held) };
        tick(snap);
      }
      if (game) {
        renderer.draw(game, particles, time, DT, { flashes, mouse: null });
        updateHud();
      }
    },
  };
}


