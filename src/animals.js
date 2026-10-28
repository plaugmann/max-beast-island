// Animals: procedural models (a few parametric body plans), rarity visuals, spawning and wandering AI
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FEATURES, ISLAND_R } from './world.js';
import { RARITY, ANIMALS, rollRarity } from './data.js';
import { clamp, lerp } from './util.js';
import lowSpecies from './species/low.js';
import highSpecies from './species/high.js';

// ---------- Geometry helpers ----------
const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  leg: new THREE.CylinderGeometry(1, 0.72, 1, 9),
  cone: new THREE.ConeGeometry(1, 1, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.07, 6, 28),
};
const taperCache = new Map();
const taper = (k) => { // unit cylinder along +Y, bottom radius 1, top radius k
  k = Math.round(k * 20) / 20;
  if (!taperCache.has(k)) taperCache.set(k, new THREE.CylinderGeometry(k, 1, 1, 9));
  return taperCache.get(k);
};
const wingShape = (pts) => {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))), { depth: 0.035, bevelEnabled: false });
  g.rotateX(Math.PI / 2); g.translate(0, 0.0175, 0);
  return g;
};
G.feather = wingShape([[0, 0.16], [0.35, 0.22], [0.7, 0.17], [1, 0.02], [0.9, -0.1], [0.94, -0.2], [0.8, -0.22], [0.78, -0.33],
  [0.63, -0.32], [0.56, -0.42], [0.43, -0.37], [0.32, -0.45], [0.2, -0.36], [0, -0.3]]);
G.bat = wingShape([[0, 0.12], [0.3, 0.26], [0.65, 0.32], [1, 0.26], [0.84, -0.02], [0.7, -0.04], [0.6, -0.36], [0.46, -0.2],
  [0.32, -0.46], [0.17, -0.26], [0, -0.36]]);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);

function piece(geo, color, p = [0, 0, 0], s = 1, r = [0, 0, 0]) {
  if (typeof s === 'number') s = [s, s, s];
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv'); g.clearGroups();
  _m.compose(_p.fromArray(p), r.isQuaternion ? r : _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.fromArray(s));
  g.applyMatrix4(_m);
  const pos = g.attributes.position, nor = g.attributes.normal;
  if (_m.determinant() < 0) { // mirrored: fix triangle winding
    for (const a of [pos, nor]) for (let i = 0; i < a.count; i += 3) for (let k = 0; k < 3; k++) {
      const t = a.array[(i + 1) * 3 + k]; a.array[(i + 1) * 3 + k] = a.array[(i + 2) * 3 + k]; a.array[(i + 2) * 3 + k] = t;
    }
  }
  _c.set(color);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Collects pieces into animated parts (each part = one solid + one glowing merged mesh)
class Builder {
  constructor() { this.parts = []; this.part('body', [0, 0, 0], { parent: -1 }); }
  part(type, pivot, o = {}) {
    this.cur = { type, pivot, parent: o.parent ?? 0, side: o.side ?? 0, phase: o.phase ?? 0, idx: o.idx ?? 0, solid: [], glow: [] };
    this.parts.push(this.cur); return this.parts.length - 1;
  }
  use(i) { this.cur = this.parts[i]; return this; }
  s(geo, c, p, sc, r) { this.cur.solid.push(piece(typeof geo === 'string' ? G[geo] : geo, c, p, sc, r)); return this; }
  g(geo, c, p, sc, r) { this.cur.glow.push(piece(typeof geo === 'string' ? G[geo] : geo, c, p, sc, r)); return this; }
  // Tapered tube from a to b (radius r0 -> r1)
  tube(a, b, r0, r1, c, glow = false) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    this[glow ? 'g' : 's'](taper(r1 / r0), c, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [r0, len, r0], q);
    return this;
  }
  // Polyline tube with joints
  chain(pts, r0, r1, c, glow = false) {
    for (let i = 0; i < pts.length - 1; i++) {
      const ra = lerp(r0, r1, i / (pts.length - 1)), rb = lerp(r0, r1, (i + 1) / (pts.length - 1));
      this.tube(pts[i], pts[i + 1], ra, rb, c, glow);
      if (i > 0) this[glow ? 'g' : 's']('sphere', c, pts[i], ra);
    }
    return this;
  }
  eyes(x, y, z, r, color = '#111111', glow = false) {
    for (const sd of [-1, 1]) {
      this[glow ? 'g' : 's']('sphere', color, [x * sd, y, z], r);
      if (!glow) this.s('sphere', '#ffffff', [x * sd + sd * r * 0.25, y + r * 0.4, z + r * 0.72], r * 0.32);
    }
    return this;
  }
}

const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// Bumps on an ellipsoid's upper surface (spots, cracks, plates, crystals)
function spots(b, n, cx, cy, cz, rx, ry, rz, size, color, glow, seed = 7, geo = 'sphere', flat = 0.45) {
  const R = rnd(seed);
  for (let i = 0; i < n; i++) {
    const u = (R() * 2 - 1) * 0.8, v = (R() * 2 - 1) * 1.25, k = Math.sqrt(1 - u * u);
    const p = [cx + rx * Math.sin(v) * k, cy + ry * Math.cos(v) * k, cz + rz * u];
    const sz = size * (0.6 + R() * 0.7);
    if (geo === 'cone') b[glow ? 'g' : 's']('cone', color, [p[0], p[1] + sz, p[2]], [sz * 0.35, sz * 2.4, sz * 0.35], [u * 0.3, 0, -Math.sin(v) * 0.8]);
    else b[glow ? 'g' : 's'](geo, color, p, [sz, sz * flat, sz], [0, R() * 3, -Math.sin(v) * 0.9]);
  }
}

function wing(b, side, pivot, span, color, style = 'feather', tip = null, glowTip = false) {
  b.part('wing', pivot, { side });
  b.s(style === 'bat' ? 'bat' : 'feather', color, [0, 0, 0], [side * span, 1, span * 0.9]);
  if (style === 'bat') { // finger bones along the leading edge
    b.tube([0, 0.02, 0.1 * span], [side * 0.65 * span, 0.02, 0.3 * span], span * 0.035, span * 0.02, tip ?? color);
    b.tube([side * 0.65 * span, 0.02, 0.3 * span], [side * span, 0.02, 0.24 * span], span * 0.02, span * 0.01, tip ?? color);
  } else if (tip) {
    for (let k = 0; k < 3; k++) b[glowTip ? 'g' : 's']('sphere', tip, [side * (0.62 + k * 0.12) * span, 0.02, -(0.3 + k * 0.02) * span], [0.13 * span, 0.03, 0.08 * span], [0, side * 0.5, 0]);
  }
}

