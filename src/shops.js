// Shops near spawn (Market: sell animals, Cube Shop: buy cubes) + shared gameplay UI:
// "Press E" prompts, modal panels, money popups, box colliders, canvas textures/materials and signs.
import * as THREE from 'three';
import { FEATURES } from './world.js';
import { RARITY, fmtMoney } from './data.js';
import { IS_TOUCH } from './touch.js';

const $ = (id) => document.getElementById(id);
const rnd = (s) => () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296;

// ---------- Canvas textures ----------
function canvasTex(w, h, draw, rep = [1, 1], srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  return t;
}
// Wooden planks with grain + knots
function drawWood(g, w, h, base = [128, 82, 46], planks = 4, R = rnd(7)) {
  const ph = h / planks;
  for (let i = 0; i < planks; i++) {
    const k = 0.85 + R() * 0.3, [r, gg, b] = base.map((c) => Math.round(c * k));
    g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, i * ph, w, ph);
    for (let l = 0; l < 26; l++) { // grain
      const y = i * ph + R() * ph, a = 0.05 + R() * 0.12;
      g.strokeStyle = R() > 0.5 ? `rgba(40,20,5,${a})` : `rgba(255,220,170,${a * 0.6})`; g.lineWidth = 0.6 + R() * 1.6;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + l) * 2 * R());
      g.stroke();
    }
    if (R() > 0.4) { const kx = R() * w, ky = i * ph + ph * (0.3 + R() * 0.4); g.fillStyle = 'rgba(50,25,8,0.45)'; g.beginPath(); g.ellipse(kx, ky, 7 + R() * 6, 3 + R() * 2, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(20,10,2,0.55)'; g.fillRect(0, i * ph, w, 3); // gaps
    g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(0, i * ph + 3, w, 2);
  }
}
// Stone bricks (map) or the matching bump map
function drawBricks(g, w, h, bump, base = [150, 140, 125], R = rnd(11)) {
  g.fillStyle = bump ? '#202020' : '#4a4540'; g.fillRect(0, 0, w, h);
  const rows = 4, bh = h / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 4; c++) {
    const bw = w / 3, x = c * bw + (r % 2) * bw * 0.5, y = r * bh;
    const k = 0.8 + R() * 0.35;
    if (bump) { g.fillStyle = `rgb(${170 + R() * 50 | 0},${170 + R() * 50 | 0},${170 + R() * 50 | 0})`; }
    else g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    g.beginPath(); g.roundRect(x + 4, y + 4, bw - 8, bh - 8, 6); g.fill();
    for (let s = 0; s < 40; s++) { // speckles / pits
      g.fillStyle = bump ? `rgba(0,0,0,${R() * 0.25})` : `rgba(${R() > 0.5 ? '255,250,240' : '30,25,20'},${R() * 0.12})`;
      g.beginPath(); g.arc(x + 6 + R() * (bw - 12), y + 6 + R() * (bh - 12), 1 + R() * 4, 0, 7); g.fill();
    }
    if (!bump) { const gr = g.createLinearGradient(0, y, 0, y + bh); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)'); g.fillStyle = gr; g.fillRect(x + 4, y + 4, bw - 8, bh - 8); }
  }
}

