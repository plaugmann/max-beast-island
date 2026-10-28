// Trees, bushes, ferns and rocks.
// Procedural branching trees with alpha-tested leaf / needle cards (canvas-generated textures),
// bark with bump shading, fake leaf translucency, wind sway + leaf flutter, triplanar textured rocks.
// Two levels of detail per tree (dithered cross-fade on the GPU) and spatial chunks that are
// switched on/off from the camera position, so ~7k trees stay cheap.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FEATURES, ISLAND_R, nearPlot } from './world.js';
import { mulberry32 } from './util.js';
import { leafClusterTexture, needleTexture, fernTexture, barkTexture, rockTexture } from './vegtextures.js';

const FORESTS_PINE = { x: 170, z: -300 };
const TAU = Math.PI * 2;
const V3 = THREE.Vector3;

const hash3 = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// LOD distances (metres, from the camera to the tree's base)
const TREE_LOD = 85, TREE_FADE = 8;
const ROCK_LOD = 140, ROCK_FADE = 20;
const SHADOW_CARDS = 40, SHADOW_FADE = 10; // leaf cards cast shadows up to here, solid proxies beyond
const PROXY_LAYER = 7;
const FAR = 1e6;

// ---------------------------------------------------------------------------------------------
// Geometry builder
// ---------------------------------------------------------------------------------------------
class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.d = []; this.idx = []; this.count = 0; }
  vert(p, n, u, v, col, d) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v);
    this.c.push(col[0], col[1], col[2]); this.d.push(d[0], d[1], d[2]);
    return this.count++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(this.d, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const _q = new THREE.Quaternion(), _t = new V3(), _a = new V3(), _b = new V3();

// Tapered tube along a polyline (parallel-transport frames). uv: u around, v along.
function tube(B, pts, radii, seg, { vScale = 1, ao = () => 1, strip = null } = {}) {
  const n = pts.length;
  const T = new V3().subVectors(pts[1], pts[0]).normalize();
  const N = Math.abs(T.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  const Bn = new V3().crossVectors(T, N).normalize();
  N.crossVectors(Bn, T).normalize();
  let len = 0;
  const base = B.count;
  for (let i = 0; i < n; i++) {
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    const Tn = i < n - 1 ? _t.subVectors(pts[i + 1], pts[i]) : _t.subVectors(pts[i], pts[i - 1]);
    Tn.normalize();
    _q.setFromUnitVectors(T, Tn);
    N.applyQuaternion(_q); T.copy(Tn);
    Bn.crossVectors(T, N).normalize(); N.crossVectors(Bn, T).normalize();
    const s = ao(i / (n - 1));
    const col = [s, s, s];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU;
      const dir = new V3().copy(N).multiplyScalar(Math.cos(a)).addScaledVector(Bn, Math.sin(a));
      const p = new V3().copy(pts[i]).addScaledVector(dir, radii[i]);
      if (strip) B.vert(p, dir, strip[0] + (j / seg) * 0.2, strip[1], col, [0, 0, 0]);
      else B.vert(p, dir, j / seg, len * vScale, col, [0, 0, 0]);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = base + i * (seg + 1) + j, b = a + seg + 1;
    B.quad(a, b, b + 1, a + 1);
  }
}

// Leaf card: centre c, "up" (twig direction, base at v=1) and "side" half vectors.
function leafCard(B, c, up, side, crown, col, phase, snow, vTop = 0.04) {
  const fn = new V3().crossVectors(side, up).normalize();
  const out = new V3().subVectors(c, crown.c).divide(crown.r);
  if (fn.dot(out) < 0) fn.negate();
  const corners = [[-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, vTop], [-1, 1, 0, vTop]];
  const ids = corners.map(([sx, sy, u, v]) => {
    const p = new V3().copy(c).addScaledVector(side, sx).addScaledVector(up, sy);
    const sph = _a.subVectors(p, crown.c).divide(crown.r);
    const dist = Math.min(1.3, sph.length());
    sph.normalize();
    const nrm = new V3().copy(fn).multiplyScalar(0.3).addScaledVector(sph, 0.85).normalize();
    // fake ambient occlusion: darker deep inside and underneath the crown
    const ao = (0.42 + 0.58 * Math.min(1, dist)) * (0.82 + 0.18 * Math.max(-1, Math.min(1, sph.y)));
    return B.vert(p, nrm, u, v, [col[0] * ao, col[1] * ao, col[2] * ao], [sy > 0 ? 1 : 0.35, phase, snow]);
  });
  B.quad(ids[0], ids[1], ids[2], ids[3]);
}

function randomPerp(dir, rnd) {
  const r = new V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
  return r.addScaledVector(dir, -r.dot(dir)).normalize();
}

// Solid low-poly stand-ins that only render into the shadow map for trees further from the
// camera (alpha-tested leaf cards in a 4096^2 shadow map are far too much overdraw).
function proxyPart(g) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
function trunkProxy(h, r) { return proxyPart(new THREE.CylinderGeometry(r * 0.5, r, h, 5, 1, true).translate(0, h / 2 - 0.05, 0)); }

// ---------------------------------------------------------------------------------------------
// Broadleaf trees (oak-like and birch)
// ---------------------------------------------------------------------------------------------
const SPECIES = {
  oak: {
    trunkLen: 0.56, trunkR: 0.046, lean: 0.05, mainN: [4, 6], mainFrom: 0.5, mainAng: [0.55, 0.95], mainLen: [0.3, 0.4],
    childN: [2, 4], childLen: 0.6, up: 0.18, gravity: 0.02, crown: { c: new V3(0, 0.74, 0), r: new V3(0.42, 0.33, 0.42) },
    card: [0.19, 0.26], cardsPer: 2, clusterStep: 0.09, leader: false, color: [1, 1, 1],
  },
  birch: {
    trunkLen: 0.97, trunkR: 0.032, lean: 0.06, mainN: [8, 11], mainFrom: 0.33, mainAng: [0.5, 0.8], mainLen: [0.18, 0.26],
    childN: [2, 3], childLen: 0.6, up: 0.04, gravity: 0.1, crown: { c: new V3(0, 0.68, 0), r: new V3(0.26, 0.36, 0.26) },
    card: [0.13, 0.18], cardsPer: 2, clusterStep: 0.06, leader: true, color: [1, 1, 1],
  },
};

function growBroadleaf(sp, seed) {
  const rnd = mulberry32(seed);
  const R = (a) => a[0] + rnd() * (a[1] - a[0]);
  const branches = []; // {pts, radii, depth}
  const clusters = []; // {p, dir}
  const crown = sp.crown;

  function grow(start, dir, length, r0, depth, maxDepth) {
    const segs = depth === 0 ? 7 : depth === 1 ? 5 : 3;
    const pts = [start.clone()], radii = [r0];
    const d = dir.clone();
    let p = start.clone();
    for (let i = 1; i <= segs; i++) {
      d.x += (rnd() - 0.5) * 0.25; d.z += (rnd() - 0.5) * 0.25;
      d.y += depth === 0 ? 0.02 : sp.up - sp.gravity * (depth);
      d.normalize();
      p = p.clone().addScaledVector(d, length / segs);
      pts.push(p);
      radii.push(r0 * (1 - 0.72 * (i / segs)) + 0.0015);
    }
    branches.push({ pts, radii, depth });
    if (depth >= 1) {
      for (let t = 0.35; t <= 1.0001; t += sp.clusterStep / length * 0.3 + 0.12) {
        const idx = Math.min(segs, Math.round(t * segs));
        const q = pts[idx].clone();
        // keep foliage inside the crown envelope
        const o = q.clone().sub(crown.c).divide(crown.r);
        if (o.length() > 1.05) q.copy(crown.c).add(o.setLength(1.0 + rnd() * 0.05).multiply(crown.r));
        clusters.push({ p: q, dir: d.clone().lerp(o.normalize(), 0.5).normalize() });
      }
    }
    if (depth < maxDepth) {
      const n = depth === 0 ? Math.round(R(sp.mainN)) : Math.round(R(sp.childN));
      for (let k = 0; k < n; k++) {
        const t = depth === 0 ? sp.mainFrom + (1 - sp.mainFrom) * ((k + rnd() * 0.7) / n) : 0.3 + 0.65 * ((k + rnd()) / n);
        const idx = Math.min(segs, Math.max(1, Math.round(t * segs)));
        const az = (k / n) * TAU + rnd() * 0.9 + seed;
        const ang = depth === 0 ? R(sp.mainAng) : 0.5 + rnd() * 0.5;
        let cd;
        if (depth === 0) cd = new V3(Math.cos(az) * Math.sin(ang), Math.cos(ang), Math.sin(az) * Math.sin(ang));
        else cd = d.clone().applyAxisAngle(randomPerp(d, rnd), ang);
        const len = depth === 0 ? R(sp.mainLen) * (sp.leader ? 1 - t * 0.55 : 1) : length * sp.childLen * (0.8 + rnd() * 0.4);
        grow(pts[idx], cd.normalize(), len, radii[idx] * (depth === 0 ? 0.55 : 0.6), depth + 1, maxDepth);
      }
    }
  }
  const lean = new V3((rnd() - 0.5) * sp.lean, 1, (rnd() - 0.5) * sp.lean).normalize();
  grow(new V3(0, -0.06, 0), lean, sp.trunkLen + 0.06, sp.trunkR, 0, 2);
  // a few clusters along the top of the trunk / leader
  const tr = branches[0].pts;
  for (let i = Math.floor(tr.length * 0.6); i < tr.length; i++) clusters.push({ p: tr[i].clone(), dir: new V3(0, 1, 0) });
  return { branches, clusters, rnd };
}

function broadleafGeos(kind, seed) {
  const sp = SPECIES[kind];
  const { branches, clusters, rnd } = growBroadleaf(sp, seed);
  const crown = sp.crown;
  // --- high detail ---
  const bark = new Builder();
  for (const br of branches) {
    if (br.depth === 2 && br.radii[0] < 0.004) continue;
    const seg = br.depth === 0 ? 10 : br.depth === 1 ? 6 : 4;
    const circ = TAU * Math.max(0.01, br.radii[0]);
    tube(bark, br.pts, br.radii, seg, {
      vScale: 1 / (circ * 2),
      ao: br.depth === 0 ? (t) => 0.7 + 0.3 * Math.min(1, t * 3) : () => 0.9,
    });
  }
  const leaves = new Builder();
  const addCluster = (B, cl, size, cards) => {
    const tint = 0.85 + rnd() * 0.3;
    const col = [tint * (0.95 + rnd() * 0.1), tint, tint * (0.9 + rnd() * 0.15)];
    for (let k = 0; k < cards; k++) {
      const up = cl.dir.clone().add(new V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.2)).normalize();
      const side = randomPerp(up, rnd);
      const s = size * (0.8 + rnd() * 0.4);
      const c = cl.p.clone().addScaledVector(up, s * 0.6);
      leafCard(B, c, up.multiplyScalar(s), side.multiplyScalar(s), crown, col, rnd(), 0);
    }
  };
  for (const cl of clusters) addCluster(leaves, cl, sp.card[0] + rnd() * (sp.card[1] - sp.card[0]), sp.cardsPer);
  // --- low detail: trunk + main branches (bark strip in the leaf texture) + fewer, bigger cards ---
  const lo = new Builder();
  for (const br of branches) {
    if (br.depth > 1) continue;
    const pts = br.pts.filter((_, i) => i % 2 === 0 || i === br.pts.length - 1);
    const radii = br.radii.filter((_, i) => i % 2 === 0 || i === br.radii.length - 1);
    tube(lo, pts, radii, br.depth === 0 ? 5 : 3, { strip: [0.4, 0.012], ao: () => 0.8 });
  }
  for (let i = 0; i < clusters.length; i += 4) addCluster(lo, clusters[i], (sp.card[0] + sp.card[1]) * 0.5 * 1.85, 2);
  const prox = [trunkProxy(sp.trunkLen, sp.trunkR)];
  const pr = (sp.card[0] + sp.card[1]) * 0.5;
  for (let i = 0; i < clusters.length; i += 5) {
    const c = clusters[i].p;
    prox.push(proxyPart(new THREE.IcosahedronGeometry(pr * (0.85 + rnd() * 0.3), 0).scale(1, 0.8, 1).translate(c.x, c.y + pr * 0.4, c.z)));
  }
  return { bark: bark.build(), leaves: leaves.build(), lo: lo.build(), proxy: mergeGeometries(prox) };
}

// ---------------------------------------------------------------------------------------------
// Spruce (layered drooping branch cards)
// ---------------------------------------------------------------------------------------------
const NEEDLE_V = 116 / 256, NEEDLE_HALF = 0.43, NEEDLE_STRIP = 1 - 7 / 256;

function spruceBranch(B, rnd, y, az, L, yrel, snowy, trunkR) {
  const out = new V3(Math.cos(az), 0, Math.sin(az));
  const side = new V3(-out.z, 0, out.x);
  const pitch = -0.5 + 0.75 * yrel + (rnd() - 0.5) * 0.35;
  const W = Math.max(0.05, L * 0.75);
  const phase = rnd();
  const tint = 0.85 + rnd() * 0.25;
  const rows = 4, ids = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const drop = -0.35 * L * t * t * (1 - yrel * 0.7);
    for (let c = -1; c <= 1; c++) {
      const p = new V3(0, y, 0)
        .addScaledVector(out, trunkR + t * L * Math.cos(pitch))
        .add(new V3(0, t * L * Math.sin(pitch) + drop + (1 - Math.abs(c)) * W * 0.16 - Math.abs(c) * W * 0.06 * t, 0))
        .addScaledVector(side, c * W * 0.5 * (0.35 + 0.65 * Math.min(1, t * 2.2)));
      const nrm = new V3(0, 1, 0).multiplyScalar(0.75).addScaledVector(out, 0.45 + 0.3 * t).addScaledVector(side, c * 0.12).normalize();
      const ao = (0.4 + 0.6 * t) * (0.72 + 0.28 * yrel) * tint;
      ids.push(B.vert(p, nrm, 0.02 + t * 0.97, NEEDLE_V + c * NEEDLE_HALF, [ao * 0.95, ao, ao * 0.95], [0.25 + 0.75 * t, phase, snowy ? (0.45 + 0.55 * (1 - Math.abs(c))) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.3))) : 0]));
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let c = 0; c < 2; c++) {
    const a = i * 3 + c;
    B.quad(ids[a], ids[a + 1], ids[a + 4], ids[a + 3]);
  }
}

