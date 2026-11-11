/**
 * Keyboard + mouse, twin touch sticks and gamepad, merged into one snapshot per step:
 * { move: {x, y}, aim (radians), fire, grenade, dash, weapon (id | null), cycle (-1 | 0 | 1) }.
 * One-shot commands (pause, mute, music) go through `onCommand`.
 */

import { WEAPON_ORDER } from "../core/weapons.js";

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const COMMAND_KEYS = { KeyP: "pause", Escape: "pause", KeyM: "mute", KeyN: "music" };

/** Stick vector from a finger offset: unit-clamped, with a dead zone. */
export function stickVector(dx, dy, radius, deadZone = 0.18) {
  const len = Math.hypot(dx, dy) / radius;
  if (len < deadZone) return { x: 0, y: 0, len: 0 };
  const k = Math.min(1, len) / (len || 1) / radius;
  return { x: dx * k, y: dy * k, len: Math.min(1, len) };
}

export function createInput({ canvas, toWorldAngle, onCommand, isPlaying }) {
  const keys = new Set();
  let mouse = { x: 0, y: 0, down: false, right: false };
  let wheel = 0;
  let pickedWeapon = null;
  const sticks = { move: null, aim: null }; // { id, ox, oy, x, y }
  const touchButtons = new Map(); // pointerId → button name
  let padPrev = [];
  let lastAim = 0;
  let usingPad = false;

  window.addEventListener("keydown", (e) => {
    if (MOVE_KEYS[e.code] || e.code === "Space" || e.code === "ShiftLeft" || e.code === "KeyG" || e.code === "KeyQ" || e.code === "KeyE") {
      keys.add(e.code);
      if (isPlaying()) e.preventDefault();
    }
    const digit = /^Digit([1-6])$/.exec(e.code);
    if (digit) pickedWeapon = WEAPON_ORDER[Number(digit[1]) - 1];
    if (e.code === "KeyQ" && !e.repeat) wheel -= 1;
    if (e.code === "KeyE" && !e.repeat) wheel += 1;
    const command = COMMAND_KEYS[e.code];
    if (command && !e.repeat) {
      onCommand(command);
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    mouse.down = false;
    mouse.right = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    usingPad = false;
  });
  canvas.addEventListener("mousedown", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.right = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (e) => {
    if (!isPlaying()) return;
    wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }, { passive: false });

  /** Touch: left half = move stick, right half = aim stick (fires while pushed), plus buttons. */
  function bindTouch(root) {
    root.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      const button = e.target.closest("[data-button],[data-command]");
      if (button) {
        e.preventDefault();
        if (button.dataset.command) onCommand(button.dataset.command);
        else {
          touchButtons.set(e.pointerId, button.dataset.button);
          button.classList.add("pressed");
          if (button.dataset.button === "cycle") wheel += 1;
        }
        return;
      }
      if (!e.target.closest("[data-zone]")) return;
      e.preventDefault();
      const side = e.clientX < window.innerWidth / 2 ? "move" : "aim";
      if (sticks[side]) return;
      sticks[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      root.setPointerCapture?.(e.pointerId);
      drawSticks(root);
    });
    root.addEventListener("pointermove", (e) => {
      for (const s of Object.values(sticks)) {
        if (s && s.id === e.pointerId) {
          s.x = e.clientX;
          s.y = e.clientY;
        }
      }
      drawSticks(root);
    });
    const end = (e) => {
      for (const side of ["move", "aim"]) if (sticks[side]?.id === e.pointerId) sticks[side] = null;
      const name = touchButtons.get(e.pointerId);
      if (name) {
        touchButtons.delete(e.pointerId);
        root.querySelector(`[data-button="${name}"]`)?.classList.remove("pressed");
      }
      drawSticks(root);
    };
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    root.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  const STICK_R = 46;
  function drawSticks(root) {
    for (const side of ["move", "aim"]) {
      const el = root.querySelector(`[data-stick="${side}"]`);
      const s = sticks[side];
      if (!el) continue;
      el.hidden = !s;
      if (!s) continue;
      const v = stickVector(s.x - s.ox, s.y - s.oy, STICK_R);
      el.style.left = `${s.ox}px`;
      el.style.top = `${s.oy}px`;
      el.querySelector("i").style.transform = `translate(${v.x * STICK_R}px, ${v.y * STICK_R}px)`;
    }
  }

  function readPad(out) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(Boolean);
    if (!pad) return;
    const b = (i) => Boolean(pad.buttons[i]?.pressed);
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    if (Math.hypot(lx, ly) > 0.2) {
      out.move.x += lx;
      out.move.y += ly;
    }
    if (Math.hypot(rx, ry) > 0.35) {
      out.aim = Math.atan2(ry, rx);
      usingPad = true;
      if (Math.hypot(rx, ry) > 0.6) out.fire = true;
    }
    out.fire ||= b(7) || b(5);
    out.grenade ||= b(6) || b(4);
    out.dash ||= b(0) || b(1);
    const now = pad.buttons.map((x) => x.pressed);
    if (now[3] && !padPrev[3]) wheel += 1;
    if (now[2] && !padPrev[2]) wheel -= 1;
    if (now[9] && !padPrev[9]) onCommand("pause");
    padPrev = now;
  }

  return {
    bindTouch,
    /** Current crosshair position on screen (for drawing), or null when a stick is aiming. */
    get mouse() {
      return usingPad || sticks.aim ? null : mouse;
    },
    snapshot() {
      const out = { move: { x: 0, y: 0 }, aim: lastAim, fire: false, grenade: false, dash: false, weapon: null, cycle: 0 };
      for (const code of keys) {
        const m = MOVE_KEYS[code];
        if (m) {
          out.move.x += m[0];
          out.move.y += m[1];
        }
      }
      out.dash = keys.has("Space") || keys.has("ShiftLeft");
      out.grenade = keys.has("KeyG") || mouse.right;
      out.fire = mouse.down;
      if (!usingPad && !sticks.aim) out.aim = toWorldAngle(mouse.x, mouse.y);
      if (sticks.move) {
        const v = stickVector(sticks.move.x - sticks.move.ox, sticks.move.y - sticks.move.oy, STICK_R);
        out.move.x += v.x;
        out.move.y += v.y;
      }
      if (sticks.aim) {
        const v = stickVector(sticks.aim.x - sticks.aim.ox, sticks.aim.y - sticks.aim.oy, STICK_R, 0.25);
        if (v.len > 0) {
          out.aim = Math.atan2(v.y, v.x);
          out.fire = true;
        }
      }
      for (const name of touchButtons.values()) {
        if (name === "grenade") out.grenade = true;
        if (name === "dash") out.dash = true;
      }
      readPad(out);
      out.weapon = pickedWeapon;
      pickedWeapon = null;
      out.cycle = Math.sign(wheel);
      wheel = 0;
      lastAim = out.aim;
      return out;
    },
    clear() {
      keys.clear();
      mouse.down = false;
      mouse.right = false;
    },
  };
}