let M = null; // shared materials (created once)
export function materials() {
  if (M) return M;
  const woodMap = canvasTex(512, 512, (g, w, h) => drawWood(g, w, h));
  const darkMap = canvasTex(512, 512, (g, w, h) => drawWood(g, w, h, [74, 44, 26], 4, rnd(3)));
  const brickMap = canvasTex(512, 512, (g, w, h) => drawBricks(g, w, h, false));
  const brickBump = canvasTex(512, 512, (g, w, h) => drawBricks(g, w, h, true), [1, 1], false);
  const capMap = canvasTex(256, 256, (g, w, h) => drawBricks(g, w, h, false, [205, 196, 178], rnd(5)));
  M = {
    wood: new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.78 }),
    darkWood: new THREE.MeshStandardMaterial({ map: darkMap, roughness: 0.7 }),
    brick: new THREE.MeshStandardMaterial({ map: brickMap, bumpMap: brickBump, bumpScale: 2.5, roughness: 0.92 }),
    cap: new THREE.MeshStandardMaterial({ map: capMap, roughness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe8b348, metalness: 1, roughness: 0.28 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.8, roughness: 0.45 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 2.2, roughness: 0.4 }),
    tex: { woodMap, darkMap, brickMap, brickBump, capMap },
  };
  return M;
}
// Clone a material with a different texture repeat (keeps UVs simple on long walls)
export function repMat(mat, rx, ry) {
  const m = mat.clone();
  for (const k of ['map', 'bumpMap']) if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(rx, ry); m[k].needsUpdate = true; }
  return m;
}
export function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  parent?.add(m);
  return m;
}

// Wooden sign board with painted text (front face gets the canvas, slightly self-lit so it reads at night)
export function makeSign(title, sub, { w = 4, h = 1.2, color = '#ffd34a', sub2 = '#fff3d0', depth = 0.14 } = {}) {
  const g = new THREE.Group();
  const cw = 1024, ch = Math.round(1024 * h / w);
  const tex = canvasTex(cw, ch, (c) => {
    drawWood(c, cw, ch, [96, 58, 32], 3, rnd(title.length * 13));
    c.strokeStyle = '#3a2210'; c.lineWidth = 18; c.strokeRect(9, 9, cw - 18, ch - 18);
    c.strokeStyle = '#d9a648'; c.lineWidth = 5; c.strokeRect(26, 26, cw - 52, ch - 52);
    for (const [x, y] of [[44, 44], [cw - 44, 44], [44, ch - 44], [cw - 44, ch - 44]]) { // nails
      c.fillStyle = '#c9c2b0'; c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill(); c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(x + 2, y + 2, 4, 0, 7); c.fill();
    }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const ty = sub ? ch * 0.42 : ch * 0.52, px = Math.min(ch * (sub ? 0.46 : 0.6), (cw * 0.86) / (title.length * 0.52));
    c.font = `${px}px "Lilita One", sans-serif`;
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillText(title, cw / 2 + 5, ty + 7);
    c.lineWidth = px * 0.12; c.strokeStyle = '#2a1606'; c.strokeText(title, cw / 2, ty);
    const gr = c.createLinearGradient(0, ty - px / 2, 0, ty + px / 2); gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.5, color); gr.addColorStop(1, '#c07a10');
    c.fillStyle = gr; c.fillText(title, cw / 2, ty);
    if (sub) {
      c.font = `800 ${ch * 0.17}px Nunito, sans-serif`; c.lineWidth = 8; c.strokeStyle = '#2a1606';
      c.strokeText(sub, cw / 2, ch * 0.78); c.fillStyle = sub2; c.fillText(sub, cw / 2, ch * 0.78);
    }
  }, [1, 1]);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const M = materials();
  const board = box(w + 0.16, h + 0.16, depth, M.darkWood, 0, 0, 0, g);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.7 }));
  face.position.z = depth / 2 + 0.005; g.add(face);
  const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -depth / 2 - 0.005; g.add(back);
  g.userData.board = board;
  return g;
}

// Hanging lantern (glowing glass in an iron frame)
export function lantern(parent, x, y, z, s = 1) {
  const M = materials(), g = new THREE.Group();
  g.position.set(x, y, z); g.scale.setScalar(s);
  box(0.26, 0.04, 0.26, M.iron, 0, 0.2, 0, g); box(0.3, 0.04, 0.3, M.iron, 0, -0.2, 0, g);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 8), M.lamp); g.add(glass);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(0.025, 0.4, 0.025, M.iron, a * 0.12, 0, b * 0.12, g);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 4), M.iron); top.position.y = 0.3; top.rotation.y = Math.PI / 4; g.add(top);
  parent.add(g);
  return g;
}