// ---------- Body plans (all face +Z, feet at y = 0) ----------
function quad(b, o) {
  const L = o.len, W = o.wid, BH = o.bodyH, LEG = o.leg, LR = o.legR ?? L * 0.055, HR = o.head;
  const c = o.c, c2 = o.c2 ?? c, c3 = o.c3 ?? '#2a221c';
  const by = LEG + BH * 0.42;
  b.s('sphere', c, [0, by, 0], [W / 2, BH / 2, L / 2]);
  b.s('sphere', c, [0, by + BH * 0.06, L * 0.27], [W * 0.53, BH * 0.56, L * 0.27]);
  b.s('sphere', c, [0, by + BH * 0.02, -L * 0.27], [W * 0.5, BH * 0.52, L * 0.26]);
  b.s('sphere', c2, [0, by - BH * 0.17, L * 0.06], [W * 0.4, BH * 0.33, L * 0.38]);
  if (o.hump) b.s('sphere', c, [0, by + BH * 0.42, L * 0.18], [W * 0.42, BH * 0.36, L * 0.3]);
  if (o.spots) spots(b, o.spots.n ?? 12, 0, by, 0, W / 2, BH / 2, L / 2, o.spots.size ?? W * 0.12, o.spots.c, o.spots.glow, o.seed ?? 3);
  if (o.stripes) for (let i = 0; i < 5; i++) b.g('box', o.stripes, [0, by + BH * 0.47, -L * 0.32 + i * L * 0.15], [W * 0.7, 0.02, L * 0.035], [0, 0.3 * (i % 2 ? 1 : -1), 0]);
  if (o.spikes) for (let i = 0; i < o.spikes.n; i++) {
    const t = i / (o.spikes.n - 1), z = lerp(-L * 0.4, L * 0.35, t), h = o.spikes.h * (0.6 + 0.4 * Math.sin(t * Math.PI));
    b[o.spikes.glow ? 'g' : 's']('cone', o.spikes.c, [0, by + BH * 0.46 + h * 0.4, z], [h * 0.3, h, h * 0.45], [-0.35, 0, 0]);
  }
  if (o.plates) spots(b, 9, 0, by, 0, W / 2, BH / 2, L / 2, W * 0.24, o.plates, false, 11, 'box', 0.25);
  if (o.runes) spots(b, 10, 0, by + 0.01, 0, W / 2, BH / 2, L / 2, W * 0.06, o.runes, true, 5, 'box', 0.4);
  if (o.crystals) spots(b, 7, 0, by, -L * 0.05, W * 0.4, BH * 0.45, L * 0.38, W * 0.1, o.crystals, true, 9, 'cone');

  // Head + neck
  const NL = o.neck ?? L * 0.22, na = o.neckAngle ?? 0.85, nW = W * 0.24 * (o.neckW ?? 1);
  b.part('head', [0, by + BH * 0.22, L * 0.4]);
  const hp = [0, Math.sin(na) * NL + HR * 0.15, Math.cos(na) * NL + HR * 0.25];
  b.tube([0, -BH * 0.1, -L * 0.04], hp, nW, nW * 0.8, c);
  if (o.mane) {
    b.s('sphere', o.mane, [0, hp[1] - HR * 0.1, hp[2] - HR * 0.35], [HR * 1.45, HR * 1.4, HR * 1.1]);
    b.s('sphere', o.mane, [0, hp[1] - HR * 0.7, hp[2] - HR * 0.6], [HR * 1.15, HR * 1.0, HR * 1.0]);
    if (o.maneGlow) spots(b, 9, 0, hp[1] - HR * 0.1, hp[2] - HR * 0.35, HR * 1.45, HR * 1.4, HR * 1.1, HR * 0.22, o.maneGlow, true, 4, 'box', 0.25);
  }
  if (o.horseMane) for (let i = 0; i < 5; i++) {
    const t = i / 4;
    b.s('sphere', o.horseMane, [0, lerp(-BH * 0.1, hp[1] + HR * 0.4, t) + nW * 0.75, lerp(-L * 0.06, hp[2] - HR * 0.55, t)], [nW * 0.5, nW * 1.1, nW * 0.9], [-0.6, 0, 0]);
  }
  b.s('sphere', o.headC ?? c, hp, [HR * 0.85, HR * 0.82, HR]);
  const sn = o.snout ?? HR * 0.8;
  if (o.beak) { // eagle head
    b.s('cone', o.beak, [0, hp[1] - HR * 0.15, hp[2] + HR * 1.1], [HR * 0.3, HR * 0.8, HR * 0.34], [Math.PI / 2 + 0.35, 0, 0]);
  } else if (sn > 0.01) {
    const sp = [0, hp[1] - HR * 0.25, hp[2] + HR * 0.5 + sn * 0.35];
    b.s('sphere', o.snoutC ?? o.headC ?? c, sp, [HR * 0.5 * (o.snoutW ?? 1), HR * 0.46, sn * 0.62]);
    b.s('sphere', '#151112', [0, sp[1] + HR * 0.12, sp[2] + sn * 0.58], HR * 0.13 * (o.snoutW ?? 1));
  }
  if (o.mask) b.s('sphere', o.mask, [0, hp[1] + HR * 0.18, hp[2] + HR * 0.42], [HR * 0.9, HR * 0.26, HR * 0.5]);
  const eyeZ = hp[2] + HR * 0.74;
  b.eyes(HR * 0.46, hp[1] + HR * 0.2, eyeZ, HR * 0.15, o.eyeC ?? '#111111', !!o.glowEyes);
  const ear = o.ear ?? HR * 0.6;
  for (const sd of [-1, 1]) {
    const ex = HR * 0.5 * sd, ey = hp[1] + HR * 0.72, ez = hp[2] - HR * 0.15;
    if (o.ears === 'long') b.s('sphere', o.earC ?? c, [HR * 0.28 * sd, hp[1] + HR * 0.6 + ear * 0.85, ez - HR * 0.1], [ear * 0.2, ear, ear * 0.09], [-0.25, 0, -0.12 * sd]);
    else if (o.ears === 'round') b.s('sphere', o.earC ?? c, [HR * 0.62 * sd, hp[1] + HR * 0.66, ez], [ear * 0.55, ear * 0.5, ear * 0.22]);
    else if (o.ears === 'side') b.s('sphere', o.earC ?? c, [HR * 0.85 * sd, hp[1] + HR * 0.45, ez], [ear, ear * 0.3, ear * 0.18], [0, 0, 0.35 * sd]);
    else if (o.ears !== 'none') {
      b.s('cone', o.earC ?? c, [ex, ey + ear * 0.35, ez], [ear * 0.42, ear, ear * 0.2], [0, 0, -0.28 * sd]);
      if (o.ears === 'tuft') b.s('cone', '#151112', [ex + sd * ear * 0.18, ey + ear * 1.0, ez], [ear * 0.1, ear * 0.5, ear * 0.08], [0, 0, -0.28 * sd]);
    }
  }
  const hc = o.hornC ?? '#e8dcc2';
  if (o.horns === 'antlers') for (const sd of [-1, 1]) {
    const base = [HR * 0.35 * sd, hp[1] + HR * 0.7, hp[2] - HR * 0.05], A = HR * (o.antler ?? 3.2);
    const tip = [base[0] + sd * A * 0.55, base[1] + A, base[2] - A * 0.35];
    b.chain([base, [base[0] + sd * A * 0.3, base[1] + A * 0.45, base[2] - A * 0.1], tip], HR * 0.13, HR * 0.07, hc, o.hornGlow);
    for (let k = 1; k <= 3; k++) {
      const t = k / 3.3, p = [lerp(base[0], tip[0], t), lerp(base[1], tip[1], t), lerp(base[2], tip[2], t)];
      b.tube(p, [p[0] + sd * A * 0.08, p[1] + A * 0.35, p[2] + A * 0.18], HR * 0.09, HR * 0.04, hc, o.hornGlow);
    }
  } else if (o.horns === 'unicorn') {
    b.g('cone', hc, [0, hp[1] + HR * 1.05, hp[2] + HR * 0.55], [HR * 0.16, HR * 1.6, HR * 0.16], [0.55, 0, 0]);
  } else if (o.horns === 'horns') for (const sd of [-1, 1]) {
    const base = [HR * 0.42 * sd, hp[1] + HR * 0.6, hp[2] - HR * 0.2], A = HR * (o.hornLen ?? 1.3);
    b.chain([base, [base[0] + sd * A * 0.45, base[1] + A * 0.4, base[2] - A * 0.35], [base[0] + sd * A * 0.55, base[1] + A * 0.75, base[2] - A * 0.95]], HR * 0.16, HR * 0.02, hc, o.hornGlow);
  }
  if (o.trunk) b.chain([[0, hp[1] - HR * 0.1, hp[2] + HR * 0.8], [0, hp[1] - HR * 0.75, hp[2] + HR * 1.1], [0, hp[1] - HR * 1.5, hp[2] + HR * 1.05],
    [0, hp[1] - HR * 2.1, hp[2] + HR * 1.25]], HR * 0.28, HR * 0.13, c);
  if (o.tusks) for (const sd of [-1, 1]) b.chain([[HR * 0.35 * sd, hp[1] - HR * 0.5, hp[2] + HR * 0.6], [HR * 0.5 * sd, hp[1] - HR * 1.3, hp[2] + HR * 1.3],
    [HR * 0.35 * sd, hp[1] - HR * 1.35, hp[2] + HR * 2.0], [HR * 0.05 * sd, hp[1] - HR * 0.8, hp[2] + HR * 2.35]], HR * 0.14, HR * 0.04, o.tusks);
  if (o.halo) b.g('torus', o.halo, [0, hp[1] + HR * 1.9, hp[2] - HR * 0.2], [HR * 0.7, HR * 0.7, HR * 0.7], [Math.PI / 2, 0, 0]);

  // Legs (diagonal pairs move together)
  const legSet = o.biped ? [[-1, -1, 0], [1, -1, Math.PI]] : [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]];
  for (const [sx, sz, ph] of legSet) {
    b.part('leg', [sx * W * 0.3, LEG, sz * L * 0.31], { phase: ph });
    b.s('sphere', c, [0, -LR * 0.4, 0], [LR * 1.8, LR * 2.4, LR * 2.0]);
    if (o.socks) {
      b.s('leg', c, [0, -LEG * 0.25, 0], [LR, LEG * 0.5, LR]);
      b.s('leg', o.socks, [0, -LEG * 0.72, 0], [LR * 0.8, LEG * 0.5, LR * 0.8]);
    } else b.s('leg', c, [0, -LEG / 2, 0], [LR, LEG, LR]);
    if (o.hooves) b.s('cyl', c3, [0, -LEG + LR * 0.4, 0], [LR * 0.85, LR * 0.8, LR * 0.85]);
    else b.s('sphere', o.socks ?? c3, [0, -LEG + LR * 0.5, LR * 0.35], [LR * 1.15, LR * 0.6, LR * 1.5]);
  }

  // Wings
  if (o.wings) for (const sd of [-1, 1]) wing(b, sd, [sd * W * 0.38, by + BH * 0.38, L * 0.18], o.wings.span, o.wings.c, o.wings.style, o.wings.tip, o.wings.glow);

  // Tail
  const tl = o.tailLen ?? L * 0.4, tc = o.tailC ?? c;
  b.part('tail', [0, by + BH * 0.12, -L * 0.47]);
  if (o.tail === 'bushy') {
    b.s('sphere', tc, [0, tl * 0.25, -tl * 0.5], [tl * 0.26, tl * 0.26, tl * 0.58], [-0.55, 0, 0]);
    if (o.tailTip) b[o.tipGlow ? 'g' : 's']('sphere', o.tailTip, [0, tl * 0.5, -tl * 0.95], [tl * 0.17, tl * 0.17, tl * 0.2], [-0.55, 0, 0]);
  } else if (o.tail === 'squirrel') {
    b.s('sphere', tc, [0, tl * 0.55, -tl * 0.25], [tl * 0.3, tl * 0.62, tl * 0.28], [0.35, 0, 0]);
    b.s('sphere', tc, [0, tl * 1.05, -tl * 0.05], [tl * 0.25, tl * 0.25, tl * 0.3]);
  } else if (o.tail === 'ringed') {
    for (let i = 0; i < 6; i++) b.s('sphere', i % 2 ? '#2a2624' : tc, [0, -tl * 0.05 * i, -tl * (0.12 + i * 0.15)], [tl * 0.2, tl * 0.2, tl * 0.12]);
  } else if (o.tail === 'thin' || o.tail === 'tuft') {
    b.chain([[0, 0, 0], [0, -tl * 0.25, -tl * 0.45], [0, -tl * 0.2, -tl * 0.8], [0, tl * 0.05, -tl * 1.05]], LR * 0.55, LR * 0.35, tc);
    if (o.tail === 'tuft') b.s('sphere', o.tailTip ?? c3, [0, tl * 0.05, -tl * 1.08], [LR * 1.1, LR * 1.4, LR * 1.6]);
  } else if (o.tail === 'horse') {
    b.s('sphere', tc, [0, -tl * 0.35, -tl * 0.3], [tl * 0.16, tl * 0.5, tl * 0.18], [0.5, 0, 0]);
  } else if (o.tail === 'long') {
    const pts = [[0, 0, 0], [0, -tl * 0.1, -tl * 0.35], [0, -tl * 0.1, -tl * 0.7], [0, tl * 0.05, -tl * 1.0]];
    b.chain(pts, W * 0.2, W * 0.03, tc);
    if (o.tailFin) b.s('cone', o.tailFin, [0, tl * 0.08, -tl * 1.05], [W * 0.25, W * 0.5, W * 0.08], [-Math.PI / 2, 0, 0]);
  } else {
    b.s('sphere', o.tailTip ?? tc, [0, BH * 0.05, -BH * 0.05], [BH * 0.17, BH * 0.17, BH * 0.15]);
  }
  if (o.orbs) {
    b.part('orb', [0, by + BH * 1.3, 0]);
    const oc = ['#ff6a1a', '#2a9bff', '#b08a5a', '#e8fbff'];
    oc.forEach((col, i) => { const a = (i / 4) * Math.PI * 2; b.g('sphere', col, [Math.cos(a) * L * 0.45, 0, Math.sin(a) * L * 0.45], L * 0.07); });
  }
  return { by, top: by + BH * 0.5 + Math.sin(na) * NL + HR * 1.2 + (o.horns === 'antlers' ? HR * 2 : 0) };
}

