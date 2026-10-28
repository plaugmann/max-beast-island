// Extra species. NEW_ANIMALS: list entries per rarity (merged into ANIMALS in data.js).
// default export: (P) => { 'Name': { plan, ...opts } } — P holds the body plans and builder helpers from animals.js.
export const NEW_ANIMALS = {
  Common: [
    { name: 'Hedgehog', icon: '🦔' }, { name: 'Duck', icon: '🦆' }, { name: 'Mouse', icon: '🐭' },
    { name: 'Chicken', icon: '🐔' }, { name: 'Snail', icon: '🐌' }, { name: 'Sparrow', icon: '🐦' }],
  Uncommon: [
    { name: 'Goat', icon: '🐐' }, { name: 'Beaver', icon: '🦫' }, { name: 'Seal', icon: '🦭', biome: 'ice' },
    { name: 'Badger', icon: '🦡' }, { name: 'Parrot', icon: '🦜' }, { name: 'Boar', icon: '🐗' }],
  Rare: [
    { name: 'Brown Bear', icon: '🐻' }, { name: 'Eagle', icon: '🦅' }, { name: 'Arctic Fox', icon: '🦊', biome: 'ice' },
    { name: 'Moose', icon: '🫎' }, { name: 'Black Panther', icon: '🐈‍⬛' }, { name: 'Fire Salamander', icon: '🦎', biome: 'volcano' }],
  Epic: [
    { name: 'Tiger', icon: '🐅' }, { name: 'Gorilla', icon: '🦍' }, { name: 'Rhino', icon: '🦏' },
    { name: 'Ice Elk', icon: '🦌', biome: 'ice' }, { name: 'Ash Raven', icon: '🐦‍⬛', biome: 'volcano' }, { name: 'Komodo Dragon', icon: '🦎' }],
  Legendary: [
    { name: 'Yeti', icon: '❄️', biome: 'ice' }, { name: 'Pegasus', icon: '🐎' }, { name: 'Thunderbird', icon: '⚡' },
    { name: 'Ember Bear', icon: '🐻', biome: 'volcano' }, { name: 'Crystal Stag', icon: '💎' }, { name: 'Sabertooth', icon: '🐯' }],
};

