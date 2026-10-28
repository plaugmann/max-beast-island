// Island generation: heightmap, biomes, colors and zone lookup.
// Everything is seeded so every player gets the exact same island.
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { mulberry32, smoothstep, lerp, clamp } from './util.js';

export const WORLD_SIZE = 2600;
export const SEG = 600;
export const ISLAND_R = 900;
export const BOUNDARY_R = 1180;

export const FEATURES = {
  ice: { x: -60, z: -620, r: 400, h: 300, name: 'Frostfang Peak' },
  ice2: { x: -260, z: -500, r: 230, h: 165 },
  stone: { x: -590, z: -60, r: 300, h: 205, name: 'Stonecrown Mountain' },
  grey: { x: 540, z: -250, r: 280, h: 175, name: 'Greyridge Mountain' },
  volcano: { x: 400, z: 470, r: 340, h: 235, crater: 70, craterDepth: 55, name: 'Mount Ember' },
  cave: { x: -330, z: 330, r: 26, name: 'Crystal Cave' },
  spawn: { x: -40, z: 170 },
  market: { x: -24, z: 169 }, cubeShop: { x: -39, z: 154 }, // stalls next to spawn
};

export const FORESTS = [
  { x: -320, z: 300, r: 300, name: 'Whispering Woods' },
  { x: 170, z: -300, r: 220, name: 'Pinewood Forest' },
  { x: 60, z: 420, r: 200, name: 'Old Oak Forest' },
  { x: -620, z: 420, r: 200, name: 'Whispering Woods' },
];

// Base plots (max 20 players per island): flat open land, doorway (+z local) faces spawn
export const BASE_SIZE = { w: 24, d: 22 };
export const BASE_PLOTS = [
  [-190, 670], [390, -530], [-10, -50], [-390, 660], [-400, 540], [250, -180], [-490, -610], [-110, 550], [200, 130], [310, 110],
  [-70, 260], [-90, -160], [70, 600], [-200, 480], [80, 20], [-170, 360], [230, 20], [-530, -450], [30, 170], [570, 120],
].map(([x, z]) => ({ x, z, ry: Math.atan2(FEATURES.spawn.x - x, FEATURES.spawn.z - z) }));
// Plot-local → world (rotation about Y like three.js)
export const plotToWorld = (pl, lx, lz) => [pl.x + lx * Math.cos(pl.ry) + lz * Math.sin(pl.ry), pl.z - lx * Math.sin(pl.ry) + lz * Math.cos(pl.ry)];
export const worldToPlot = (pl, x, z) => { const dx = x - pl.x, dz = z - pl.z, c = Math.cos(pl.ry), s = Math.sin(pl.ry); return [dx * c - dz * s, dx * s + dz * c]; };
export const nearPlot = (x, z, pad = 0) => BASE_PLOTS.some((pl) => {
  if (Math.abs(x - pl.x) > 17 + pad || Math.abs(z - pl.z) > 17 + pad) return false;
  const [lx, lz] = worldToPlot(pl, x, z);
  return Math.abs(lx) < BASE_SIZE.w / 2 + pad && Math.abs(lz) < BASE_SIZE.d / 2 + pad;
});

const LAVA_RIVERS = [0.55, 1.35, 2.3];

const C = (hex) => new THREE.Color(hex);
const PAL = {
  grass: C(0x5b8a36), grassDry: C(0x92a04c), forest: C(0x3a5226), sand: C(0xdcc79b), wetSand: C(0xa48e66),
  seabed: C(0x8f8462), deep: C(0x4d5348), rock: C(0x77716a), rockDark: C(0x4e4a45), snow: C(0xf3f6fa),
  ice: C(0x9fcbe3), ash: C(0x3d3734), basalt: C(0x221f1d), meadow: C(0x6e9a3e),
};

