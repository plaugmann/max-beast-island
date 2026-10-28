// Extra species for the high rarities (Mythic ... The Next Level).
// NEW_ANIMALS: list entries per rarity (merged into ANIMALS in data.js).
// default export: (P) => { 'Name': { plan, ...opts } } — P holds the body plans and builder helpers from animals.js.
export const NEW_ANIMALS = {
  Mythic: [
    { name: 'Kitsune', icon: '🦊' }, { name: 'Basilisk', icon: '🐍' }, { name: 'Chimera', icon: '🦁' },
    { name: 'Frost Drake', icon: '🐲', biome: 'ice' }, { name: 'Cerberus', icon: '🐕' }, { name: 'Manticore', icon: '🦂' }],
  Godly: [
    { name: 'Thunder Dragon', icon: '🐉' }, { name: 'Celestial Tiger', icon: '🐅' }, { name: 'Golden Griffin', icon: '🦅' },
    { name: 'Ice Titan', icon: '🧊', biome: 'ice' }, { name: 'Solar Eagle', icon: '☀️' }, { name: 'Emerald Serpent', icon: '🐍' }],
  Divine: [
    { name: 'Seraph Owl', icon: '🦉' }, { name: 'Holy Kirin', icon: '🦄' }, { name: 'Lava Leviathan', icon: '🌋', biome: 'volcano' },
    { name: 'Aurora Fox', icon: '🦊', biome: 'ice' }, { name: 'Starlight Pegasus', icon: '🐴' }, { name: 'Radiant Lion', icon: '🦁' }],
  Infinite: [
    { name: 'Nebula Whale', icon: '🐋' }, { name: 'Quantum Fox', icon: '⚛️' }, { name: 'Aurora Dragon', icon: '🐉' },
    { name: 'Infinity Serpent', icon: '♾️' }, { name: 'Starforged Griffin', icon: '🦅' }, { name: 'Supernova Phoenix', icon: '💥' }],
  'The Next Level': [
    { name: 'Shadow Kraken', icon: '🐙' }, { name: 'Null Dragon', icon: '🐲' }, { name: 'Abyss Stag', icon: '🦌' },
    { name: 'Rift Serpent', icon: '🐍' }, { name: 'Phantom Tiger', icon: '🐅' }, { name: 'Dark Matter Bear', icon: '🐻' }],
};