function bird(b, o) {
  const s = o.size, c = o.c, c2 = o.c2 ?? c, legH = 0.28 * s, by = legH + 0.4 * s;
  b.s('sphere', c, [0, by, 0], [0.38 * s, 0.4 * s, 0.6 * s], [-0.35, 0, 0]);
  b.s('sphere', c2, [0, by - 0.06 * s, 0.17 * s], [0.31 * s, 0.34 * s, 0.4 * s], [-0.35, 0, 0]);
  if (o.neckC) b.s('sphere', o.neckC, [0, by + 0.25 * s, 0.28 * s], [0.25 * s, 0.22 * s, 0.22 * s]);
  if (o.stars) spots(b, 12, 0, by, 0, 0.38 * s, 0.4 * s, 0.6 * s, 0.035 * s, o.stars, true, 8);
  for (const sd of [-1, 1]) {
    b.s('cyl', o.legC ?? '#d9a040', [sd * 0.12 * s, legH / 2, 0], [0.025 * s, legH, 0.025 * s]);
    for (const a of [-0.5, 0, 0.5]) b.s('sphere', o.legC ?? '#d9a040', [sd * 0.12 * s + Math.sin(a) * 0.07 * s, 0.012 * s, Math.cos(a) * 0.07 * s], [0.025 * s, 0.015 * s, 0.07 * s], [0, a, 0]);
  }
  b.part('head', [0, by + 0.3 * s, 0.3 * s]);
  const HR = (o.owl ? 0.34 : 0.24) * s, hy = HR * 0.6, hz = o.owl ? 0 : HR * 0.4;
  b.s('sphere', o.headC ?? c, [0, hy, hz], HR);
  if (o.owl) {
    b.s('sphere', o.faceC ?? c2, [0, hy - HR * 0.05, hz + HR * 0.55], [HR * 0.85, HR * 0.75, HR * 0.5]);
    for (const sd of [-1, 1]) {
      b[o.glowEyes ? 'g' : 's']('sphere', o.eyeC ?? '#ffcf2a', [sd * HR * 0.36, hy + HR * 0.08, hz + HR * 0.92], HR * 0.25);
      b.s('sphere', '#0b0b0b', [sd * HR * 0.36, hy + HR * 0.08, hz + HR * 1.1], HR * 0.13);
      b.s('cone', o.headC ?? c, [sd * HR * 0.6, hy + HR * 0.95, hz], [HR * 0.2, HR * 0.5, HR * 0.12], [0, 0, -0.35 * sd]);
    }
    b.s('cone', o.beak ?? '#3a3226', [0, hy - HR * 0.25, hz + HR * 1.02], [HR * 0.12, HR * 0.35, HR * 0.12], [Math.PI / 2 + 0.6, 0, 0]);
  } else {
    b.s('cone', o.beak ?? '#e0b030', [0, hy - HR * 0.1, hz + HR * 1.12], [HR * 0.28, HR * (o.beakLen ?? 0.7), HR * 0.28], [Math.PI / 2 + 0.15, 0, 0]);
    b.eyes(HR * 0.62, hy + HR * 0.2, hz + HR * 0.55, HR * 0.17, o.eyeC ?? '#111111', !!o.glowEyes);
  }
  if (o.crest) for (let i = 0; i < 3; i++) b[o.crestGlow ? 'g' : 's']('sphere', o.crest, [0, hy + HR * (0.9 + i * 0.12), hz - HR * (0.3 + i * 0.35)], [HR * 0.12, HR * 0.5, HR * 0.14], [-0.9 - i * 0.2, 0, 0]);
  if (o.corona) b.g('torus', o.corona, [0, hy + HR * 0.2, hz - HR * 1.1], HR * 1.7, [0, 0, 0]);
  for (const sd of [-1, 1]) wing(b, sd, [sd * 0.3 * s, by + 0.14 * s, 0.1 * s], (o.span ?? 1.1) * s, o.wingC ?? c, 'feather', o.tip, o.tipGlow);
  b.part('tail', [0, by - 0.02 * s, -0.5 * s]);
  if (o.longTail) for (const a of [-0.25, 0, 0.25]) b[o.tailGlow ? 'g' : 's']('sphere', o.longTail, [Math.sin(a) * 0.5 * s, -0.05 * s, -0.75 * s], [0.07 * s, 0.035 * s, 0.85 * s], [0.15, a, 0]);
  b.s('sphere', o.tailC ?? o.wingC ?? c, [0, 0, -0.26 * s], [0.2 * s, 0.04 * s, 0.36 * s], [0.3, 0, 0]);
  return { by, top: by + 0.3 * s + HR * 2.2 };
}

function penguin(b, o) {
  const s = o.size;
  b.s('sphere', '#1b1d24', [0, 0.52 * s, -0.02 * s], [0.3 * s, 0.5 * s, 0.28 * s]);
  b.s('sphere', '#f5f5f0', [0, 0.47 * s, 0.07 * s], [0.25 * s, 0.42 * s, 0.24 * s]);
  b.s('sphere', '#1b1d24', [0, 1.02 * s, 0.01 * s], [0.2 * s, 0.19 * s, 0.2 * s]);
  for (const sd of [-1, 1]) b.s('sphere', '#ffb52a', [sd * 0.13 * s, 0.93 * s, 0.07 * s], [0.06 * s, 0.07 * s, 0.08 * s]);
  b.s('cone', '#ff8a1a', [0, 1.0 * s, 0.25 * s], [0.04 * s, 0.13 * s, 0.035 * s], [Math.PI / 2 + 0.15, 0, 0]);
  b.eyes(0.09 * s, 1.06 * s, 0.17 * s, 0.025 * s);
  for (const sd of [-1, 1]) {
    b.part('flip', [sd * 0.27 * s, 0.75 * s, 0], { side: sd });
    b.s('sphere', '#1b1d24', [sd * 0.03 * s, -0.22 * s, 0], [0.05 * s, 0.26 * s, 0.11 * s], [0, 0, 0.15 * sd]);
    b.part('leg', [sd * 0.12 * s, 0.1 * s, 0.02 * s], { phase: sd > 0 ? 0 : Math.PI });
    b.s('sphere', '#ff8a1a', [0, -0.08 * s, 0.07 * s], [0.08 * s, 0.03 * s, 0.13 * s]);
  }
  return { by: 0.5 * s, top: 1.3 * s };
}

function frog(b, o) {
  const s = o.size, c = o.c, c2 = o.c2 ?? c;
  b.s('sphere', c, [0, 0.28 * s, 0], [0.38 * s, 0.26 * s, 0.45 * s], [-0.25, 0, 0]);
  b.s('sphere', c2, [0, 0.21 * s, 0.08 * s], [0.32 * s, 0.19 * s, 0.38 * s], [-0.25, 0, 0]);
  b.s('sphere', c, [0, 0.36 * s, 0.32 * s], [0.36 * s, 0.2 * s, 0.28 * s]);
  spots(b, 8, 0, 0.3 * s, -0.05 * s, 0.36 * s, 0.25 * s, 0.4 * s, 0.06 * s, o.c3 ?? '#2a5a1a', false, 13);
  for (const sd of [-1, 1]) {
    b.s('sphere', c, [sd * 0.18 * s, 0.5 * s, 0.36 * s], 0.11 * s);
    b.s('sphere', '#f3e06a', [sd * 0.19 * s, 0.52 * s, 0.43 * s], 0.065 * s);
    b.s('sphere', '#0b0b0b', [sd * 0.195 * s, 0.525 * s, 0.48 * s], 0.04 * s);
    b.s('sphere', c, [sd * 0.3 * s, 0.18 * s, -0.15 * s], [0.12 * s, 0.14 * s, 0.26 * s], [0.3, 0, 0]);
    b.s('sphere', c, [sd * 0.38 * s, 0.03 * s, 0.03 * s], [0.1 * s, 0.03 * s, 0.2 * s], [0, -0.3 * sd, 0]);
    b.part('leg', [sd * 0.2 * s, 0.2 * s, 0.3 * s], { phase: 0 });
    b.s('cyl', c, [0, -0.1 * s, 0], [0.04 * s, 0.2 * s, 0.04 * s]);
    b.s('sphere', c, [0, -0.19 * s, 0.04 * s], [0.07 * s, 0.02 * s, 0.08 * s]);
  }
  b.use(0).s('sphere', '#2a3a1a', [0, 0.3 * s, 0.59 * s], [0.22 * s, 0.012 * s, 0.03 * s]);
  return { by: 0.28 * s, top: 0.75 * s };
}

function lizard(b, o) {
  const s = o.size, c = o.c, c2 = o.c2 ?? c, by = 0.26 * s;
  b.s('sphere', c, [0, by, 0], [0.3 * s, 0.19 * s, 0.75 * s]);
  b.s('sphere', c2, [0, by - 0.06 * s, 0.05 * s], [0.25 * s, 0.13 * s, 0.6 * s]);
  if (o.spots) spots(b, 16, 0, by, 0, 0.3 * s, 0.19 * s, 0.75 * s, 0.05 * s, o.spots, o.spotsGlow, 21);
  for (let i = 0; i < 6; i++) b.s('cone', o.c3 ?? c, [0, by + 0.2 * s, -0.4 * s + i * 0.15 * s], [0.04 * s, 0.1 * s, 0.05 * s], [-0.3, 0, 0]);
  b.part('head', [0, by + 0.04 * s, 0.68 * s]);
  b.s('sphere', c, [0, 0, 0.18 * s], [0.2 * s, 0.13 * s, 0.3 * s]);
  b.s('sphere', c2, [0, -0.05 * s, 0.24 * s], [0.17 * s, 0.07 * s, 0.25 * s]);
  b.eyes(0.13 * s, 0.07 * s, 0.26 * s, 0.045 * s, o.eyeC ?? '#111111', !!o.glowEyes);
  for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
    b.part('leg', [sx * 0.25 * s, by, sz * 0.4 * s], { phase: ph });
    b.tube([0, 0, 0], [sx * 0.22 * s, -0.04 * s, 0.02 * s], 0.06 * s, 0.05 * s, c);
    b.tube([sx * 0.22 * s, -0.04 * s, 0.02 * s], [sx * 0.28 * s, -by + 0.02 * s, 0.06 * s], 0.05 * s, 0.035 * s, c);
    b.s('sphere', c, [sx * 0.28 * s, -by + 0.02 * s, 0.1 * s], [0.06 * s, 0.02 * s, 0.08 * s]);
  }
  let parent = 0;
  for (let i = 0; i < 4; i++) {
    const segL = 0.32 * s, r0 = 0.17 * s * (1 - i / 4.5), r1 = 0.17 * s * (1 - (i + 1) / 4.5);
    parent = b.part('seg', i === 0 ? [0, by, -0.68 * s] : [0, 0, -segL], { parent, idx: i });
    b.tube([0, 0, 0], [0, 0, -segL], r0, r1, c);
    if (o.spots && o.spotsGlow) b.g('sphere', o.spots, [0, r0 * 0.75, -segL * 0.5], r0 * 0.35);
  }
  return { by, top: 0.7 * s };
}