function spruceGeos(seed, snowy) {
  const rnd = mulberry32(seed);
  const trunkPts = [], radii = [];
  const lx = (rnd() - 0.5) * 0.03, lz = (rnd() - 0.5) * 0.03;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    trunkPts.push(new V3(lx * t + (rnd() - 0.5) * 0.006, -0.06 + t * 1.06, lz * t + (rnd() - 0.5) * 0.006));
    radii.push(0.042 * (1 - t) + 0.003);
  }
  const bark = new Builder();
  tube(bark, trunkPts, radii, 8, { vScale: 1 / (TAU * 0.042 * 2), ao: (t) => 0.6 + 0.4 * Math.min(1, t * 4) });
  const needles = new Builder();
  const trunkAt = (y) => 0.042 * (1 - (y + 0.06) / 1.06) + 0.003;
  const whorls = (B, step, nPer, scale) => {
    for (let y = 0.09; y < 0.99; y += step * (0.85 + rnd() * 0.3)) {
      const yrel = (y - 0.09) / 0.9;
      const L = (0.035 + 0.34 * Math.pow(1 - yrel, 1.05)) * (0.85 + rnd() * 0.3) * scale;
      const n = Math.max(3, Math.round(nPer * (1 - yrel * 0.4)));
      const az0 = rnd() * TAU;
      for (let k = 0; k < n; k++) spruceBranch(B, rnd, y, az0 + (k / n) * TAU + (rnd() - 0.5) * 0.5, L * (0.85 + rnd() * 0.3), yrel, snowy, trunkAt(y) * 0.5);
    }
    // leader tip
    spruceBranch(B, rnd, 0.95, rnd() * TAU, 0.07, 1, snowy, 0);
  };
  whorls(needles, 0.034, 7, 1);
  const lo = new Builder();
  tube(lo, [trunkPts[0], trunkPts[4], trunkPts[7]], [radii[0], radii[4], radii[7] * 0.5], 4, { strip: [0.3, NEEDLE_STRIP], ao: () => 0.8 });
  whorls(lo, 0.075, 6, 1.1);
  const prox = [trunkProxy(1, 0.042)];
  for (let k = 0; k < 3; k++) {
    const y0 = 0.08 + k * 0.28, yrel = (y0 - 0.09) / 0.9;
    const r = (0.035 + 0.34 * Math.pow(Math.max(0, 1 - yrel), 1.05)) * 0.85;
    const h = k === 2 ? 0.95 - y0 : 0.42;
    prox.push(proxyPart(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y0 + h / 2 - 0.04, 0)));
  }
  return { bark: bark.build(), leaves: needles.build(), lo: lo.build(), proxy: mergeGeometries(prox) };
}