export default function species(P) {
  const { THREE, quad, bird, lizard, spots, rnd } = P;
  const UP = new THREE.Vector3(0, 1, 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ARC = new THREE.TorusGeometry(1, 0.07, 5, 20, Math.PI); // half ring over the top (XY plane)
  const SHARD = new THREE.OctahedronGeometry(1, 0); // crystal shard
  const qDir = (d) => new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...d).normalize());

  // ---- helpers ----
  const partIdx = (b, type, k = 0) => { let n = 0; for (let i = 0; i < b.parts.length; i++) if (b.parts[i].type === type && n++ === k) return i; return -1; };
  const ext = (plan, fn) => (b, o) => { const r = plan(b, o); fn(b, o, r); return r; };
  // quad() head geometry (local to the head part)
  const qh = (o) => {
    const L = o.len, HR = o.head, NL = o.neck ?? L * 0.22, na = o.neckAngle ?? 0.85, sn = o.snout ?? HR * 0.8;
    const hp = [0, Math.sin(na) * NL + HR * 0.15, Math.cos(na) * NL + HR * 0.25];
    return { HR, hp, sn, sp: [0, hp[1] - HR * 0.25, hp[2] + HR * 0.5 + sn * 0.35] };
  };
  const qBy = (o) => o.leg + o.bodyH * 0.42;
  // bird() head geometry
  const bh = (o) => { const HR = 0.24 * o.size; return { HR, hy: HR * 0.6, hz: HR * 0.4 }; };

  // cones sticking out of the upper surface of an ellipsoid, leaning backwards (spines, fur, flames)
  function bristles(b, n, c, r, len, rad, color, { back = 0.8, seed = 3, glow = false, vmax = 1.35, umax = 0.85, geo = 'cone', color2 = null } = {}) {
    const R = rnd(seed);
    for (let i = 0; i < n; i++) {
      const u = (R() * 2 - 1) * umax, v = (R() * 2 - 1) * vmax, k = Math.sqrt(1 - u * u);
      const p = [c[0] + r[0] * Math.sin(v) * k, c[1] + r[1] * Math.cos(v) * k, c[2] + r[2] * u];
      const nr = [(p[0] - c[0]) / (r[0] * r[0]), (p[1] - c[1]) / (r[1] * r[1]), (p[2] - c[2]) / (r[2] * r[2])];
      const nl = Math.hypot(...nr), d = [nr[0] / nl, nr[1] / nl, nr[2] / nl - back];
      const dl = Math.hypot(...d), dn = d.map((x) => x / dl), L = len * (0.75 + R() * 0.5);
      b[glow ? 'g' : 's'](geo, color2 && i % 3 === 0 ? color2 : color, [p[0] + dn[0] * L * 0.35, p[1] + dn[1] * L * 0.35, p[2] + dn[2] * L * 0.35],
        [rad, L, rad], qDir(dn));
    }
  }
  // dark stripes arching over a quad() body (tiger / sabertooth)
  function quadStripes(b, o, zs, color, w = 1, sides = 0.0) {
    const L = o.len, W = o.wid, BH = o.bodyH, by = qBy(o);
    const ells = [[0, 0, W / 2, BH / 2, L / 2], [BH * 0.06, L * 0.27, W * 0.53, BH * 0.56, L * 0.27], [BH * 0.02, -L * 0.27, W * 0.5, BH * 0.52, L * 0.26]];
    b.use(0);
    zs.forEach((zt, i) => {
      const z = zt * L / 2;
      let best = null;
      for (const [cy, cz, rx, ry, rz] of ells) {
        const t = (z - cz) / rz; if (Math.abs(t) >= 1) continue;
        const k = Math.sqrt(1 - t * t), top = cy + ry * k;
        if (!best || top > best.top) best = { top, cy, rx: rx * k, ry: ry * k };
      }
      if (!best) return;
      const th = 0.025 * L * w / 0.07;
      b.s(ARC, color, [0, by + best.cy, z], [best.rx * 1.0, best.ry * 1.0, th], [0.18 * (i % 2 ? 1 : -1), 0, sides]);
    });
  }

  // ---- new body plans ----
  // Ape: gorilla (knuckle walking) or yeti (upright)
  function ape(b, o) {
    const s = o.size, c = o.c, c2 = o.c2 ?? '#3a3434', c3 = o.c3 ?? c2, up = !!o.upright;
    const hipY = (up ? 0.78 : 0.52) * s, hipZ = (up ? -0.02 : -0.3) * s, shY = (up ? 1.5 : 1.0) * s, shZ = (up ? 0.04 : 0.24) * s;
    const hip = [0, hipY, hipZ], sh = [0, shY, shZ];
    const d = [0, shY - hipY, shZ - hipZ], len = Math.hypot(d[1], d[2]), q = qDir(d);
    const at = (t, off = 0) => [0, lerp(hipY, shY, t) + (d[2] / len) * off, lerp(hipZ, shZ, t) - (d[1] / len) * off]; // off > 0 = towards the back
    b.s('sphere', c, at(0.45), [0.4 * s, len * 0.66, 0.33 * s], q);
    b.s('sphere', c, at(0.78, 0.02 * s), [0.5 * s, 0.33 * s, 0.37 * s], q); // shoulders
    b.s('sphere', o.chest ?? c, at(0.6, -0.12 * s), [0.32 * s, 0.3 * s, 0.24 * s], q);
    b.s('sphere', c, at(0.05), [0.34 * s, 0.26 * s, 0.3 * s], q); // hips
    if (o.back) b.s('sphere', o.back, at(0.42, 0.1 * s), [0.36 * s, len * 0.5, 0.25 * s], q);
    if (o.fur) bristles(b, 36, at(0.5), [0.42 * s, len * 0.6, 0.35 * s], 0.2 * s, 0.07 * s, o.fur, { back: 0.2, seed: 41, vmax: 2.4, umax: 0.9 });
    if (o.crystals) for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const p = at(0.85 - k * 0.1, 0.12 * s); p[0] = sd * (0.3 - k * 0.06) * s;
      b.g(SHARD, k === 1 ? o.crystals2 ?? o.crystals : o.crystals, [p[0], p[1] + 0.16 * s, p[2]], [0.08 * s, (0.34 - k * 0.06) * s, 0.08 * s], [-0.3, 0, -sd * (0.4 + k * 0.25)]);
    }
    // head
    const hpv = up ? [0, shY + 0.14 * s, shZ + 0.08 * s] : [0, shY + 0.06 * s, shZ + 0.26 * s];
    b.part('head', hpv);
    const fc = o.face ?? c2;
    b.s('sphere', c, [0, 0.16 * s, 0], [0.2 * s, 0.22 * s, 0.2 * s]);
    if (o.crest) b.s('sphere', c, [0, 0.3 * s, -0.05 * s], [0.12 * s, 0.13 * s, 0.15 * s]);
    if (o.horns) for (const sd of [-1, 1]) b.chain([[sd * 0.13 * s, 0.3 * s, -0.02 * s], [sd * 0.22 * s, 0.4 * s, -0.05 * s], [sd * 0.2 * s, 0.5 * s, -0.12 * s]], 0.04 * s, 0.01 * s, o.horns);
    b.s('sphere', fc, [0, 0.13 * s, 0.11 * s], [0.15 * s, 0.15 * s, 0.11 * s]);
    b.s('sphere', fc, [0, 0.04 * s, 0.16 * s], [0.13 * s, 0.09 * s, 0.1 * s]);
    b.s('sphere', o.brow ?? fc, [0, 0.2 * s, 0.17 * s], [0.16 * s, 0.045 * s, 0.07 * s]);
    for (const sd of [-1, 1]) {
      b.s('sphere', '#151214', [sd * 0.035 * s, 0.075 * s, 0.25 * s], [0.025 * s, 0.018 * s, 0.015 * s]);
      b.s('sphere', fc, [sd * 0.19 * s, 0.15 * s, 0.01 * s], [0.035 * s, 0.055 * s, 0.03 * s]);
    }
    b.s('box', '#151214', [0, 0.0, 0.245 * s], [0.08 * s, 0.008 * s, 0.01 * s]);
    b.eyes(0.065 * s, 0.155 * s, 0.205 * s, 0.026 * s, o.eyeC ?? '#111111', !!o.glowEyes);
    // arms (front legs)
    const armR = (o.arm ?? 1) * 0.11 * s;
    for (const sd of [-1, 1]) {
      b.part('leg', [sd * 0.42 * s, shY, shZ], { phase: sd < 0 ? 0 : Math.PI });
      const el = up ? [sd * 0.1 * s, -0.4 * s, -0.04 * s] : [sd * 0.06 * s, -shY * 0.48, -0.02 * s];
      const hd = up ? [sd * 0.12 * s, -0.8 * s, 0.06 * s] : [sd * 0.08 * s, -shY + 0.07 * s, 0.06 * s];
      b.s('sphere', c, [0, 0, 0], armR * 1.5);
      b.tube([0, 0, 0], el, armR * 1.2, armR, c);
      b.s('sphere', c, el, armR);
      b.tube(el, hd, armR, armR * 0.85, c);
      b.s('sphere', c3, [hd[0], hd[1] - (up ? 0.04 * s : 0), hd[2] + 0.02 * s], [armR * 1.0, armR * 0.75, armR * 1.15]);
    }
    // legs
    for (const sd of [-1, 1]) {
      b.part('leg', [sd * 0.2 * s, hipY, hipZ], { phase: sd < 0 ? Math.PI : 0 });
      const kn = [0, -hipY * 0.5, 0.06 * s], ft = [0, -hipY + 0.05 * s, 0.02 * s], lr = 0.12 * s * (o.legW ?? 1);
      b.tube([0, 0, 0], kn, lr, lr * 0.85, c);
      b.s('sphere', c, kn, lr * 0.85);
      b.tube(kn, ft, lr * 0.85, lr * 0.7, c);
      b.s('sphere', c3, [0, -hipY + 0.045 * s, 0.08 * s], [lr * 0.85, lr * 0.45, lr * 1.5]);
    }
    return { by: hipY, top: hpv[1] + 0.4 * s };
  }

  // Seal: lies on its belly, front flippers + tail flippers
  function seal(b, o) {
    const s = o.size, c = o.c, c2 = o.c2 ?? c;
    b.s('sphere', c, [0, 0.3 * s, 0], [0.34 * s, 0.3 * s, 0.62 * s]);
    b.s('sphere', c2, [0, 0.18 * s, 0.05 * s], [0.29 * s, 0.17 * s, 0.56 * s]);
    b.s('sphere', c, [0, 0.42 * s, 0.4 * s], [0.27 * s, 0.31 * s, 0.28 * s], [-0.45, 0, 0]);
    b.s('sphere', c2, [0, 0.3 * s, 0.52 * s], [0.2 * s, 0.22 * s, 0.16 * s], [-0.45, 0, 0]);
    b.tube([0, 0.25 * s, -0.4 * s], [0, 0.13 * s, -0.86 * s], 0.25 * s, 0.09 * s, c);
    if (o.spots) spots(b, 16, 0, 0.3 * s, -0.05 * s, 0.34 * s, 0.3 * s, 0.6 * s, 0.035 * s, o.spots, false, 5);
    b.part('head', [0, 0.62 * s, 0.56 * s]);
    b.s('sphere', c, [0, 0.06 * s, 0.04 * s], [0.2 * s, 0.19 * s, 0.21 * s]);
    b.s('sphere', o.muzzle ?? c2, [0, -0.01 * s, 0.2 * s], [0.12 * s, 0.09 * s, 0.11 * s]);
    b.s('sphere', '#1a1416', [0, 0.04 * s, 0.305 * s], [0.045 * s, 0.03 * s, 0.025 * s]);
    b.eyes(0.095 * s, 0.1 * s, 0.19 * s, 0.05 * s);
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) b.tube([sd * 0.08 * s, -0.01 * s + k * 0.02 * s, 0.27 * s], [sd * 0.24 * s, -0.04 * s + k * 0.05 * s, 0.27 * s], 0.005 * s, 0.003 * s, '#f4f0e8');
    for (const sd of [-1, 1]) {
      b.part('flip', [sd * 0.27 * s, 0.26 * s, 0.32 * s], { side: sd });
      b.s('sphere', c, [sd * 0.08 * s, -0.15 * s, 0.05 * s], [0.06 * s, 0.17 * s, 0.11 * s], [0.3, 0, 0.45 * sd]);
    }
    b.part('tail', [0, 0.13 * s, -0.86 * s]);
    for (const sd of [-1, 1]) b.s('sphere', c, [sd * 0.09 * s, -0.02 * s, -0.1 * s], [0.1 * s, 0.025 * s, 0.15 * s], [0, 0.45 * sd, 0]);
    return { by: 0.3 * s, top: 0.95 * s };
  }

  // Snail: long foot, spiral shell, eye stalks
  function snail(b, o) {
    const s = o.size, c = o.c, c2 = o.c2, c3 = o.c3;
    b.s('sphere', c, [0, 0.07 * s, 0], [0.16 * s, 0.08 * s, 0.58 * s]);
    b.s('sphere', c, [0, 0.16 * s, 0.4 * s], [0.12 * s, 0.16 * s, 0.14 * s], [0.35, 0, 0]);
    const C = [0, 0.4 * s, -0.08 * s], RS = 0.3 * s;
    b.s('sphere', c2, C, [0.22 * s, RS, RS]);
    b.s('sphere', c3, [0, 0.13 * s, -0.08 * s], [0.2 * s, 0.05 * s, 0.26 * s]); // lip
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        const th = (i / 26) * Math.PI * 4.2, r = 0.27 * s * Math.exp(-0.14 * th);
        const x = sd * (0.22 * s * Math.sqrt(Math.max(0.04, 1 - (r / RS) ** 2)) + 0.004 * s);
        pts.push([x, C[1] + r * Math.cos(th), C[2] - r * Math.sin(th)]);
      }
      b.chain(pts, 0.03 * s, 0.014 * s, c3);
      b.s('sphere', c3, [sd * 0.215 * s, C[1], C[2]], [0.03 * s, 0.045 * s, 0.045 * s]);
    }
    if (o.gems) spots(b, 6, C[0], C[1], C[2], 0.2 * s, RS, RS, 0.035 * s, o.gems, true, 3);
    b.part('head', [0, 0.27 * s, 0.47 * s]);
    for (const sd of [-1, 1]) {
      b.tube([sd * 0.035 * s, 0, 0], [sd * 0.09 * s, 0.2 * s, 0.08 * s], 0.024 * s, 0.016 * s, c);
      b.tube([sd * 0.05 * s, -0.06 * s, 0.07 * s], [sd * 0.08 * s, -0.05 * s, 0.15 * s], 0.016 * s, 0.01 * s, c);
    }
    b.eyes(0.09 * s, 0.215 * s, 0.085 * s, 0.035 * s);
    b.s('sphere', '#4a3020', [0, -0.07 * s, 0.11 * s], [0.035 * s, 0.01 * s, 0.01 * s]);
    return { by: 0.1 * s, top: 0.75 * s };
  }

  // ---- species extras (wrappers around the shared plans) ----
  const hedgehog = ext(quad, (b, o) => {
    const by = qBy(o);
    b.use(0);
    const C = [0, by + o.bodyH * 0.12, o.len * 0.02], R = [o.wid * 0.6, o.bodyH * 0.62, o.len * 0.62];
    b.s('sphere', o.spine, C, R);
    bristles(b, 190, C, R, o.len * 0.2, o.len * 0.032, o.spine, { back: 0.55, seed: 5, vmax: 1.55, umax: 0.95, color2: o.spine2 });
  });
  const duck = ext(bird, (b, o) => {
    const { HR, hy, hz } = bh(o);
    b.use(partIdx(b, 'head'));
    b.s('sphere', o.beak, [0, hy - HR * 0.18, hz + HR * 1.05], [HR * 0.42, HR * 0.13, HR * 0.6], [0.12, 0, 0]);
    b.s('sphere', '#f8f6f0', [0, -HR * 0.25, hz - HR * 0.15], [HR * 0.78, HR * 0.14, HR * 0.78]); // white collar
  });
  const chicken = ext(bird, (b, o) => {
    const { HR, hy, hz } = bh(o), s = o.size;
    b.use(partIdx(b, 'head'));
    for (let k = 0; k < 4; k++) b.s('sphere', '#e0242a', [0, hy + HR * (0.95 - Math.abs(k - 1.5) * 0.06), hz + HR * (0.45 - k * 0.3)], [HR * 0.1, HR * 0.24, HR * 0.16]);
    b.s('sphere', '#e0242a', [0, hy - HR * 0.55, hz + HR * 0.8], [HR * 0.11, HR * 0.24, HR * 0.12]);
    b.use(partIdx(b, 'tail'));
    for (let k = -1; k <= 1; k++) b.s('sphere', o.c, [k * 0.07 * s, 0.2 * s, -0.12 * s], [0.06 * s, 0.26 * s, 0.13 * s], [-0.45, 0, k * 0.25]);
  });
  const parrot = ext(bird, (b, o) => {
    const { HR, hy, hz } = bh(o);
    b.use(partIdx(b, 'head'));
    for (const sd of [-1, 1]) b.s('sphere', '#f8f4ec', [sd * HR * 0.55, hy + HR * 0.05, hz + HR * 0.55], [HR * 0.3, HR * 0.32, HR * 0.3]);
    b.s('sphere', '#2a2420', [0, hy - HR * 0.45, hz + HR * 0.95], [HR * 0.2, HR * 0.14, HR * 0.2]); // lower beak
  });
  const thunderbird = ext(bird, (b, o) => {
    const span = (o.span ?? 1.1) * o.size;
    for (const sd of [-1, 1]) {
      b.use(partIdx(b, 'wing', sd < 0 ? 0 : 1));
      b.chain([[sd * 0.12 * span, 0.04, 0.05 * span], [sd * 0.35 * span, 0.04, -0.1 * span], [sd * 0.5 * span, 0.04, 0.04 * span], [sd * 0.78 * span, 0.04, -0.12 * span]], 0.022 * span, 0.012 * span, o.bolt, true);
    }
    const { HR, hy, hz } = bh(o), s = o.size;
    b.use(partIdx(b, 'head'));
    for (let k = -2; k <= 2; k++) b.g('sphere', k % 2 ? o.bolt : '#7fd8ff', [k * HR * 0.22, hy + HR * 1.0, hz - HR * 0.35], [HR * 0.09, HR * 0.6, HR * 0.12], [-0.7, 0, -k * 0.3]);
    for (const sd of [-1, 1]) b.g('box', o.bolt, [sd * HR * 0.62, hy + HR * 0.45, hz + HR * 0.45], [HR * 0.08, HR * 0.06, HR * 0.5], [0, sd * 0.4, sd * 0.3]);
    b.use(0); // lightning zigzag on the chest
    const by = 0.28 * s + 0.4 * s;
    b.chain([[0, by + 0.26 * s, 0.5 * s], [0.07 * s, by + 0.1 * s, 0.58 * s], [-0.06 * s, by - 0.02 * s, 0.6 * s], [0.03 * s, by - 0.18 * s, 0.55 * s]], 0.035 * s, 0.02 * s, o.bolt, true);
  });
  const goat = ext(quad, (b, o) => {
    const { HR, sp, sn } = qh(o);
    b.use(partIdx(b, 'head'));
    b.s('sphere', o.beard, [0, sp[1] - HR * 0.5, sp[2] - sn * 0.15], [HR * 0.16, HR * 0.45, HR * 0.16], [0.35, 0, 0]);
  });
  const beaver = ext(quad, (b, o) => {
    const { HR, sp, sn } = qh(o);
    b.use(partIdx(b, 'head'));
    for (const sd of [-1, 1]) b.s('box', '#f4dfa8', [sd * HR * 0.09, sp[1] - HR * 0.42, sp[2] + sn * 0.45], [HR * 0.16, HR * 0.3, HR * 0.06]);
    b.use(partIdx(b, 'tail'));
    b.s('sphere', o.paddle, [0, -o.bodyH * 0.25, -o.len * 0.3], [o.wid * 0.36, o.wid * 0.07, o.len * 0.42]);
    for (let k = 0; k < 4; k++) b.s('box', '#2a1f1a', [0, -o.bodyH * 0.25 + o.wid * 0.06, -o.len * (0.12 + k * 0.1)], [o.wid * 0.45 * (1 - k * 0.12), 0.005, 0.008]);
  });
  const badger = ext(quad, (b, o) => {
    const { HR, hp } = qh(o);
    b.use(partIdx(b, 'head'));
    for (const sd of [-1, 1]) b.s('sphere', '#151515', [sd * HR * 0.42, hp[1] + HR * 0.04, hp[2] + HR * 0.08], [HR * 0.24, HR * 0.84, HR * 1.0], [0, 0, 0.12 * sd]);
  });
  const boar = ext(quad, (b, o) => {
    const { HR, sp, sn } = qh(o);
    b.use(partIdx(b, 'head'));
    b.s('cyl', o.disc, [0, sp[1], sp[2] + sn * 0.6], [HR * 0.28, HR * 0.06, HR * 0.24], [Math.PI / 2, 0, 0]);
    for (const sd of [-1, 1]) {
      b.s('sphere', '#151112', [sd * HR * 0.1, sp[1], sp[2] + sn * 0.64], HR * 0.05);
      b.chain([[sd * HR * 0.3, sp[1] - HR * 0.2, sp[2] + sn * 0.25], [sd * HR * 0.44, sp[1] - HR * 0.05, sp[2] + sn * 0.4], [sd * HR * 0.44, sp[1] + HR * 0.25, sp[2] + sn * 0.25]], HR * 0.08, HR * 0.02, '#f6f0e0');
    }
  });
  const moose = ext(quad, (b, o) => {
    const { HR, hp, sp, sn } = qh(o), hc = o.hornC2;
    b.use(partIdx(b, 'head'));
    b.s('sphere', o.c, [0, sp[1] - HR * 0.7, sp[2] - sn * 0.6], [HR * 0.14, HR * 0.4, HR * 0.18], [0.2, 0, 0]); // bell
    for (const sd of [-1, 1]) {
      const base = [sd * HR * 0.45, hp[1] + HR * 0.6, hp[2] - HR * 0.1], cx = sd * HR * 1.9, cy = hp[1] + HR * 1.2, cz = hp[2] - HR * 0.25;
      b.tube(base, [sd * HR * 1.2, hp[1] + HR * 0.95, hp[2] - HR * 0.2], HR * 0.13, HR * 0.11, hc);
      b.s('sphere', hc, [cx, cy, cz], [HR * 1.05, HR * 0.1, HR * 0.62], [0.15, 0, sd * 0.38]);
      for (let k = 0; k < 6; k++) {
        const t = k / 5, x = sd * HR * (1.05 + t * 1.75), y = cy + (Math.abs(x) - Math.abs(cx)) * Math.tan(0.38) + HR * 0.2 * Math.sin(t * Math.PI);
        b.s('cone', hc, [x, y + HR * 0.25, cz + HR * (0.4 - t * 0.6)], [HR * 0.09, HR * 0.5, HR * 0.09], [0.15 - t * 0.3, 0, -sd * (0.1 + t * 0.4)]);
      }
      b.s('cone', hc, [sd * HR * 1.3, hp[1] + HR * 1.05, hp[2] + HR * 0.35], [HR * 0.09, HR * 0.55, HR * 0.09], [1.0, 0, -sd * 0.3]); // brow tine
    }
  });
  const rhino = ext(quad, (b, o) => {
    const { HR, sp, sn } = qh(o);
    b.use(partIdx(b, 'head'));
    b.s('cone', o.hornC, [0, sp[1] + HR * 0.95, sp[2] + sn * 0.3], [HR * 0.3, HR * 1.6, HR * 0.34], [-0.25, 0, 0]);
    b.s('cone', o.hornC, [0, sp[1] + HR * 0.75, sp[2] - sn * 0.3], [HR * 0.2, HR * 0.8, HR * 0.22], [-0.15, 0, 0]);
  });
  const tiger = ext(quad, (b, o) => {
    quadStripes(b, o, o.stripeZ, o.stripeC, o.stripeW ?? 1);
    const { HR, hp } = qh(o);
    b.use(partIdx(b, 'head'));
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) b.s('box', o.stripeC, [sd * HR * 0.78, hp[1] + HR * (0.05 - k * 0.22), hp[2] + HR * 0.15], [HR * 0.1, HR * 0.07, HR * 0.4], [0, sd * 0.3, sd * 0.4]);
    for (let k = 0; k < 3; k++) b.s('box', o.stripeC, [(k - 1) * HR * 0.18, hp[1] + HR * 0.78, hp[2] + HR * 0.2], [HR * 0.06, HR * 0.05, HR * 0.4], [0.5, 0, (k - 1) * 0.3]);
    for (const sd of [-1, 1]) b.s('sphere', o.cheek, [sd * HR * 0.6, hp[1] - HR * 0.42, hp[2] + HR * 0.22], [HR * 0.3, HR * 0.24, HR * 0.3], [0, 0, -0.6 * sd]);
    if (o.fangs) for (const sd of [-1, 1]) {
      const { sp, sn } = qh(o);
      b.s('cone', o.fangs, [sd * HR * 0.17, sp[1] - HR * 0.65, sp[2] + sn * 0.2], [HR * 0.075, HR * 0.85, HR * 0.09], [Math.PI + 0.12, 0, 0]);
    }
    if (o.tailRings) {
      b.use(partIdx(b, 'tail'));
      const tl = o.tailLen;
      for (let k = 1; k < 4; k++) b.s('sphere', o.stripeC, [0, -tl * (0.25 * Math.sin(k / 4 * Math.PI)), -tl * k * 0.24], [o.len * 0.035, o.len * 0.035, o.len * 0.02]);
    }
  });
  const crystalStag = ext(quad, (b, o) => {
    const { HR, hp } = qh(o);
    b.use(partIdx(b, 'head'));
    for (const sd of [-1, 1]) [[2.8, 0.25, -0.35, 0], [2.0, 0.65, -0.1, 1], [1.6, 0.05, -0.75, 1], [1.2, 0.9, 0.3, 0]].forEach(([l, out, back, ci]) => {
      const d = [sd * out, 1, back], n = Math.hypot(...d), base = [sd * HR * 0.38, hp[1] + HR * 0.72, hp[2] - HR * 0.05];
      b.g(SHARD, ci ? o.crystal2 : o.crystal1, [base[0] + d[0] / n * HR * l * 0.5, base[1] + d[1] / n * HR * l * 0.5, base[2] + d[2] / n * HR * l * 0.5], [HR * 0.16, HR * l * 0.55, HR * 0.16], qDir(d));
    });
  });
  const yeti = ape;
  const pegasus = quad;
  const salamander = ext(lizard, (b, o) => {
    const s = o.size;
    for (let i = 0; i < 4; i++) {
      const r0 = 0.17 * s * (1 - i / 4.5), segL = 0.32 * s;
      b.use(partIdx(b, 'seg', i));
      for (const sd of [-1, 1]) if ((i + (sd > 0 ? 1 : 0)) % 2 === 0 || i === 0) b.s('sphere', o.spots, [sd * r0 * 0.45, r0 * 0.7, -segL * (0.3 + 0.35 * (sd > 0 ? 1 : 0))], [r0 * 0.38, r0 * 0.3, r0 * 0.5]);
    }
    b.use(partIdx(b, 'head'));
    for (const sd of [-1, 1]) b.s('sphere', o.spots, [sd * 0.12 * s, 0.11 * s, 0.1 * s], [0.06 * s, 0.035 * s, 0.09 * s]);
  });
  const komodo = ext(lizard, (b, o) => {
    const s = o.size;
    b.use(partIdx(b, 'head'));
    b.tube([0, -0.04 * s, 0.44 * s], [0, -0.06 * s, 0.6 * s], 0.012 * s, 0.01 * s, o.tongue);
    for (const sd of [-1, 1]) b.tube([0, -0.06 * s, 0.6 * s], [sd * 0.03 * s, -0.065 * s, 0.67 * s], 0.01 * s, 0.005 * s, o.tongue);
  });
  const emberBear = ext(quad, (b, o) => {
    const by = qBy(o);
    b.use(0);
    bristles(b, 22, [0, by + o.bodyH * 0.1, o.len * 0.05], [o.wid * 0.45, o.bodyH * 0.52, o.len * 0.42], o.bodyH * 0.45, o.bodyH * 0.08, o.flame,
      { back: 0.5, seed: 17, glow: true, vmax: 0.7, color2: o.flame2 });
    const BH = o.bodyH, L = o.len, W = o.wid;
    spots(b, 14, 0, by + BH * 0.06, L * 0.27, W * 0.53, BH * 0.56, L * 0.27, W * 0.09, o.spots.c, true, 23);
    const { HR, hp } = qh(o);
    b.use(partIdx(b, 'head'));
    spots(b, 6, hp[0], hp[1], hp[2], HR * 0.85, HR * 0.82, HR, HR * 0.14, o.spots.c, true, 29);
    bristles(b, 7, hp, [HR * 0.7, HR * 0.75, HR * 0.8], HR * 0.7, HR * 0.13, o.flame2, { back: 0.9, seed: 9, glow: true, vmax: 0.6, umax: 0.6, color2: o.flame });
    for (let i = 0; i < 4; i++) { b.use(partIdx(b, 'leg', i)); b.g('box', o.flame, [0, -o.leg * 0.55, o.legR * 0.95], [o.legR * 0.25, o.leg * 0.5, o.legR * 0.2], [0, 0, 0.3]); }
  });

  return {
    // ---- Common ----
    'Hedgehog': { plan: hedgehog, scale: 1.7, speed: 0.8, o: { len: 0.42, wid: 0.34, bodyH: 0.27, leg: 0.07, legR: 0.03, head: 0.105, snout: 0.12, snoutW: 0.7,
      ears: 'round', ear: 0.06, earC: '#c8a47a', tail: 'short', c: '#7a5a3e', c2: '#e2c8a2', c3: '#3a2a1a', headC: '#d6b68c', snoutC: '#e8d0aa', spine: '#5a4230', spine2: '#e6d8c0' } },
    'Duck': { plan: duck, peck: true, speed: 0.7, waddle: true, scale: 1.4, o: { size: 0.4, c: '#9a968e', c2: '#8a4e2c', headC: '#1d6e3c', wingC: '#857c70', tip: '#2a58c8',
      tailC: '#2a2a2a', beak: '#f2c22a', legC: '#ff8a1a', beakLen: 0.3, span: 1.0 } },
    'Mouse': { plan: quad, scale: 1.8, speed: 1.3, o: { len: 0.34, wid: 0.22, bodyH: 0.2, leg: 0.06, legR: 0.022, head: 0.12, snout: 0.11, snoutW: 0.75,
      ears: 'round', ear: 0.15, earC: '#f2b6be', tail: 'thin', tailLen: 0.46, tailC: '#eaaab2', c: '#9a9aa4', c2: '#e2e2e6', c3: '#eaaab2', snoutC: '#b4b4bc' } },
    'Chicken': { plan: chicken, peck: true, speed: 0.8, scale: 1.4, o: { size: 0.42, c: '#f8f4ea', c2: '#f4eedf', wingC: '#ece4d2', tip: '#d8ccb4', tailC: '#f2ecdc',
      beak: '#f2b02a', legC: '#f2b02a', beakLen: 0.5, span: 0.9 } },
    'Snail': { plan: snail, heavy: true, speed: 0.35, scale: 1.5, o: { size: 0.6, c: '#cdbb9a', c2: '#d4843c', c3: '#7a3e1a' } },
    'Sparrow': { plan: bird, flyer: true, perch: true, flyH: 3, scale: 1.45, o: { size: 0.3, c: '#8e6640', c2: '#e2d6c0', headC: '#7a5a3e', wingC: '#7a5030', tip: '#3a2818',
      tailC: '#5a3e26', beak: '#4a3e34', legC: '#b89070', beakLen: 0.45 } },
    // ---- Uncommon ----
    'Goat': { plan: goat, o: { len: 0.95, wid: 0.38, bodyH: 0.44, leg: 0.48, legR: 0.045, head: 0.15, snout: 0.19, snoutW: 0.75, neck: 0.3, neckAngle: 1.0,
      ears: 'side', ear: 0.12, horns: 'horns', hornLen: 1.7, hornC: '#6a5a44', hooves: true, tail: 'short', c: '#f2eee6', c2: '#e6e0d4', c3: '#4a4038', beard: '#d8d0c0' } },
    'Beaver': { plan: beaver, speed: 0.8, scale: 1.3, o: { len: 0.72, wid: 0.44, bodyH: 0.4, leg: 0.13, legR: 0.055, head: 0.18, snout: 0.12, snoutW: 1.25,
      ears: 'round', ear: 0.06, tail: 'short', tailTip: '#7a4a26', c: '#7a4a26', c2: '#9a6a42', snoutC: '#8a5a36', c3: '#2a1a10', paddle: '#3e3029' } },
    'Seal': { plan: seal, speed: 0.8, scale: 1.2, o: { size: 1.0, c: '#7a8590', c2: '#b8c0c6', spots: '#4a5560', muzzle: '#a2acb4' } },
    'Badger': { plan: badger, speed: 1.0, o: { len: 0.8, wid: 0.46, bodyH: 0.34, leg: 0.16, legR: 0.06, head: 0.17, snout: 0.2, snoutW: 0.7, ears: 'round', ear: 0.07,
      earC: '#f2f2ee', tail: 'short', tailTip: '#9a9a96', c: '#8e8e8a', c2: '#2a2a2a', c3: '#1a1a1a', socks: '#1e1e1e', headC: '#f4f4f0', snoutC: '#f4f4f0' } },
    'Parrot': { plan: parrot, flyer: true, perch: true, flyH: 3.5, scale: 1.3, o: { size: 0.45, c: '#e0261e', c2: '#e83a22', wingC: '#2a5ad8', tip: '#f2c41a',
      tailC: '#2a5ad8', longTail: '#e0261e', beak: '#efe6d0', legC: '#5a5a5a', beakLen: 0.75 } },
    'Boar': { plan: boar, o: { len: 1.0, wid: 0.46, bodyH: 0.52, leg: 0.3, legR: 0.055, head: 0.22, snout: 0.24, snoutW: 0.9, ears: 'pointy', ear: 0.11,
      hooves: true, hump: true, tail: 'thin', tailLen: 0.3, c: '#5a4232', c2: '#6a5040', c3: '#1a120c', disc: '#6a4a40', spikes: { n: 8, h: 0.12, c: '#2a1e16' } } },
    // ---- Rare ----
    'Brown Bear': { plan: quad, heavy: true, o: { len: 1.6, wid: 0.8, bodyH: 0.8, leg: 0.52, legR: 0.13, head: 0.29, snout: 0.24, ears: 'round', ear: 0.12,
      hump: true, tail: 'short', c: '#6a4224', c2: '#7a5030', snoutC: '#a07850', c3: '#2a1a10' } },
    'Eagle': { plan: bird, flyer: true, perch: true, flyH: 5, o: { size: 0.7, c: '#4a3020', c2: '#553822', headC: '#faf8f2', neckC: '#f2efe6', wingC: '#3e2818',
      tip: '#2a1a10', tailC: '#f4f2ec', beak: '#f2c020', legC: '#f2c020', eyeC: '#2a1a0a', span: 1.5 } },
    'Arctic Fox': { plan: quad, o: { len: 0.85, wid: 0.34, bodyH: 0.34, leg: 0.3, legR: 0.045, head: 0.17, snout: 0.25, snoutW: 0.7, ears: 'pointy', ear: 0.13,
      tail: 'bushy', tailLen: 0.75, tailTip: '#cfe8ff', c: '#f4f7fb', c2: '#ffffff', snoutC: '#ffffff', c3: '#c8d2de', earC: '#e6ecf4', eyeC: '#1a3a5a' } },
    'Moose': { plan: moose, heavy: true, o: { len: 1.75, wid: 0.62, bodyH: 0.78, leg: 1.0, legR: 0.075, head: 0.24, snout: 0.38, snoutW: 1.05, neck: 0.45, neckAngle: 0.7,
      neckW: 1.3, ears: 'side', ear: 0.15, hump: true, hooves: true, tail: 'short', c: '#4a3020', c2: '#5a3a26', snoutC: '#5e4030', c3: '#1a120c', socks: '#9a8064', hornC2: '#d8c49a' } },
    'Black Panther': { plan: quad, o: { len: 1.2, wid: 0.4, bodyH: 0.42, leg: 0.5, legR: 0.06, head: 0.2, snout: 0.11, snoutW: 1.2, ears: 'pointy', ear: 0.1,
      tail: 'thin', tailLen: 1.0, c: '#1c1b21', c2: '#24232a', snoutC: '#2a2930', c3: '#0e0d10', eyeC: '#c8f04a', glowEyes: true } },
    'Fire Salamander': { plan: salamander, speed: 1.0, scale: 1.1, o: { size: 1.0, c: '#18161a', c2: '#222024', c3: '#18161a', spots: '#ffc21a', eyeC: '#ff8a1a', glowEyes: true } },
    // ---- Epic ----
    'Tiger': { plan: tiger, o: { len: 1.6, wid: 0.56, bodyH: 0.58, leg: 0.6, legR: 0.08, head: 0.3, snout: 0.16, snoutW: 1.0, ears: 'round', ear: 0.1, earC: '#2a1a10', cheek: '#fbf3e6',
      tail: 'thin', tailLen: 0.9, tailTip: '#1a1410', tailRings: true, c: '#ee8a2a', c2: '#fbf3e6', snoutC: '#fbf3e6', c3: '#2a1a10', eyeC: '#e8b020',
      stripeC: '#1a1410', stripeZ: [0.75, 0.5, 0.25, 0, -0.25, -0.5, -0.75] } },
    'Gorilla': { plan: ape, heavy: true, speed: 1.1, o: { size: 1.1, c: '#2a2a2f', c2: '#3a3536', c3: '#26222a', chest: '#3e3a3c', back: '#8a8a92', crest: true, brow: '#2e2a2c' } },
    'Rhino': { plan: rhino, heavy: true, o: { len: 2.0, wid: 0.95, bodyH: 0.9, leg: 0.55, legR: 0.15, head: 0.44, snout: 0.56, snoutW: 1.0, ears: 'pointy', ear: 0.13, neckAngle: 0.35, neck: 0.4,
      tail: 'tuft', tailLen: 0.4, c: '#8c8a88', c2: '#9a9896', c3: '#3a3836', hornC: '#c2b8a2', plates: '#7a7876' } },
    'Ice Elk': { plan: quad, o: { len: 1.7, wid: 0.6, bodyH: 0.7, leg: 1.0, legR: 0.075, head: 0.23, snout: 0.3, snoutW: 0.85, neck: 0.62, neckAngle: 1.05, neckW: 1.3,
      ears: 'side', ear: 0.16, horns: 'antlers', antler: 3.8, hornC: '#8fe6ff', hornGlow: true, horseMane: '#b8d4ec', tail: 'short', tailTip: '#ffffff', hooves: true,
      c: '#dce8f4', c2: '#ffffff', c3: '#4a6a88', socks: '#a8c4dc', eyeC: '#7fe6ff', glowEyes: true } },
    'Ash Raven': { plan: bird, flyer: true, perch: true, flyH: 4.5, o: { size: 0.68, c: '#1c1a1f', c2: '#29262b', headC: '#1c1a1f', wingC: '#151317', tip: '#ff6a1a', tipGlow: true,
      tailC: '#151317', beak: '#2c2a2e', legC: '#2a2a2a', eyeC: '#ff8a1a', glowEyes: true, stars: '#ff7a2a', crest: '#ff6a1a', crestGlow: true, beakLen: 0.8, span: 1.3 } },
    'Komodo Dragon': { plan: komodo, speed: 0.9, o: { size: 2.1, c: '#6e6452', c2: '#8a806a', c3: '#5a5040', spots: '#4e463a', tongue: '#f2c84a', eyeC: '#d8a020' } },
    // ---- Legendary ----
    'Yeti': { plan: yeti, heavy: true, speed: 1.2, o: { size: 1.3, upright: true, c: '#eef3f8', c2: '#7aa4c4', face: '#8ab4d4', c3: '#6a90b0', chest: '#f8fbff', brow: '#dfe9f2',
      fur: '#ffffff', eyeC: '#7fe6ff', glowEyes: true, crystals: '#8fe9ff', crystals2: '#d6f8ff', horns: '#cfe2f0', arm: 1.15, legW: 1.1 } },
    'Pegasus': { plan: pegasus, flyer: true, perch: true, flyH: 3.5, o: { len: 1.55, wid: 0.52, bodyH: 0.62, leg: 0.92, legR: 0.065, head: 0.21, snout: 0.36, snoutW: 0.8,
      neck: 0.6, neckAngle: 1.0, neckW: 1.5, ears: 'pointy', ear: 0.12, horseMane: '#9fdcff', tail: 'horse', tailLen: 0.9, tailC: '#9fdcff', hooves: true,
      c: '#ffffff', c2: '#f4f8ff', c3: '#f2c84a', eyeC: '#2a5a9a', wings: { span: 2.1, c: '#ffffff', tip: '#8fd8ff', glow: true } } },
    'Thunderbird': { plan: thunderbird, flyer: true, perch: true, flyH: 6, speed: 4, o: { size: 1.2, c: '#22307a', c2: '#3a56c8', headC: '#1c2866', wingC: '#1a2460', beakLen: 0.9,
      tip: '#fff27a', tipGlow: true, crest: '#fff27a', crestGlow: true, longTail: '#7fd8ff', tailGlow: true, tailC: '#1a2460', beak: '#ffd23a', legC: '#ffd23a',
      eyeC: '#fff6a0', glowEyes: true, stars: '#9fe8ff', bolt: '#fff27a', span: 1.6 } },
    'Ember Bear': { plan: emberBear, heavy: true, o: { len: 1.9, wid: 0.92, bodyH: 0.9, leg: 0.6, legR: 0.15, head: 0.31, snout: 0.25, ears: 'round', ear: 0.12,
      hump: true, tail: 'short', c: '#241c1a', c2: '#2e2420', snoutC: '#3a2c26', c3: '#120c0a', eyeC: '#ffb000', glowEyes: true,
      spots: { c: '#ff5a0a', glow: true, n: 34, size: 0.1 }, flame: '#ff6a10', flame2: '#ffc23a' } },
    'Crystal Stag': { plan: crystalStag, o: { len: 1.5, wid: 0.5, bodyH: 0.58, leg: 0.92, legR: 0.06, head: 0.2, snout: 0.26, snoutW: 0.8, neck: 0.55, neckAngle: 1.1,
      ears: 'side', ear: 0.15, tail: 'short', tailTip: '#f2c8ff', hooves: true, c: '#e6e0f6', c2: '#ffffff', c3: '#7a4ab8', eyeC: '#ff9cf0', glowEyes: true,
      crystals: '#d68cff', crystal1: '#8ff6ff', crystal2: '#e8a0ff' } },
    'Sabertooth': { plan: tiger, heavy: true, o: { len: 1.65, wid: 0.62, bodyH: 0.64, leg: 0.6, legR: 0.095, head: 0.34, snout: 0.2, snoutW: 1.05, ears: 'round', ear: 0.09, cheek: '#d8b080',
      tail: 'short', c: '#c8925a', c2: '#f2e2c2', snoutC: '#d8b080', c3: '#3a2a1a', eyeC: '#ffd23a', glowEyes: true, fangs: '#fffaf0',
      stripeC: '#6a4a2a', stripeZ: [0.3, 0.05, -0.2, -0.45], stripeW: 0.8, hump: true } },
  };
}