function serpent(b, o) {
  const s = o.size, c = o.c, c2 = o.c2 ?? c, r0 = 0.27 * s, segL = 0.55 * s;
  b.s('sphere', c, [0, r0, 0], [r0, r0 * 0.9, r0 * 1.2]);
  const heads = o.heads ?? 1;
  for (let h = 0; h < heads; h++) {
    const yaw = heads > 1 ? (h - 1) * 0.55 : 0;
    b.part('head', [heads > 1 ? (h - 1) * 0.2 * s : 0, r0, 0.1 * s], { idx: h });
    const R = (x, y, z) => [x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw)];
    const hp = R(0, (heads > 1 ? 1.1 : 0.75) * s, 0.5 * s);
    b.chain([[0, 0, 0], R(0, hp[1] * 0.55, 0.38 * s), hp], r0 * 0.9, r0 * 0.6, c);
    b.s('sphere', c, hp, [0.2 * s, 0.15 * s, 0.25 * s], [0, yaw, 0]);
    b.s('sphere', c, R(0, hp[1] - 0.03 * s, 0.68 * s), [0.14 * s, 0.1 * s, 0.2 * s], [0, yaw, 0]);
    for (const sd of [-1, 1]) b[o.glowEyes ? 'g' : 's']('sphere', o.eyeC ?? '#111111', R(sd * 0.13 * s, hp[1] + 0.07 * s, 0.62 * s), 0.04 * s);
    if (o.frill) {
      b.s('cyl', o.frillC ?? c2, R(0, hp[1], 0.32 * s), [0.42 * s, 0.03 * s, 0.42 * s], [Math.PI / 2 - 0.25, yaw, 0]);
      b.g('torus', o.frill, R(0, hp[1], 0.31 * s), 0.43 * s, [-0.25, yaw, 0]);
    }
  }
  if (o.ring) b.g('torus', o.ring, [0, r0, -0.2 * s], [0.75 * s, 0.75 * s, 0.75 * s], [Math.PI / 2 - 0.3, 0, 0]);
  let parent = 0;
  const n = o.segs ?? 7;
  for (let i = 0; i < n; i++) {
    const r = r0 * (1 - (i + 0.5) / (n + 1.5));
    parent = b.part('seg', i === 0 ? [0, r0, -r0 * 0.9] : [0, (r0 - r) * 0.12, -segL], { parent, idx: i });
    b.s('sphere', i % 2 ? c : (o.bandC ?? c), [0, 0, -segL * 0.5], [r, r * 0.88, segL * 0.62]);
    b.s('sphere', c2, [0, -r * 0.3, -segL * 0.5], [r * 0.8, r * 0.6, segL * 0.55]);
    if (o.crystals && i % 2 === 0) b.g('cone', o.crystals, [0, r * 1.1, -segL * 0.5], [r * 0.3, r * 1.1, r * 0.3], [-0.3, 0, 0]);
    if (o.fins && i === 1) for (const sd of [-1, 1]) b.s('sphere', o.fins, [sd * r * 1.2, 0, -segL * 0.4], [r * 1.1, r * 0.08, r * 0.6], [0, -0.5 * sd, 0]);
    if (i === n - 1) b.s('cone', o.tipC ?? c, [0, 0, -segL * 1.1], [r * 0.7, segL * 0.6, r * 0.6], [-Math.PI / 2, 0, 0]);
  }
  return { by: r0, top: (heads > 1 ? 1.4 : 1.1) * s };
}

function turtle(b, o) {
  const s = o.size, c = o.shell, sk = o.skin;
  b.s('sphere', c, [0, 0.32 * s, 0], [0.55 * s, 0.33 * s, 0.65 * s]);
  b.s('sphere', o.rim ?? '#3a3022', [0, 0.24 * s, 0], [0.6 * s, 0.1 * s, 0.7 * s]);
  const R = rnd(31);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI * 2, rr = i === 6 ? 0 : 0.3;
    b.s('sphere', o.scute ?? c, [Math.cos(a) * rr * s, 0.55 * s + (i === 6 ? 0.08 * s : 0), Math.sin(a) * rr * s * 1.1], [0.16 * s, 0.08 * s, 0.17 * s], [Math.sin(a) * rr, 0, -Math.cos(a) * rr]);
  }
  if (o.moss) for (let i = 0; i < 9; i++) {
    const a = R() * 6.28, rr = R() * 0.35;
    b.s('sphere', o.moss, [Math.cos(a) * rr * s, 0.6 * s - rr * 0.3 * s, Math.sin(a) * rr * s], [0.1 * s, 0.07 * s, 0.1 * s]);
    if (i % 3 === 0) b.s('sphere', '#ff8ad8', [Math.cos(a) * rr * s, 0.66 * s - rr * 0.3 * s, Math.sin(a) * rr * s], 0.03 * s);
  }
  if (o.clock) {
    b.g('torus', o.clock, [0, 0.66 * s, 0], 0.28 * s, [Math.PI / 2, 0, 0]);
    b.g('torus', o.clock, [0, 0.47 * s, 0], [0.5 * s, 0.5 * s, 0.5 * s], [Math.PI / 2, 0, 0]);
    b.g('box', o.clock, [0, 0.68 * s, 0.08 * s], [0.025 * s, 0.02 * s, 0.18 * s]);
    b.g('box', o.clock, [0.06 * s, 0.68 * s, 0], [0.13 * s, 0.02 * s, 0.025 * s]);
  }
  b.part('head', [0, 0.28 * s, 0.6 * s]);
  b.tube([0, 0, -0.1 * s], [0, 0.08 * s, 0.18 * s], 0.08 * s, 0.07 * s, sk);
  b.s('sphere', sk, [0, 0.1 * s, 0.26 * s], [0.13 * s, 0.11 * s, 0.16 * s]);
  b.eyes(0.08 * s, 0.14 * s, 0.35 * s, 0.025 * s);
  for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
    b.part('leg', [sx * 0.4 * s, 0.22 * s, sz * 0.4 * s], { phase: ph });
    b.s('leg', sk, [0, -0.1 * s, 0], [0.09 * s, 0.22 * s, 0.09 * s]);
    b.s('sphere', sk, [0, -0.2 * s, 0.03 * s], [0.1 * s, 0.035 * s, 0.12 * s]);
  }
  b.use(0).s('cone', sk, [0, 0.22 * s, -0.7 * s], [0.05 * s, 0.14 * s, 0.04 * s], [-Math.PI / 2, 0, 0]);
  return { by: 0.32 * s, top: 0.8 * s };
}

function crab(b, o) {
  const s = o.size, c = o.c, by = 0.45 * s;
  b.s('sphere', c, [0, by, 0], [0.55 * s, 0.25 * s, 0.42 * s]);
  b.s('sphere', o.c2 ?? c, [0, by - 0.1 * s, 0], [0.45 * s, 0.15 * s, 0.35 * s]);
  spots(b, 8, 0, by, 0, 0.5 * s, 0.24 * s, 0.4 * s, 0.06 * s, o.c3 ?? '#ff7a5a', false, 17);
  for (const sd of [-1, 1]) {
    b.s('cyl', c, [sd * 0.14 * s, by + 0.28 * s, 0.3 * s], [0.025 * s, 0.22 * s, 0.025 * s]);
    b.s('sphere', '#111111', [sd * 0.14 * s, by + 0.4 * s, 0.3 * s], 0.055 * s);
    for (let i = 0; i < 3; i++) {
      b.part('leg', [sd * 0.45 * s, by, (0.14 - i * 0.18) * s], { phase: (i + (sd > 0 ? 1 : 0)) % 2 ? Math.PI : 0 });
      b.tube([0, 0, 0], [sd * 0.32 * s, 0.16 * s, 0], 0.05 * s, 0.04 * s, c);
      b.tube([sd * 0.32 * s, 0.16 * s, 0], [sd * 0.48 * s, -by, (0.05 - i * 0.05) * s], 0.04 * s, 0.015 * s, c);
    }
    b.part('claw', [sd * 0.38 * s, by, 0.28 * s], { side: sd });
    b.tube([0, 0, 0], [sd * 0.22 * s, 0.08 * s, 0.25 * s], 0.07 * s, 0.06 * s, c);
    b.s('sphere', c, [sd * 0.28 * s, 0.1 * s, 0.45 * s], [0.15 * s, 0.11 * s, 0.24 * s]);
    b.s('sphere', c, [sd * 0.3 * s, 0.17 * s, 0.62 * s], [0.06 * s, 0.05 * s, 0.14 * s], [0.3, 0, 0]);
    b.s('cone', o.c3 ?? '#ff7a5a', [sd * 0.26 * s, 0.05 * s, 0.7 * s], [0.05 * s, 0.16 * s, 0.04 * s], [Math.PI / 2, 0, 0]);
  }
  if (o.tentacles) for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.18 * s;
    b.part('tail', [x, by - 0.12 * s, -0.33 * s], { idx: i });
    b.chain([[0, 0, 0], [x * 0.5, -0.2 * s, -0.3 * s], [x * 0.9, -0.32 * s, -0.65 * s], [x * 1.1, -0.15 * s, -0.95 * s], [x * 0.8, 0.05 * s, -1.05 * s]], 0.07 * s, 0.02 * s, o.tentacles);
  }
  return { by, top: by + 0.6 * s };
}

function beetle(b, o) {
  const s = o.size, c = o.c, by = 0.28 * s;
  b.s('sphere', o.c3 ?? '#151520', [0, by - 0.03 * s, 0], [0.28 * s, 0.17 * s, 0.5 * s]);
  for (const sd of [-1, 1]) b.s('sphere', c, [sd * 0.13 * s, by + 0.06 * s, -0.08 * s], [0.18 * s, 0.2 * s, 0.48 * s]);
  b.s('sphere', o.c2 ?? c, [0, by + 0.04 * s, 0.38 * s], [0.24 * s, 0.17 * s, 0.17 * s]);
  b.s('sphere', o.c3 ?? '#151520', [0, by - 0.01 * s, 0.56 * s], 0.12 * s);
  b.s('cone', o.c2 ?? c, [0, by + 0.16 * s, 0.62 * s], [0.06 * s, 0.32 * s, 0.06 * s], [0.75, 0, 0]);
  b.eyes(0.09 * s, by + 0.03 * s, 0.64 * s, 0.03 * s);
  for (const sd of [-1, 1]) b.tube([sd * 0.05 * s, by + 0.04 * s, 0.64 * s], [sd * 0.2 * s, by + 0.25 * s, 0.85 * s], 0.012 * s, 0.008 * s, o.c3 ?? '#151520');
  if (o.crystals) spots(b, 9, 0, by + 0.06 * s, -0.08 * s, 0.28 * s, 0.2 * s, 0.45 * s, 0.07 * s, o.crystals, true, 19, 'cone');
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
    b.part('leg', [sd * 0.2 * s, by - 0.05 * s, (0.28 - i * 0.24) * s], { phase: (i + (sd > 0 ? 1 : 0)) % 2 ? Math.PI : 0 });
    b.tube([0, 0, 0], [sd * 0.16 * s, 0.06 * s, 0], 0.03 * s, 0.025 * s, o.c3 ?? '#151520');
    b.tube([sd * 0.22 * s, 0.06 * s, 0], [sd * 0.27 * s, -by + 0.05 * s, 0.04 * s], 0.025 * s, 0.012 * s, o.c3 ?? '#151520');
  }
  return { by, top: by + 0.55 * s };
}

function whale(b, o) {
  const s = o.size, c = o.c, c2 = o.c2 ?? c, by = 1.1 * s;
  b.s('sphere', c, [0, by, 0], [1.1 * s, 1.0 * s, 3.0 * s]);
  b.s('sphere', c, [0, by, 1.6 * s], [1.05 * s, 0.97 * s, 1.5 * s]);
  b.s('sphere', c2, [0, by - 0.38 * s, 0.6 * s], [0.92 * s, 0.68 * s, 2.5 * s]);
  for (let i = -2; i <= 2; i++) b.s('box', o.c3 ?? '#5a7aa8', [i * 0.18 * s, by - 1.0 * s, 0.9 * s], [0.04 * s, 0.03 * s, 2.2 * s]);
  if (o.spots) spots(b, 14, 0, by, 0, 1.1 * s, 1.0 * s, 3.0 * s, 0.08 * s, o.spots, true, 23);
  b.eyes(0.98 * s, by + 0.02 * s, 2.0 * s, 0.08 * s);
  b.s('box', o.c3 ?? '#5a7aa8', [0, by - 0.35 * s, 2.6 * s], [1.6 * s, 0.03 * s, 0.6 * s]);
  for (const sd of [-1, 1]) {
    b.part('wing', [sd * 0.9 * s, by - 0.4 * s, 1.0 * s], { side: sd });
    b.s('sphere', c, [sd * 0.75 * s, -0.1 * s, -0.15 * s], [0.85 * s, 0.07 * s, 0.32 * s], [0, 0.35 * sd, -0.25 * sd]);
  }
  b.part('fin', [0, by + 0.1 * s, -2.7 * s]);
  b.tube([0, 0, 0.3 * s], [0, 0.1 * s, -1.1 * s], 0.5 * s, 0.18 * s, c);
  for (const sd of [-1, 1]) b.s('sphere', c, [sd * 0.55 * s, 0.12 * s, -1.3 * s], [0.75 * s, 0.06 * s, 0.32 * s], [0, 0.45 * sd, 0]);
  return { by, top: by + 1.4 * s };
}