export default function species(P) {
  const { THREE, Builder, spots, wing, quad, bird, serpent, whale } = P;
  const PI = Math.PI, lerp = (a, b, t) => a + (b - a) * t;
  const M = () => new THREE.Matrix4();
  const rotM = (yaw = 0, pitch = 0, roll = 0, sc = 1) => M().makeRotationY(yaw).multiply(M().makeRotationX(pitch)).multiply(M().makeRotationZ(roll)).multiply(M().makeScale(sc, sc, sc));
  const xf = (geos, m) => geos.map((g) => g.clone().applyMatrix4(m));
  const THIN = new THREE.TorusGeometry(1, 0.05, 5, 36);
  const OCTA = new THREE.OctahedronGeometry(1, 0);
  const LOW = new THREE.SphereGeometry(1, 9, 6); // low-poly sphere for many small pieces

  // ---------- helpers ----------
  const idx = (b, type, n = 0) => { let k = 0; for (let i = 0; i < b.parts.length; i++) if (b.parts[i].type === type && k++ === n) return i; return -1; };
  const seg = (b, n) => b.parts.findIndex((p) => p.type === 'seg' && p.idx === n);
  // quad head geometry (same formulas as quad())
  const qHead = (o) => {
    const L = o.len, BH = o.bodyH, HR = o.head, NL = o.neck ?? L * 0.22, na = o.neckAngle ?? 0.85, by = o.leg + BH * 0.42;
    return { by, HR, hp: [0, Math.sin(na) * NL + HR * 0.15, Math.cos(na) * NL + HR * 0.25], start: [0, -BH * 0.1, -L * 0.04] };
  };
  // Replace a part's geometry with several rotated copies spread over `groups` parts (fans of tails, extra heads, ...)
  function fan(b, type, list, groups = 1) {
    const p = b.parts[idx(b, type)], sol = p.solid, glo = p.glow, parts = [p];
    for (let k = 1; k < groups; k++) { b.part(type, p.pivot.slice(), { parent: p.parent, idx: k, side: p.side, phase: p.phase }); parts.push(b.cur); }
    for (const q of parts) { q.solid = []; q.glow = []; }
    list.forEach((t, j) => {
      const m = rotM(t.yaw, t.pitch, t.roll, t.s), q = parts[j % groups];
      if (t.off) q.pivot = p.pivot.map((v, i) => v + t.off[i]);
      q.solid.push(...xf(sol, m)); q.glow.push(...xf(glo, m));
    });
    return parts;
  }
  // Extra heads: each {off, yaw, pitch}; the first entry transforms the original head
  function heads(b, list) {
    const i0 = idx(b, 'head'), p = b.parts[i0], sol = p.solid, glo = p.glow, base = p.pivot.slice();
    list.forEach((t, j) => {
      let q = p;
      if (j > 0) { b.part('head', base.slice(), { parent: p.parent, idx: j }); q = b.cur; }
      q.pivot = base.map((v, i) => v + (t.off?.[i] ?? 0));
      const m = rotM(t.yaw ?? 0, t.pitch ?? 0, t.roll ?? 0);
      q.solid = xf(sol, m); q.glow = xf(glo, m);
    });
  }
  // Rays in a disc (normal = +Z) around a centre
  function rays(b, c, n, r0, len, w, colors, off = 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + off, l = len * (i % 2 ? 0.65 : 1), d = [Math.cos(a), Math.sin(a)];
      b.g('cone', colors[i % colors.length], [c[0] + d[0] * (r0 + l / 2), c[1] + d[1] * (r0 + l / 2), c[2]], [w, l, w * 0.35], [0, 0, a - PI / 2]);
    }
  }
  // Tiger stripes: pairs of arcs up the flanks, slanted back (glowing or solid)
  const ARC = new THREE.TorusGeometry(1, 0.06, 5, 14, 1.9); ARC.rotateZ(-0.55);
  function bands(b, o, color, glow, n = 7, from = -0.38, to = 0.33, w = 0.02) {
    const L = o.len, W = o.wid, BH = o.bodyH, by = o.leg + BH * 0.42;
    const ell = [[by, 0, W / 2, BH / 2, L / 2], [by + BH * 0.06, L * 0.27, W * 0.53, BH * 0.56, L * 0.27], [by + BH * 0.02, -L * 0.27, W * 0.5, BH * 0.52, L * 0.26]];
    for (let i = 0; i < n; i++) {
      const z = L * lerp(from, to, i / (n - 1));
      let best = null;
      for (const [cy, cz, rx, ry, rz] of ell) {
        const k = Math.sqrt(Math.max(0, 1 - ((z - cz) / rz) ** 2));
        if (!best || rx * k > best[1]) best = [cy, rx * k, ry * k];
      }
      for (const sd of [-1, 1]) b[glow ? 'g' : 's'](ARC, color, [0, best[0], z + sd * L * 0.012 * (i % 2 ? 1 : -1)], [sd * best[1] * 1.0, best[2] * 1.0, (L * w) / 0.06], [-0.32, 0, 0]);
    }
  }
  // Plume tails (kitsune style) replacing a quad's tail: n tails fanned out, glowing tips
  function plumes(b, o, n, spread, fire, mid) {
    const tl = o.tailLen, t0 = b.parts[idx(b, 'tail')]; t0.solid = []; t0.glow = [];
    const groups = [t0], G = Math.min(3, n);
    for (let k = 1; k < G; k++) { b.part('tail', t0.pivot.slice(), { idx: k }); groups.push(b.cur); }
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0, yaw = t * spread, rise = 1.0 - 0.45 * Math.abs(t), m = 10;
      b.use(b.parts.indexOf(groups[i % G]));
      let y = 0, z = 0;
      for (let k = 0; k < m; k++) {
        const u = k / (m - 1), ang = 0.05 + rise * 1.5 * u, st = (tl / (m - 1)) * 1.15;
        y += Math.sin(ang) * st; z -= Math.cos(ang) * st;
        const rr = tl * (0.05 + 0.085 * Math.sin(PI * Math.min(u * 1.05, 1) * 0.85 + 0.25));
        const p = [z * Math.sin(yaw), y, z * Math.cos(yaw)];
        if (k >= m - 2) b.g(LOW, k === m - 1 ? '#ffffff' : fire, p, rr * (k === m - 1 ? 0.75 : 1.05));
        else b.s(LOW, k === m - 3 ? mid : o.c, p, rr);
      }
    }
  }
  // Teardrop flame (glow): sphere + cone on top
  const flame = (b, c, p, r) => { b.g('sphere', c, p, r); b.g('cone', c, [p[0], p[1] + r * 1.3, p[2]], [r * 0.85, r * 2.4, r * 0.85]); };
  // Flames on every foot of a quad (Divine)
  function footFlames(b, o, c) {
    for (let i = 0; i < b.parts.length; i++) if (b.parts[i].type === 'leg') {
      b.use(i); const LR = o.legR ?? o.len * 0.055;
      flame(b, c, [0, -o.leg + LR * 1.6, 0], LR * 1.25);
    }
  }

  // ---------- new plans ----------
  // Dragon with every quad option available (crystals, runes, halo, extra wings styles...)
  function dragonX(b, o) {
    const L = o.len;
    return quad(b, {
      wid: L * 0.32, bodyH: L * 0.3, leg: L * 0.3, legR: L * 0.05, head: L * 0.13, snout: L * 0.16, neck: L * 0.42, neckAngle: 0.75, neckW: 0.8,
      c3: '#221a14', ears: 'none', horns: 'horns', hornLen: 1.6, eyeC: '#ffd23a', glowEyes: true, tail: 'long', tailLen: L, tailFin: o.wingC,
      spikes: { n: 7, h: L * 0.09, c: o.spikeC ?? o.hornC ?? '#e8dcc2', glow: o.spikeGlow },
      wings: { span: L * (o.span ?? 1.05), c: o.wingC, style: o.wingStyle ?? 'bat', tip: o.wingTip ?? o.c, glow: o.wingGlow },
      ...o,
    });
  }

  // Upright giant (arms swing like legs)
  function titan(b, o) {
    const s = o.size, c = o.c, c2 = o.c2 ?? c, c3 = o.c3 ?? c, cr = o.crystals, hipY = 1.15 * s;
    b.s('sphere', c, [0, 1.38 * s, 0], [0.52 * s, 0.38 * s, 0.4 * s]);
    b.s('sphere', c, [0, 2.0 * s, 0], [0.8 * s, 0.56 * s, 0.52 * s], [0.12, 0, 0]);
    b.s('sphere', c2, [0, 1.98 * s, 0.2 * s], [0.58 * s, 0.44 * s, 0.38 * s], [0.12, 0, 0]);
    b.s('sphere', c2, [0, 1.45 * s, 0.18 * s], [0.38 * s, 0.26 * s, 0.26 * s]);
    spots(b, 12, 0, 2.08 * s, -0.16 * s, 0.62 * s, 0.5 * s, 0.4 * s, 0.2 * s, cr, true, 9, 'cone');
    for (const sd of [-1, 1]) {
      b.s('sphere', c3, [sd * 0.8 * s, 2.32 * s, 0], [0.36 * s, 0.3 * s, 0.36 * s]);
      for (let k = 0; k < 3; k++) b.g('cone', cr, [sd * (0.72 + k * 0.14) * s, 2.66 * s - k * 0.05 * s, (k - 1) * 0.14 * s], [0.1 * s, (0.65 - k * 0.12) * s, 0.1 * s], [(k - 1) * 0.3, 0, -sd * (0.25 + k * 0.25)]);
    }
    // head
    b.part('head', [0, 2.45 * s, 0.12 * s]);
    b.s('sphere', c, [0, 0.2 * s, 0.06 * s], [0.34 * s, 0.33 * s, 0.33 * s]);
    b.s('box', c3, [0, 0.3 * s, 0.3 * s], [0.56 * s, 0.09 * s, 0.14 * s]);
    b.s('sphere', c2, [0, 0.05 * s, 0.2 * s], [0.24 * s, 0.14 * s, 0.2 * s]);
    for (const sd of [-1, 1]) b.g('sphere', o.eyeC, [sd * 0.13 * s, 0.22 * s, 0.37 * s], [0.07 * s, 0.04 * s, 0.03 * s]);
    for (let k = 0; k < 5; k++) b.g('cone', cr, [(k - 2) * 0.1 * s, 0.48 * s - Math.abs(k - 2) * 0.05 * s, -0.02 * s], [0.07 * s, (0.55 - Math.abs(k - 2) * 0.12) * s, 0.07 * s], [-0.2, 0, -(k - 2) * 0.32]);
    // arms (animated like legs, opposite to the leg on the same side)
    for (const sd of [-1, 1]) {
      b.part('leg', [sd * 0.88 * s, 2.25 * s, 0], { phase: sd < 0 ? PI : 0 });
      b.tube([0, 0, 0], [sd * 0.12 * s, -0.75 * s, 0], 0.18 * s, 0.15 * s, c);
      b.s('sphere', c, [sd * 0.12 * s, -0.75 * s, 0], 0.17 * s);
      b.tube([sd * 0.12 * s, -0.75 * s, 0], [sd * 0.16 * s, -1.38 * s, 0.12 * s], 0.17 * s, 0.22 * s, c);
      b.s('sphere', c3, [sd * 0.16 * s, -1.55 * s, 0.14 * s], [0.25 * s, 0.24 * s, 0.25 * s]);
      for (let k = 0; k < 2; k++) b.g('cone', cr, [sd * 0.3 * s, (-0.95 - k * 0.22) * s, 0.04 * s], [0.05 * s, 0.26 * s, 0.05 * s], [0, 0, -sd * 1.2]);
    }
    for (const sd of [-1, 1]) {
      b.part('leg', [sd * 0.32 * s, hipY, 0], { phase: sd < 0 ? 0 : PI });
      b.tube([0, 0, 0], [0, -0.55 * s, 0.05 * s], 0.24 * s, 0.19 * s, c);
      b.s('sphere', c3, [0, -0.55 * s, 0.08 * s], 0.2 * s);
      b.tube([0, -0.55 * s, 0.05 * s], [0, -hipY + 0.12 * s, 0], 0.19 * s, 0.21 * s, c);
      b.s('sphere', c3, [0, -hipY + 0.09 * s, 0.1 * s], [0.24 * s, 0.11 * s, 0.32 * s]);
    }
    return { by: 1.6 * s, top: 3.0 * s };
  }

  // Octopus / kraken: big mantle + 8 swaying tentacles
  function octopus(b, o) {
    const s = o.size, c = o.c, c2 = o.c2 ?? c, gl = o.glow;
    b.s('sphere', c, [0, 1.2 * s, -0.4 * s], [0.62 * s, 0.85 * s, 0.7 * s], [-0.65, 0, 0]);
    b.s('sphere', c, [0, 0.66 * s, 0.08 * s], [0.6 * s, 0.46 * s, 0.56 * s]);
    b.s('sphere', c2, [0, 0.48 * s, 0.12 * s], [0.5 * s, 0.3 * s, 0.5 * s]);
    spots(b, 14, 0, 1.2 * s, -0.4 * s, 0.6 * s, 0.82 * s, 0.68 * s, 0.06 * s, gl, true, 41);
    b.g('torus', gl, [0, 1.55 * s, -0.7 * s], [0.5 * s, 0.5 * s, 0.5 * s], [PI / 2 - 0.9, 0, 0]);
    for (const sd of [-1, 1]) {
      b.s('sphere', c, [sd * 0.38 * s, 0.82 * s, 0.34 * s], 0.2 * s);
      b.g('sphere', o.eyeC, [sd * 0.44 * s, 0.85 * s, 0.44 * s], 0.13 * s);
      b.s('box', '#050308', [sd * 0.47 * s, 0.85 * s, 0.55 * s], [0.13 * s, 0.03 * s, 0.03 * s], [0, sd * 0.5, 0]);
      for (let k = 0; k < 3; k++) b.g('cone', gl, [sd * (0.25 + k * 0.12) * s, (1.05 + k * 0.06) * s, (0.22 - k * 0.1) * s], [0.04 * s, 0.22 * s, 0.04 * s], [-0.4, 0, -sd * (0.4 + k * 0.2)]);
    }
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) / 8) * PI * 2, d = [Math.sin(a), Math.cos(a)], pp = [Math.cos(a), -Math.sin(a)], cs = k % 2 ? 1 : -1;
      const len = Math.cos(a) > 0 ? 1.05 : 1.25;
      b.part('tail', [d[0] * 0.38 * s, 0.42 * s, d[1] * 0.38 * s + 0.05 * s], { idx: k });
      const R = [0, 0.45, 0.9, 1.3, 1.6, 1.68], Y = [0, -0.28, -0.37, -0.32, -0.12, 0.14], C = [0, 0, 0.06, 0.14, 0.28, 0.46];
      const pts = R.map((r, i) => [d[0] * r * s * len + pp[0] * C[i] * s * cs, Y[i] * s, d[1] * r * s * len + pp[1] * C[i] * s * cs]);
      const cv = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))).getPoints(11).map((v) => v.toArray());
      for (let i = 0; i < cv.length - 1; i++) b.tube(cv[i], cv[i + 1], lerp(0.2, 0.03, i / 11) * s, lerp(0.2, 0.03, (i + 1.15) / 11) * s, c);
      b.s('sphere', c, [0, 0, 0], 0.2 * s);
      for (let i = 1; i < 5; i++) b.g('sphere', gl, [pts[i][0], pts[i][1] + 0.15 * s * (1 - i / 5.5), pts[i][2]], 0.035 * s * (1.4 - i * 0.2));
    }
    return { by: 0.65 * s, top: 2.0 * s };
  }

  // ---------- species-specific builders ----------
  const plans = {
    kitsune(b, o) {
      const r = quad(b, o);
      plumes(b, o, 9, 1.2, o.fire, o.tailMid);
      const { by } = qHead(o);
      b.part('orb', [0, by + 0.25, 0]);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2; flame(b, o.fire, [Math.cos(a) * o.len * 0.75, (k % 2) * 0.2, Math.sin(a) * o.len * 0.75], 0.07); }
      return r;
    },
    basilisk(b, o) {
      const r = serpent(b, o), s = o.size, hy = 0.75 * s;
      b.use(idx(b, 'head'));
      for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.42; b.s('cone', o.crown, [Math.sin(a) * 0.15 * s, hy + 0.17 * s, 0.46 * s + Math.cos(a) * 0.04 * s], [0.035 * s, 0.16 * s * (k === 2 ? 1.5 : 1), 0.035 * s], [-0.25, 0, -a * 0.6]); }
      b.g('sphere', o.gem, [0, hy + 0.13 * s, 0.6 * s], 0.035 * s);
      for (const sd of [-1, 1]) {
        b.s('cone', '#f4f0e0', [sd * 0.07 * s, hy - 0.13 * s, 0.75 * s], [0.02 * s, 0.1 * s, 0.02 * s], [PI, 0, 0]);
        b.s('cone', o.c2, [sd * 0.17 * s, hy + 0.02 * s, 0.38 * s], [0.06 * s, 0.22 * s, 0.03 * s], [-1.2, 0, sd * 1.1]);
      }
      for (let i = 0; i < (o.segs ?? 7); i++) {
        b.use(seg(b, i)); const rr = 0.27 * s * (1 - (i + 0.5) / ((o.segs ?? 7) + 1.5));
        b.s('cone', o.spike, [0, rr * 1.05, -0.55 * s * 0.5], [rr * 0.25, rr * 0.8, rr * 0.35], [-0.4, 0, 0]);
      }
      return r;
    },
    chimera(b, o) {
      const r = quad(b, o), { by } = qHead(o), L = o.len, BH = o.bodyH, HR = o.head * 0.95;
      // goat head growing from the back
      b.part('head', [0, by + BH * 0.38, L * 0.02], { idx: 1 });
      const gp = [0, BH * 0.85, L * 0.06];
      b.tube([0, -BH * 0.1, 0], gp, HR * 0.5, HR * 0.4, o.goat);
      b.s('sphere', o.goat, gp, [HR * 0.62, HR * 0.68, HR * 0.8]);
      b.s('sphere', o.goat, [0, gp[1] - HR * 0.25, gp[2] + HR * 0.7], [HR * 0.38, HR * 0.38, HR * 0.6]);
      b.s('sphere', '#1a1412', [0, gp[1] - HR * 0.18, gp[2] + HR * 1.28], HR * 0.1);
      b.s('cone', o.goat, [0, gp[1] - HR * 0.85, gp[2] + HR * 0.75], [HR * 0.16, HR * 0.6, HR * 0.12], [PI, 0, 0]);
      b.eyes(HR * 0.42, gp[1] + HR * 0.2, gp[2] + HR * 0.55, HR * 0.13, o.eyeC, true);
      for (const sd of [-1, 1]) {
        b.s('sphere', o.goat, [sd * HR * 0.75, gp[1] + HR * 0.15, gp[2] - HR * 0.1], [HR * 0.45, HR * 0.14, HR * 0.2], [0, 0, -0.4 * sd]);
        const h0 = [sd * HR * 0.3, gp[1] + HR * 0.55, gp[2] - HR * 0.05];
        b.chain([h0, [sd * HR * 0.55, h0[1] + HR * 0.75, h0[2] - HR * 0.45], [sd * HR * 0.8, h0[1] + HR * 0.6, h0[2] - HR * 1.15],
          [sd * HR * 0.85, h0[1] - HR * 0.15, h0[2] - HR * 1.05], [sd * HR * 0.8, h0[1] - HR * 0.2, h0[2] - HR * 0.5]], HR * 0.2, HR * 0.06, o.goatHorn);
      }
      // snake tail with a head
      const ti = idx(b, 'tail'); b.parts[ti].solid = []; b.use(ti);
      const tl = o.tailLen, sc = o.snake, rs = L * 0.055;
      const pts = [[0, 0, 0], [0, -tl * 0.15, -tl * 0.35], [0, tl * 0.1, -tl * 0.7], [0, tl * 0.45, -tl * 0.75], [0, tl * 0.65, -tl * 0.5]];
      b.chain(pts, rs * 1.3, rs, sc);
      const sh = [0, tl * 0.7, -tl * 0.38];
      b.s('sphere', sc, sh, [rs * 1.5, rs * 1.1, rs * 2.0], [-0.4, 0, 0]);
      for (const sd of [-1, 1]) b.g('sphere', o.eyeC, [sd * rs * 0.95, sh[1] + rs * 0.6, sh[2] + rs * 0.6], rs * 0.32);
      for (const sd of [-1, 1]) b.s('cone', '#f4f0e0', [sd * rs * 0.5, sh[1] - rs * 1.0, sh[2] + rs * 1.5], [rs * 0.18, rs * 0.8, rs * 0.18], [PI - 0.4, 0, 0]);
      b.g('box', '#ff3a3a', [0, sh[1] - rs * 0.2, sh[2] + rs * 2.6], [rs * 0.15, rs * 0.06, rs * 1.2]);
      return r;
    },
    cerberus(b, o) {
      const r = quad(b, o), { by, HR, hp, start } = qHead(o), W = o.wid;
      b.use(idx(b, 'head'));
      const m = hp.map((v, i) => lerp(start[i], v, 0.45)), d = new THREE.Vector3(hp[0] - start[0], hp[1] - start[1], hp[2] - start[2]).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      const nr = W * 0.24 * (o.neckW ?? 1);
      b.s(THIN, o.collar, m, [nr * 1.1, nr * 1.1, nr * 5], q);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * PI * 2, v = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(q);
        b.g('cone', o.spikeC, [m[0] + v.x * nr * 1.2, m[1] + v.y * nr * 1.2, m[2] + v.z * nr * 1.2], [nr * 0.15, nr * 0.5, nr * 0.15], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v));
      }
      heads(b, [{ off: [0, 0.03, 0.04] }, { off: [-W * 0.5, -0.08, -0.12], yaw: -0.85, roll: -0.3 }, { off: [W * 0.5, -0.08, -0.12], yaw: 0.85, roll: 0.3 }]);
      return { ...r, by };
    },
    manticore(b, o) {
      const r = quad(b, o), L = o.len;
      const ti = idx(b, 'tail'); b.parts[ti].solid = []; b.use(ti);
      const pts = [[0, 0, 0], [0, L * 0.25, -L * 0.22], [0, L * 0.58, -L * 0.25], [0, L * 0.82, -L * 0.08], [0, L * 0.9, L * 0.15], [0, L * 0.82, L * 0.3]];
      for (let i = 0; i < pts.length - 1; i++) {
        const n = 3;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, p = pts[i].map((v, j) => lerp(v, pts[i + 1][j], t)), rr = L * 0.075 * (1 - (i * n + k) / 22);
          b.s('sphere', (i * n + k) % 2 ? o.tailC : o.tailC2, p, [rr * 1.1, rr, rr * 1.1]);
        }
      }
      const tip = pts[pts.length - 1];
      b.s('sphere', o.tailC2, tip, L * 0.07);
      b.g('cone', o.sting, [tip[0], tip[1] - L * 0.06, tip[2] + L * 0.1], [L * 0.03, L * 0.2, L * 0.03], [2.2, 0, 0]);
      for (let k = 0; k < 4; k++) b.g('cone', o.sting, [0, pts[2 + (k % 3)][1] + L * 0.06, pts[2 + (k % 3)][2]], [L * 0.015, L * 0.09, L * 0.015], [-0.5 + k * 0.3, 0, 0]);
      return r;
    },
    lung(b, o) { // eastern (thunder) dragon: long serpent body, antlers, whiskers, little legs
      const r = serpent(b, o), s = o.size, hy = 0.75 * s;
      b.use(idx(b, 'head'));
      for (const sd of [-1, 1]) {
        const a0 = [sd * 0.1 * s, hy + 0.1 * s, 0.45 * s], a1 = [sd * 0.22 * s, hy + 0.42 * s, 0.3 * s], a2 = [sd * 0.32 * s, hy + 0.66 * s, 0.1 * s];
        b.chain([a0, a1, a2], 0.035 * s, 0.015 * s, o.antler, true);
        b.tube(a1, [sd * 0.38 * s, hy + 0.5 * s, 0.38 * s], 0.025 * s, 0.01 * s, o.antler, true);
        b.chain([[sd * 0.1 * s, hy - 0.05 * s, 0.8 * s], [sd * 0.38 * s, hy - 0.08 * s, 0.92 * s], [sd * 0.58 * s, hy - 0.24 * s, 0.8 * s], [sd * 0.66 * s, hy - 0.4 * s, 0.62 * s]], 0.018 * s, 0.006 * s, o.antler, true);
        b.s('sphere', o.c2, [sd * 0.16 * s, hy - 0.02 * s, 0.45 * s], [0.04 * s, 0.14 * s, 0.1 * s], [0.3, 0, sd * 0.3]);
      }
      for (let k = 0; k < 6; k++) for (const sd of [-1, 0, 1]) b.s('cone', o.maneC, [sd * 0.07 * s, hy * (0.98 - k * 0.15) + 0.08 * s, 0.42 * s - k * 0.08 * s], [0.06 * s, (sd ? 0.22 : 0.3) * s, 0.035 * s], [-1.0, 0, -sd * 0.6]);
      b.part('orb', [0, hy + 0.1 * s, 1.0 * s]);
      b.g('sphere', o.antler, [0, 0, 0], 0.11 * s);
      b.g(THIN, '#ffffff', [0, 0, 0], [0.17 * s, 0.17 * s, 0.17 * s], [0.6, 0, 0]);
      for (const n of [1, 5]) {
        const i = seg(b, n); if (i < 0) continue; b.use(i);
        const rr = 0.27 * s * (1 - (n + 0.5) / ((o.segs ?? 7) + 1.5)), y0 = -0.27 * s + 0.02 * s;
        for (const sd of [-1, 1]) {
          b.tube([sd * rr * 0.7, -rr * 0.1, -0.27 * s], [sd * rr * 1.7, y0 * 0.45, -0.24 * s], rr * 0.42, rr * 0.34, o.c);
          b.s('sphere', o.c, [sd * rr * 1.7, y0 * 0.45, -0.24 * s], rr * 0.36);
          b.tube([sd * rr * 1.7, y0 * 0.45, -0.24 * s], [sd * rr * 1.8, y0, -0.16 * s], rr * 0.34, rr * 0.26, o.c);
          for (const a of [-0.5, 0, 0.5]) b.s('cone', '#f4f0e0', [sd * rr * 1.8 + Math.sin(a) * rr * 0.3, y0 + 0.02 * s, -0.12 * s + Math.cos(a) * rr * 0.3], [rr * 0.08, rr * 0.4, rr * 0.08], [PI / 2, a, 0]);
        }
      }
      return r;
    },
    tiger(b, o) {
      const r = quad(b, o);
      b.use(0); bands(b, o, o.bandC, o.bandGlow, 8, -0.38, 0.33, o.bandW ?? 0.02);
      // stripes on the tail too
      const ti = idx(b, 'tail'); b.use(ti);
      const tl = o.tailLen, LR = o.legR;
      const pts = [[0, 0, 0], [0, -tl * 0.25, -tl * 0.45], [0, -tl * 0.2, -tl * 0.8], [0, tl * 0.05, -tl * 1.05]];
      for (let i = 1; i < 6; i++) {
        const t = i / 6 * 3, k = Math.floor(t), f = t - k, p = pts[k].map((v, j) => lerp(v, pts[k + 1][j], f));
        const d = new THREE.Vector3(...pts[k + 1].map((v, j) => v - pts[k][j])).normalize();
        b[o.bandGlow ? 'g' : 's'](THIN, o.bandC, p, [LR * 0.6, LR * 0.6, LR * 2], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d));
      }
      if (o.tailFlame) flame(b, o.tailFlame, pts[3], LR * 1.1);
      { // face stripes + white cheek ruffs
        const { HR, hp } = qHead(o); b.use(idx(b, 'head'));
        for (let k = 0; k < 3; k++) b[o.bandGlow ? 'g' : 's']('box', o.bandC, [0, hp[1] + HR * 0.8, hp[2] + HR * (0.05 + k * 0.22)], [HR * (0.5 - k * 0.12), HR * 0.06, HR * 0.07], [0.3 * (k - 1) * 0, 0, 0]);
        for (const sd of [-1, 1]) {
          b.s('sphere', o.c2, [sd * HR * 0.58, hp[1] - HR * 0.32, hp[2] + HR * 0.25], [HR * 0.32, HR * 0.28, HR * 0.3]);
          for (let k = 0; k < 2; k++) b[o.bandGlow ? 'g' : 's']('box', o.bandC, [sd * HR * 0.8, hp[1] + HR * (0.15 - k * 0.25), hp[2] + HR * 0.1], [HR * 0.06, HR * 0.07, HR * 0.4], [0, sd * 0.4, sd * (0.4 + k * 0.2)]);
        }
      }
      if (o.feetFlame) footFlames(b, o, o.feetFlame);
      if (o.starRing) {
        const by = o.leg + o.bodyH * 0.42; b.part('orb', [0, by + o.bodyH * 0.9, 0]);
        for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2; b.g(OCTA, o.starRing, [Math.cos(a) * o.len * 0.55, (k % 2) * 0.18, Math.sin(a) * o.len * 0.55], [0.06, 0.13, 0.06], [0, a, 0]); }
      }
      return r;
    },
    griffin(b, o) {
      const r = quad(b, o), { HR, hp } = qHead(o);
      b.use(idx(b, 'head'));
      for (let i = 0; i < 4; i++) b[o.crestGlow ? 'g' : 's']('sphere', o.crest, [0, hp[1] + HR * (0.85 + i * 0.08), hp[2] - HR * (0.3 + i * 0.32)], [HR * 0.1, HR * 0.45, HR * 0.13], [-0.9 - i * 0.2, 0, 0]);
      return r;
    },
    sunBird(b, o) {
      const r = bird(b, o), s = o.size, HR = 0.24 * s, hy = HR * 0.6, hz = HR * 0.4;
      b.use(idx(b, 'head'));
      rays(b, [0, hy + HR * 0.2, hz - HR * 1.1], o.rayN ?? 12, HR * 1.85, HR * (o.rayLen ?? 0.8), HR * 0.16, o.rays);
      if (o.ring2) b.g('torus', o.ring2, [0, hy + HR * 0.2, hz - HR * 1.15], HR * 2.9, [0, 0, 0]);
      if (o.fanTail) {
        b.use(idx(b, 'tail'));
        for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.2; b.g('sphere', o.fanTail[k % o.fanTail.length], [Math.sin(a) * 0.75 * s, 0.02 * s, -0.95 * s * Math.cos(a)], [0.06 * s, 0.03 * s, 0.75 * s], [0.12, a, 0]); }
      }
      return r;
    },
    cobra(b, o) {
      const r = serpent(b, o), s = o.size, hy = 0.75 * s;
      b.use(idx(b, 'head'));
      b.s('sphere', o.hoodC, [0, hy - 0.22 * s, 0.33 * s], [0.44 * s, 0.42 * s, 0.07 * s], [-0.2, 0, 0]);
      b.g(THIN, o.gem, [0, hy - 0.22 * s, 0.335 * s], [0.44 * s, 0.42 * s, 0.6 * s], [-0.2, 0, 0]);
      b.s('sphere', o.c2, [0, hy - 0.24 * s, 0.355 * s], [0.26 * s, 0.31 * s, 0.05 * s], [-0.2, 0, 0]);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * PI * 2;
        b.g(OCTA, o.gem, [Math.cos(a) * 0.29 * s, hy - 0.24 * s + Math.sin(a) * 0.33 * s, 0.37 * s - Math.sin(a) * 0.06 * s], [0.035 * s, 0.05 * s, 0.03 * s]);
      }
      b.g(OCTA, o.gem, [0, hy - 0.3 * s, 0.4 * s], [0.07 * s, 0.1 * s, 0.05 * s]);
      b.g(OCTA, o.gem, [0, hy + 0.15 * s, 0.6 * s], [0.04 * s, 0.03 * s, 0.05 * s]);
      return r;
    },
    seraph(b, o) {
      const r = bird(b, o), s = o.size, HR = 0.34 * s, hy = HR * 0.6, by = 0.68 * s;
      b.use(idx(b, 'head'));
      b.g('torus', o.halo, [0, hy + HR * 1.45, 0], [HR * 0.8, HR * 0.8, HR * 0.8], [PI / 2, 0, 0]);
      for (const [dy, dz, span, rot, tw] of [[0.4, -0.02, 0.95, 0.6, 0.3], [-0.12, 0.02, 0.8, -0.5, -0.2]]) for (const sd of [-1, 1]) {
        wing(b, sd, [sd * 0.24 * s, by + dy * s, dz * s], span * s, o.wingC, 'feather', o.tip, true);
        const m = M().makeRotationZ(sd * rot).multiply(M().makeRotationY(-sd * tw));
        b.cur.solid = b.cur.solid.map((g) => g.applyMatrix4(m)); b.cur.glow = b.cur.glow.map((g) => g.applyMatrix4(m));
      }
      return r;
    },
    kirin(b, o) {
      const r = quad(b, o), { HR, hp } = qHead(o);
      footFlames(b, o, o.flame);
      b.use(idx(b, 'head'));
      for (const sd of [-1, 1]) b.chain([[sd * HR * 0.3, hp[1] - HR * 0.35, hp[2] + HR * 1.0], [sd * HR * 0.9, hp[1] - HR * 0.5, hp[2] + HR * 1.3], [sd * HR * 1.4, hp[1] - HR * 0.9, hp[2] + HR * 1.1]], HR * 0.06, HR * 0.02, o.whisker, true);
      b.s('cone', o.maneC, [0, hp[1] - HR * 0.75, hp[2] + HR * 0.3], [HR * 0.25, HR * 0.8, HR * 0.2], [PI + 0.3, 0, 0]);
      b.use(idx(b, 'tail'));
      flame(b, o.flame, [0, -o.tailLen * 0.7, -o.tailLen * 0.55], o.legR * 1.4);
      return r;
    },
    leviathan(b, o) {
      const r = serpent(b, o), s = o.size, hy = 0.75 * s;
      b.use(idx(b, 'head'));
      for (const sd of [-1, 1]) {
        b.chain([[sd * 0.1 * s, hy + 0.1 * s, 0.42 * s], [sd * 0.22 * s, hy + 0.28 * s, 0.22 * s], [sd * 0.26 * s, hy + 0.36 * s, -0.02 * s]], 0.05 * s, 0.01 * s, o.horn);
        b.g('sphere', o.lava, [sd * 0.12 * s, hy - 0.04 * s, 0.82 * s], [0.012 * s, 0.03 * s, 0.05 * s]);
      }
      b.g('box', o.lava, [0, hy - 0.1 * s, 0.72 * s], [0.18 * s, 0.015 * s, 0.25 * s]);
      for (let i = 0; i < (o.segs ?? 7); i += 2) { // glow only on segments that already glow (crystals) -> fewer draw calls
        b.use(seg(b, i)); const rr = 0.27 * s * (1 - (i + 0.5) / ((o.segs ?? 7) + 1.5));
        for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) b.g('sphere', o.lava, [sd * rr * 0.9, rr * (0.1 + k * 0.4), -0.55 * s * (0.3 + k * 0.35)], [rr * 0.1, rr * 0.08, rr * 0.3], [0, sd * 0.3, 0]);
      }
      return r;
    },
    aurora(b, o) {
      const r = quad(b, o), tl = o.tailLen, L = o.len, W = o.wid, BH = o.bodyH, by = o.leg + BH * 0.42;
      b.use(0);
      for (let i = 0; i < 8; i++) { const z = lerp(-L * 0.36, L * 0.3, i / 7), h = W * (0.32 + 0.18 * Math.sin((i / 7) * PI));
        b.g('box', o.aurora[Math.floor(i / 2) % o.aurora.length], [0, by + BH * 0.48 + h * 0.4, z], [0.02, h, L * 0.07], [-0.35, 0, 0]); }
      b.use(idx(b, 'tail'));
      const cc = [0, tl * 0.25, -tl * 0.5], d = new THREE.Vector3(0, 0.49, -0.87);
      o.aurora.forEach((c, i) => {
        const t = (i - 1.2) * 0.22 * tl, p = [cc[0] + d.x * t, cc[1] + d.y * t, cc[2] + d.z * t], rr = tl * 0.27 * Math.sqrt(Math.max(0.15, 1 - (t / (tl * 0.58)) ** 2));
        b.g(THIN, c, p, [rr, rr, tl * 0.5], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d));
      });
      return r;
    },
    pegasus(b, o) {
      const r = quad(b, o), tl = o.tailLen;
      b.use(idx(b, 'tail'));
      spots(b, 8, 0, -tl * 0.35, -tl * 0.3, tl * 0.17, tl * 0.5, tl * 0.19, tl * 0.035, o.star, true, 61);
      const { HR, hp } = qHead(o); b.use(idx(b, 'head'));
      for (let k = 0; k < 4; k++) b.g(OCTA, o.star, [0, hp[1] + HR * (0.9 + k * 0.05), hp[2] - HR * (0.5 + k * 0.9)], [HR * 0.12, HR * 0.12, HR * 0.12], [0, 0.6, 0.6]);
      return r;
    },
    radiant(b, o) {
      const r = quad(b, o), { HR, hp } = qHead(o);
      b.use(idx(b, 'head'));
      rays(b, [0, hp[1] - HR * 0.1, hp[2] - HR * 0.5], 16, HR * 1.3, HR * 0.9, HR * 0.17, o.rays);
      footFlames(b, o, o.flame);
      return r;
    },
    nebula(b, o) {
      const r = whale(b, o), s = o.size, by = 1.1 * s;
      b.use(0);
      const hoop = new THREE.TorusGeometry(1, 0.035, 6, 48);
      b.g(hoop, o.ring, [0, by, 0.2 * s], [1.6 * s, 1.5 * s, 1.6 * s], [0.25, 0, 0.3]);
      b.g(hoop, o.ring2, [0, by, -1.0 * s], [1.45 * s, 1.35 * s, 1.45 * s], [-0.2, 0, -0.4]);
      spots(b, 10, 0, by + 0.05 * s, 0, 1.1 * s, 1.0 * s, 3.0 * s, 0.18 * s, o.cloud, true, 71, 'sphere', 0.25);
      b.g(OCTA, '#ffffff', [0, by + 1.15 * s, 1.6 * s], [0.08 * s, 0.25 * s, 0.08 * s]);
      return r;
    },
    quantum(b, o) {
      const r = quad(b, o), { by } = qHead(o), L = o.len;
      plumes(b, o, 2, 0.45, o.tailTip, o.c2);
      b.part('orb', [0, by + o.bodyH * 0.1, 0]);
      const R = L * 0.68;
      [[PI / 2 + 0.5, 0, 0], [PI / 2 - 0.5, 0, 1.0], [PI / 2, 0.5, -1.0]].forEach((rot, i) => {
        b.g(THIN, o.ring[i], [0, 0, 0], [R, R, R * 0.6], rot);
        const v = new THREE.Vector3(R, 0, 0).applyEuler(new THREE.Euler(...rot));
        b.g('sphere', '#ffffff', [v.x, v.y, v.z], L * 0.04);
      });
      for (let k = 0; k < 4; k++) { const a = (k / 4) * PI * 2 + 0.4; b.g('box', o.ring[k % 3], [Math.cos(a) * R * 1.25, 0.15 + (k % 2) * 0.25, Math.sin(a) * R * 1.25], L * 0.07, [0.6, a, 0.6]); }
      return r;
    },
    infinity(b, o) {
      const r = serpent(b, o), s = o.size, n = o.segs ?? 7, segL = 0.55 * s;
      const rr = 0.27 * s * (1 - (n - 0.5) / (n + 1.5));
      b.use(seg(b, n - 1)); // second head at the tail end
      const hp = [0, rr * 0.6, -segL * 1.3];
      b.s('sphere', o.c, hp, [0.15 * s, 0.11 * s, 0.19 * s]);
      b.s('sphere', o.c, [0, hp[1] - 0.02 * s, hp[2] - 0.14 * s], [0.1 * s, 0.075 * s, 0.15 * s]);
      for (const sd of [-1, 1]) b.g('sphere', o.eyeC, [sd * 0.1 * s, hp[1] + 0.05 * s, hp[2] - 0.1 * s], 0.032 * s);
      b.part('orb', [0, 1.5 * s, -1.2 * s]);
      for (const sd of [-1, 1]) b.g(THIN, o.sym, [sd * 0.27 * s, 0, 0], [0.28 * s, 0.28 * s, 0.6 * s], [0, 0, 0]);
      return r;
    },
    rift(b, o) {
      const r = serpent(b, o), s = o.size, n = o.segs ?? 7, hy = 0.75 * s;
      for (let i = 0; i < n; i += 2) {
        b.use(seg(b, i)); const rr = 0.27 * s * (1 - (i + 0.5) / (n + 1.5));
        b.g(THIN, o.ring, [0, 0, -0.55 * s * 0.5], [rr * 1.25, rr * 1.15, rr * 4], [0, 0, 0]);
      }
      b.use(seg(b, n - 1));
      b.g('torus', o.ring2, [0, 0.05 * s, -0.55 * s * 1.4], [0.35 * s, 0.35 * s, 0.35 * s], [0, 0, 0]);
      b.use(idx(b, 'head'));
      for (let k = 0; k < 3; k++) b.g('box', o.ring2, [(k - 1) * 0.07 * s, hy + 0.14 * s, 0.5 * s + Math.abs(k - 1) * 0.03 * s], [0.015 * s, 0.01 * s, 0.22 * s], [0, (k - 1) * 0.4, 0]);
      for (const sd of [-1, 1]) b.chain([[sd * 0.12 * s, hy + 0.08 * s, 0.4 * s], [sd * 0.3 * s, hy + 0.3 * s, 0.25 * s], [sd * 0.25 * s, hy + 0.5 * s, 0.05 * s]], 0.04 * s, 0.01 * s, o.ring, true);
      return r;
    },
    stag(b, o) {
      const r = quad(b, o), L = o.len, BH = o.bodyH, by = o.leg + BH * 0.42;
      footFlames(b, o, o.hoofGlow);
      b.part('orb', [0, by + BH * 1.1, 0]);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * PI * 2; b.g(OCTA, o.shard, [Math.cos(a) * L * 0.55, (k % 2) * 0.25, Math.sin(a) * L * 0.55], [0.06, 0.16, 0.06], [0.3, a, 0.2]); }
      return r;
    },
    bear(b, o) {
      const r = quad(b, o), L = o.len, BH = o.bodyH, by = o.leg + BH * 0.42;
      b.part('orb', [0, by + BH * 0.85, 0]);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * PI * 2, p = [Math.cos(a) * L * 0.5, (k - 1) * 0.15, Math.sin(a) * L * 0.5];
        b.s('sphere', '#000000', p, 0.17);
        b.g('torus', o.orbRing, p, 0.3, [PI / 2 - 0.4, a, 0]);
        b.g('sphere', o.orbRing, [p[0], p[1] + 0.2, p[2]], 0.035);
      }
      return r;
    },
    nullDragon(b, o) {
      const r = dragonX(b, o), W = o.len * 0.32;
      heads(b, [{ off: [-W * 0.18, 0, 0], yaw: -0.3, roll: -0.08 }, { off: [W * 0.18, 0, 0], yaw: 0.3, roll: 0.08 }]);
      return r;
    },
  };

  // ---------- species ----------
  return {
    // Mythic
    'Kitsune': { plan: plans.kitsune, o: { len: 1.25, wid: 0.4, bodyH: 0.42, leg: 0.46, legR: 0.055, head: 0.22, snout: 0.3, snoutW: 0.75, ears: 'pointy', ear: 0.22, earC: '#fff6f0', tail: 'short', tailLen: 0.95, c: '#fbf6ee', c2: '#ffffff', snoutC: '#ffffff', c3: '#e8d8d0', eyeC: '#ff3a5a', glowEyes: true, stripes: '#ff3a4a', fire: '#6ad8ff', tailMid: '#dff4ff' } },
    'Basilisk': { plan: plans.basilisk, speed: 1.3, o: { size: 2.3, segs: 8, c: '#2f6a2a', c2: '#c9d27a', bandC: '#22501e', eyeC: '#ffe23a', glowEyes: true, crown: '#e8c23a', gem: '#ff2a2a', spike: '#183a16' } },
    'Chimera': { plan: plans.chimera, heavy: true, o: { len: 1.75, wid: 0.62, bodyH: 0.66, leg: 0.72, legR: 0.085, head: 0.3, snout: 0.2, snoutW: 1.1, ears: 'round', ear: 0.12, mane: '#8a3a1a', tail: 'none', tailLen: 1.0, c: '#c98f4a', c2: '#e8c88a', snoutC: '#e8c88a', eyeC: '#ffb02a', glowEyes: true, goat: '#d8d0c4', goatHorn: '#4a3a30', snake: '#3a7a2a' } },
    'Frost Drake': { plan: dragonX, flyer: true, flyH: 6, speed: 3.5, o: { len: 2.3, c: '#bfe4ff', c2: '#ffffff', c3: '#6a8aa8', wingC: '#7fb8e8', wingTip: '#e8f8ff', hornC: '#e8f8ff', spikeC: '#8fe8ff', spikeGlow: true, eyeC: '#7ff0ff', crystals: '#9ff0ff' } },
    'Cerberus': { plan: plans.cerberus, o: { len: 1.8, wid: 0.62, bodyH: 0.66, leg: 0.75, legR: 0.09, head: 0.23, snout: 0.28, snoutW: 0.85, ears: 'pointy', ear: 0.17, tail: 'thin', tailLen: 0.9, c: '#2a2220', c2: '#3a302c', snoutC: '#3a302c', c3: '#151010', eyeC: '#ff3a1a', glowEyes: true, collar: '#8a1a14', spikeC: '#ff5a1a', spikes: { n: 6, h: 0.16, c: '#ff4a1a', glow: true } } },
    'Manticore': { plan: plans.manticore, o: { len: 1.8, wid: 0.64, bodyH: 0.68, leg: 0.72, legR: 0.09, head: 0.3, snout: 0.2, snoutW: 1.1, ears: 'round', ear: 0.12, mane: '#5a1a14', tail: 'none', c: '#b8542a', c2: '#e0a070', snoutC: '#e0a070', eyeC: '#ffcf3a', glowEyes: true, wings: { span: 1.9, c: '#6a1a14', style: 'bat', tip: '#2a0a08' }, tailC: '#7a2414', tailC2: '#4a1208', sting: '#ff6a1a' } },
    // Godly
    'Thunder Dragon': { plan: plans.lung, flyer: true, flyH: 6, speed: 3.5, o: { size: 2.1, segs: 9, c: '#5a6a9a', c2: '#e8e0c0', bandC: '#4a5a8a', maneC: '#2a3050', antler: '#9fe8ff', eyeC: '#9fe8ff', glowEyes: true, crystals: '#9fe8ff' } },
    'Celestial Tiger': { plan: plans.tiger, heavy: true, o: { len: 1.95, wid: 0.66, bodyH: 0.68, leg: 0.76, legR: 0.09, head: 0.3, snout: 0.2, snoutW: 1.2, ears: 'pointy', ear: 0.13, tail: 'thin', tailLen: 1.1, c: '#f4efe6', c2: '#ffffff', snoutC: '#ffffff', c3: '#d8d0c0', eyeC: '#8ff0ff', glowEyes: true, bandC: '#24160a', bandW: 0.03, starRing: '#bff6ff', tailFlame: '#7fe8ff', spots: { c: '#bff6ff', glow: true, n: 14, size: 0.035 }, stripes: '#7fe8ff' } },
    'Golden Griffin': { plan: plans.griffin, flyer: true, perch: true, flyH: 4, o: { len: 1.9, wid: 0.66, bodyH: 0.68, leg: 0.72, legR: 0.085, head: 0.29, beak: '#ffcf3a', headC: '#fffaf0', ears: 'pointy', ear: 0.14, earC: '#fffaf0', tail: 'tuft', tailLen: 0.9, tailTip: '#fffaf0', c: '#e0b050', c2: '#fff0c0', c3: '#ffcf3a', wings: { span: 2.5, c: '#d8a040', tip: '#fff6c0', glow: true }, mane: '#fffaf0', maneGlow: '#fff2a0', eyeC: '#ff8a1a', glowEyes: true, halo: '#fff2a0', crest: '#fff2a0', crestGlow: true, runes: '#fff2a0' } },
    'Ice Titan': { plan: titan, heavy: true, speed: 0.9, o: { size: 1.15, c: '#bfe0f2', c2: '#e8f6ff', c3: '#7a9ab8', crystals: '#8ff0ff', eyeC: '#8ff0ff', leg: 1.2 } },
    'Solar Eagle': { plan: plans.sunBird, flyer: true, perch: true, flyH: 6, o: { size: 1.2, c: '#a86a1a', c2: '#e8b060', headC: '#ffffff', neckC: '#ffffff', wingC: '#8a5a1a', tip: '#ffe27a', tipGlow: true, beak: '#ffcf3a', eyeC: '#ff8a1a', glowEyes: true, corona: '#ffd23a', rays: ['#ffd23a', '#ff8a1a'], span: 1.6, tailC: '#ffffff' } },
    'Emerald Serpent': { plan: plans.cobra, speed: 1.3, o: { size: 1.8, segs: 8, c: '#1f8a4a', c2: '#bfeac8', bandC: '#146a36', hoodC: '#167040', crystals: '#3aff8a', gem: '#3aff8a', eyeC: '#3aff8a', glowEyes: true } },
    // Divine
    'Seraph Owl': { plan: plans.seraph, flyer: true, perch: true, flyH: 5, o: { size: 0.95, owl: true, c: '#fffaf0', c2: '#ffffff', faceC: '#fff3d8', wingC: '#ffffff', tip: '#ffd86a', tipGlow: true, eyeC: '#ffd23a', glowEyes: true, beak: '#d8a83a', halo: '#ffe27a', span: 1.2 } },
    'Holy Kirin': { plan: plans.kirin, o: { len: 1.7, wid: 0.55, bodyH: 0.62, leg: 0.95, legR: 0.065, head: 0.22, snout: 0.34, snoutW: 0.85, neck: 0.6, neckAngle: 1.05, neckW: 1.4, ears: 'pointy', ear: 0.11, horns: 'antlers', antler: 1.6, hornC: '#ffd86a', hornGlow: true, horseMane: '#2ac8b8', maneC: '#2ac8b8', tail: 'horse', tailLen: 0.9, tailC: '#2ac8b8', hooves: true, c: '#f2dca0', c2: '#fff6dc', c3: '#b88a2a', plates: '#e0b860', eyeC: '#7ff0e0', glowEyes: true, flame: '#ffb02a', whisker: '#ffd86a' } },
    'Lava Leviathan': { plan: plans.leviathan, speed: 1.2, o: { size: 2.1, segs: 9, c: '#2a1a16', c2: '#4a2418', bandC: '#3a201a', eyeC: '#ffb000', glowEyes: true, fins: '#3a1a12', crystals: '#ff5a0a', frill: '#ff6a1a', frillC: '#2a1410', horn: '#1a1210', lava: '#ff6a10' } },
    'Aurora Fox': { plan: plans.aurora, o: { len: 1.2, wid: 0.4, bodyH: 0.4, leg: 0.44, legR: 0.052, head: 0.21, snout: 0.28, snoutW: 0.75, ears: 'pointy', ear: 0.19, tail: 'bushy', tailLen: 0.95, tailTip: '#7fffc0', tipGlow: true, c: '#eef6ff', c2: '#ffffff', snoutC: '#ffffff', socks: '#9fd8ff', eyeC: '#7fffd0', glowEyes: true, aurora: ['#4aff9a', '#3ae8ff', '#8a6aff', '#ff6ae8'] } },
    'Starlight Pegasus': { plan: plans.pegasus, flyer: true, perch: true, flyH: 4, o: { len: 1.7, wid: 0.56, bodyH: 0.66, leg: 1.0, legR: 0.07, head: 0.22, snout: 0.38, snoutW: 0.8, neck: 0.62, neckAngle: 1.0, neckW: 1.5, ears: 'pointy', ear: 0.13, horseMane: '#c8d8ff', tail: 'horse', tailLen: 0.95, tailC: '#c8d8ff', hooves: true, c: '#2a3470', c2: '#3a4690', c3: '#c8d8ff', eyeC: '#bfe0ff', glowEyes: true, wings: { span: 2.2, c: '#e8eeff', tip: '#bfd8ff', glow: true }, spots: { c: '#ffffff', glow: true, n: 18, size: 0.035 }, star: '#ffffff' } },
    'Radiant Lion': { plan: plans.radiant, heavy: true, o: { len: 2.0, wid: 0.74, bodyH: 0.76, leg: 0.82, legR: 0.1, head: 0.33, snout: 0.2, snoutW: 1.1, ears: 'round', ear: 0.12, mane: '#ffcf4a', maneGlow: '#fff2a0', tail: 'tuft', tailLen: 0.95, tailTip: '#ffcf4a', c: '#f2d48a', c2: '#fff2cc', snoutC: '#fff2cc', eyeC: '#fff2a0', glowEyes: true, halo: '#fff2a0', rays: ['#fff2a0', '#ffb02a'], flame: '#ffcf4a' } },
    // Infinite
    'Nebula Whale': { plan: plans.nebula, flyer: true, flyH: 11, speed: 2.5, o: { size: 1.25, c: '#3a2a7a', c2: '#9a7ae8', c3: '#5a3aa8', spots: '#ffb0ff', ring: '#ff9af0', ring2: '#8af0ff', cloud: '#c08aff' } },
    'Quantum Fox': { plan: plans.quantum, o: { len: 1.15, wid: 0.38, bodyH: 0.38, leg: 0.42, legR: 0.05, head: 0.2, snout: 0.27, snoutW: 0.75, ears: 'pointy', ear: 0.18, tail: 'short', tailLen: 0.85, tailTip: '#9ff8ff', c: '#3a4aa8', c2: '#cfe0ff', snoutC: '#cfe0ff', socks: '#1a1a3a', eyeC: '#ffffff', glowEyes: true, runes: '#9ff8ff', ring: ['#9ff8ff', '#ff8af0', '#fff27a'] } },
    'Aurora Dragon': { plan: dragonX, flyer: true, flyH: 8, speed: 4, o: { len: 2.9, c: '#2a6a8a', c2: '#bff0ff', wingC: '#3a9ab8', wingStyle: 'feather', wingTip: '#9fffe0', wingGlow: true, span: 1.15, hornC: '#e8fff8', hornGlow: true, spikeC: '#9fffe0', spikeGlow: true, eyeC: '#e0fff8', crystals: '#c9a8ff', runes: '#9fffe0' } },
    'Infinity Serpent': { plan: plans.infinity, speed: 1.3, o: { size: 1.8, segs: 9, c: '#3a2a6a', c2: '#d8c8ff', bandC: '#5a3aa8', eyeC: '#ffffff', glowEyes: true, crystals: '#ffffff', sym: '#ffffff' } },
    'Starforged Griffin': { plan: plans.griffin, flyer: true, perch: true, flyH: 4.5, o: { len: 2.0, wid: 0.68, bodyH: 0.7, leg: 0.74, legR: 0.09, head: 0.3, beak: '#c8c8e8', headC: '#e8e8ff', ears: 'pointy', ear: 0.15, earC: '#e8e8ff', tail: 'tuft', tailLen: 0.9, tailTip: '#ffffff', tipGlow: true, c: '#4a4a6a', c2: '#8a8ab8', c3: '#c8c8e8', wings: { span: 2.7, c: '#5a5a8a', tip: '#ffffff', glow: true }, mane: '#e8e8ff', maneGlow: '#ffffff', plates: '#9a9ac8', crystals: '#ffffff', eyeC: '#ffffff', glowEyes: true, crest: '#ffffff', crestGlow: true } },
    'Supernova Phoenix': { plan: plans.sunBird, flyer: true, perch: true, flyH: 6, o: { size: 1.3, c: '#ff3a6a', c2: '#ffb02a', headC: '#ff6a3a', wingC: '#ff2a5a', tip: '#fff2a0', tipGlow: true, crest: '#ffffff', crestGlow: true, longTail: '#ffcf3a', tailGlow: true, beak: '#fff2c0', eyeC: '#ffffff', glowEyes: true, corona: '#ffffff', ring2: '#ff8a3a', rays: ['#ffffff', '#ffcf3a', '#ff5a8a'], rayN: 18, rayLen: 1.3, fanTail: ['#ff5a8a', '#ffcf3a', '#ffffff'], span: 1.6 } },
    // The Next Level
    'Shadow Kraken': { plan: octopus, speed: 1.0, o: { size: 2.0, c: '#1a1020', c2: '#2a1a30', glow: '#b04bff', eyeC: '#ff3aff' } },
    'Null Dragon': { plan: plans.nullDragon, flyer: true, flyH: 8, speed: 4, o: { len: 3.0, c: '#141018', c2: '#221a28', wingC: '#100c14', wingTip: '#ffffff', span: 1.15, hornC: '#ffffff', hornGlow: true, spikeC: '#ffffff', spikeGlow: true, eyeC: '#ffffff', runes: '#ffffff', spots: { c: '#ffffff', glow: true, n: 16, size: 0.05 } } },
    'Abyss Stag': { plan: plans.stag, o: { len: 1.8, wid: 0.6, bodyH: 0.68, leg: 1.05, legR: 0.07, head: 0.22, snout: 0.28, snoutW: 0.8, neck: 0.64, neckAngle: 1.1, ears: 'side', ear: 0.17, horns: 'antlers', antler: 4.4, hornC: '#2bf3d0', hornGlow: true, tail: 'short', hooves: true, c: '#141018', c2: '#221a28', c3: '#0a080c', eyeC: '#2bf3d0', glowEyes: true, runes: '#2bf3d0', hoofGlow: '#2bf3d0', shard: '#2bf3d0' } },
    'Rift Serpent': { plan: plans.rift, speed: 1.3, o: { size: 1.9, segs: 9, c: '#18121f', c2: '#2a1f36', eyeC: '#ff2bd6', glowEyes: true, crystals: '#ff2bd6', ring: '#ff2bd6', ring2: '#2bf3ff' } },
    'Phantom Tiger': { plan: plans.tiger, heavy: true, o: { len: 1.95, wid: 0.66, bodyH: 0.68, leg: 0.76, legR: 0.09, head: 0.3, snout: 0.2, snoutW: 1.2, ears: 'pointy', ear: 0.13, tail: 'thin', tailLen: 1.1, c: '#1a1a20', c2: '#22222a', c3: '#0a0a0e', eyeC: '#7fffe8', glowEyes: true, bandC: '#7fffe8', bandGlow: true, tailFlame: '#7fffe8', feetFlame: '#7fffe8' } },
    'Dark Matter Bear': { plan: plans.bear, heavy: true, speed: 1.0, o: { len: 2.8, wid: 1.4, bodyH: 1.35, leg: 1.0, legR: 0.23, head: 0.48, snout: 0.32, ears: 'round', ear: 0.17, tail: 'short', c: '#1a1420', c2: '#2a2030', c3: '#0a080c', plates: '#3a3040', runes: '#c07bff', crystals: '#c07bff', eyeC: '#d08cff', glowEyes: true, spots: { c: '#b06bff', glow: true, n: 22, size: 0.13 }, spikes: { n: 6, h: 0.45, c: '#c07bff', glow: true }, orbRing: '#c06bff' } },
  };
}