// ---------------------------------------------------------------------------------------------
// Dead tree, bush, fern, rocks
// ---------------------------------------------------------------------------------------------
function deadGeo(seed) {
  const sp = { ...SPECIES.oak, trunkLen: 0.75, trunkR: 0.05, mainN: [3, 4], mainFrom: 0.4, mainLen: [0.25, 0.35], up: 0.1, gravity: 0.05, childN: [1, 3] };
  const { branches } = growBroadleaf(sp, seed);
  const B = new Builder();
  for (const br of branches) {
    const circ = TAU * Math.max(0.01, br.radii[0]);
    tube(B, br.pts, br.radii, br.depth === 0 ? 9 : 5, { vScale: 1 / (circ * 2), ao: br.depth === 0 ? (t) => 0.6 + 0.4 * Math.min(1, t * 3) : () => 0.9 });
  }
  return B.build();
}

function bushGeo(seed) {
  const rnd = mulberry32(seed);
  const B = new Builder();
  const crown = { c: new V3(0, 0.22, 0), r: new V3(0.45, 0.32, 0.45) };
  for (let k = 0; k < 22; k++) {
    const az = rnd() * TAU, el = 0.15 + rnd() * 1.2;
    const dir = new V3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const up = dir.clone().add(new V3(0, 0.4, 0)).normalize();
    const side = randomPerp(up, rnd);
    const s = 0.2 + rnd() * 0.1;
    const c = new V3(0, 0.08, 0).addScaledVector(dir, 0.12 + rnd() * 0.12).addScaledVector(up, s * 0.7);
    const tint = 0.85 + rnd() * 0.3;
    leafCard(B, c, up.multiplyScalar(s), side.multiplyScalar(s), crown, [tint, tint, tint * 0.95], rnd(), 0);
  }
  return B.build();
}