function dragon(b, o) {
  const r = quad(b, {
    len: o.len, wid: o.len * 0.32, bodyH: o.len * 0.3, leg: o.len * 0.3, legR: o.len * 0.05, head: o.len * 0.13, snout: o.len * 0.16,
    neck: o.len * 0.42, neckAngle: 0.75, neckW: 0.8, c: o.c, c2: o.c2, c3: o.c3 ?? '#221a14', ears: 'none', horns: 'horns', hornLen: 1.6,
    hornC: o.hornC, eyeC: o.eyeC ?? '#ffd23a', glowEyes: true, tail: 'long', tailLen: o.len * 1.0, tailFin: o.wingC, biped: o.biped,
    spikes: { n: 7, h: o.len * 0.09, c: o.spikeC ?? o.hornC ?? '#e8dcc2', glow: o.spikeGlow }, spots: o.spots,
    wings: { span: o.len * 1.05, c: o.wingC, style: 'bat', tip: o.c },
  });
  return r;
}

// ---------- Species ----------
const SPECIES = {
  'Rabbit': { plan: quad, hop: true, scale: 1.4, o: { len: 0.55, wid: 0.36, bodyH: 0.36, leg: 0.16, legR: 0.05, head: 0.16, snout: 0.08, snoutW: 1.3, ears: 'long', ear: 0.28, tail: 'short', tailTip: '#ffffff', c: '#a88a6c', c2: '#efe4d4', c3: '#d9c8b0' } },
  'Squirrel': { plan: quad, hop: true, scale: 1.5, o: { len: 0.46, wid: 0.26, bodyH: 0.26, leg: 0.14, legR: 0.04, head: 0.13, snout: 0.07, ears: 'tuft', ear: 0.08, tail: 'squirrel', tailLen: 0.5, c: '#b8582a', c2: '#f3dcb8', c3: '#6a3a1a' } },
  'Frog': { plan: frog, hop: true, scale: 1.4, o: { size: 0.55, c: '#4caf3a', c2: '#d8e88a' } },
  'Pigeon': { plan: bird, speed: 0.7, peck: true, scale: 1.4, o: { size: 0.36, c: '#8c93a3', c2: '#a7adbb', neckC: '#4f8a80', wingC: '#7d8495', tip: '#3a3e48', beak: '#d8b9a6', legC: '#d0606a', beakLen: 0.45 } },
  'Fox': { plan: quad, o: { len: 0.9, wid: 0.34, bodyH: 0.34, leg: 0.34, legR: 0.045, head: 0.17, snout: 0.24, snoutW: 0.75, ears: 'pointy', ear: 0.14, tail: 'bushy', tailLen: 0.62, tailTip: '#ffffff', c: '#dd6a1e', c2: '#f6efe2', snoutC: '#f6efe2', socks: '#2a1a12' } },
  'Deer': { plan: quad, o: { len: 1.2, wid: 0.44, bodyH: 0.5, leg: 0.8, legR: 0.05, head: 0.16, snout: 0.22, snoutW: 0.8, neck: 0.5, neckAngle: 1.1, ears: 'side', ear: 0.14, horns: 'antlers', hornC: '#e3d2ad', tail: 'short', tailTip: '#ffffff', hooves: true, c: '#a0683a', c2: '#efe2cc', c3: '#2a1d12', spots: { c: '#efe2cc', n: 10, size: 0.05 } } },
  'Raccoon': { plan: quad, o: { len: 0.72, wid: 0.42, bodyH: 0.38, leg: 0.22, legR: 0.05, head: 0.18, snout: 0.13, snoutC: '#e9e4de', ears: 'round', ear: 0.12, mask: '#1b1b1b', tail: 'ringed', tailLen: 0.5, tailC: '#8a8580', c: '#7d7a78', c2: '#cfc9c2', c3: '#222222' } },
  'Penguin': { plan: penguin, waddle: true, speed: 0.7, scale: 1.2, o: { size: 0.75 } },
  'Wolf': { plan: quad, o: { len: 1.25, wid: 0.42, bodyH: 0.46, leg: 0.55, legR: 0.06, head: 0.2, snout: 0.26, snoutW: 0.8, ears: 'pointy', ear: 0.16, tail: 'bushy', tailLen: 0.6, c: '#7c8088', c2: '#dcdcd8', snoutC: '#c9c9c4', c3: '#3a3a3e' } },
  'Snow Owl': { plan: bird, flyer: true, perch: true, o: { size: 0.55, owl: true, c: '#f4f6fa', c2: '#ffffff', wingC: '#eef1f6', tip: '#5a5a62', tailC: '#e6e9ee', stars: null } },
  'Lynx': { plan: quad, o: { len: 0.95, wid: 0.38, bodyH: 0.4, leg: 0.46, legR: 0.06, head: 0.19, snout: 0.1, snoutW: 1.2, ears: 'tuft', ear: 0.15, tail: 'short', tailTip: '#1a1412', c: '#c9a477', c2: '#efe2cc', snoutC: '#efe2cc', spots: { c: '#6a4a2a', n: 18, size: 0.04 } } },
  'Crystal Beetle': { plan: beetle, speed: 0.9, scale: 1.25, o: { size: 0.85, c: '#25356a', c2: '#3a4f9a', c3: '#121626', crystals: '#5ff3ff' } },
  'Polar Bear': { plan: quad, heavy: true, o: { len: 1.8, wid: 0.9, bodyH: 0.88, leg: 0.6, legR: 0.14, head: 0.3, snout: 0.26, ears: 'round', ear: 0.12, tail: 'short', c: '#f2f1ec', c2: '#e6e3d8', c3: '#2a2a2a' } },
  'Lava Lizard': { plan: lizard, speed: 1.4, o: { size: 1.5, c: '#2b1e1a', c2: '#4a2a1e', c3: '#ff5a10', spots: '#ff6a10', spotsGlow: true, eyeC: '#ffd23a', glowEyes: true } },
  'Thunder Hawk': { plan: bird, flyer: true, perch: true, o: { size: 0.75, c: '#34458a', c2: '#f2e6a0', wingC: '#2c3a78', tip: '#9fe8ff', tipGlow: true, crest: '#9fe8ff', crestGlow: true, beak: '#ffd23a', eyeC: '#9fe8ff', glowEyes: true } },
  'Moss Turtle': { plan: turtle, speed: 0.5, o: { size: 1.25, shell: '#5a6b3a', scute: '#6a7a42', moss: '#6fae3a', skin: '#7a8a55' } },
  'Frost Wolf': { plan: quad, o: { len: 1.55, wid: 0.5, bodyH: 0.56, leg: 0.68, legR: 0.075, head: 0.25, snout: 0.32, snoutW: 0.8, ears: 'pointy', ear: 0.2, tail: 'bushy', tailLen: 0.75, tailTip: '#9fe8ff', tipGlow: true, c: '#e2efff', c2: '#ffffff', c3: '#8fb6d8', eyeC: '#7fe6ff', glowEyes: true, spikes: { n: 6, h: 0.22, c: '#8fe3ff', glow: true } } },
  'Fire Fox': { plan: quad, o: { len: 1.15, wid: 0.42, bodyH: 0.42, leg: 0.42, legR: 0.055, head: 0.21, snout: 0.3, snoutW: 0.75, ears: 'pointy', ear: 0.18, earC: '#2a0a04', tail: 'bushy', tailLen: 0.85, tailTip: '#ffb000', tipGlow: true, c: '#ff4a12', c2: '#ffd27a', snoutC: '#ffd27a', socks: '#2a0a04', eyeC: '#ffe14a', glowEyes: true, stripes: '#ffb000' } },
  'Griffin': { plan: quad, flyer: true, perch: true, flyH: 3.5, o: { len: 1.6, wid: 0.6, bodyH: 0.62, leg: 0.66, legR: 0.08, head: 0.26, beak: '#ffc02a', headC: '#f4f1ea', ears: 'pointy', ear: 0.14, earC: '#f4f1ea', tail: 'tuft', tailLen: 0.8, c: '#c99a4e', c2: '#e6c88a', c3: '#ffc02a', wings: { span: 1.9, c: '#8a5a2a', tip: '#f4f1ea' }, mane: '#f4f1ea' } },
  'Glacier Mammoth': { plan: quad, heavy: true, speed: 1.0, o: { len: 2.6, wid: 1.4, bodyH: 1.5, leg: 1.1, legR: 0.24, head: 0.55, snout: 0, ears: 'round', ear: 0.35, trunk: true, tusks: '#f3f8ff', hump: true, tail: 'short', c: '#8fb0c6', c2: '#d8ecf8', c3: '#3a4a5a', crystals: '#9fe9ff' } },
  'Phoenix': { plan: bird, flyer: true, perch: true, o: { size: 1.0, c: '#ff4a1a', c2: '#ffb02e', headC: '#ff6a1a', wingC: '#ff3a10', tip: '#ffd23a', tipGlow: true, crest: '#ffd23a', crestGlow: true, longTail: '#ffb02e', tailGlow: true, beak: '#ffe08a', eyeC: '#fff2a0', glowEyes: true, span: 1.4 } },
  'Unicorn': { plan: quad, o: { len: 1.6, wid: 0.55, bodyH: 0.66, leg: 0.95, legR: 0.07, head: 0.22, snout: 0.38, snoutW: 0.8, neck: 0.62, neckAngle: 1.0, neckW: 1.5, ears: 'pointy', ear: 0.13, horns: 'unicorn', hornC: '#ffe9a8', horseMane: '#ff9be8', tail: 'horse', tailLen: 0.9, tailC: '#b48cff', hooves: true, c: '#fbf8ff', c2: '#f3eeff', c3: '#c9b6ff' } },
  'Shadow Stag': { plan: quad, o: { len: 1.6, wid: 0.56, bodyH: 0.64, leg: 1.0, legR: 0.065, head: 0.21, snout: 0.28, snoutW: 0.8, neck: 0.62, neckAngle: 1.1, ears: 'side', ear: 0.17, horns: 'antlers', hornC: '#b46bff', hornGlow: true, tail: 'short', hooves: true, c: '#2a2238', c2: '#4a3a60', c3: '#100c16', eyeC: '#d08cff', glowEyes: true, runes: '#a05cff' } },
  'Kraken Crab': { plan: crab, speed: 0.8, o: { size: 1.5, c: '#c4302b', c2: '#e86a50', c3: '#ffb08a', tentacles: '#7a2a8a' } },
  'Golden Dragon': { plan: dragon, flyer: true, flyH: 7, speed: 4, o: { len: 2.6, c: '#e8b23a', c2: '#fff1b0', wingC: '#c47f1a', hornC: '#fff6d5' } },
  'Storm Lion': { plan: quad, heavy: true, o: { len: 1.9, wid: 0.7, bodyH: 0.74, leg: 0.8, legR: 0.1, head: 0.32, snout: 0.2, snoutW: 1.1, ears: 'round', ear: 0.12, mane: '#2a3f7a', maneGlow: '#7fd8ff', tail: 'tuft', tailLen: 0.9, tailTip: '#2a3f7a', c: '#d9b26a', c2: '#f2dcae', snoutC: '#f2dcae', eyeC: '#7fd8ff', glowEyes: true, stripes: '#7fd8ff' } },
  'Sun Serpent': { plan: serpent, speed: 1.3, o: { size: 1.5, c: '#f2a81e', c2: '#fff1a0', bandC: '#d9801a', frill: '#ffcf3a', frillC: '#ff9a1a', eyeC: '#ff4a1a', glowEyes: true } },
  'Titan Bear': { plan: quad, heavy: true, speed: 1.1, o: { len: 2.7, wid: 1.35, bodyH: 1.3, leg: 0.95, legR: 0.22, head: 0.46, snout: 0.32, ears: 'round', ear: 0.16, tail: 'short', c: '#5a3a22', c2: '#8a6a4a', c3: '#2a1a10', plates: '#7a7a82', runes: '#7cffb0', eyeC: '#7cffb0', glowEyes: true } },
  'Inferno Wyvern': { plan: dragon, flyer: true, flyH: 7, speed: 4, o: { len: 2.8, c: '#3a1210', c2: '#ff6a1a', wingC: '#5a1a10', hornC: '#2a0a08', spikeC: '#ff5a0a', spikeGlow: true, biped: true, spots: { c: '#ff5a0a', glow: true, n: 14, size: 0.08 } } },
  'Angel Stag': { plan: quad, flyer: true, perch: true, flyH: 3, o: { len: 1.7, wid: 0.58, bodyH: 0.66, leg: 1.05, legR: 0.07, head: 0.22, snout: 0.28, snoutW: 0.8, neck: 0.62, neckAngle: 1.1, ears: 'side', ear: 0.17, horns: 'antlers', hornC: '#ffe9a0', hornGlow: true, tail: 'short', hooves: true, c: '#f8f6ff', c2: '#ffffff', c3: '#d8c27a', halo: '#ffe9a0', wings: { span: 2.0, c: '#ffffff', tip: '#ffe9a0' } } },
  'Sky Whale': { plan: whale, flyer: true, flyH: 11, speed: 2.5, o: { size: 1.1, c: '#7fa9d8', c2: '#eef6ff', c3: '#5a7aa8', spots: '#bff3ff' } },
  'Magma Behemoth': { plan: quad, heavy: true, speed: 0.9, o: { len: 2.9, wid: 1.6, bodyH: 1.55, leg: 1.0, legR: 0.3, head: 0.6, snout: 0.3, snoutW: 1.2, ears: 'none', horns: 'horns', hornLen: 1.8, hornC: '#1a1412', tail: 'long', tailLen: 1.4, c: '#2a221f', c2: '#3a2a22', c3: '#120e0c', eyeC: '#ffb000', glowEyes: true, spots: { c: '#ff5a00', glow: true, n: 22, size: 0.14 }, spikes: { n: 6, h: 0.5, c: '#1a1412' } } },
  'Galaxy Dragon': { plan: dragon, flyer: true, flyH: 8, speed: 4, o: { len: 2.8, c: '#1a1a4a', c2: '#5a3aa0', wingC: '#2a1a6a', hornC: '#cfe0ff', spikeC: '#cfe0ff', spikeGlow: true, eyeC: '#cfe0ff', spots: { c: '#e0e8ff', glow: true, n: 26, size: 0.05 } } },
  'Cosmic Owl': { plan: bird, flyer: true, perch: true, o: { size: 0.9, owl: true, c: '#1c1f4a', c2: '#3a2f7a', faceC: '#2a2a6a', wingC: '#232660', tip: '#cfe0ff', tipGlow: true, stars: '#ffffff', eyeC: '#ffe36a', glowEyes: true } },
  'Time Turtle': { plan: turtle, speed: 0.5, o: { size: 1.7, shell: '#2f4a6a', scute: '#3a5a80', skin: '#6a8aa0', rim: '#1a2a3a', clock: '#9fe6ff' } },
  'Prism Leviathan': { plan: serpent, flyer: true, flyH: 5, speed: 3, o: { size: 1.7, c: '#bfe7ff', c2: '#ffffff', bandC: '#d8c8ff', crystals: '#c9a8ff', fins: '#e8f6ff', eyeC: '#ff8af0', glowEyes: true, segs: 8 } },
  'Void Wolf': { plan: quad, o: { len: 1.7, wid: 0.55, bodyH: 0.6, leg: 0.72, legR: 0.08, head: 0.27, snout: 0.34, snoutW: 0.8, ears: 'pointy', ear: 0.22, tail: 'bushy', tailLen: 0.8, tailTip: '#b04bff', tipGlow: true, c: '#141019', c2: '#201a28', c3: '#0a080c', eyeC: '#c04bff', glowEyes: true, runes: '#8a3bff' } },
  'Eclipse Phoenix': { plan: bird, flyer: true, perch: true, o: { size: 1.1, c: '#0e0b14', c2: '#1a1424', wingC: '#120e1a', tip: '#ffcf6a', tipGlow: true, corona: '#ffcf6a', longTail: '#ff9a3a', tailGlow: true, crest: '#ff9a3a', crestGlow: true, eyeC: '#ffcf6a', glowEyes: true, span: 1.45 } },
  'Black Hole Hydra': { plan: serpent, speed: 1.2, o: { size: 1.7, heads: 3, c: '#18121f', c2: '#2a1f36', ring: '#ff8a3a', eyeC: '#b05cff', glowEyes: true } },
  'Glitch Cat': { plan: quad, glitch: true, o: { len: 0.85, wid: 0.32, bodyH: 0.32, leg: 0.32, legR: 0.045, head: 0.18, snout: 0.07, snoutW: 1.2, ears: 'pointy', ear: 0.13, tail: 'thin', tailLen: 0.7, c: '#2a2a2e', c2: '#3a3a40', eyeC: '#2bf3ff', glowEyes: true, stripes: '#ff2bd6', runes: '#2bf3ff' } },
  'The Absolute Beast': { plan: quad, o: { len: 2.3, wid: 0.7, bodyH: 0.7, leg: 0.8, legR: 0.09, head: 0.3, snout: 0.16, snoutW: 1.1, ears: 'round', ear: 0.12, tail: 'thin', tailLen: 1.3, c: '#e8f4ff', c2: '#ffffff', eyeC: '#9ff3ff', glowEyes: true, orbs: true } },
};
const PLANS = { THREE, mergeGeometries, G, taper, wingShape, piece, Builder, rnd, spots, wing, quad, bird, penguin, frog, lizard, serpent, turtle, crab, beetle, whale, dragon };
Object.assign(SPECIES, lowSpecies(PLANS), highSpecies(PLANS));
const SPECIES_INFO = {};
for (const [rar, list] of Object.entries(ANIMALS)) for (const a of list) SPECIES_INFO[a.name] = { ...a, rarity: rar };

