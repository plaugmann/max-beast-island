// The player character: a businessman sculpted from smooth lofted surfaces
// (superellipse cross-sections blended with Catmull-Rom splines), a displaced face,
// a hair shell grown from the scalp, and procedural fabric/leather/hair textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ss = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }; // JS only: reversed edges OK
const G = (u) => Math.exp(-u * u);
const mix = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise: lattice of `period` cells, coordinates in lattice units
function tileNoise(period, seed) {
  const r = rng(seed);
  const g = new Float32Array(period * period).map(() => r());
  const at = (i, j) => g[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return mix(mix(at(xi, yi), at(xi + 1, yi), ux), mix(at(xi, yi + 1), at(xi + 1, yi + 1), ux), uy);
  };
}

function canvasTex(w, h, paint, srgb) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  paint(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function normalTex(size, height, strength) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x, y);
  return canvasTex(size, size, (d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }, false);
}

function makeTextures() {
  // Worsted wool twill: fine diagonal ribs + fuzzy fibre noise
  const n1 = tileNoise(32, 11), n2 = tileNoise(64, 12);
  const twill = normalTex(128, (x, y) =>
    0.5 * n1(x / 4, y / 4) + 0.35 * n2(x / 2, y / 2) + 0.25 * n2((x + y) / 1.5, (x - y) / 6 + 17), 1.2);
  // Shirt poplin: tiny plain weave
  const weave = normalTex(64, (x, y) => 0.5 * Math.sin((TAU * x) / 4) * Math.sin((TAU * y) / 4) + 0.4 * n2(x, y), 0.9);
  // Pebbled leather grain
  const l1 = tileNoise(48, 21), l2 = tileNoise(96, 22);
  const grain = normalTex(256, (x, y) => {
    const v = l1((x / 256) * 48, (y / 256) * 48), w = l2((x / 256) * 96, (y / 256) * 96);
    return Math.pow(1 - Math.abs(v - 0.5) * 2, 3) * 1.4 + w * 0.5;
  }, 1.6);
  // Hair: strands run along v
  const h1 = tileNoise(256, 31), h2 = tileNoise(64, 32);
  const hair = canvasTex(256, 256, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = 0.55 * h1(x * 0.9 + h2(x / 8, y / 32) * 6, y / 24) + 0.45 * h1(x * 2.1, y / 10 + 40);
      const v = Math.pow(s, 1.6);
      const i = (y * w + x) * 4;
      d[i] = 34 + v * 70; d[i + 1] = 24 + v * 50; d[i + 2] = 17 + v * 34; d[i + 3] = 255;
    }
  }, true);
  // Silk repp tie: burgundy with navy and gold diagonal stripes
  const tie = canvasTex(128, 128, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = (((x + y) % 64) + 64) % 64 / 64;
      let c = [122, 16, 34];
      if (q < 0.16) c = [26, 36, 72];
      else if (q > 0.22 && q < 0.25) c = [196, 160, 80];
      const rib = 0.88 + 0.12 * Math.sin((TAU * (x - y)) / 3);
      const i = (y * w + x) * 4;
      d[i] = c[0] * rib; d[i + 1] = c[1] * rib; d[i + 2] = c[2] * rib; d[i + 3] = 255;
    }
  }, true);
  // Eyeball: equirectangular, iris centred on +z (u = 0.25, v = 0.5)
  const e1 = tileNoise(64, 41);
  const eye = canvasTex(256, 128, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const phi = ((x + 0.5) / w) * TAU, theta = ((y + 0.5) / h) * Math.PI;
      const dx = -Math.cos(phi) * Math.sin(theta), dy = Math.cos(theta), dz = Math.sin(phi) * Math.sin(theta);
      const ang = Math.acos(Math.min(1, dz)); // angle from the eye axis
      const rot = Math.atan2(dy, dx);
      let c;
      if (ang < 0.21) c = [8, 6, 5]; // pupil
      else if (ang < 0.56) {
        const t = (ang - 0.21) / 0.35;
        const streak = e1((rot / TAU) * 64 * 3, t * 4);
        const base = [mix(120, 70, t), mix(82, 48, t), mix(40, 26, t)]; // hazel-brown iris
        const k = 0.65 + 0.7 * streak;
        c = base.map((v) => v * k);
        if (t > 0.82) c = c.map((v) => v * mix(1, 0.35, (t - 0.82) / 0.18)); // limbal ring
      } else {
        const red = ss(1.0, 1.6, ang);
        c = [mix(236, 222, red), mix(230, 190, red), mix(222, 180, red)];
      }
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }, true);
  eye.wrapS = eye.wrapT = THREE.ClampToEdgeWrapping;
  return { twill, weave, grain, hair, tie, eye };
}