function fernGeo(seed) {
  const rnd = mulberry32(seed);
  const B = new Builder();
  const n = 8;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * TAU + rnd() * 0.5;
    const out = new V3(Math.cos(az), 0, Math.sin(az)), side = new V3(-out.z, 0, out.x);
    const L = 0.5 + rnd() * 0.3, W = L * 0.36;
    const rise = 0.9 + rnd() * 0.35, phase = rnd();
    const ids = [];
    const segs = 5;
    let p = new V3(), a = rise;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const nrm = new V3(0, 1, 0).addScaledVector(out, 0.3).normalize();
      const shade = 0.55 + 0.45 * t;
      for (const c of [-1, 1]) {
        const q = p.clone().addScaledVector(side, c * W * 0.5 * Math.min(1, 0.4 + t * 2));
        ids.push(B.vert(q, nrm, c < 0 ? 0 : 1, 1 - t, [shade, shade, shade], [t, phase, 0]));
      }
      p = p.clone().addScaledVector(out, Math.cos(a) * L / segs).add(new V3(0, Math.sin(a) * L / segs, 0));
      a -= 0.42;
    }
    for (let i = 0; i < segs; i++) B.quad(ids[i * 2], ids[i * 2 + 1], ids[i * 2 + 3], ids[i * 2 + 2]);
  }
  return B.build();
}

function ihash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const fx = f(x - ix), fy = f(y - iy), fz = f(z - iz);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    v += ihash3(ix + dx, iy + dy, iz + dz, s) * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
  }
  return v;
}

function rockGeo(seed, detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const rnd = mulberry32(seed);
  const planes = [];
  for (let k = 0; k < 7; k++) {
    const n = new V3(rnd() - 0.5, (rnd() - 0.35) * 1.2, rnd() - 0.5).normalize();
    planes.push([n, 0.62 + rnd() * 0.25]);
  }
  const p = g.attributes.position, v = new V3();
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let r = 1 + 0.22 * (noise3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6, seed) - 0.5)
      + 0.08 * (noise3(v.x * 5, v.y * 5, v.z * 5, seed + 1) - 0.5)
      + 0.03 * (noise3(v.x * 12, v.y * 12, v.z * 12, seed + 2) - 0.5);
    v.multiplyScalar(r);
    // chiselled faces
    let cut = 0;
    for (const [n, d] of planes) {
      const e = v.dot(n) - d;
      if (e > 0) { v.addScaledVector(n, -e * 0.85); cut += e; }
    }
    v.y = v.y < -0.25 ? -0.25 + (v.y + 0.25) * 0.25 : v.y * 0.78;
    p.setXYZ(i, v.x, v.y, v.z);
    const ao = Math.max(0.45, Math.min(1, 0.8 + (r - 1) * 2.2 + cut * 0.4)) * (v.y < -0.15 ? 0.75 : 1);
    cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Materials (MeshStandardMaterial / MeshDepthMaterial patched via onBeforeCompile)
// ---------------------------------------------------------------------------------------------
const U = { uTime: { value: 0 }, uCamPos: { value: new V3(1e7, 0, 1e7) } };