// Build each species once (geometry shared by every instance)
const templates = new Map();
function getTemplate(name) {
  if (templates.has(name)) return templates.get(name);
  const sp = SPECIES[name], b = new Builder();
  const info = sp.plan(b, sp.o), k = sp.scale ?? 1;
  if (k !== 1) { // small animals are a bit oversized so they're easy to spot
    for (const p of b.parts) { p.pivot = p.pivot.map((v) => v * k); for (const g of [...p.solid, ...p.glow]) g.scale(k, k, k); }
    info.by *= k; info.top *= k;
  }
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  const parts = b.parts.map((p) => ({
    type: p.type, pivot: p.pivot, parent: p.parent, side: p.side, phase: p.phase, idx: p.idx,
    solid: p.solid.length ? mergeGeometries(p.solid) : null, glow: p.glow.length ? mergeGeometries(p.glow) : null,
  }));
  parts.forEach((p, i) => { // rough bounds with accumulated pivots (wings excluded)
    if (p.type === 'wing') return;
    const off = new THREE.Vector3();
    for (let j = i; j >= 0; j = parts[j].parent) off.add(new THREE.Vector3(...parts[j].pivot));
    for (const g of [p.solid, p.glow]) if (g) { g.computeBoundingBox(); tmp.copy(g.boundingBox).translate(off); box.union(tmp); }
  });
  const size = box.getSize(new THREE.Vector3());
  const tpl = { name, sp, parts, by: info.by, top: Math.max(info.top, box.max.y), centerY: (box.min.y + box.max.y) / 2,
    radius: Math.max(0.35, Math.max(size.x, size.y, size.z) * 0.42), length: size.z };
  templates.set(name, tpl);
  return tpl;
}

// ---------- Rarity visuals ----------
const U_TIME = { value: 0 }, U_SCALE = { value: 600 };
const HUE = 'vec3 hue3(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }\n';
const TINT = {
  gold: 'float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = vec3(1.0, 0.62, 0.16) * (0.25 + 1.1 * sqrt(lum));',
  black: 'diffuseColor.rgb = diffuseColor.rgb * 0.05 + vec3(0.012, 0.01, 0.016);',
  rainbow: 'vec3 rb = hue3(fract(uTime * 0.25 + (vViewPosition.x + vViewPosition.y) * 0.12)); diffuseColor.rgb = mix(diffuseColor.rgb, rb, 0.55);',
  ghost: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.92, 1.0), 0.5);',
};
const matCache = {};
function rarityMats(rarity) {
  if (matCache[rarity]) return matCache[rarity];
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4) });
  const tint = { Godly: 'gold', 'The Next Level': 'black', Infinite: 'rainbow', 'Ancient Legend': 'ghost' }[rarity];
  if (tint) {
    solid.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U_TIME;
      sh.fragmentShader = 'uniform float uTime;\n' + HUE + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + TINT[tint]);
      if (tint === 'rainbow') sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += rb * 0.35;');
    };
    solid.customProgramCacheKey = () => 'tint-' + tint;
  }
  if (rarity === 'Godly') { solid.metalness = 0.75; solid.roughness = 0.28; solid.emissive.setRGB(0.08, 0.045, 0.0); }
  if (rarity === 'The Next Level') { solid.roughness = 0.35; solid.metalness = 0.3; }
  if (rarity === 'Divine') solid.emissive.setRGB(0.05, 0.015, 0.0);
  if (rarity === 'Ancient Legend') {
    solid.transparent = glow.transparent = true; solid.opacity = 0.45; glow.opacity = 0.85; solid.depthWrite = false;
    solid.emissive.setRGB(0.05, 0.12, 0.16);
  }
  return (matCache[rarity] = { solid, glow });
}