function makeMaterials() {
  const T = makeTextures();
  const rep = (tex, r) => { const t = tex.clone(); t.repeat.set(r, r); t.needsUpdate = true; return t; };
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const skinBase = { roughness: 0.52, sheen: 0.45, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff7060), specularIntensity: 0.55 };
  return {
    suit: P({ color: 0x222c46, roughness: 0.8, sheen: 0.9, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x6a7898),
      normalMap: rep(T.twill, 24), normalScale: new THREE.Vector2(0.3, 0.3), side: THREE.DoubleSide }),
    lining: P({ color: 0x14182a, roughness: 0.6 }),
    shirt: P({ color: 0xe8ebee, roughness: 0.62, sheen: 0.35, sheenColor: new THREE.Color(0xffffff),
      normalMap: rep(T.weave, 90), normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide }),
    tie: P({ color: 0xffffff, map: rep(T.tie, 16), roughness: 0.36, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xff8a9a) }),
    skin: P({ color: 0xffffff, vertexColors: true, ...skinBase }),
    skinPlain: P({ color: 0xd9a083, ...skinBase }),
    hair: P({ color: 0xffffff, map: T.hair, roughness: 0.48, sheen: 0.7, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x8a6a50) }),
    eye: P({ map: T.eye, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    shoe: P({ color: 0x0c0b0b, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    sole: P({ color: 0x1e140e, roughness: 0.85 }),
    sock: P({ color: 0x14161c, roughness: 0.9 }),
    leather: P({ color: 0x6a3d20, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.4,
      normalMap: rep(T.grain, 6), normalScale: new THREE.Vector2(0.6, 0.6) }),
    leatherDark: P({ color: 0x2c170b, roughness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.25, metalness: 1 }),
    button: P({ color: 0x15100d, roughness: 0.3, clearcoat: 0.6 }),
  };
}

// ---------------------------------------------------------------------------
// Geometry toolkit
// ---------------------------------------------------------------------------
const KEYS = ['y', 'x', 'zf', 'zb', 'n', 'nb', 'cx', 'cz'];
// Section: { y, x: half width, zf: front extent, zb: back extent, n/nb: superellipse exponents front/back, cx/cz: centre }
function normSec(s) {
  const zf = s.zf ?? s.x;
  return { y: s.y, x: s.x, zf, zb: s.zb ?? zf, n: s.n ?? 2, nb: s.nb ?? s.n ?? 2, cx: s.cx ?? 0, cz: s.cz ?? 0 };
}
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
function secAt(secs, t) {
  const n = secs.length;
  const i = Math.min(Math.max(Math.floor(t), 0), n - 2), f = t - i;
  const s0 = secs[Math.max(0, i - 1)], s1 = secs[i], s2 = secs[i + 1], s3 = secs[Math.min(n - 1, i + 2)];
  const o = {};
  for (const k of KEYS) o[k] = cr(s0[k], s1[k], s2[k], s3[k], f);
  o.x = Math.max(o.x, 1e-4); o.zf = Math.max(o.zf, 1e-4); o.zb = Math.max(o.zb, 1e-4);
  return o;
}
// a = 0 points to +z (front), a = PI/2 to +x
function secPoint(s, a) {
  const sn = Math.sin(a), cs = Math.cos(a);
  const px = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / s.n) * s.x;
  const front = cs >= 0;
  const pz = Math.sign(cs) * Math.pow(Math.abs(cs), 2 / (front ? s.n : s.nb)) * (front ? s.zf : s.zb);
  return [px + s.cx, pz + s.cz];
}

function gridIndex(rows, cols, flip) {
  const idx = [];
  for (let r = 0; r < rows - 1; r++) for (let j = 0; j < cols - 1; j++) {
    const a = r * cols + j, b = a + 1, c = a + cols, d = c + 1;
    if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  return idx;
}

function fixSeam(geo, rows, cols) {
  const nrm = geo.attributes.normal;
  for (let r = 0; r < rows; r++) {
    const a = r * cols, b = r * cols + cols - 1;
    const v = new THREE.Vector3(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
    nrm.setXYZ(a, v.x, v.y, v.z); nrm.setXYZ(b, v.x, v.y, v.z);
  }
}

/**
 * Loft a smooth surface through cross-sections.
 * opts: radial, sub (rows per section span), warp (>1 = denser at the front), aRange(y) -> [a0, a1] for open surfaces,
 * disp(x, y, z, s) -> [dx, dy, dz], axisZ (sections run along +z instead of y; section z becomes world y)
 */
function loft(secsIn, o = {}) {
  const secs = secsIn.map(normSec);
  const radial = o.radial ?? 32, sub = o.sub ?? 4, warp = o.warp ?? 1;
  const rows = (secs.length - 1) * sub + 1, cols = radial + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const fullRows = [];
  for (let r = 0; r < rows; r++) {
    const s = secAt(secs, r / sub);
    let a0 = -Math.PI, a1 = Math.PI, closed = true;
    if (o.aRange) { [a0, a1] = o.aRange(s.y); closed = false; }
    if (Math.abs(a1 - a0 - TAU) < 1e-6) fullRows.push(r);
    for (let j = 0; j < cols; j++) {
      const u = j / radial;
      let a;
      if (closed) { const w = 2 * u - 1; a = Math.PI * Math.sign(w) * Math.pow(Math.abs(w), warp); } else a = a0 + (a1 - a0) * u;
      let [x, z] = secPoint(s, a), y = s.y;
      if (o.disp) { const d = o.disp(x, y, z, s); x += d[0]; y += d[1]; z += d[2]; }
      const i = r * cols + j;
      if (o.axisZ) pos.set([x, z, y], i * 3); else pos.set([x, y, z], i * 3);
      uv[i * 2 + 1] = s.y;
    }
    // u = true arc length along the row, zero at the column nearest the front
    let acc = 0, mid = 0, best = 1e9;
    for (let j = 0; j < cols; j++) {
      const i = r * cols + j;
      if (j > 0) acc += Math.hypot(pos[i * 3] - pos[i * 3 - 3], pos[i * 3 + 1] - pos[i * 3 - 2], pos[i * 3 + 2] - pos[i * 3 - 1]);
      uv[i * 2] = acc;
      const d = Math.abs(pos[i * 3]) + (pos[i * 3 + (o.axisZ ? 1 : 2)] < 0 ? 1 : 0);
      if (d < best) { best = d; mid = acc; }
    }
    for (let j = 0; j < cols; j++) uv[(r * cols + j) * 2] -= mid;
  }
  const descending = secs[secs.length - 1].y < secs[0].y;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(gridIndex(rows, cols, descending !== !!o.axisZ));
  g.computeVertexNormals();
  if (!o.aRange || fullRows.length) {
    const nrm = g.attributes.normal;
    for (const r of o.aRange ? fullRows : [...Array(rows).keys()]) {
      const a = r * cols, b = r * cols + cols - 1;
      const v = new THREE.Vector3(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
      nrm.setXYZ(a, v.x, v.y, v.z); nrm.setXYZ(b, v.x, v.y, v.z);
    }
  }
  g.userData = { rows, cols, secs };
  return g;
}

// Rectangular patch: fn(u, v) -> [x, y, z]; u runs "right", v runs "up" as seen from the outside
function patch(nu, nv, fn, flip = false) {
  const cols = nu + 1, rows = nv + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  for (let r = 0; r < rows; r++) for (let j = 0; j < cols; j++) {
    const p = fn(j / nu, r / nv), i = r * cols + j;
    pos.set(p, i * 3); uv[i * 2] = p[0]; uv[i * 2 + 1] = p[1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(gridIndex(rows, cols, flip));
  g.computeVertexNormals();
  return g;
}

function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function mirrorX(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1);
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.index.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// Capsule between two points
function bone(a, b, r, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(1e-3, len), 3, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// Merge parts per material and add them to a bone group
function attach(group, parts) {
  const byMat = new Map();
  for (const [geo, mat] of parts) {
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(geo);
  }
  const meshes = [];
  for (const [mat, geos] of byMat) {
    for (const g of geos) if (!mat.vertexColors) g.deleteAttribute('color');
    const mixed = geos.some((g) => !g.index);
    const list = mixed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
    const geo = list.length > 1 ? mergeGeometries(list) : list[0];
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); meshes.push(m);
  }
  return meshes;
}

// ---------------------------------------------------------------------------
// Body part definitions (metres). Hips pivot sits 0.95 m above the ground.
// ---------------------------------------------------------------------------
const TORSO = [
  { y: -0.165, x: 0.184, zf: 0.124, zb: 0.133 },
  { y: -0.06, x: 0.178, zf: 0.119, zb: 0.127 },
  { y: 0.07, x: 0.167, zf: 0.115, zb: 0.115 },
  { y: 0.19, x: 0.175, zf: 0.125, zb: 0.114 },
  { y: 0.31, x: 0.19, zf: 0.133, zb: 0.117 },
  { y: 0.405, x: 0.205, zf: 0.124, zb: 0.113 },
  { y: 0.47, x: 0.222, zf: 0.106, zb: 0.1 },
  { y: 0.512, x: 0.2, zf: 0.087, zb: 0.086 },
  { y: 0.546, x: 0.132, zf: 0.074, zb: 0.076, cz: -0.006 },
  { y: 0.571, x: 0.084, zf: 0.067, zb: 0.071, cz: -0.009 },
  { y: 0.588, x: 0.066, zf: 0.062, zb: 0.067, cz: -0.011 },
].map((s) => normSec({ n: 2.6, nb: 2.3, ...s }));

function torsoSecAtY(y) {
  let lo = 0, hi = TORSO.length - 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (secAt(TORSO, m).y < y) lo = m; else hi = m; }
  return secAt(TORSO, (lo + hi) / 2);
}
// Point on the front of the jacket at lateral position x and height y, pushed out along the normal by `off`
function torsoFront(x, y, off = 0) {
  const P = (xx, yy) => {
    const s = torsoSecAtY(yy);
    const k = Math.min(0.999, Math.abs(xx - s.cx) / s.x);
    const a = Math.asin(Math.pow(k, s.n / 2)) * Math.sign(xx - s.cx);
    const [px, pz] = secPoint(s, a);
    return new THREE.Vector3(px, yy, pz);
  };
  const p = P(x, y);
  if (!off) return p;
  const e = 0.002;
  const du = P(x + e, y).sub(P(x - e, y)), dv = P(x, y + e).sub(P(x, y - e));
  const n = du.cross(dv).normalize();
  return p.addScaledVector(n, off);
}
const V = (p) => [p.x, p.y, p.z];

// Half width of the open V of the jacket (shirt visible inside)
const V_BOTTOM = 0.165, V_TOP = 0.585;
const vHalf = (y) => Math.min(0.004 + 0.072 * Math.pow(clamp01((y - V_BOTTOM) / (V_TOP - V_BOTTOM)), 0.85), torsoSecAtY(y).x * 0.62);
const edgeFall = (u, p = 10) => 1 - Math.pow(Math.abs(2 * u - 1), p);

function buildTorso(M) {
  const parts = [];
  // Jacket body: closed above the button, cut away below it
  const jacket = loft(TORSO, {
    radial: 64, sub: 4,
    aRange: (y) => { const w = y < 0.155 ? 0.3 * Math.pow((0.155 - y) / 0.32, 1.3) : 0; return [w, TAU - w]; },
  });
  parts.push([jacket, M.suit]);

  // Shirt front inside the V
  parts.push([patch(10, 24, (u, v) => {
    const y = mix(V_BOTTOM - 0.01, 0.58, v);
    return V(torsoFront((2 * u - 1) * (vHalf(y) + 0.006), y, -0.0008 + 0.0032 * edgeFall(u, 8)));
  }), M.shirt]);

  // Tie blade (only the part visible in the V) + knot
  parts.push([patch(8, 24, (u, v) => {
    const y = mix(0.19, 0.548, v);
    const hw = Math.min(mix(0.016, 0.034, ss(0.548, 0.22, y)), vHalf(y) - 0.002);
    return V(torsoFront((2 * u - 1) * Math.max(hw, 0.0005), y, 0.0032 + 0.0025 * edgeFall(u, 2)));
  }), M.tie]);
  const knot = loft([
    { y: -0.022, x: 0.009, zf: 0.007, zb: 0.004 }, { y: -0.012, x: 0.014, zf: 0.01, zb: 0.006 },
    { y: 0.006, x: 0.019, zf: 0.011, zb: 0.007 }, { y: 0.016, x: 0.019, zf: 0.009, zb: 0.006 }, { y: 0.02, x: 0.004, zf: 0.003, zb: 0.003 },
  ], { radial: 16, sub: 3 });
  const kp = torsoFront(0, 0.566, 0.009);
  knot.rotateX(-0.25); knot.translate(kp.x, kp.y, kp.z);
  parts.push([knot, M.tie]);

  // Lapels: rolled, notched, widest at the chest
  const lapelW = (y) => {
    let w = 0.006 + 0.052 * ss(V_BOTTOM, 0.42, y);
    w -= 0.03 * Math.max(0, 1 - Math.abs(y - 0.447) / 0.014); // notch
    if (y > 0.46) w = mix(0.04, 0.03, ss(0.46, 0.552, y));
    return w;
  };
  for (const side of [-1, 1]) {
    parts.push([patch(10, 30, (u, v) => {
      const y = mix(V_BOTTOM, 0.552, v);
      const xin = vHalf(y) - 0.004, x = xin + u * lapelW(y);
      const off = 0.0006 + (0.0028 + 0.0045 * (1 - u)) * edgeFall(u, 8);
      return V(torsoFront(side * x, y, off));
    }, side < 0), M.suit]);
  }

  // Shirt collar (standing band, open at the front) and its points
  parts.push([loft([
    { y: 0.566, x: 0.066, zf: 0.066, zb: 0.07, cz: -0.012 },
    { y: 0.592, x: 0.064, zf: 0.064, zb: 0.068, cz: -0.013 },
    { y: 0.617, x: 0.066, zf: 0.066, zb: 0.069, cz: -0.014 },
  ], { radial: 28, sub: 3, aRange: (y) => { const a = mix(0.3, 0.85, clamp01((y - 0.566) / 0.051)); return [a, TAU - a]; } }), M.shirt]);
  for (const side of [-1, 1]) {
    parts.push([patch(4, 6, (u, v) => {
      const top = mix(0.018, 0.052, u), bottom = 0.044;
      const x = mix(bottom, top, v), y = mix(0.522, 0.584, v);
      return V(torsoFront(side * x, y, 0.0062 + 0.002 * v));
    }, side < 0), M.shirt]);
  }
  // Jacket collar around the back of the neck
  parts.push([loft([
    { y: 0.548, x: 0.088, zf: 0.08, zb: 0.088, cz: -0.01 },
    { y: 0.578, x: 0.08, zf: 0.074, zb: 0.083, cz: -0.012 },
    { y: 0.603, x: 0.073, zf: 0.068, zb: 0.078, cz: -0.014 },
  ], { radial: 28, sub: 3, aRange: () => [0.62, TAU - 0.62] }), M.suit]);

  // Buttons
  for (const y of [0.152, 0.062]) {
    const b = new THREE.CylinderGeometry(0.0085, 0.0085, 0.004, 14);
    b.rotateX(Math.PI / 2);
    const p = torsoFront(0, y, 0.003);
    b.translate(p.x, p.y, p.z);
    parts.push([b, M.button]);
  }
  // Hip pocket flaps and breast pocket welt with pocket square
  for (const side of [-1, 1]) {
    parts.push([patch(10, 4, (u, v) => {
      const x = mix(0.055, 0.158, u), y = mix(0.018, 0.066, v) - (x - 0.1) * 0.06;
      return V(torsoFront(side * x, y, 0.0005 + 0.0026 * edgeFall(u, 12) * edgeFall(v * 0.5 + 0.5, 6)));
    }, side < 0), M.suit]);
  }
  parts.push([patch(8, 2, (u, v) => {
    const x = mix(0.062, 0.135, u), y = mix(0.352, 0.366, v) + (x - 0.1) * 0.12;
    return V(torsoFront(x, y, 0.0005 + 0.0022 * edgeFall(u, 12)));
  }), M.suit]);
  parts.push([patch(6, 3, (u, v) => {
    const x = mix(0.075, 0.118, u);
    const peak = 0.012 * Math.max(0, 1 - Math.abs(u - 0.35) / 0.35) + 0.006 * Math.max(0, 1 - Math.abs(u - 0.8) / 0.2);
    const base = 0.364 + (x - 0.1) * 0.12;
    return V(torsoFront(x, base + v * (0.003 + peak), 0.0018));
  }), M.shirt]);

  // Neck
  const neck = loft([
    { y: 0.47, x: 0.06, zf: 0.06, zb: 0.064, cz: -0.012 },
    { y: 0.56, x: 0.058, zf: 0.057, zb: 0.062, cz: -0.014 },
    { y: 0.64, x: 0.055, zf: 0.054, zb: 0.059, cz: -0.018 },
    { y: 0.72, x: 0.05, zf: 0.05, zb: 0.054, cz: -0.022 },
  ], {
    radial: 24, sub: 4,
    disp: (x, y, z) => [0, 0, 0.004 * G(x / 0.012) * G((y - 0.625) / 0.012) * ss(0.02, 0.05, z)], // Adam's apple
  });
  parts.push([neck, M.skinPlain]);
  return parts;
}

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------
const HEAD = [
  { y: -0.113, x: 0.004, zf: 0.006, zb: 0.006, cz: 0.064 },
  { y: -0.109, x: 0.027, zf: 0.022, zb: 0.025, cz: 0.058 },
  { y: -0.1, x: 0.046, zf: 0.043, zb: 0.045, cz: 0.044 },
  { y: -0.086, x: 0.058, zf: 0.072, zb: 0.06, cz: 0.02 },
  { y: -0.068, x: 0.066, zf: 0.094, zb: 0.07, cz: 0.0 },
  { y: -0.045, x: 0.069, zf: 0.104, zb: 0.08, cz: -0.008 },
  { y: -0.02, x: 0.073, zf: 0.107, zb: 0.088, cz: -0.01 },
  { y: 0.005, x: 0.076, zf: 0.109, zb: 0.092, cz: -0.012 },
  { y: 0.03, x: 0.077, zf: 0.108, zb: 0.094, cz: -0.013 },
  { y: 0.055, x: 0.076, zf: 0.105, zb: 0.093, cz: -0.014 },
  { y: 0.078, x: 0.071, zf: 0.096, zb: 0.088, cz: -0.014 },
  { y: 0.097, x: 0.061, zf: 0.081, zb: 0.076, cz: -0.014 },
  { y: 0.111, x: 0.045, zf: 0.06, zb: 0.056, cz: -0.014 },
  { y: 0.12, x: 0.025, zf: 0.036, zb: 0.031, cz: -0.014 },
  { y: 0.124, x: 0.003, zf: 0.004, zb: 0.004, cz: -0.014 },
].map((s) => ({ n: 2.35, nb: 2.1, ...s }));

const EYE_X = 0.031, EYE_Y = 0.012, EYE_R = 0.0118;

function faceDisp(x, y, z, s) {
  const ex = Math.abs(x);
  const fr = ss(0.02, 0.075, z);
  let r = 0;
  r -= 0.009 * Math.exp(-Math.pow(Math.abs(ex - EYE_X) / 0.019, 2.6)) * G((y - EYE_Y) / 0.0115) * fr; // eye sockets
  r += 0.0035 * G((ex - 0.03) / 0.022) * G((y - 0.037) / 0.008) * fr; // brow ridge
  r += 0.004 * G((ex - 0.05) / 0.016) * G((y + 0.006) / 0.014) * fr; // cheekbones
  r -= 0.0025 * G((ex - 0.048) / 0.014) * G((y + 0.042) / 0.012) * fr; // cheek hollows
  r += 0.003 * G(ex / 0.03) * G((y + 0.058) / 0.02) * fr; // muzzle
  const lipW = clamp01(1 - Math.pow(ex / 0.024, 2));
  r += 0.0018 * lipW * G((y + 0.0545) / (0.0032 * (0.4 + 0.6 * lipW))) * fr; // upper lip
  r += 0.0024 * lipW * G((y + 0.064) / (0.0042 * (0.4 + 0.6 * lipW))) * fr; // lower lip
  r -= 0.0018 * ss(0.026, 0.018, ex) * G((y + 0.0588) / 0.0015) * fr; // mouth line
  r -= 0.0015 * G(ex / 0.02) * G((y + 0.073) / 0.005) * fr; // under-lip groove
  r += 0.005 * G(ex / 0.02) * G((y + 0.092) / 0.011) * fr; // chin
  r -= 0.001 * G(ex / 0.0035) * G((y + 0.045) / 0.005) * fr; // philtrum
  r -= 0.003 * G((ex - 0.072) / 0.012) * G((y - 0.045) / 0.02); // temples
  let nose = 0;
  if (y > -0.04 && y < 0.034) {
    let h, w;
    if (y >= -0.022) { const t = (0.03 - y) / 0.052; h = 0.0035 + 0.0175 * Math.pow(clamp01(t), 1.35); w = 0.0062 + 0.0065 * clamp01(t); }
    else { const q = Math.min(1, (-0.022 - y) / 0.016); h = 0.021 * Math.pow(Math.max(0, Math.cos((q * Math.PI) / 2)), 0.8); w = 0.0127; }
    nose = h * G(x / w) * ss(0.034, 0.026, y);
  }
  nose += 0.0065 * G((ex - 0.0135) / 0.0055) * G((y + 0.03) / 0.0065); // nostril wings
  const dx = x - s.cx, dz = z - s.cz, l = Math.hypot(dx, dz) || 1;
  return [(dx / l) * r, 0, (dz / l) * r + nose * fr];
}

function skinColor(x, y, z) {
  const ex = Math.abs(x), fr = ss(0.02, 0.075, z);
  const c = new THREE.Color(0xdba486);
  const tint = (hex, t) => { if (t > 0.001) c.lerp(new THREE.Color(hex), clamp01(t)); };
  tint(0xd58676, 0.35 * G((ex - 0.045) / 0.02) * G((y + 0.02) / 0.02) * fr); // cheeks
  tint(0xd08a78, 0.3 * G(x / 0.012) * G((y + 0.02) / 0.012) * fr); // nose tip
  tint(0xb98472, 0.22 * ss(-0.045, -0.075, y) * ss(0.0, 0.04, z) * (1 - G(ex / 0.022) * G((y + 0.06) / 0.012))); // stubble shadow
  tint(0xb98472, 0.18 * G(ex / 0.02) * G((y + 0.045) / 0.006) * fr); // upper lip stubble
  tint(0xa96a5e, 0.25 * G((ex - EYE_X) / 0.016) * G((y - EYE_Y) / 0.012) * fr); // around the eyes
  const lw = clamp01(1 - Math.pow(ex / 0.025, 2));
  const lips = lw * (ss(0.0042 * (0.5 + 0.5 * lw), 0.0015, Math.abs(y + 0.0545)) + ss(0.0055 * (0.5 + 0.5 * lw), 0.002, Math.abs(y + 0.0638)));
  tint(0xb8706a, 0.6 * Math.min(1, lips) * fr); // lips
  tint(0x6a302a, 0.8 * ss(0.024, 0.014, ex) * G((y + 0.0588) / 0.0013) * fr); // mouth line
  tint(0x4a2620, 0.9 * G((ex - 0.0075) / 0.0035) * G((y + 0.0345) / 0.0028) * fr); // nostrils
  return c;
}

const HAIRLINE = [[0, 0.072], [0.35, 0.077], [0.6, 0.09], [0.8, 0.075], [1.02, 0.045], [1.2, -0.004], [1.32, -0.008],
  [1.4, 0.032], [1.9, 0.034], [2.15, -0.02], [2.45, -0.058], [Math.PI, -0.066]];
function hairlineY(th) {
  for (let i = 1; i < HAIRLINE.length; i++) {
    const [a1, y1] = HAIRLINE[i], [a0, y0] = HAIRLINE[i - 1];
    if (th <= a1) return mix(y0, y1, ss(a0, a1, th));
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}
// Offset of the hair shell from the scalp (negative = hidden inside the head)
function hairOffset(x, y, z) {
  const th = Math.abs(Math.atan2(x, z + 0.012));
  const lim = hairlineY(th);
  const slope = (hairlineY(Math.min(Math.PI, th + 0.02)) - hairlineY(Math.max(0, th - 0.02))) / (0.04 * 0.08);
  const m = ss(-0.0045, 0.0045, (y - lim) / Math.sqrt(1 + slope * slope));
  const cosT = Math.cos(th);
  let t = 0.005 + 0.016 * ss(0.04, 0.118, y);
  t += 0.01 * ss(0.4, 1, cosT) * ss(0.06, 0.1, y); // front quiff
  t += 0.003 * ss(0.0, -0.05, x) * ss(0.05, 0.1, y); // swept towards the right
  t -= 0.006 * G((x - 0.027) / 0.0035) * ss(0.075, 0.1, y) * ss(-0.07, 0.0, z); // side parting
  t *= mix(0.55, 1, ss(-0.06, 0.02, y)); // tapered nape
  let off = mix(-0.0022, t, m);
  // Eyebrows grow from the same shell
  if (z > 0.05) {
    const ex = Math.abs(x);
    const by = 0.037 + 0.0075 * Math.sin(Math.PI * clamp01((ex - 0.008) / 0.046)) - 0.004 * ss(0.035, 0.054, ex);
    const bh = 0.0042 * (1 - 0.55 * ss(0.02, 0.052, ex));
    const bm = ss(bh, bh * 0.35, Math.abs(y - by)) * ss(0.007, 0.013, ex) * ss(0.054, 0.046, ex);
    off = Math.max(off, mix(-0.0022, 0.0022, bm));
  }
  return off;
}

function buildHead(M) {
  const head = loft(HEAD, { radial: 144, sub: 12, warp: 1.35, disp: faceDisp });
  const { rows, cols } = head.userData;
  const pos = head.attributes.position, nrm = head.attributes.normal;
  // Vertex colours
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = skinColor(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  head.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // Hair shell grown along the scalp normals
  const hp = new Float32Array(pos.count * 3), huv = new Float32Array(pos.count * 2), offs = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const o = (offs[i] = hairOffset(x, y, z));
    hp.set([x + nrm.getX(i) * o, y + nrm.getY(i) * o, z + nrm.getZ(i) * o], i * 3);
    huv[i * 2] = (i % cols) / (cols - 1) * 3; huv[i * 2 + 1] = Math.floor(i / cols) / (rows - 1);
  }
  const hidx = [], src = head.index.array;
  for (let i = 0; i < src.length; i += 3) {
    if (Math.max(offs[src[i]], offs[src[i + 1]], offs[src[i + 2]]) > 0) hidx.push(src[i], src[i + 1], src[i + 2]);
  }
  const hair = new THREE.BufferGeometry();
  hair.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  hair.setAttribute('uv', new THREE.BufferAttribute(huv, 2));
  hair.setIndex(hidx);
  hair.computeVertexNormals();
  fixSeam(hair, rows, cols);

  // Find the socket surface to seat the eyeballs
  const ray = new THREE.Raycaster();
  const tmp = new THREE.Mesh(head, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  ray.set(new THREE.Vector3(EYE_X, EYE_Y, 1), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(tmp)[0];
  const sz = hit ? hit.point.z : 0.09;
  const eyeZ = sz + 0.0062 - EYE_R;

  const skinParts = [head];
  const eyes = [];
  for (const side of [-1, 1]) {
    const cx = side * EYE_X;
    const e = new THREE.SphereGeometry(EYE_R, 24, 16);
    e.rotateY(-side * 0.06); // slight outward gaze divergence looks natural
    e.translate(cx, EYE_Y, eyeZ);
    eyes.push(e);
    // Eyelids: thin skin shells over the eyeball with a dark lash line
    const lid = (t0, tl, lash, tilt) => {
      const g = new THREE.SphereGeometry(EYE_R * 1.07, 22, 8, 0, Math.PI, t0, tl);
      const p = g.attributes.position, c = new Float32Array(p.count * 3);
      const edge = lash ? t0 + tl : t0;
      for (let i = 0; i < p.count; i++) {
        const th = Math.acos(Math.max(-1, Math.min(1, p.getY(i) / (EYE_R * 1.07))));
        const k = ss(0.12, 0.0, Math.abs(th - edge));
        const cc = new THREE.Color(0xc99075).lerp(new THREE.Color(lash ? 0x1c120d : 0xb7766a), k * (lash ? 0.95 : 0.6));
        c.set([cc.r, cc.g, cc.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.rotateX(tilt);
      g.translate(cx, EYE_Y, eyeZ);
      return g;
    };
    skinParts.push(lid(0, Math.PI * 0.39, true, 0.06), lid(Math.PI * 0.655, Math.PI * 0.345, false, -0.04));

    // Ear: flattened shell + helix rim + lobe
    const ear = [];
    const base = new THREE.SphereGeometry(1, 16, 12); base.scale(0.008, 0.029, 0.018); ear.push(base);
    const rim = new THREE.TorusGeometry(0.0195, 0.0045, 8, 24, 4.1);
    rim.rotateZ(-1.65); rim.scale(1, 1.38, 1); rim.rotateY(Math.PI / 2); rim.translate(0.004, 0.002, 0); ear.push(rim);
    const lobe = new THREE.SphereGeometry(0.0075, 10, 8); lobe.scale(0.7, 1, 1); lobe.translate(0.002, -0.024, 0.003); ear.push(lobe);
    const inner = new THREE.SphereGeometry(0.009, 10, 8); inner.scale(0.6, 1.2, 1); inner.translate(0.003, -0.004, 0.004); ear.push(inner);
    let eg = mergeGeometries(ear.map((g) => paint(g, 0xd29580)));
    // Darken the inner bowl a little
    const ep = eg.attributes.position, ec = eg.attributes.color;
    for (let i = 0; i < ep.count; i++) {
      const k = G((ep.getY(i) + 0.004) / 0.012) * G((ep.getZ(i) - 0.004) / 0.008) * ss(0.006, 0.0, ep.getX(i));
      const cc = new THREE.Color(ec.getX(i), ec.getY(i), ec.getZ(i)).lerp(new THREE.Color(0x8a5040), 0.5 * k);
      ec.setXYZ(i, cc.r, cc.g, cc.b);
    }
    eg.rotateY(-0.32); eg.rotateZ(-0.08);
    if (side < 0) eg = mirrorX(eg);
    eg.translate(side * 0.074, 0.006, -0.016);
    skinParts.push(eg);
  }
  return { skin: mergeGeometries(skinParts), hair, eyes: mergeGeometries(eyes) };
}

// ---------------------------------------------------------------------------
// Limbs
// ---------------------------------------------------------------------------
// Trouser crease along the front and back
const crease = (x, y, z, s) => {
  const a = Math.atan2(x - s.cx, z - s.cz);
  const k = 0.0024 * (G(a / 0.13) + G((Math.abs(a) - Math.PI) / 0.13));
  const l = Math.hypot(x - s.cx, z - s.cz) || 1;
  return [((x - s.cx) / l) * k, 0, ((z - s.cz) / l) * k];
};

function buildHand(M, grip) {
  // Built for the +x side: palm faces -x (towards the thigh), fingers hang down
  const parts = [];
  parts.push(loft([
    { y: 0.035, x: 0.019, zf: 0.024, zb: 0.024 },
    { y: 0.0, x: 0.019, zf: 0.026, zb: 0.025 },
    { y: -0.03, x: 0.0165, zf: 0.035, zb: 0.034 },
    { y: -0.068, x: 0.0152, zf: 0.041, zb: 0.038 },
    { y: -0.088, x: 0.013, zf: 0.039, zb: 0.035 },
    { y: -0.096, x: 0.005, zf: 0.018, zb: 0.016 },
  ].map((s) => ({ n: 2.4, ...s })), { radial: 32, sub: 5 }));
  const fingers = [
    { z: 0.0255, len: [0.04, 0.024, 0.02], r: 0.0094 },
    { z: 0.0085, len: [0.044, 0.027, 0.021], r: 0.0097 },
    { z: -0.0085, len: [0.041, 0.025, 0.02], r: 0.0092 },
    { z: -0.0245, len: [0.033, 0.02, 0.018], r: 0.0082 },
  ];
  const curl = grip ? [1.0, 1.35, 0.9] : [0.3, 0.38, 0.25];
  for (const f of fingers) {
    let p = new THREE.Vector3(-0.002, -0.08, f.z * 0.92), phi = 0, r = f.r;
    for (let k = 0; k < 3; k++) {
      phi += curl[k] * (1 + (f.z < 0 ? 0.08 : 0));
      const d = new THREE.Vector3(-Math.sin(phi), -Math.cos(phi), f.z * 0.25);
      d.normalize();
      const q = p.clone().addScaledVector(d, f.len[k]);
      parts.push(bone(p, q, r));
      p = q; r *= 0.93;
    }
  }
  // Thumb
  const t0 = new THREE.Vector3(-0.007, -0.016, 0.026);
  const t1 = t0.clone().add(grip ? new THREE.Vector3(-0.016, -0.03, 0.012) : new THREE.Vector3(-0.007, -0.032, 0.013));
  const t2 = t1.clone().add(grip ? new THREE.Vector3(-0.004, -0.024, -0.01) : new THREE.Vector3(-0.004, -0.025, 0.003));
  parts.push(bone(t0, t1, 0.0108), bone(t1, t2, 0.009));
  const thenar = new THREE.SphereGeometry(0.016, 14, 10); thenar.scale(0.75, 1.3, 1); thenar.translate(-0.006, -0.03, 0.02);
  parts.push(thenar);
  return mergeGeometries(parts.map((g) => { g.deleteAttribute('color'); return g; }));
}

function buildShoe() {
  const prof = [[-0.08, 0.004, -0.04, -0.07], [-0.077, 0.026, -0.006, -0.08], [-0.06, 0.04, 0.008, -0.08], [-0.02, 0.044, 0.012, -0.08],
    [0.03, 0.047, 0.002, -0.08], [0.075, 0.051, -0.014, -0.08], [0.115, 0.051, -0.027, -0.08], [0.15, 0.048, -0.036, -0.08],
    [0.177, 0.042, -0.043, -0.08], [0.196, 0.032, -0.05, -0.079], [0.207, 0.017, -0.056, -0.077], [0.211, 0.004, -0.062, -0.074]];
  const sec = (grow, soleOnly) => prof.map(([z, x, top, bot]) => {
    const t = soleOnly ? bot + 0.013 : top;
    const h = t - bot;
    return { y: z * (1 + grow * 0.3), x: Math.max(x + grow * 0.05 * Math.min(1, x / 0.02), grow ? 0.008 : 0), cz: bot + h * 0.35, zf: h * 0.65, zb: h * 0.35, n: 2.2, nb: 6 };
  });
  const upper = loft(sec(0, false), { radial: 32, sub: 4, axisZ: true });
  const sole = loft(sec(0.06, true), { radial: 32, sub: 3, axisZ: true });
  sole.translate(0, -0.0015, 0);
  return { upper, sole };
}

// ---------------------------------------------------------------------------
// look: optional colour overrides for NPCs, e.g. { suit: 0xc8b48a, tie: 0x6a8a3a, hair: 0x9a9a9a }
export function createBusinessman(look = {}) {
  const M = makeMaterials();
  for (const [k, c] of Object.entries(look)) M[k]?.color.set(c);
  if (look.hair != null) M.hair.map = null; // the hair texture is brown, so plain colour for grey/white hair
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body); // everything that bobs
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);

  // Trouser seat
  attach(hips, [[loft([
    { y: -0.17, x: 0.03, zf: 0.03 }, { y: -0.14, x: 0.11, zf: 0.08, zb: 0.085 }, { y: -0.08, x: 0.163, zf: 0.106, zb: 0.117 },
    { y: 0.0, x: 0.17, zf: 0.11, zb: 0.12 }, { y: 0.1, x: 0.16, zf: 0.106, zb: 0.11 },
  ].map((s) => ({ n: 2.4, ...s })), { radial: 32, sub: 3 }), M.suit]]);

  // Legs
  const legs = [];
  const shoe = buildShoe();
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.094 * side, 0, 0); hips.add(hip);
    attach(hip, [[loft([
      { y: 0.1, x: 0.05, zf: 0.055, zb: 0.06 }, { y: 0.07, x: 0.08, zf: 0.083, zb: 0.088 }, { y: 0.0, x: 0.086, zf: 0.086, zb: 0.09 },
      { y: -0.14, x: 0.08, zf: 0.08, zb: 0.082 }, { y: -0.3, x: 0.069, zf: 0.068, zb: 0.068 }, { y: -0.43, x: 0.061, zf: 0.06, zb: 0.06 },
      { y: -0.475, x: 0.05, zf: 0.05, zb: 0.05 }, { y: -0.49, x: 0.01, zf: 0.01, zb: 0.01 },
    ], { radial: 40, sub: 4, disp: crease }), M.suit]]);
    const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
    const sock = new THREE.CylinderGeometry(0.033, 0.035, 0.14, 14, 1, true); sock.translate(0, -0.37, 0);
    attach(knee, [[loft([
      { y: 0.05, x: 0.012 }, { y: 0.035, x: 0.052 }, { y: 0.0, x: 0.06, zf: 0.06, zb: 0.062 }, { y: -0.15, x: 0.057, zf: 0.057, zb: 0.058 },
      { y: -0.33, x: 0.054 }, { y: -0.4, x: 0.057, zf: 0.064, zb: 0.058 },
    ], { radial: 40, sub: 4, disp: crease }), M.suit], [sock, M.sock]]);
    const ankle = new THREE.Group(); ankle.position.y = -0.42; knee.add(ankle);
    const up = shoe.upper.clone(), so = shoe.sole.clone();
    if (side > 0) { up.rotateY(-0.06); so.rotateY(-0.06); } else { up.rotateY(0.06); so.rotateY(0.06); }
    attach(ankle, [[up, M.shoe], [so, M.sole]]);
    legs.push({ hip, knee, ankle });
  }

  // Torso
  const torso = new THREE.Group(); hips.add(torso);
  const torsoMeshes = attach(torso, buildTorso(M));
  const chest = torsoMeshes; // scaled slightly for breathing

  // Head
  const head = new THREE.Group(); head.position.set(0, 0.712, 0.006); torso.add(head);
  const headGeo = new THREE.Group(); headGeo.scale.setScalar(0.95); head.add(headGeo);
  const hg = buildHead(M);
  attach(headGeo, [[hg.skin, M.skin], [hg.hair, M.hair], [hg.eyes, M.eye]]);

  // Arms
  const arms = [];
  let briefcaseHand;
  const upperArm = loft([
    { y: 0.03, x: 0.012 }, { y: 0.022, x: 0.044, zf: 0.05, zb: 0.05 }, { y: 0.0, x: 0.058, zf: 0.062, zb: 0.06 },
    { y: -0.05, x: 0.057, zf: 0.058, zb: 0.058 }, { y: -0.17, x: 0.052, zf: 0.053, zb: 0.053 }, { y: -0.27, x: 0.047, zf: 0.048, zb: 0.05 },
    { y: -0.315, x: 0.044, zf: 0.045, zb: 0.047 }, { y: -0.33, x: 0.01 },
  ], { radial: 28, sub: 4 });
  const foreArm = loft([
    { y: 0.035, x: 0.01 }, { y: 0.025, x: 0.04, zf: 0.04, zb: 0.045 }, { y: 0.0, x: 0.046, zf: 0.046, zb: 0.05 },
    { y: -0.08, x: 0.045, zf: 0.045, zb: 0.046 }, { y: -0.2, x: 0.041 }, { y: -0.247, x: 0.043 },
  ], { radial: 28, sub: 4 });
  const cuff = loft([{ y: -0.222, x: 0.037 }, { y: -0.258, x: 0.0355 }], { radial: 20, sub: 2 });
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(0.18 * side, 0.468, -0.006); torso.add(shoulder);
    attach(shoulder, [[upperArm.clone(), M.suit]]);
    const elbow = new THREE.Group(); elbow.position.y = -0.31; shoulder.add(elbow);
    attach(elbow, [[foreArm.clone(), M.suit], [cuff.clone(), M.shirt]]);
    const hand = new THREE.Group(); hand.position.y = -0.256; elbow.add(hand);
    let hgeo = buildHand(M, side === 1);
    if (side < 0) hgeo = mirrorX(hgeo);
    attach(hand, [[hgeo, M.skinPlain]]);
    if (side === 1) briefcaseHand = hand;
    arms.push({ shoulder, elbow, hand });
  }

  // Briefcase (handle grip at the group origin)
  const briefcase = new THREE.Group();
  const bparts = [];
  const box = new RoundedBoxGeometry(0.42, 0.3, 0.095, 3, 0.014); box.translate(0, -0.19, 0); bparts.push([box, M.leather]);
  const band = new RoundedBoxGeometry(0.424, 0.304, 0.012, 2, 0.005); band.translate(0, -0.19, 0); bparts.push([band, M.leatherDark]);
  const flap = new RoundedBoxGeometry(0.41, 0.07, 0.1, 2, 0.012); flap.translate(0, -0.068, 0); bparts.push([flap, M.leather]);
  const handle = new THREE.TorusGeometry(0.036, 0.0085, 8, 18, Math.PI); handle.scale(1, 0.75, 1.2); handle.translate(0, -0.036, 0);
  bparts.push([handle, M.leather]);
  for (const sx of [-1, 1]) {
    const mount = new THREE.BoxGeometry(0.016, 0.012, 0.022); mount.translate(sx * 0.036, -0.038, 0); bparts.push([mount, M.gold]);
    for (const sz of [-1, 1]) {
      const latch = new RoundedBoxGeometry(0.03, 0.026, 0.008, 1, 0.003); latch.translate(sx * 0.13, -0.075, sz * 0.05); bparts.push([latch, M.gold]);
    }
  }
  attach(briefcase, bparts);
  briefcase.rotation.y = Math.PI / 2;
  briefcase.position.set(-0.012, -0.098, 0.0);
  briefcaseHand.add(briefcase);

  return { root, body, hips, torso, head, legs, arms, chest, briefcase };
}
