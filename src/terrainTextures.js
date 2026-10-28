// Procedural, seamlessly tiling ground materials for terrain splatting.
// Builds two DataArrayTextures (one layer per material):
//   albedo: rgb = colour tint around a mean of 0.5 (multiplied onto the biome vertex colour), a = height
//   normal: rgb = tangent-space normal, a = roughness modulation (0.5 = neutral)
// Layers: 0 grass ground, 1 dirt / forest floor, 2 sand, 3 rock, 4 snow, 5 volcanic ash
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export const LAYERS = 6;

// ---------- tileable noise helpers ----------
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint16Array(512), grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; grad[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const hash = (x, y) => perm[(perm[x & 255] + y) & 511];
  const fade = (t) => t * t * (3 - 2 * t);
  // value noise on a lattice that repeats every `per` cells
  function noise(x, y, per) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per;
    const x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
    const a = grad[hash(x0, y0)], b = grad[hash(x1, y0)], c = grad[hash(x0, y1)], d = grad[hash(x1, y1)];
    const u = fade(xf), v = fade(yf);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  // u,v in [0,1); base = lattice cells across the tile
  function fbm(u, v, base, oct, gain = 0.5) {
    let s = 0, a = 1, n = 0, f = base;
    for (let o = 0; o < oct; o++) { s += a * noise(u * f + o * 17.3, v * f + o * 9.1, f); n += a; a *= gain; f *= 2; }
    return s / n;
  }
  // tileable voronoi: returns [F1, F2, cellRandom]
  const cellRnd = (x, y) => grad[hash(x, y + 77)];
  const out = [0, 0, 0];
  function voronoi(u, v, cells, jitter = 0.9) {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      const px = cx + 0.5 + (grad[hash(wx, wy)] - 0.5) * jitter, py = cy + 0.5 + (grad[hash(wy + 31, wx + 7)] - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = cellRnd(wx, wy); } else if (d < f2) f2 = d;
    }
    out[0] = f1; out[1] = f2; out[2] = id;
    return out;
  }
  const white = (x, y) => grad[hash(x & 255, (y & 255) ^ ((x >> 8) * 13))];
  return { noise, fbm, voronoi, white };
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- material painters: return [r, g, b, height, rough] ----------
function painters(N) {
  const res = [0, 0, 0, 0, 0];
  const set = (r, g, b, h, ro) => { res[0] = r; res[1] = g; res[2] = b; res[3] = h; res[4] = ro; return res; };
  return [
    // 0 grass ground: tufts, darker gaps, a few dry blades and soil specks
    (u, v, px, py) => {
      const clump = N.fbm(u, v, 8, 4);
      const fine = N.fbm(u, v, 64, 3);
      const blades = N.noise(u * 160, v * 40, 160) * 0.5 + N.noise(u * 50, v * 190, 50) * 0.5;
      const dry = sstep(0.58, 0.75, N.fbm(u + 0.3, v + 0.7, 4, 3));
      const soil = sstep(0.7, 0.82, N.fbm(u + 0.5, v, 16, 3)) * (1 - clump) * 0.6;
      let l = 0.82 + 0.3 * clump + 0.22 * (blades - 0.5) + 0.12 * (fine - 0.5);
      const h = clump * 0.6 + blades * 0.4;
      let r = l * (1 + dry * 0.28), g = l * (1 + dry * 0.06), b = l * (1 - dry * 0.3);
      r = r * (1 - soil) + soil * 0.9; g = g * (1 - soil) + soil * 0.62; b = b * (1 - soil) + soil * 0.42;
      return set(r, g, b, h * (1 - soil * 0.5), 0.5 + 0.1 * (1 - h));
    },
    // 1 dirt / forest floor: soil, pebbles and leaf litter
    (u, v) => {
      const base = N.fbm(u, v, 6, 5);
      const vo = N.voronoi(u, v, 22, 0.8);
      const pebble = sstep(0.42, 0.18, vo[0]) * sstep(0.55, 0.85, vo[2] + N.fbm(u, v, 3, 2) * 0.4);
      const leaf = sstep(0.62, 0.7, N.fbm(u + 0.2, v + 0.1, 24, 3));
      const grain = N.fbm(u, v, 96, 2);
      let l = 0.75 + 0.45 * base + 0.18 * (grain - 0.5);
      let r = l, g = l * 0.97, b = l * 0.93;
      r = r * (1 - pebble) + pebble * (0.95 + vo[2] * 0.3); g = g * (1 - pebble) + pebble * (0.95 + vo[2] * 0.3); b = b * (1 - pebble) + pebble * (1.0 + vo[2] * 0.3);
      r = r * (1 - leaf) + leaf * 1.25; g = g * (1 - leaf) + leaf * 0.85; b = b * (1 - leaf) + leaf * 0.5;
      const h = base * 0.5 + pebble * 0.55 + leaf * 0.15 + grain * 0.1;
      return set(r, g, b, h, 0.5 - pebble * 0.12);
    },
    // 2 sand: fine grain, wind ripples, darker grains and shell bits
    (u, v, px, py) => {
      const warp = N.fbm(u, v, 4, 3);
      const ripple = Math.sin((v * 18 + u * 4 + warp * 2.2) * Math.PI * 2) * 0.5 + 0.5;
      const ripple2 = Math.sin((v * 37 - u * 9 + warp * 3.0) * Math.PI * 2) * 0.5 + 0.5;
      const grain = N.white(px, py);
      const big = N.fbm(u, v, 5, 4);
      const dark = sstep(0.9, 0.98, N.white(px * 7 + 3, py * 5 + 1)) * 0.3;
      const shell = sstep(0.993, 1.0, N.white(px + 911, py + 377));
      const h = ripple * 0.55 + ripple2 * 0.15 + big * 0.2 + grain * 0.1;
      let l = 0.88 + 0.2 * (big - 0.5) + 0.14 * (grain - 0.5) + 0.1 * (ripple - 0.5) - dark * 0.35;
      l = l * (1 - shell) + shell * 1.35;
      return set(l * 1.01, l, l * 0.98, h, 0.5 + 0.1 * (ripple - 0.5));
    },
    // 3 rock: layered strata, weathered fbm, a few sparse fractures, cool/warm tint, lichen
    (u, v) => {
      const warp = N.fbm(u, v, 3, 4);
      const strata = Math.sin((v * 6 + warp * 3.0) * Math.PI * 2) * 0.5 + 0.5;
      const strata2 = Math.sin((v * 17 + warp * 5.0 + u * 2) * Math.PI * 2) * 0.5 + 0.5;
      const det = N.fbm(u, v, 8, 6);
      const fine = N.fbm(u, v, 48, 3);
      const vo = N.voronoi(u + warp * 0.15, v + warp * 0.1, 5, 1);
      const crackMask = sstep(0.55, 0.7, N.fbm(u + 0.4, v, 4, 3));
      const crack = sstep(0.035, 0.0, vo[1] - vo[0]) * crackMask;
      const lichen = sstep(0.68, 0.8, N.fbm(u + 0.7, v + 0.2, 10, 4)) * (1 - crack);
      const tint = N.fbm(u + 0.1, v + 0.9, 2, 3);
      const h = det * 0.55 + strata * 0.2 + strata2 * 0.08 + fine * 0.15 - crack * 0.35;
      let l = 0.7 + 0.5 * det + 0.14 * (strata - 0.5) + 0.06 * (strata2 - 0.5) + 0.12 * (fine - 0.5) - crack * 0.3;
      let r = l * (0.94 + tint * 0.14), g = l * (0.97 + tint * 0.05), b = l * (1.06 - tint * 0.12);
      r = r * (1 - lichen * 0.5) + lichen * 0.5 * l * 1.18; g = g * (1 - lichen * 0.5) + lichen * 0.5 * l * 1.16; b = b * (1 - lichen * 0.5) + lichen * 0.5 * l * 0.78;
      return set(r, g, b, Math.max(0, h), 0.5 + 0.12 * (det - 0.5) + crack * 0.1);
    },
    // 4 snow: soft wind-blown drifts, faintly blue hollows
    (u, v) => {
      const big = N.fbm(u, v, 3, 4);
      const warp = N.fbm(u + 0.5, v + 0.5, 4, 3);
      const sastrugi = Math.sin((u * 9 + v * 3 + warp * 2.4) * Math.PI * 2) * 0.5 + 0.5;
      const fine = N.fbm(u, v, 48, 3);
      const h = big * 0.5 + sastrugi * 0.32 + fine * 0.18;
      const l = 0.97 + 0.06 * (h - 0.5) + 0.03 * (fine - 0.5);
      return set(l * (0.985 + 0.03 * h), l * (0.99 + 0.02 * h), l * (1.02 - 0.02 * h), h, 0.5 - 0.1 * fine);
    },
    // 5 volcanic ash: cinders and pumice, oxidised patches
    (u, v, px, py) => {
      const base = N.fbm(u, v, 5, 5);
      const vo = N.voronoi(u, v, 40, 1.0);
      const cinder = sstep(0.55, 0.15, vo[0]) * (0.4 + 0.6 * N.fbm(u + 0.9, v, 8, 2));
      const vo2 = N.voronoi(u + 0.31, v + 0.17, 9, 0.9);
      const rock = sstep(0.32, 0.12, vo2[0]) * sstep(0.6, 0.8, vo2[2]);
      const rust = sstep(0.55, 0.72, N.fbm(u + 0.6, v + 0.3, 4, 4));
      const grain = N.white(px, py);
      const h = base * 0.35 + cinder * 0.35 * (0.5 + vo[2]) + rock * 0.5 + grain * 0.08;
      let l = 0.72 + 0.4 * base + 0.3 * cinder * (vo[2] - 0.4) + 0.16 * (grain - 0.5) + rock * 0.25;
      return set(l * (1 + rust * 0.3), l * (1 + rust * 0.02), l * (1 - rust * 0.15), h, 0.5 - rock * 0.15);
    },
  ];
}