// Glowing ring on the ground in the rarity colour
const ringGeo = new THREE.PlaneGeometry(1, 1);
const ringMats = {};
function ringMat(rarity) {
  if (ringMats[rarity]) return ringMats[rarity];
  const r = RARITY[rarity], mode = rarity === 'Infinite' ? 1 : rarity === 'The Next Level' ? 2 : 0;
  const strength = [0.5, 0.9, 1.1, 1.3, 1.5, 1.7, 1.9, 2.1, 1.6, 1, 1.4][r.index];
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U_TIME, uColor: { value: new THREE.Color(r.color).multiplyScalar(strength) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: HUE + `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 d = vUv - 0.5; float r = length(d) * 2.0;
        float ring = smoothstep(0.6, 0.8, r) * (1.0 - smoothstep(0.84, 1.0, r));
        float a = (ring + (1.0 - smoothstep(0.0, 0.85, r)) * 0.22) * (0.8 + 0.2 * sin(uTime * 3.0));
        vec3 col = uColor;
        ${mode === 1 ? 'col = hue3(fract(atan(d.y, d.x + 1e-4) / 6.2832 + uTime * 0.2)) * 1.6;' : ''}
        ${mode === 2 ? 'gl_FragColor = vec4(0.03, 0.0, 0.06, a * 0.9); return;' : ''}
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: mode === 2 ? THREE.NormalBlending : THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return (ringMats[rarity] = m);
}

// Particle effects: 0 sparkles, 1 flames, 2 rainbow sparkles, 3 dark wisps
const fxGeo = (() => {
  const n = 56, pos = new Float32Array(n * 3), rr = new Float32Array(n * 4), R = rnd(99);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, y = R() * 2 - 1, r = Math.sqrt(1 - y * y) * (0.6 + R() * 0.4);
    pos.set([Math.cos(a) * r, y * 0.8, Math.sin(a) * r], i * 3); rr.set([R(), R(), R(), R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(rr, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 2.5);
  return g;
})();
const fxMats = {};
function fxMat(mode, color) {
  const key = mode + color;
  if (fxMats[key]) return fxMats[key];
  return (fxMats[key] = new THREE.ShaderMaterial({
    uniforms: { uTime: U_TIME, uScale: U_SCALE, uColor: { value: new THREE.Color(color) } },
    defines: { MODE: mode },
    vertexShader: HUE + `attribute vec4 aR; uniform float uTime; uniform float uScale; uniform vec3 uColor; varying vec3 vC; varying float vA;
      void main(){
        float sc = length(modelMatrix[0].xyz);
        float life = fract(aR.x + uTime * (0.3 + 0.4 * aR.y));
        vec3 p = position; float size;
        #if MODE == 1
          p.xz *= 0.85 * (1.0 - life * 0.6); p.y = p.y * 0.5 - 0.3 + life * 1.3;
          vC = mix(vec3(3.6, 2.6, 1.0), vec3(3.0, 0.5, 0.05), smoothstep(0.0, 0.55, life));
          vA = sin(life * 3.1416); size = mix(0.34, 0.08, life);
        #elif MODE == 3
          p.xz *= 0.9 + life * 0.5; p.y = p.y * 0.5 - 0.2 + life * 1.4;
          vC = mix(vec3(0.06, 0.0, 0.12), vec3(0.0), life); vA = sin(life * 3.1416) * 0.6; size = mix(0.25, 0.55, life);
        #else
          float a = uTime * (0.3 + aR.z * 0.6) + aR.w * 6.2832, rr = length(p.xz) * 1.15;
          p = vec3(cos(a) * rr, p.y + sin(uTime * 1.5 + aR.w * 6.0) * 0.12, sin(a) * rr);
          vA = pow(max(0.5 + 0.5 * sin(uTime * (2.5 + aR.y * 4.0) + aR.x * 40.0), 0.0), 3.0);
          #if MODE == 2
            vC = hue3(fract(aR.x + uTime * 0.3)) * 2.6;
          #else
            vC = uColor * 2.6;
          #endif
          size = 0.14;
        #endif
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * sc * uScale / max(-mv.z, 0.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
        #if MODE == 1
          r = length(vec2(d.x * 2.2, d.y * 1.2 - 0.12)) * 2.0; // teardrop flame
        #endif
        float a = (1.0 - smoothstep(0.0, 1.0, r)) * vA;
        #if MODE == 0 || MODE == 2
          float star = max(0.0, 1.0 - abs(d.x * d.y) * 80.0) * (1.0 - smoothstep(0.5, 1.0, r));
          a = max(a * 0.5, star * vA);
        #endif
        #if MODE == 3
          gl_FragColor = vec4(vC, a * 0.7);
        #else
          gl_FragColor = vec4(vC * a, a);
        #endif
      }`,
    transparent: true, depthWrite: false, blending: mode === 3 ? THREE.NormalBlending : THREE.AdditiveBlending,
  }));
}

// Floating name + rarity label (canvas sprite, cached per species+rarity)
const labelCache = {};
function labelMat(name, rarity) {
  const key = name + '|' + rarity;
  if (labelCache[key]) return labelCache[key];
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const g = cv.getContext('2d'), r = RARITY[rarity];
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const fill = (y, h) => {
    if (rarity === 'Infinite') { const gr = g.createLinearGradient(60, 0, 452, 0); ['#ff4a4a', '#ffb02e', '#fff23a', '#4aff6a', '#3ad8ff', '#6a5cff', '#ff4ae0'].forEach((c, i) => gr.addColorStop(i / 6, c)); return gr; }
    if (rarity === 'Divine') { const gr = g.createLinearGradient(0, y - h, 0, y + h); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(0.5, '#ffa21a'); gr.addColorStop(1, '#ff3a0a'); return gr; }
    if (rarity === 'Godly') { const gr = g.createLinearGradient(0, y - h, 0, y + h); gr.addColorStop(0, '#fff6c0'); gr.addColorStop(0.5, '#ffc22a'); gr.addColorStop(1, '#b86a00'); return gr; }
    return r.color;
  };
  const dark = rarity === 'The Next Level';
  const line = (text, y, px, font) => {
    g.font = `${px}px ${font}`;
    g.lineWidth = px * 0.22; g.strokeStyle = dark ? '#b98cff' : 'rgba(0,0,0,0.85)';
    if (dark) { g.shadowColor = '#a050ff'; g.shadowBlur = 16; }
    g.strokeText(text, 256, y); g.shadowBlur = 0;
    g.fillStyle = fill(y, px / 2); g.fillText(text, 256, y);
  };
  line(name, 56, 58, '"Lilita One", system-ui, sans-serif');
  line(rarity, 118, 38, '"Nunito", system-ui, sans-serif');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (labelCache[key] = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: rarity === 'Ancient Legend' ? 0.8 : 1 }));
}

// ---------- Manager ----------
const V = FEATURES.volcano, CV = FEATURES.cave;
const MAX_ALIVE = 60, SPAWN_EVERY = 5, MIN_D = 40, MAX_D = 250, DESPAWN_D = 380, VIS_D = 230, LABEL_D = 75;

export function createAnimals(scene, world, { onSpawn } = {}) {
  const qs = new URLSearchParams(location.search);
  const forced = (() => {
    const q = (qs.get('rarity') || '').toLowerCase();
    return Object.keys(RARITY).find((r) => r.toLowerCase() === q) || null;
  })();
  const list = [];
  let spawnTimer = 0, started = false, uid = 0;

  const lavaAt = (x, z) => {
    const ix = clamp(Math.round((x + world.half) / world.cell), 0, world.N - 1), iz = clamp(Math.round((z + world.half) / world.cell), 0, world.N - 1);
    return world.lava[iz * world.N + ix];
  };
  function validGround(x, z) {
    if (world.heightAt(x, z) < 1.3) return false; // water + wet sand
    if (Math.hypot(x, z) > ISLAND_R + 120) return false;
    if (Math.hypot(x - V.x, z - V.z) < V.crater * 1.25) return false; // lava lake
    if (lavaAt(x, z) > 0.2) return false; // lava rivers
    if (Math.hypot(x - CV.x, z - CV.z) < CV.r + 8) return false; // cave
    return true;
  }
  const biomeAt = (x, z) => {
    const zone = world.zoneAt(x, z, false);
    return zone === FEATURES.ice.name ? 'ice' : zone === FEATURES.volcano.name ? 'volcano' : null;
  };
  function pickSpecies(rarity, biome) {
    const opts = ANIMALS[rarity].map((a) => {
      let w = 1;
      if (a.biome) w = a.biome === biome ? 6 : biome ? 0 : 0.15;
      return [a.name, w];
    });
    let sum = opts.reduce((s, o) => s + o[1], 0);
    if (sum <= 0) return null;
    let r = Math.random() * sum;
    for (const [n, w] of opts) if ((r -= w) < 0) return n;
    return opts[0][0];
  }

  function create(name, rarity, x, z, frozen = false) {
    const tpl = getTemplate(name), sp = tpl.sp, mats = rarityMats(rarity);
    const root = new THREE.Group(), model = new THREE.Group();
    root.add(model);
    const objs = tpl.parts.map((p) => {
      const g = new THREE.Group(); g.position.fromArray(p.pivot);
      if (p.solid) { const m = new THREE.Mesh(p.solid, mats.solid); m.castShadow = true; g.add(m); }
      if (p.glow) g.add(new THREE.Mesh(p.glow, mats.glow));
      return g;
    });
    tpl.parts.forEach((p, i) => (p.parent < 0 ? model : objs[p.parent]).add(objs[i]));
    const ri = RARITY[rarity].index;
    // Ground ring
    const ring = new THREE.Mesh(ringGeo, ringMat(rarity));
    ring.scale.setScalar(Math.max(1.2, tpl.radius * 2.6)); ring.renderOrder = 1;
    scene.add(ring);
    // Particles / aura for the rare ones
    if (ri >= 4) {
      const mode = rarity === 'Divine' ? 1 : rarity === 'Infinite' ? 2 : rarity === 'The Next Level' ? 3 : 0;
      const fx = new THREE.Points(fxGeo, fxMat(mode, RARITY[rarity].color));
      fx.scale.setScalar(tpl.radius * 1.3); fx.position.y = tpl.centerY; fx.renderOrder = 3;
      model.add(fx);
      if (mode === 3) { // dark aura: smoky wisps + purple sparks
        const sparks = new THREE.Points(fxGeo, fxMat(0, '#9a40ff'));
        sparks.scale.copy(fx.scale); sparks.position.y = tpl.centerY; sparks.renderOrder = 3;
        model.add(sparks);
      }
    }
    const label = new THREE.Sprite(labelMat(name, rarity));
    label.center.set(0.5, 0); label.renderOrder = 5;
    root.add(label);
    scene.add(root);
    const a = {
      id: ++uid, name, rarity, info: SPECIES_INFO[name], tpl, sp, root, model, objs, ring, label,
      pos: new THREE.Vector3(x, world.heightAt(x, z), z), home: new THREE.Vector2(x, z), heading: Math.random() * Math.PI * 2,
      state: 'idle', timer: 1 + Math.random() * 3, target: new THREE.Vector2(x, z), phase: Math.random() * 10, move: 0,
      alt: sp.flyer && !sp.perch ? sp.flyH ?? 4 : 0, seed: Math.random() * 100, born: performance.now(),
      captured: false, frozen, radius: tpl.radius, visible: true,
    };
    list.push(a);
    return a;
  }

  function remove(a) {
    const i = list.indexOf(a); if (i >= 0) list.splice(i, 1);
    scene.remove(a.root); scene.remove(a.ring);
  }

  function spawnNear(p, rarity = forced || rollRarity()) {
    if (rarity === 'Ancient Legend' && !forced) return null;
    for (let t = 0; t < 40; t++) {
      const ang = Math.random() * Math.PI * 2, d = MIN_D + Math.random() * (MAX_D - MIN_D);
      const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
      if (!validGround(x, z)) continue;
      const name = pickSpecies(rarity, biomeAt(x, z));
      if (!name) continue;
      const a = create(name, rarity, x, z);
      onSpawn?.(a);
      return a;
    }
    return null;
  }

  // ?zoo lines up every species next to the player (for looking at the models)
  function zoo(p) { // one row (of up to 10) per rarity, Common nearest
    const byRarity = {};
    for (const n of Object.keys(SPECIES)) (byRarity[SPECIES_INFO[n]?.rarity] ??= []).push(n);
    const blocked = (x, z) => [FEATURES.market, FEATURES.cubeShop].some((s) => s && Math.hypot(x - s.x, z - s.z) < 6.5); // skip the shop stalls
    let row = 0;
    for (const r of Object.keys(RARITY)) {
      const names = byRarity[r] ?? [];
      for (let k = 0; k < names.length; k += 10, row++) {
        let col = 0;
        for (const n of names.slice(k, k + 10)) {
          const z = p.z - 8 - row * 7;
          while (blocked(p.x - 27 + col * 6, z)) col++;
          const a = create(n, forced || r, p.x - 27 + col * 6, z, true);
          a.heading = 0; a.alt = 0; col++;
        }
      }
    }
  }

  function pickTarget(a) {
    const range = a.sp.flyer ? 45 : a.sp.heavy ? 25 : 30;
    for (let t = 0; t < 8; t++) {
      const ang = Math.random() * Math.PI * 2, d = 6 + Math.random() * range;
      const x = a.home.x + Math.cos(ang) * d, z = a.home.y + Math.sin(ang) * d;
      if (validGround(x, z)) { a.target.set(x, z); return true; }
    }
    return false;
  }

  function think(a, dt) {
    const sp = a.sp;
    a.timer -= dt;
    if (a.state === 'idle') {
      a.move = lerp(a.move, 0, 1 - Math.exp(-6 * dt));
      if (a.timer <= 0) {
        if (pickTarget(a)) { a.state = 'walk'; a.timer = 25; } else a.timer = 2;
      }
    } else {
      const dx = a.target.x - a.pos.x, dz = a.target.y - a.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 1 || a.timer <= 0) { a.state = 'idle'; a.timer = 2 + Math.random() * 6; return; }
      const want = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading));
      a.heading += clamp(diff, -2.2 * dt, 2.2 * dt);
      const facing = Math.abs(diff) < 0.9 ? 1 : 0.2;
      a.move = lerp(a.move, facing, 1 - Math.exp(-4 * dt));
      let speed = sp.flyer && a.alt > 1 ? (sp.speed ?? 3.5) : sp.speed ?? clamp((sp.o.leg ?? 0.3) * 2.4, 0.9, 2.6);
      if (sp.hop) speed = 2.2 * Math.max(0, Math.sin(a.phase));
      const nx = a.pos.x + Math.sin(a.heading) * speed * a.move * dt, nz = a.pos.z + Math.cos(a.heading) * speed * a.move * dt;
      if (sp.flyer && a.alt > 1 ? world.heightAt(nx, nz) > -0.5 : validGround(nx, nz)) { a.pos.x = nx; a.pos.z = nz; }
      else { a.state = 'idle'; a.timer = 0.5 + Math.random(); }
    }
  }

  const _cam = new THREE.Vector3(), _nrm = new THREE.Vector3();
  function animate(a, dt, t) {
    const sp = a.sp, tpl = a.tpl, m = a.move;
    const ground = Math.max(world.heightAt(a.pos.x, a.pos.z), -1.3);
    // Flying height
    if (sp.flyer) {
      const want = a.frozen ? 1.2 : sp.perch && a.state === 'idle' ? 0 : sp.flyH ?? 4;
      a.alt = lerp(a.alt, want, 1 - Math.exp(-(want > a.alt ? 1.2 : 0.8) * dt));
    }
    const flying = sp.flyer && a.alt > 0.4;
    a.phase += dt * (flying ? 3 : (sp.hop ? 7 : 2 + (sp.speed ?? 2) * 2.2) * (0.25 + m));
    let y = ground + a.alt;
    if (flying) y += Math.sin(t * 1.3 + a.seed) * 0.3;
    else if (sp.hop) y += Math.max(0, Math.sin(a.phase)) * 0.25 * m * tpl.length;
    a.root.position.set(a.pos.x, y, a.pos.z);
    a.root.rotation.y = a.heading;
    // Tilt with the slope when walking
    if (!flying) {
      const L = Math.max(tpl.length * 0.5, 0.3), sx = Math.sin(a.heading) * L, sz = Math.cos(a.heading) * L;
      const tilt = -Math.atan2(world.heightAt(a.pos.x + sx, a.pos.z + sz) - world.heightAt(a.pos.x - sx, a.pos.z - sz), 2 * L);
      a.model.rotation.x = lerp(a.model.rotation.x, clamp(tilt, -0.45, 0.45), 1 - Math.exp(-6 * dt));
    } else a.model.rotation.x = lerp(a.model.rotation.x, -0.08 * m, 1 - Math.exp(-3 * dt));
    a.model.rotation.z = sp.waddle ? Math.sin(a.phase) * 0.14 * m : flying ? Math.sin(t * 0.7 + a.seed) * 0.08 : 0;
    a.model.position.y = sp.heavy || sp.hop || flying ? 0 : Math.abs(Math.sin(a.phase)) * 0.025 * m * tpl.length;

    const p = a.phase;
    for (let i = 1; i < tpl.parts.length; i++) {
      const part = tpl.parts[i], o = a.objs[i];
      switch (part.type) {
        case 'leg': o.rotation.x = flying ? lerp(o.rotation.x, 0.7, 0.1) : Math.sin(p + part.phase) * (sp.hop ? 0.5 : 0.65) * m; break;
        case 'wing': {
          if (flying) { o.rotation.z = part.side * (0.15 + Math.sin(t * (tpl.length > 3 ? 1.6 : 5) + a.seed) * (tpl.length > 3 ? 0.25 : 0.65)); o.rotation.y = 0; }
          else { o.rotation.z = lerp(o.rotation.z, -part.side * 1.15, 0.15); o.rotation.y = lerp(o.rotation.y, part.side * 1.25, 0.15); }
          break;
        }
        case 'tail': o.rotation.y = Math.sin(t * 2.6 + a.seed + part.idx) * 0.3; o.rotation.x = Math.sin(t * 1.7 + part.idx) * 0.08; break;
        case 'seg': o.rotation.y = Math.sin(t * (flying ? 2 : 3.5) - part.idx * 0.9 + a.seed) * (0.18 + 0.25 * m); break;
        case 'head': {
          const look = a.state === 'idle' ? Math.sin(t * 0.5 + a.seed) * 0.4 : 0;
          o.rotation.y = look + (sp.plan === serpent ? Math.sin(t * 1.3 + part.idx * 2) * 0.15 : 0);
          o.rotation.x = sp.peck && a.state === 'idle' ? Math.max(0, Math.sin(t * 3 + a.seed)) * 0.6 : Math.sin(t * 1.4 + a.seed) * 0.06;
          break;
        }
        case 'flip': o.rotation.z = part.side * (0.15 + Math.max(0, Math.sin(p)) * 0.35 * m + Math.sin(t * 2) * 0.05); break;
        case 'fin': o.rotation.x = Math.sin(t * 1.4 + a.seed) * 0.22; break;
        case 'claw': o.rotation.y = Math.sin(t * 2 + part.side) * 0.15; o.rotation.x = Math.sin(t * 3 + part.side) * 0.1; break;
        case 'orb': o.rotation.y = t * 1.2; o.position.y = part.pivot[1] + Math.sin(t * 2) * 0.1; break;
      }
    }
    if (sp.glitch) { // jittery glitch frames
      const g = Math.sin(t * 13 + a.seed) > 0.93;
      a.model.position.x = g ? (Math.random() - 0.5) * 0.25 : 0;
      a.model.scale.set(g ? 1.25 : 1, g ? 0.8 : 1, 1);
    }
    // Ground ring follows (tilted to the terrain)
    const n = world.normalAt(a.pos.x, a.pos.z);
    a.ring.position.set(a.pos.x, world.heightAt(a.pos.x, a.pos.z) + 0.08, a.pos.z);
    a.ring.quaternion.setFromUnitVectors(Z_AXIS, _nrm.set(n[0], n[1], n[2]));
  }

  function update(dt, t, playerPos, camera) {
    U_TIME.value = t;
    U_SCALE.value = window.innerHeight * Math.min(window.devicePixelRatio, 1.5) * 0.87;
    if (!started) {
      started = true;
      if (qs.has('zoo')) zoo(playerPos);
      else for (let i = 0; i < 16; i++) spawnNear(playerPos);
    }
    spawnTimer += dt;
    if (spawnTimer > SPAWN_EVERY && !qs.has('zoo')) {
      spawnTimer = 0;
      // Make room: drop the farthest animal when full
      if (list.length >= MAX_ALIVE) {
        let far = null, fd = -1;
        for (const a of list) { const d = a.pos.distanceToSquared(playerPos); if (!a.captured && d > fd) { fd = d; far = a; } }
        if (far) remove(far);
      }
      spawnNear(playerPos);
    }
    camera.getWorldPosition(_cam);
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      const d = Math.hypot(a.pos.x - playerPos.x, a.pos.z - playerPos.z);
      if (d > DESPAWN_D && !a.captured) { remove(a); continue; }
      if (!a.captured && !a.frozen) think(a, dt);
      const vis = d < VIS_D;
      a.root.visible = vis; a.ring.visible = vis && !a.captured;
      if (!vis || a.captured) { a.label.visible = false; continue; }
      animate(a, dt, t);
      const cd = a.root.position.distanceTo(_cam);
      a.label.visible = cd < LABEL_D;
      if (a.label.visible) {
        const k = clamp(cd / 14, 1, 3.2);
        a.label.scale.set(2.2 * k, 0.69 * k, 1);
        a.label.position.y = a.tpl.top + 0.25;
      }
    }
  }

  // World-space centre of an animal (for hit tests)
  const center = (a, out = new THREE.Vector3()) => out.set(a.root.position.x, a.root.position.y + a.tpl.centerY, a.root.position.z);

  return { list, update, remove, spawnNear, center, create, forced };
}