export function generateWorld(seed = 1337) {
  const rng = mulberry32(seed);
  const simplex = new SimplexNoise({ random: rng });
  const n2 = (x, z) => simplex.noise(x, z);
  const fbm = (x, z, oct = 5) => {
    let a = 1, f = 1, s = 0, t = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, z * f); t += a; a *= 0.5; f *= 2.03; }
    return s / t;
  };
  const ridged = (x, z, oct = 5) => {
    let a = 1, f = 1, s = 0, t = 0;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(n2(x * f + 31.7 * i, z * f - 17.3 * i));
      v *= v; s += a * v; t += a; a *= 0.5; f *= 2.1;
    }
    return s / t;
  };
  const F = FEATURES;

  function coastRadius(ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return ISLAND_R + 120 * n2(c * 1.2 + 5, s * 1.2 + 5) + 50 * n2(c * 3.1 - 7, s * 3.1 + 2) + 18 * n2(c * 9 + 1, s * 9 - 3);
  }

  function baseHeight(x, z) {
    const d = Math.hypot(x, z);
    const t = d / coastRadius(Math.atan2(z, x));
    const land = smoothstep(1.06, 0.8, t);
    const hills = fbm(x * 0.0035 + 11, z * 0.0035 - 4, 5) * 0.5 + 0.5;
    let h = lerp(-30, 4.5, land) + land * land * hills * 20;
    h += fbm(x * 0.03, z * 0.03, 3) * 0.8 * land;
    return h;
  }

  function mountainH(x, z, f, power = 1.6, rough = 1) {
    const dx = x - f.x, dz = z - f.z;
    let d = Math.hypot(dx, dz) / f.r;
    d *= 1 + 0.25 * n2(dx * 0.0045 + f.x * 0.01, dz * 0.0045 + f.z * 0.01);
    if (d >= 1) return 0;
    let fall = 1 - d; fall = fall * fall * (3 - 2 * fall);
    const r = ridged(x * 0.005 + f.x * 0.001, z * 0.005, 6);
    return f.h * Math.pow(fall, power) * (0.55 + 0.6 * r * rough);
  }

  function volcanoH(x, z) {
    const f = F.volcano;
    const dx = x - f.x, dz = z - f.z, dist = Math.hypot(dx, dz);
    const d = dist / f.r;
    if (d >= 1) return [0, 0];
    const ang = Math.atan2(dz, dx);
    const gully = ridged(Math.cos(ang) * 3 + dist * 0.004, Math.sin(ang) * 3, 3);
    const rim = f.crater / f.r;
    const cone = (dd) => f.h * Math.pow(Math.max(0, 1 - dd), 1.35);
    let h;
    if (d > rim) h = cone(d) * (0.92 + 0.12 * gully);
    else {
      // Flat crater floor so the lava lake fills it evenly
      const k = smoothstep(rim, rim * 0.55, d);
      h = cone(rim) * lerp(0.92 + 0.12 * gully, 0.98, k) - f.craterDepth * k;
    }
    h *= smoothstep(1.0, 0.85, d);

    let lava = 0;
    if (d > rim * 0.9 && d < 0.8) {
      for (const a0 of LAVA_RIVERS) {
        const a = a0 + 0.3 * n2(dist * 0.006, a0 * 3);
        const da = Math.atan2(Math.sin(ang - a), Math.cos(ang - a));
        const w = lerp(9, 3.5, (d - rim) / (0.8 - rim));
        const k = Math.exp(-Math.pow((da * dist) / w, 2)) * smoothstep(0.8, 0.62, d);
        lava = Math.max(lava, k);
      }
      h -= 2.5 * lava;
    }
    return [h, lava];
  }

  function heightFn(x, z) {
    let h = baseHeight(x, z);
    h += mountainH(x, z, F.ice, 1.5, 1.1);
    h += mountainH(x, z, F.ice2, 1.6, 1.0);
    h += mountainH(x, z, F.stone, 1.7, 1.0);
    h += mountainH(x, z, F.grey, 1.6, 1.0);
    const v = volcanoH(x, z);
    return [h + v[0], v[1]];
  }

  function forestFn(x, z) {
    let boost = -0.15;
    for (const f of FORESTS) boost += 0.55 * smoothstep(f.r, f.r * 0.3, Math.hypot(x - f.x, z - f.z));
    return smoothstep(0.0, 0.3, fbm(x * 0.0028 + 40, z * 0.0028 - 12, 4) + boost);
  }

  // ---------- Build grid ----------
  const N = SEG + 1;
  const cell = WORLD_SIZE / SEG;
  const half = WORLD_SIZE / 2;
  const heights = new Float32Array(N * N);
  const lava = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + ix * cell;
      const [h, l] = heightFn(x, z);
      heights[iz * N + ix] = h;
      lava[iz * N + ix] = l;
    }
  }

  // Flatten around the cave and spawn so they sit on level ground
  const flatten = (fx, fz, inner, outer) => {
    const target = Math.max(4, rawSample(fx, fz));
    const r = Math.ceil(outer / cell) + 1;
    const cx = Math.round((fx + half) / cell), cz = Math.round((fz + half) / cell);
    for (let iz = cz - r; iz <= cz + r; iz++) for (let ix = cx - r; ix <= cx + r; ix++) {
      const x = -half + ix * cell, z = -half + iz * cell;
      const w = smoothstep(outer, inner, Math.hypot(x - fx, z - fz));
      const i = iz * N + ix;
      heights[i] = lerp(heights[i], target, w);
    }
    return target;
  };
  function rawSample(x, z) {
    const ix = clamp(Math.round((x + half) / cell), 0, SEG), iz = clamp(Math.round((z + half) / cell), 0, SEG);
    return heights[iz * N + ix];
  }
  const caveFloor = flatten(F.cave.x, F.cave.z, F.cave.r + 8, F.cave.r + 34);
  flatten(F.spawn.x, F.spawn.z, 14, 40);
  for (const pl of BASE_PLOTS) pl.y = flatten(pl.x, pl.z, 18, 36);

  // ---------- Normals, biomes, colors ----------
  const normals = new Float32Array(N * N * 3);
  const colors = new Float32Array(N * N * 3);
  const tex = new Float32Array(N * N * 4);
  const forestArr = new Float32Array(N * N);
  const hAt = (ix, iz) => heights[clamp(iz, 0, SEG) * N + clamp(ix, 0, SEG)];
  const col = new THREE.Color(), tmp = new THREE.Color();

  for (let iz = 0; iz < N; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + ix * cell;
      const i = iz * N + ix;
      const h = heights[i];
      const nx = -(hAt(ix + 1, iz) - hAt(ix - 1, iz)) / (2 * cell);
      const nz = -(hAt(ix, iz + 1) - hAt(ix, iz - 1)) / (2 * cell);
      const inv = 1 / Math.hypot(nx, 1, nz);
      normals[i * 3] = nx * inv; normals[i * 3 + 1] = inv; normals[i * 3 + 2] = nz * inv;
      const slope = 1 - inv;

      const n1 = fbm(x * 0.01, z * 0.01, 3);
      const iceW = Math.max(
        1 - smoothstep(0.85, 1.15, Math.hypot(x - F.ice.x, z - F.ice.z) / F.ice.r),
        1 - smoothstep(0.8, 1.1, Math.hypot(x - F.ice2.x, z - F.ice2.z) / F.ice2.r));
      const volW = 1 - smoothstep(0.75, 1.02, Math.hypot(x - F.volcano.x, z - F.volcano.z) / F.volcano.r);
      const sandW = smoothstep(3.4, 1.6, h + n1 * 0.8);
      let forest = forestFn(x, z) * (1 - sandW) * (1 - volW) * smoothstep(0.45, 0.25, slope) * smoothstep(110, 70, h);
      forest *= smoothstep(45, 70, Math.hypot(x - F.cave.x, z - F.cave.z)) * smoothstep(35, 60, Math.hypot(x - F.spawn.x, z - F.spawn.z));
      forestArr[i] = forest;

      col.copy(PAL.grass).lerp(PAL.grassDry, clamp(n1 * 0.8 + 0.3, 0, 1) * 0.6);
      col.lerp(PAL.meadow, clamp(fbm(x * 0.04, z * 0.04, 2), 0, 1) * 0.5);
      col.lerp(PAL.forest, forest);
      if (h < 0) col.copy(PAL.wetSand).lerp(PAL.seabed, smoothstep(0, -6, h)).lerp(PAL.deep, smoothstep(-6, -28, h));
      else col.lerp(tmp.copy(PAL.sand).lerp(PAL.wetSand, smoothstep(1.2, 0.2, h)), sandW);
      const rockW = Math.max(smoothstep(0.28, 0.5, slope + n1 * 0.06), smoothstep(70, 120, h) * (1 - iceW) * 0.75);
      col.lerp(tmp.copy(PAL.rock).lerp(PAL.rockDark, clamp(n1 + 0.5, 0, 1)), rockW);
      const volGround = volW * smoothstep(2, 14, h);
      col.lerp(tmp.copy(PAL.ash).lerp(PAL.basalt, clamp(fbm(x * 0.02, z * 0.02, 3) + 0.5, 0, 1)), volGround);

      const snowLine = lerp(168, 38, iceW);
      const iceCliff = iceW * smoothstep(0.42, 0.65, slope) * smoothstep(snowLine - 25, snowLine, h);
      col.lerp(PAL.ice, iceCliff * 0.85);
      const snowW = smoothstep(snowLine - 12, snowLine + 12, h + n1 * 14) * (1 - smoothstep(0.5, 0.75, slope) * 0.85) * (1 - volW);
      col.lerp(PAL.snow, snowW);

      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      const inCave = 1 - smoothstep(F.cave.r - 2, F.cave.r + 4, Math.hypot(x - F.cave.x, z - F.cave.z));
      if (inCave > 0) {
        col.lerp(PAL.rockDark, inCave);
        colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      }
      const grass = h > 1.4 ? (1 - sandW) * (1 - rockW) * (1 - smoothstep(0.15, 0.5, snowW)) * (1 - volGround) * (1 - iceCliff) * (1 - forest * 0.55) * (1 - inCave) : 0;
      tex[i * 4] = h; tex[i * 4 + 1] = clamp(grass * (0.75 + 0.35 * n1), 0, 1); tex[i * 4 + 2] = forest; tex[i * 4 + 3] = snowW;
      if (h > 3 && (Math.hypot(x - F.market.x, z - F.market.z) < 6 || Math.hypot(x - F.cubeShop.x, z - F.cubeShop.z) < 6)) tex[i * 4 + 1] *= 0.15;
      if (h > 3 && nearPlot(x, z, 4.5)) tex[i * 4 + 1] = forestArr[i] = tex[i * 4 + 2] = 0; // no grass/forest through base floors
    }
  }

  const terrainTex = new THREE.DataTexture(tex, N, N, THREE.RGBAFormat, THREE.FloatType);
  terrainTex.minFilter = terrainTex.magFilter = THREE.NearestFilter;
  terrainTex.needsUpdate = true;

  // Exact height under the rendered triangles (matches PlaneGeometry triangulation)
  function heightAt(x, z) {
    let fx = (x + half) / cell, fz = (z + half) / cell;
    if (fx < 0 || fz < 0 || fx >= SEG || fz >= SEG) return -30;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const u = fx - ix, v = fz - iz;
    const ha = heights[iz * N + ix], hd = heights[iz * N + ix + 1];
    const hb = heights[(iz + 1) * N + ix], hc = heights[(iz + 1) * N + ix + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  function sampleGrid(arr, x, z) {
    const ix = clamp(Math.round((x + half) / cell), 0, SEG), iz = clamp(Math.round((z + half) / cell), 0, SEG);
    return arr[iz * N + ix];
  }
  const normalAt = (x, z) => {
    const ix = clamp(Math.round((x + half) / cell), 0, SEG), iz = clamp(Math.round((z + half) / cell), 0, SEG);
    const i = (iz * N + ix) * 3;
    return [normals[i], normals[i + 1], normals[i + 2]];
  };

  const v = F.volcano;
  const lavaY = heightAt(v.x, v.z) + 4;

  function zoneAt(x, z, inCave) {
    if (inCave) return F.cave.name;
    const h = heightAt(x, z);
    if (h < -1.3) return Math.hypot(x, z) > ISLAND_R ? 'Open Sea' : 'Lagoon';
    const dn = (f) => Math.hypot(x - f.x, z - f.z) / f.r;
    if (dn(F.ice) < 0.85 || dn(F.ice2) < 0.8) return F.ice.name;
    if (dn(F.volcano) < 0.8) return F.volcano.name;
    if (dn(F.stone) < 0.8) return F.stone.name;
    if (dn(F.grey) < 0.8) return F.grey.name;
    if (h < 3.2) return 'Sunny Beach';
    if (sampleGrid(forestArr, x, z) > 0.45) {
      let best = FORESTS[0], bd = Infinity;
      for (const f of FORESTS) { const d = Math.hypot(x - f.x, z - f.z); if (d < bd) { bd = d; best = f; } }
      return best.name;
    }
    return 'Central Meadows';
  }

  return {
    N, cell, half, heights, normals, colors, lava, forestArr, tex, terrainTex,
    heightAt, normalAt, zoneAt, lavaY, caveFloor, rng, simplex,
    forestAt: (x, z) => sampleGrid(forestArr, x, z),
    grassAt: (x, z) => tex[(clamp(Math.round((z + half) / cell), 0, SEG) * N + clamp(Math.round((x + half) / cell), 0, SEG)) * 4 + 1],
    snowAt: (x, z) => tex[(clamp(Math.round((z + half) / cell), 0, SEG) * N + clamp(Math.round((x + half) / cell), 0, SEG)) * 4 + 3],
  };
}