const VEG_VERT_PARS = /* glsl */ `
uniform float uTime; uniform vec3 uCamPos; uniform vec4 uRange;
varying vec2 vFade;
#ifdef VEG_DATA
attribute vec3 aData;
varying float vSnow;
#endif
#ifdef VEG_ROCK
varying vec3 vObjPos; varying vec3 vObjN;
#endif
`;
const VEG_VERT_MAIN = /* glsl */ `
vec3 ip = vec3(0.0);
float isc = 1.0;
#ifdef USE_INSTANCING
  ip = instanceMatrix[3].xyz;
  isc = length(instanceMatrix[0].xyz);
#endif
float vd = distance(ip, uCamPos);
vFade = vec2(clamp((vd - uRange.x) / max(uRange.y - uRange.x, 0.001), 0.0, 1.0),
             1.0 - clamp((vd - uRange.z) / max(uRange.w - uRange.z, 0.001), 0.0, 1.0));
#ifdef VEG_DATA
  vSnow = aData.z;
#endif
#ifdef VEG_WIND
  float ph = ip.x * 0.043 + ip.z * 0.061;
  float gust = 0.65 + 0.35 * sin(uTime * 0.31 + ip.x * 0.004);
  float sw = (sin(uTime * 1.05 + ph) + 0.45 * sin(uTime * 2.25 + ph * 1.7)) * gust;
  float hk = max(position.y - 0.12, 0.0); hk *= hk;
  transformed.x += sw * 0.035 * hk; transformed.z += sw * 0.022 * hk;
  #ifdef VEG_DATA
    float fl = sin(uTime * 6.5 + aData.y * 6.283 + ph * 5.0) + 0.5 * sin(uTime * 11.0 + aData.y * 17.0);
    transformed += normal * (fl * VEG_FLUTTER * aData.x * gust);
  #endif
#endif
#ifdef VEG_ROCK
  vObjPos = position * isc; vObjN = normal;
#endif
`;
const VEG_FRAG_PARS = /* glsl */ `
varying vec2 vFade;
#ifdef VEG_DATA
varying float vSnow;
#endif
#ifdef VEG_ROCK
varying vec3 vObjPos; varying vec3 vObjN;
uniform sampler2D uRockTex;
#endif
vec3 vegPerturb(vec3 p, vec3 n, vec2 dH) {
  vec3 sx = dFdx(p), sy = dFdy(p);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 o = abs(det) * n - sign(det) * (dH.x * r1 + dH.y * r2);
  float l = length(o);
  return l > 1e-12 ? o / l : n;
}
`;
const VEG_DITHER = /* glsl */ `
{
  float hd = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (hd < 1.0 - vFade.x || hd >= vFade.y) discard;
}
`;
const VEG_ALPHA = /* glsl */ `
#ifdef USE_MAP
{
  // keep leaf coverage in the small mip levels (otherwise far trees go thin and bald)
  vec2 tsz = vec2(textureSize(map, 0));
  vec2 dx = dFdx(vMapUv * tsz), dy = dFdy(vMapUv * tsz);
  float mip = max(0.0, 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8)));
  diffuseColor.a *= 1.0 + mip * 0.28;
}
#endif
if (diffuseColor.a < alphaTest) discard;
`;

const RE_DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

function patch(mat, o) {
  const defs = [
    o.data ? '#define VEG_DATA' : '', o.wind ? '#define VEG_WIND' : '', o.rock ? '#define VEG_ROCK' : '',
    `#define VEG_FLUTTER ${(o.flutter ?? 0).toFixed(4)}`,
  ].join('\n') + '\n';
  const key = ['veg', o.data, o.wind, o.rock, o.flutter, o.leaf, o.depth, o.trans, o.snow, o.bump, o.moss].join('|');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uCamPos = U.uCamPos;
    sh.uniforms.uRange = o.range;
    if (o.rock) sh.uniforms.uRockTex = o.rockTex;
    sh.vertexShader = defs + sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VEG_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VEG_VERT_MAIN)
      .replace('#include <project_vertex>', '#include <project_vertex>\nif (vFade.x <= 0.0 || vFade.y <= 0.0) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);');
    let fs = defs + sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + VEG_FRAG_PARS)
      .replace('#include <clipping_planes_fragment>', VEG_DITHER + '#include <clipping_planes_fragment>');
    if (o.leaf) fs = fs.replace('#include <alphatest_fragment>', VEG_ALPHA);
    if (!o.depth) {
      if (o.leaf) {
        // keep the crown-shaped normals on both sides of a card
        fs = fs.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
        // light shining through the leaves (only where the sun is not shadowed)
        fs = fs.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replaceAll(RE_DIRECT, RE_DIRECT + `
          {
            float back = pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 3.0);
            float thru = 0.25 + 0.75 * clamp(-dot(geometryNormal, directLight.direction) * 0.5 + 0.5, 0.0, 1.0);
            reflectedLight.directDiffuse += directLight.color * material.diffuseColor * vec3(0.9, 1.1, 0.55) * ((0.18 + 1.4 * back) * thru * ${o.trans.toFixed(3)});
          }`));
      }
      if (o.snow) {
        fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
          {
            float lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));
            float sn = vSnow * (gl_FrontFacing ? 1.0 : 0.2) * clamp(lum * 30.0 - 0.2, 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.82, 0.88), clamp(sn, 0.0, 0.85));
          }`);
      }
      if (o.bump) {
        fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { float hb = texture2D(map, vMapUv).a; normal = vegPerturb(-vViewPosition, normal, vec2(dFdx(hb), dFdy(hb)) * ${o.bump.toFixed(4)}); }`);
      }
      if (o.rock) {
        fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
          vec3 rn = normalize(vObjN + vec3(1e-5));
          vec3 tw = pow(abs(rn), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          vec3 rq = vObjPos * 0.21;
          vec4 rt = texture2D(uRockTex, rq.zy) * tw.x + texture2D(uRockTex, rq.xz + 0.37) * tw.y + texture2D(uRockTex, rq.xy + 0.71) * tw.z;
          float rel = (vColor.g - vColor.r) / max(vColor.g, 1e-3);
          float snowCap = clamp((rel - 0.07) * 40.0, 0.0, 1.0);
          float topness = clamp((rn.y - 0.55 + (rt.a - 0.5) * 0.8) * 3.0, 0.0, 1.0);
          float moss = topness * ${(o.moss ?? 0).toFixed(3)} * clamp(rel * 30.0, 0.0, 1.0) * (1.0 - snowCap);
          diffuseColor.rgb *= mix(rt.rgb * 1.6, vec3(0.08, 0.13, 0.035), moss);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.83, 0.88), clamp((rn.y - 0.3 + (rt.a - 0.5) * 0.6) * 4.0, 0.0, 1.0) * snowCap);`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = vegPerturb(-vViewPosition, normal, vec2(dFdx(rt.a), dFdy(rt.a)) * 0.12);`);
      }
    }
    sh.fragmentShader = fs;
  };
  return mat;
}

