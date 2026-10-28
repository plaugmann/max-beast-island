// Touch controls (iPad / phones): floating joystick on the left, drag to look + pinch to zoom on the right,
// on-screen buttons. Buttons send the same key events as the keyboard, so the other modules need no changes.
// ?touch forces touch mode on a desktop (for testing).
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);
export const IS_TOUCH = new URLSearchParams(location.search).has('touch') ||
  (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
if (IS_TOUCH) document.documentElement.classList.add('touch');

const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
const LOOK = 0.006; // radians per dragged pixel
const R = 55; // joystick radius (px); dragging further than RUN makes the player run
const RUN = 75;

export function createTouch(game, canvas) {
  const { input, camCtl, cubes } = game;
  const playing = () => $('loading').classList.contains('gone') && !game.panels.size &&
    !$('map').classList.contains('show') && !$('inventory').classList.contains('show');

  // Texts that mention keys
  $('talk').querySelector('.next').textContent = 'Tap ▶';
  $('intro').querySelector('.skip').textContent = 'Tap to skip ▶';
  $('map').querySelector('.close').textContent = 'Tap to close';
  $('inventory').querySelector('.note').textContent =
    "Animals in your inventory don't earn money – put them on a pedestal in your base (tap E there). Tap to close.";

  // Safari: no page zoom, scrolling, text magnifier or long-press menu
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  // Also no emulated mouse events / clicks afterwards: a tap that opens a panel must not land on (and close) it
  const noMouse = (el) => { for (const t of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(t, (e) => e.preventDefault(), { passive: false }); };
  for (const id of ['game', 'touch', 'hotbar', 'prompt', 'tut-hint']) noMouse($(id));

  // Full screen when PLAY is tapped (not needed when started from the home screen)
  $('play').addEventListener('click', () => {
    const d = document.documentElement;
    try { (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d)?.catch?.(() => {}); } catch { /* not supported */ }
  });

  // ---------- Joystick (left 40% of the screen) and looking (the rest) ----------
  const stick = $('stick'), knob = $('stick-knob');
  let move = null, pinch = 0;
  const looks = new Map(); // pointerId → { x, y, x0, y0 }

  function setMove(dx, dy) {
    const len = Math.hypot(dx, dy), k = len > R ? R / len : 1, dead = 0.35;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    input.forward = dy < -dead * R; input.back = dy > dead * R;
    input.left = dx < -dead * R; input.right = dx > dead * R;
    input.sprint = len > RUN;
    knob.classList.toggle('run', input.sprint);
  }
  function endMove() {
    move = null; setMove(0, 0);
    stick.classList.remove('active'); stick.style.left = stick.style.bottom = '';
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    if (!move && e.clientX < innerWidth * 0.4 && playing()) {
      move = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      stick.style.left = e.clientX + 'px'; stick.style.bottom = innerHeight - e.clientY + 'px';
      stick.classList.add('active');
      return;
    }
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    pinch = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (move?.id === e.pointerId) { setMove(e.clientX - move.x0, e.clientY - move.y0); return; }
    const p = looks.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!camCtl.enabled || game.panels.size) return;
    if (looks.size >= 2) { // two fingers: pinch to zoom
      const [a, b] = looks.values(), d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) camCtl.wantDist = clamp(camCtl.wantDist - (d - pinch) * 0.04, 2.5, 22);
      pinch = d;
      return;
    }
    camCtl.yaw -= dx * LOOK;
    camCtl.pitch = clamp(camCtl.pitch + dy * LOOK, -0.45, 1.35);
  });
  function pointerEnd(e) {
    if (move?.id === e.pointerId) { endMove(); return; }
    const p = looks.get(e.pointerId); if (!p) return;
    looks.delete(e.pointerId); pinch = 0;
    // A tap (finger didn't move) acts like a mouse click: skips the intro, next line of dialogue
    if (e.type === 'pointerup' && Math.hypot(p.x - p.x0, p.y - p.y0) < 12) {
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    }
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  window.addEventListener('blur', () => { if (move) endMove(); looks.clear(); });

  // ---------- Buttons ----------
  function button(id, down, up) {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); down(); });
    const release = () => { if (el.classList.contains('down')) { el.classList.remove('down'); up?.(); } };
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, release);
  }
  button('t-throw', () => { if (playing()) cubes.throwCube(); });
  button('t-jump', () => { input.jump = true; }, () => { input.jump = false; });
  button('t-use', () => key('KeyE'));
  button('t-map', () => key('KeyQ'));
  button('t-bag', () => key('Tab'));

  // Tap a hotbar slot to pick that cube, tap the "E" prompt to use it, tap a tip to skip it
  $('hotbar').addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('.slot');
    if (slot) { e.preventDefault(); cubes.select(+slot.dataset.i); }
  });
  $('prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); key('KeyE'); });
  $('tut-hint').addEventListener('pointerdown', () => key('Enter'));
  // Tap anywhere to close the map / inventory
  $('map').addEventListener('click', () => key('KeyQ'));
  $('inventory').addEventListener('click', () => key('Tab'));
}