const NORMAL_STRENGTH = [2.2, 3.0, 2.0, 5.0, 1.6, 2.0];

export function createTerrainTextures(renderer, size = 512, seed = 4242) {
  const N = makeNoise(seed);
  const paint = painters(N);
  const alb = new Uint8Array(size * size * 4 * LAYERS);
  const nrm = new Uint8Array(size * size * 4 * LAYERS);
  const r = new Float32Array(size * size), g = new Float32Array(size * size), b = new Float32Array(size * size);
  const h = new Float32Array(size * size), ro = new Float32Array(size * size);

  for (let L = 0; L < LAYERS; L++) {
    let sr = 0, sg = 0, sb = 0, hmin = Infinity, hmax = -Infinity;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const c = paint[L](x / size, y / size, x, y);
      r[i] = c[0]; g[i] = c[1]; b[i] = c[2]; h[i] = c[3]; ro[i] = c[4];
      sr += c[0]; sg += c[1]; sb += c[2];
      if (c[3] < hmin) hmin = c[3]; if (c[3] > hmax) hmax = c[3];
    }
    const n = size * size;
    // Normalise tint so the average is exactly 0.5 per channel (distant mips converge to the vertex colour)
    const kr = 0.5 / (sr / n), kg = 0.5 / (sg / n), kb = 0.5 / (sb / n);
    const hs = 1 / Math.max(1e-5, hmax - hmin);
    const off = L * n * 4;
    for (let i = 0; i < n; i++) {
      h[i] = (h[i] - hmin) * hs;
      alb[off + i * 4] = Math.min(255, r[i] * kr * 255);
      alb[off + i * 4 + 1] = Math.min(255, g[i] * kg * 255);
      alb[off + i * 4 + 2] = Math.min(255, b[i] * kb * 255);
      alb[off + i * 4 + 3] = h[i] * 255;
    }
    const s = NORMAL_STRENGTH[L];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = h[y * size + ((x - 1 + size) % size)], rr = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
      let nx = (l - rr) * s, ny = (d - u) * s, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const o = off + i * 4;
      nrm[o] = (nx * 0.5 + 0.5) * 255; nrm[o + 1] = (ny * 0.5 + 0.5) * 255; nrm[o + 2] = (nz * 0.5 + 0.5) * 255;
      nrm[o + 3] = Math.min(255, Math.max(0, ro[i] * 255));
    }
  }

  const mk = (data) => {
    const t = new THREE.DataArrayTexture(data, size, size, LAYERS);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
    return t;
  };
  return { albedo: mk(alb), normal: mk(nrm) };
}

// Shared GLSL: animated cellular noise (F1, F2)
export const GLSL_VORONOI = /* glsl */ `
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec2 voronoi2(vec2 x, float t){
  vec2 n = floor(x), f = fract(x); float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g); o = 0.5 + 0.45 * sin(t + 6.2831 * o);
    float d = length(g + o - f);
    if (d < f1){ f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return vec2(f1, f2);
}
`;