function makeMats(kind, opts) {
  const range = { value: new THREE.Vector4(...opts.range) };
  const common = { ...opts, range };
  const dRange = opts.shadowRange ? { value: new THREE.Vector4(...opts.shadowRange) } : range;
  let m;
  if (kind === 'proxy') {
    m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patch(d, { range, wind: true, depth: true });
    m.userData.range = opts.range;
    return [m, d];
  }
  if (kind === 'leaf') {
    m = new THREE.MeshStandardMaterial({ map: opts.map, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8, metalness: 0, envMapIntensity: 0.8 });
  } else if (kind === 'bark') {
    m = new THREE.MeshStandardMaterial({ map: opts.map, vertexColors: true, roughness: 0.95, metalness: 0 });
  } else {
    m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 });
  }
  patch(m, { ...common, leaf: kind === 'leaf', data: kind !== 'rock', rock: kind === 'rock', map: undefined, rockTex: opts.rockTex });
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: kind === 'leaf' ? opts.map : null, alphaTest: kind === 'leaf' ? 0.5 : 0 });
  patch(d, { ...common, range: dRange, leaf: kind === 'leaf', data: kind !== 'rock', rock: false, depth: true, map: undefined, snow: false, bump: 0, trans: 0 });
  // stash range for the CPU-side chunk visibility
  m.userData.range = opts.range;
  return [m, d];
}