// ---------- Shared gameplay UI ----------
export function createUI(game) {
  const { player, camera } = game;
  const canvas = $('game');
  const st = game.cubes.state;

  // Box colliders (oriented, y-rotation): wrap the player's collider lookup so pushing happens inside its physics step
  const boxes = [];
  game.addBoxCollider = (x, z, hx, hz, ry = 0) => { const b = { x, z, hx, hz, c: Math.cos(ry), s: Math.sin(ry) }; boxes.push(b); return b; };
  const origColl = player.colliders;
  player.colliders = (x, z) => {
    const out = origColl(x, z), R = 0.36;
    for (const b of boxes) {
      const dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx) > b.hx + b.hz + 2 || Math.abs(dz) > b.hx + b.hz + 2) continue;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; // world → box local
      const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
      const toW = (u, v) => [b.x + u * b.c + v * b.s, b.z - u * b.s + v * b.c];
      if (qx !== lx || qz !== lz) { // outside: push from the closest point
        if (Math.hypot(lx - qx, lz - qz) < R) { const [cx, cz] = toW(qx, qz); out.push({ x: cx, z: cz, r: 0 }); }
      } else { // inside: push out through the nearest face
        const ex = b.hx - Math.abs(lx), ez = b.hz - Math.abs(lz);
        const [nu, nv, depth] = ex < ez ? [Math.sign(lx) || 1, 0, ex] : [0, Math.sign(lz) || 1, ez];
        const [cx, cz] = toW(lx - nu * 0.01, lz - nv * 0.01);
        out.push({ x: cx, z: cz, r: depth + 0.01 });
      }
    }
    return out;
  };

  // Interactables: { pos: Vector3, r, label: () => string|null, action }
  const items = [];
  let current = null;
  game.addInteract = (it) => { items.push(it); return it; };
  const prompt = $('prompt'), _v = new THREE.Vector3();

  // Modal panel
  let panel = null;
  function openPanel(name, opts) {
    if (panel) closePanel(false);
    panel = { name, ...opts };
    game.panels.add('panel');
    $('gp-title').textContent = opts.title; $('gp-title').style.color = opts.color || '#ffe27a';
    $('gp-sub').textContent = opts.sub || '';
    $('gp-note').textContent = IS_TOUCH ? (opts.note || '').replace(' (E / Esc to close)', '') : opts.note || '';
    renderPanel();
    $('gpanel').classList.add('show');
    document.exitPointerLock?.();
    prompt.classList.remove('show');
  }
  function renderPanel() { if (panel) $('gp-body').innerHTML = panel.render(); }
  function closePanel(relock = true) {
    if (!panel) return;
    panel.onClose?.(); panel = null;
    game.panels.delete('panel');
    $('gpanel').classList.remove('show');
    if (relock) canvas.requestPointerLock?.()?.catch?.(() => {});
  }
  $('gp-body').addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && !el.disabled && panel) { panel.onClick?.(el.dataset.act, el); renderPanel(); }
  });
  $('gp-close').addEventListener('click', () => closePanel());
  $('gpanel').addEventListener('mousedown', (e) => { if (e.target.id === 'gpanel') closePanel(); });
  game.ui = { openPanel, closePanel, renderPanel, get panel() { return panel; } };

  // Money
  game.addMoney = (n, popup = true) => {
    n = Math.round(n); if (!n) return;
    st.money = Math.max(0, st.money + n);
    game.cubes.renderHotbar();
    if (popup) moneyPop(n);
    const chip = $('money'); chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
  };
  function moneyPop(n) {
    const el = document.createElement('div');
    el.className = 'money-pop' + (n < 0 ? ' neg' : '');
    el.textContent = (n < 0 ? '-' : '+') + fmtMoney(Math.abs(n));
    $('hud').appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
  game.moneyPop = moneyPop;
  game.banner = (big, small, color = '#ffe27a') => {
    const el = $('big-banner');
    el.innerHTML = `<div class="b1" style="color:${color}">${big}</div>${small ? `<div class="b2">${small}</div>` : ''}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3800);
  };

  // Keys: E = use / close panel, Esc closes, block Tab/Q while a panel is open
  game.onKey.push((e) => {
    if (panel) {
      if ((e.code === 'Escape' || e.code === 'KeyE') && !e.repeat) { closePanel(); return true; }
      return e.code === 'Tab' || e.code === 'KeyQ' || /^Digit/.test(e.code);
    }
    if (e.code === 'KeyE' && !e.repeat && current && !game.panels.size && $('loading').classList.contains('gone')) {
      if (!$('map').classList.contains('show') && !$('inventory').classList.contains('show')) { current.action(); return true; }
    }
    return false;
  });

  game.onFrame.push(() => {
    current = null;
    if (panel || !$('loading').classList.contains('gone')) { prompt.classList.remove('show'); return; }
    let best = Infinity, label = null;
    for (const it of items) {
      const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
      if (d < it.r && d < best && Math.abs(it.pos.y - player.pos.y) < 4) { const l = it.label(); if (l) { best = d; current = it; label = l; } }
    }
    if (!current) { prompt.classList.remove('show'); return; }
    _v.copy(current.pos); _v.y += current.h ?? 1.6;
    _v.project(camera);
    if (_v.z > 1) { prompt.classList.remove('show'); return; }
    prompt.innerHTML = `<b>E</b>${label}`;
    prompt.style.left = (_v.x * 0.5 + 0.5) * innerWidth + 'px';
    prompt.style.top = (-_v.y * 0.5 + 0.5) * innerHeight + 'px';
    prompt.classList.add('show');
  });
}

// ---------- Stalls ----------
// Market stall (red awning, coins and money bags) or Cube Shop stall (blue awning, glowing cubes). Front faces +z.
function buildStall(kind, game) {
  const M = materials(), g = new THREE.Group();
  const market = kind === 'market';
  const W = 4.6, D = 2.6;
  // Stone paving disc
  const pave = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.6, 0.6, 40), repMat(M.cap, 3, 3));
  pave.position.set(0, -0.24, 0.4); pave.receiveShadow = true; g.add(pave);
  // Counter
  box(W, 1.0, 0.9, repMat(M.wood, 2, 0.5), 0, 0.55, 0.55, g);
  box(W + 0.2, 0.1, 1.1, M.darkWood, 0, 1.1, 0.55, g);
  box(W, 0.12, 0.95, M.darkWood, 0, 0.1, 0.55, g);
  // Back wall with shelves
  box(W, 2.4, 0.14, repMat(M.wood, 2, 1.2), 0, 1.25, -D / 2 + 0.07, g);
  for (const y of [1.45, 2.05]) box(W - 0.3, 0.07, 0.42, M.darkWood, 0, y, -D / 2 + 0.3, g);
  // Posts
  for (const [x, z, h] of [[-W / 2, 1.05, 2.75], [W / 2, 1.05, 2.75], [-W / 2, -D / 2, 3.15], [W / 2, -D / 2, 3.15]]) box(0.16, h, 0.16, M.darkWood, x, h / 2, z, g);
  // Striped awning with scalloped valance
  const c1 = market ? '#d8352a' : '#2a62d8', c2 = '#f6efe0';
  const stripe = canvasTex(512, 256, (c, w, h) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? c2 : c1; c.fillRect(i * w / 8, 0, w / 8, h); }
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,.15)'); gr.addColorStop(1, 'rgba(255,255,255,.08)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  stripe.wrapS = stripe.wrapT = THREE.ClampToEdgeWrapping;
  const cloth = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.9, side: THREE.DoubleSide });
  const aw = new THREE.PlaneGeometry(W + 0.6, 3.0, 8, 6), ap = aw.attributes.position;
  for (let i = 0; i < ap.count; i++) ap.setZ(i, Math.sin((ap.getY(i) / 3 + 0.5) * Math.PI) * 0.12); // gentle sag
  aw.computeVertexNormals();
  const awning = new THREE.Mesh(aw, cloth);
  awning.position.set(0, 2.98, 0.05); awning.rotation.x = -Math.PI / 2 + 0.17; awning.castShadow = true; g.add(awning);
  const scallop = canvasTex(512, 64, (c, w, h) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? c2 : c1; c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo((i + 1) * w / 8, 0); c.lineTo((i + 1) * w / 8, h * 0.45); c.arc((i + 0.5) * w / 8, h * 0.45, w / 16, 0, Math.PI); c.fill(); }
  });
  scallop.wrapS = scallop.wrapT = THREE.ClampToEdgeWrapping;
  const val = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 0.4), new THREE.MeshStandardMaterial({ map: scallop, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }));
  val.position.set(0, 2.55, 1.55); val.castShadow = true; g.add(val);
  // Big sign on top
  const sign = makeSign(market ? 'MARKET' : 'CUBE SHOP', market ? 'Sell your animals' : 'Buy more cubes', { w: 3.6, h: 1.15, color: market ? '#ffd34a' : '#8fe3ff' });
  sign.position.set(0, 3.95, 0.25); sign.rotation.x = -0.08; g.add(sign);
  for (const x of [-1.4, 1.4]) box(0.08, 0.7, 0.08, M.darkWood, x, 3.25, 0.25, g);
  lantern(g, -W / 2 - 0.05, 2.35, 1.15, 0.9); lantern(g, W / 2 + 0.05, 2.35, 1.15, 0.9);

  const spin = [];
  if (market) {
    // Coin stacks, money bags and crates
    const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.035, 18);
    const R = rnd(42);
    for (const [cx, cz, n] of [[-1.5, 0.45, 7], [-1.2, 0.7, 4], [-1.65, 0.75, 10], [1.25, 0.4, 5]]) for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(coinGeo, M.gold); c.position.set(cx + (R() - 0.5) * 0.03, 1.17 + i * 0.036, cz + (R() - 0.5) * 0.03); c.castShadow = true; g.add(c);
    }
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x9c7a4a, roughness: 0.95 });
    for (const [bx, bz, s] of [[0.2, 0.5, 1], [0.75, 0.62, 0.8], [-W / 2 - 0.55, 1.4, 1.2]]) {
      const bag = new THREE.Group(); bag.position.set(bx, bx < -2 ? 0.05 : 1.15, bz); bag.scale.setScalar(s);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), bagMat); b.scale.set(1, 0.9, 1); b.position.y = 0.25; b.castShadow = true; bag.add(b);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.14, 12), bagMat); neck.position.y = 0.55; bag.add(neck);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 16), M.gold); tie.rotation.x = Math.PI / 2; tie.position.y = 0.52; bag.add(tie);
      const dollar = makeLabelPlane('$', '#ffd34a', 0.26); dollar.position.set(0, 0.27, 0.27); bag.add(dollar);
      g.add(bag);
    }
    for (const [x, z, s, r] of [[W / 2 + 0.6, 1.1, 0.7, 0.3], [W / 2 + 0.55, 0.3, 0.55, -0.2], [W / 2 + 0.6, 1.0, 0.45, 0.8]]) {
      const cr = box(s, s, s, repMat(M.wood, 0.5, 0.5), x, s / 2, z, g); cr.rotation.y = r;
      if (s === 0.45) cr.position.y = 0.7 + s / 2;
    }
    // Shelf: jars of coins
    for (let i = 0; i < 5; i++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 14), new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.35 }));
      jar.position.set(-1.6 + i * 0.8, 1.64, -D / 2 + 0.3); g.add(jar);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.18, 14), M.gold); fill.position.set(-1.6 + i * 0.8, 1.58, -D / 2 + 0.3); g.add(fill);
    }
  } else {
    // Glowing cubes on little stands + more on the shelves
    const { looks, types } = game.cubes;
    const geo = new THREE.BoxGeometry(0.34, 0.34, 0.34), small = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    types.filter((c) => !c.admin).forEach((c, i) => {
      const x = -1.7 + i * 0.85;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12), M.gold); st.position.set(x, 1.21, 0.6); g.add(st);
      const cube = new THREE.Mesh(geo, looks[c.id].mat); cube.position.set(x, 1.52, 0.6); cube.castShadow = true; g.add(cube);
      spin.push(cube);
      for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(small, looks[c.id].mat); s.position.set(x + (k - 1) * 0.26, k % 2 ? 2.21 : 1.61, -D / 2 + 0.3); s.rotation.y = k * 0.4; g.add(s); }
    });
    const crate = box(0.8, 0.8, 0.8, repMat(M.wood, 0.6, 0.6), -W / 2 - 0.7, 0.4, 1.0, g); crate.rotation.y = 0.25;
    const c2b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), looks.rusty.mat); c2b.position.set(-W / 2 - 0.7, 0.97, 1.0); c2b.rotation.y = 0.6; g.add(c2b);
  }
  return { group: g, spin };
}
// Small double-sided text plane
function makeLabelPlane(text, color, size) {
  const t = canvasTex(128, 128, (c) => { c.font = '100px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.strokeStyle = '#3a2210'; c.lineWidth = 8; c.strokeText(text, 64, 70); c.fillText(text, 64, 70); });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8 }));
}

export function createShops(game) {
  createUI(game);
  const { scene, world, cubes } = game;
  const st = cubes.state, S = FEATURES.spawn;
  // Stalls left and right of where the player spawns, angled towards the spawn point
  const spots = { market: [FEATURES.market.x, FEATURES.market.z], cubeShop: [FEATURES.cubeShop.x, FEATURES.cubeShop.z] };
  const shops = {}, spinners = [];
  for (const kind of ['market', 'cubeShop']) {
    const [x, z] = spots[kind], { group, spin } = buildStall(kind, game);
    const ry = Math.atan2(S.x - x, S.z - z);
    group.position.set(x, world.heightAt(x, z), z); group.rotation.y = ry;
    scene.add(group); spinners.push(...spin);
    const front = new THREE.Vector3(x + Math.sin(ry) * 1.9, group.position.y, z + Math.cos(ry) * 1.9);
    shops[kind] = front;
    game.addBoxCollider(x + Math.sin(ry) * -0.1, z + Math.cos(ry) * -0.1, 2.5, 1.35, ry);
    game.addInteract({ pos: front, r: 3.6, h: 2.3, label: () => kind === 'market' ? 'Sell animals' : 'Buy cubes', action: () => (kind === 'market' ? openMarket() : openCubeShop()) });
    game.map?.addMarker({ x, z, icon: kind === 'market' ? '💰' : '🧊', name: kind === 'market' ? 'Market' : 'Cube Shop', color: kind === 'market' ? '#ffd34a' : '#8fe3ff', ox: kind === 'market' ? 70 : -70, oy: -46 });
  }
  game.shops = shops;
  game.onFrame.push((dt, t) => { spinners.forEach((c, i) => { c.rotation.y = t * 0.8 + i; c.position.y = 1.52 + Math.sin(t * 2 + i) * 0.04; }); });

  const after = () => { cubes.renderHotbar(); cubes.renderInventory(); game.emit?.('change'); };

  // ---------- Market ----------
  let confirmAll = false;
  function openMarket() {
    confirmAll = false;
    game.onShop?.('market');
    game.ui.openPanel('market', {
      title: 'MARKET', sub: 'Sell animals from your inventory', color: '#ffd34a',
      note: 'Tip: animals in your base earn money every second – only sell the ones you don\'t need! (E / Esc to close)',
      render() {
        const inv = st.inventory;
        if (!inv.length) return '<div class="gp-empty">Your inventory is empty.<br>Catch some animals first!</div>';
        const sellable = inv.filter((it) => RARITY[it.rarity].sell != null), total = sellable.reduce((s, it) => s + RARITY[it.rarity].sell, 0);
        return `<div class="gp-grid">${inv.map((it, i) => {
          const r = RARITY[it.rarity];
          return `<div class="gp-card r-${r.index}" style="--rc:${r.color}"><div class="ic">${it.icon}</div><div class="an">${it.name}</div><div class="ar">${it.rarity}</div>
            ${r.sell == null ? '<button class="gp-btn" disabled>Can\'t sell</button>' : `<button class="gp-btn sell" data-act="sell:${i}">Sell ${fmtMoney(r.sell)}</button>`}</div>`;
        }).join('')}</div>
        <div class="gp-foot"><span>${inv.length} animal${inv.length === 1 ? '' : 's'}</span>
          <button class="gp-btn big ${confirmAll ? 'warn' : 'sell'}" data-act="all" ${sellable.length ? '' : 'disabled'}>${confirmAll ? `Sure? Sell ${sellable.length} for ${fmtMoney(total)}` : `Sell all (${fmtMoney(total)})`}</button></div>`;
      },
      onClick(act) {
        if (act.startsWith('sell:')) {
          const it = st.inventory[+act.slice(5)]; if (!it) return;
          st.inventory.splice(st.inventory.indexOf(it), 1);
          game.addMoney(RARITY[it.rarity].sell); confirmAll = false; after();
          game.toast(`Sold ${it.name} for ${fmtMoney(RARITY[it.rarity].sell)}`);
        } else if (act === 'all') {
          if (!confirmAll) { confirmAll = true; return; }
          const keep = st.inventory.filter((it) => RARITY[it.rarity].sell == null);
          const sold = st.inventory.filter((it) => RARITY[it.rarity].sell != null);
          st.inventory.length = 0; st.inventory.push(...keep);
          game.addMoney(sold.reduce((s, it) => s + RARITY[it.rarity].sell, 0)); confirmAll = false; after();
          game.toast(`Sold ${sold.length} animal${sold.length === 1 ? '' : 's'}!`);
        }
      },
    });
  }

  // ---------- Cube Shop ----------
  function openCubeShop() {
    game.onShop?.('cubeShop');
    game.ui.openPanel('cubeShop', {
      title: 'CUBE SHOP', sub: 'Better cubes catch rarer animals', color: '#8fe3ff', note: IS_TOUCH ? 'Tap a cube in the bar at the bottom to pick it.' : 'Press 1-5 in the game to pick a cube. (E / Esc to close)',
      render() {
        return `<div class="gp-shop">${cubes.types.filter((c) => !c.admin).map((c) => {
          const have = st.counts[c.id] ?? 0, best = c.chances.map((p, k) => p > 0 ? k : -1).filter((k) => k >= 0).pop();
          const rn = Object.keys(RARITY)[best];
          return `<div class="gp-cube" style="--glow:${c.glow}"><img src="${cubes.looks[c.id].icon}" alt=""><div class="cn">${c.name}</div>
            <div class="cp" style="color:${c.glow}">${fmtMoney(c.price)}</div><div class="ch">Up to <span style="color:${RARITY[rn].index === 9 ? '#c89cff' : RARITY[rn].color}">${rn}</span></div>
            <div class="hv">You have <b>${have === Infinity ? '∞' : have}</b></div>
            <button class="gp-btn buy" data-act="buy:${c.id}:1" ${st.money >= c.price ? '' : 'disabled'}>Buy ×1</button>
            <button class="gp-btn buy" data-act="buy:${c.id}:10" ${st.money >= c.price * 10 ? '' : 'disabled'}>×10 ${fmtMoney(c.price * 10)}</button></div>`;
        }).join('')}</div><div class="gp-foot"><span>Your money: <b class="gp-money">${fmtMoney(st.money)}</b></span></div>`;
      },
      onClick(act) {
        const [, id, n] = act.split(':'), c = cubes.types.find((t) => t.id === id), cost = c.price * +n;
        if (st.money < cost) return;
        game.addMoney(-cost);
        st.counts[id] = (st.counts[id] || 0) + +n;
        cubes.select(cubes.types.indexOf(c)); after();
        game.toast(`Bought ${n} ${c.name}${+n > 1 ? 's' : ''}!`);
      },
    });
  }
  return { shops, openMarket, openCubeShop };
}