// ---------------------------------------------------------------------------------------------
export function createVegetation(world, scene) {
  const rng = world.rng;
  const F = FEATURES;
  const colliders = [];
  const instances = { pine: [], snowpine: [], oak: [], birch: [], dead: [], bush: [], rock: [], rockB: [] };
  const near = (x, z, f, r) => Math.hypot(x - f.x, z - f.z) < r;
  const blocked = (x, z) => near(x, z, F.cave, F.cave.r + 14) || near(x, z, F.spawn, 18) || nearPlot(x, z, 7);

  // ---- placement (unchanged: consumes world.rng exactly like before) ----
  const lim = ISLAND_R + 200;
  for (let i = 0; i < 90000; i++) {
    const x = (rng() * 2 - 1) * lim, z = (rng() * 2 - 1) * lim;
    const h = world.heightAt(x, z);
    if (h < 2.2 || blocked(x, z)) continue;
    const [, ny] = world.normalAt(x, z);
    const slope = 1 - ny;
    const forest = world.forestAt(x, z);
    const snow = world.snowAt(x, z);
    const inVolcano = near(x, z, F.volcano, F.volcano.r * 0.85);
    const r = rng();

    if (inVolcano) {
      if (r < 0.006 && slope < 0.35 && h < 120) instances.dead.push([x, h, z, 6 + rng() * 5]);
      continue;
    }
    if (slope > 0.42) continue;
    const pTree = forest * 0.55 + 0.012;
    if (r < pTree && h < 150) {
      const s = 9 + rng() * 9;
      const conifer = h > 55 || snow > 0.1 || near(x, z, FORESTS_PINE, 260) || rng() < 0.25;
      if (snow > 0.2 || (near(x, z, F.ice, F.ice.r * 1.1) && h > 30)) instances.snowpine.push([x, h, z, s * 1.05]);
      else if (conifer) instances.pine.push([x, h, z, s * 1.1]);
      else if (rng() < 0.6) instances.oak.push([x, h, z, s]);
      else instances.birch.push([x, h, z, s * 0.95]);
      colliders.push({ x, z, r: 0.04 * s + 0.15 });
    } else if (r < pTree + forest * 0.25 + 0.006 && snow < 0.3) {
      instances.bush.push([x, h, z, 1.2 + rng() * 1.6]);
    }
  }
  for (let i = 0; i < 22000 && instances.rock.length + instances.rockB.length < 2600; i++) {
    const x = (rng() * 2 - 1) * lim, z = (rng() * 2 - 1) * lim;
    const h = world.heightAt(x, z);
    if (h < -3 || blocked(x, z)) continue;
    const slope = 1 - world.normalAt(x, z)[1];
    const p = 0.03 + slope * 0.4 + (h > 40 ? 0.08 : 0) + (h < 3 && h > -1 ? 0.05 : 0);
    if (rng() > p) continue;
    const s = rng() < 0.08 ? 3 + rng() * 5 : 0.4 + rng() * 2;
    (rng() < 0.5 ? instances.rock : instances.rockB).push([x, h - s * 0.15, z, s]);
    if (s > 1.6) colliders.push({ x, z, r: s * 0.85 });
  }
  // Ferns: forest-floor clutter, own deterministic generator so world.rng is untouched
  const ferns = [];
  {
    const fr = mulberry32(90210);
    for (let i = 0; i < 260000; i++) {
      const x = (fr() * 2 - 1) * lim, z = (fr() * 2 - 1) * lim, keep = fr(), sc = fr();
      const forest = world.forestAt(x, z);
      if (forest < 0.25 || keep > forest * 0.8) continue;
      const h = world.heightAt(x, z);
      if (h < 3 || h > 140 || blocked(x, z) || world.snowAt(x, z) > 0.1 || near(x, z, F.volcano, F.volcano.r)) continue;
      if (world.normalAt(x, z)[1] < 0.8) continue;
      ferns.push([x, h - 0.05, z, 0.9 + sc * 0.9]);
    }
  }

  // ---- textures & materials ----
  const tex = {
    oak: leafClusterTexture('oak', 1), birch: leafClusterTexture('birch', 2), bush: leafClusterTexture('bush', 3),
    needle: needleTexture(3), fern: fernTexture(5),
    barkOak: barkTexture('oak'), barkPine: barkTexture('pine'), barkBirch: barkTexture('birch'), barkDead: barkTexture('dead'),
    rock: rockTexture(),
  };
  const HI = [-2, -1, TREE_LOD - TREE_FADE, TREE_LOD], LO = [TREE_LOD - TREE_FADE, TREE_LOD, FAR, FAR + 1], ALL = [-2, -1, FAR, FAR + 1];
  const SH = [-2, -1, SHADOW_CARDS - SHADOW_FADE, SHADOW_CARDS];
  const leafOpts = { wind: true, flutter: 0.0045, trans: 0.55, shadowRange: SH };
  const M = {
    oakLeaf: makeMats('leaf', { ...leafOpts, map: tex.oak, range: HI }),
    oakLo: makeMats('leaf', { ...leafOpts, map: tex.oak, range: LO }),
    birchLeaf: makeMats('leaf', { ...leafOpts, map: tex.birch, range: HI, trans: 0.7 }),
    birchLo: makeMats('leaf', { ...leafOpts, map: tex.birch, range: LO, trans: 0.7 }),
    pineLeaf: makeMats('leaf', { ...leafOpts, map: tex.needle, range: HI, flutter: 0.002, trans: 0.3 }),
    pineLo: makeMats('leaf', { ...leafOpts, map: tex.needle, range: LO, flutter: 0.0, trans: 0.3 }),
    snowLeaf: makeMats('leaf', { ...leafOpts, map: tex.needle, range: HI, flutter: 0.0015, trans: 0.25, snow: true }),
    snowLo: makeMats('leaf', { ...leafOpts, map: tex.needle, range: LO, flutter: 0.0, trans: 0.25, snow: true }),
    bush: makeMats('leaf', { ...leafOpts, map: tex.bush, range: [-2, -1, 320, 380], flutter: 0.01, shadowRange: [-2, -1, 25, 35] }),
    proxy: makeMats('proxy', { range: [SHADOW_CARDS - SHADOW_FADE, SHADOW_CARDS, FAR, FAR + 1] }),
    fern: makeMats('leaf', { wind: true, flutter: 0.02, trans: 0.6, map: tex.fern, range: [-2, -1, 32, 42] }),
    oakBark: makeMats('bark', { wind: true, map: tex.barkOak, range: HI, bump: 0.05 }),
    birchBark: makeMats('bark', { wind: true, map: tex.barkBirch, range: HI, bump: 0.03 }),
    pineBark: makeMats('bark', { wind: true, map: tex.barkPine, range: HI, bump: 0.05 }),
    deadBark: makeMats('bark', { wind: true, map: tex.barkDead, range: ALL, bump: 0.05 }),
    rockHi: makeMats('rock', { rockTex: { value: tex.rock }, range: [-2, -1, ROCK_LOD - ROCK_FADE, ROCK_LOD], moss: 0.6 }),
    rockLo: makeMats('rock', { rockTex: { value: tex.rock }, range: [ROCK_LOD - ROCK_FADE, ROCK_LOD, FAR, FAR + 1], moss: 0.6 }),
  };

  // ---- geometry variants ----
  const NV = 3;
  const G = {
    oak: [11, 23, 37].map((s) => broadleafGeos('oak', s)),
    birch: [5, 17, 29].map((s) => broadleafGeos('birch', s)),
    pine: [3, 13, 31].map((s) => spruceGeos(s, false)),
    snowpine: [7, 19, 41].map((s) => spruceGeos(s, true)),
  };
  const deadG = [deadGeo(8), deadGeo(21)];
  const bushG = [bushGeo(4), bushGeo(9)];
  const fernG = [fernGeo(6), fernGeo(12)];
  const rockG = { rock: [rockGeo(1, 7), rockGeo(1, 2)], rockB: [rockGeo(7, 7), rockGeo(7, 2)] };

  // ---- instancing in spatial chunks ----
  const managed = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new V3(), pv = new V3();
  const color = new THREE.Color();

  const DBG = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('vegdbg')) || '';
  const stats = {};
  function addLayer(items, geo, mats, chunk, colorFn, { castShadow = true, isRock = false, tag = '', layer = 0 } = {}) {
    if (!items.length) return;
    if (tag && DBG.includes(tag)) return;
    if (DBG.includes('noshadow')) castShadow = false;
    stats[tag] = stats[tag] || { inst: 0, verts: 0, meshes: 0 };
    stats[tag].inst += items.length; stats[tag].verts += items.length * geo.attributes.position.count; stats[tag].meshes++;
    const [mat, depth] = mats;
    const range = mat.userData.range;
    const chunks = new Map();
    for (const it of items) {
      const key = Math.floor(it[0] / chunk) + ',' + Math.floor(it[2] / chunk);
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(it);
    }
    for (const list of chunks.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.customDepthMaterial = depth;
      const bb = new THREE.Box3();
      list.forEach(([x, y, z, s], i) => {
        const a = hash3(x, z, 1);
        if (isRock) e.set((a - 0.5) * 0.6, a * 20, (hash3(z, x, 2) - 0.5) * 0.6);
        else e.set((a - 0.5) * 0.08, a * Math.PI * 2, (hash3(z, x, 3) - 0.5) * 0.08);
        q.setFromEuler(e);
        const sy = isRock ? s * (0.6 + 0.5 * hash3(x, 5, z)) : s * (0.85 + 0.3 * hash3(x, 9, z));
        sv.set(s, sy, s * (isRock ? 0.8 + 0.4 * a : 1));
        pv.set(x, y - (isRock ? 0 : 0.15), z);
        m4.compose(pv, q, sv);
        mesh.setMatrixAt(i, m4);
        colorFn(color, x, y, z, a);
        mesh.setColorAt(i, color);
        bb.expandByPoint(pv);
      });
      mesh.castShadow = castShadow;
      if (layer) mesh.layers.set(layer);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      managed.push({ mesh, bb, near: range[0] > 0 ? range[0] : -1, far: range[3] });
    }
  }

  const byVariant = (list, n) => {
    const out = Array.from({ length: n }, () => []);
    for (const it of list) out[Math.floor(hash3(it[0], it[2], 11) * n) % n].push(it);
    return out;
  };
  const tintFn = (base, hueVar) => (c, x, y, z, a) => {
    const t = 0.82 + 0.3 * hash3(z, 7, x);
    const w = hash3(x, 3, z);
    c.setRGB(base[0] * t * (1 + hueVar * (w - 0.5)), base[1] * t, base[2] * t * (1 - hueVar * (w - 0.5)));
  };
  const barkTint = (c, x, y, z) => { const t = 0.85 + 0.25 * hash3(z, 4, x); c.setRGB(t, t, t); };

  const HI_CHUNK = 128, LO_CHUNK = 384;
  const treeTypes = [
    ['oak', M.oakBark, M.oakLeaf, M.oakLo, tintFn([1, 1, 0.9], 0.35)],
    ['birch', M.birchBark, M.birchLeaf, M.birchLo, tintFn([1, 1, 0.9], 0.25)],
    ['pine', M.pineBark, M.pineLeaf, M.pineLo, tintFn([0.95, 1, 0.95], 0.2)],
    ['snowpine', M.pineBark, M.snowLeaf, M.snowLo, tintFn([0.95, 1, 1], 0.1)],
  ];
  let total = 0;
  for (const [type, barkM, leafM, loM, tint] of treeTypes) {
    const vars = byVariant(instances[type], NV);
    vars.forEach((list, v) => {
      const geos = G[type][v];
      addLayer(list, geos.bark, barkM, HI_CHUNK, barkTint, { tag: 'hibark' });
      addLayer(list, geos.leaves, leafM, HI_CHUNK, tint, { tag: 'hileaf' });
      addLayer(list, geos.lo, loM, LO_CHUNK, tint, { tag: 'lotree' + type, castShadow: false });
      addLayer(list, geos.proxy, M.proxy, LO_CHUNK, tint, { tag: 'proxy', layer: PROXY_LAYER });
    });
    total += instances[type].length;
  }
  byVariant(instances.dead, 2).forEach((list, v) => addLayer(list, deadG[v], M.deadBark, LO_CHUNK, barkTint, { tag: 'dead' }));
  byVariant(instances.bush, 2).forEach((list, v) => addLayer(list, bushG[v], M.bush, LO_CHUNK, tintFn([1, 1, 0.85], 0.4), { tag: 'bush' }));
  byVariant(ferns, 2).forEach((list, v) => addLayer(list, fernG[v], M.fern, HI_CHUNK, tintFn([1, 1, 0.9], 0.3), { castShadow: false, tag: 'fern' }));
  const rockTint = (c, x, y, z, a) => {
    const t = 0.8 + 0.35 * hash3(z, 7, x);
    if (world.heightAt(x, z) > 0 && near(x, z, F.volcano, F.volcano.r)) c.setRGB(0.42 * t, 0.38 * t, 0.36 * t);
    else if (world.snowAt(x, z) > 0.25) c.setRGB(t * 0.88, t, t * 1.02); // (g-r)/g ~ 0.12 marks snow-capped
    else c.setRGB(t * 0.97, t, t * (0.94 + 0.1 * a)); // (g-r)/g ~ 0.03 marks mossy
  };
  for (const type of ['rock', 'rockB']) {
    addLayer(instances[type], rockG[type][0], M.rockHi, HI_CHUNK, rockTint, { isRock: true, tag: 'rockhi' });
    addLayer(instances[type], rockG[type][1], M.rockLo, LO_CHUNK, rockTint, { isRock: true, tag: 'rocklo' });
  }
  total += instances.dead.length + instances.bush.length + instances.rock.length + instances.rockB.length;

  if (typeof window !== 'undefined') window.__veg = { stats, managed };
  // ---- per-frame chunk visibility from the main camera ----
  const cp = new V3(), tmp = new V3();
  // dev: ?off=veg hides all vegetation (main.js hides instanced meshes once; keep them hidden)
  const devOff = typeof location !== 'undefined' && (new URLSearchParams(location.search).get('off') || '').split(',').includes('veg');
  function updateVisibility(camera) {
    cp.copy(camera.position);
    U.uCamPos.value.copy(cp);
    for (const m of managed) {
      // pad the box a little: trees extend above / around their base point
      const dn = m.bb.distanceToPoint(cp) - 6;
      tmp.set(cp.x < (m.bb.min.x + m.bb.max.x) / 2 ? m.bb.max.x : m.bb.min.x,
        cp.y < (m.bb.min.y + m.bb.max.y) / 2 ? m.bb.max.y : m.bb.min.y,
        cp.z < (m.bb.min.z + m.bb.max.z) / 2 ? m.bb.max.z : m.bb.min.z);
      const df = tmp.distanceTo(cp) + 6;
      m.mesh.visible = !devOff && dn < m.far && df > m.near;
    }
  }
  const prevBefore = scene.onBeforeRender;
  let frame = 0;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    if (prevBefore) prevBefore.call(this, renderer, sc, camera, target);
    if (camera && camera.isPerspectiveCamera) updateVisibility(camera);
    // let shadow-casting lights see the shadow proxies (the main camera never does)
    if (!(frame++ % 60)) sc.traverse((o) => { if (o.isLight && o.shadow && o.shadow.camera) o.shadow.camera.layers.enable(PROXY_LAYER); });
  };

  // ---- spatial hash for collisions ----
  const CELL = 10, grid = new Map();
  for (const c of colliders) {
    const key = Math.floor(c.x / CELL) + ',' + Math.floor(c.z / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(c);
  }
  function nearbyColliders(x, z) {
    const out = [], cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const l = grid.get((cx + dx) + ',' + (cz + dz));
      if (l) out.push(...l);
    }
    return out;
  }

  return { update: (t) => { U.uTime.value = t; }, nearbyColliders, count: total };
}
