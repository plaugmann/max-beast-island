// Procedural textures for the vegetation (leaves, needles, ferns, bark, rock).
// Everything is drawn once at load time on canvases and uploaded as DataTextures, so the RGB of
// transparent texels can be "dilated" (no dark fringes on alpha-tested leaf edges) and the alpha
// channel of opaque textures can carry a height map for bump shading.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const TAU = Math.PI * 2;

// ---------- tileable value noise ----------
function ihash(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, px, py, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  const x0 = ((ix % px) + px) % px, y0 = ((iy % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const a = ihash(x0, y0, s), b = ihash(x1, y0, s), c = ihash(x0, y1, s), d = ihash(x1, y1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// u, v in [0,1); fx, fy = base frequency (integers -> tiles)
function fbm(u, v, fx, fy, oct, s) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u * fx, v * fy, fx, fy, s + o * 31);
    norm += amp; amp *= 0.5; fx *= 2; fy *= 2;
  }
  return sum / norm;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Fill RGB of transparent texels with the colour of nearby opaque ones (prevents dark mip fringes)
function dilate(data, w, h, passes = 10) {
  const n = w * h;
  const valid = new Uint8Array(n);
  let ar = 0, ag = 0, ab = 0, an = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] > 8) {
    valid[i] = 1; ar += data[i * 4]; ag += data[i * 4 + 1]; ab += data[i * 4 + 2]; an++;
  }
  // un-premultiply edge texels is not needed: canvas getImageData returns straight alpha
  for (let p = 0; p < passes; p++) {
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (valid[i]) continue;
      let r = 0, g = 0, b = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (valid[j]) { r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; k++; }
      }
      if (k) add.push(i, r / k, g / k, b / k);
    }
    for (let q = 0; q < add.length; q += 4) {
      const i = add[q];
      data[i * 4] = add[q + 1]; data[i * 4 + 1] = add[q + 2]; data[i * 4 + 2] = add[q + 3]; valid[i] = 1;
    }
  }
  if (an) for (let i = 0; i < n; i++) if (!valid[i]) {
    data[i * 4] = ar / an; data[i * 4 + 1] = ag / an; data[i * 4 + 2] = ab / an;
  }
}

function toTexture(data, w, h, { repeat = false, srgb = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function canvasToTexture(c, ctx, opts) {
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const data = new Uint8Array(img.data.buffer.slice(0));
  dilate(data, c.width, c.height);
  return toTexture(data, c.width, c.height, opts);
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// ---------- leaves ----------
function leafPath(ctx, len, wid, shape, rnd) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const N = 18, pts = [];
  for (let i = 1; i < N; i++) {
    const t = i / N;
    let r;
    if (shape === 'oak') r = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.8) * (1 + 0.28 * Math.sin(t * Math.PI * 9));
    else if (shape === 'birch') r = wid * Math.pow(t < 0.35 ? t / 0.35 : (1 - t) / 0.65, 0.75) * (1 + 0.12 * ((i % 2) ? 1 : -1));
    else r = wid * Math.pow(Math.sin(Math.PI * t), 0.9);
    pts.push([r, -len * t]);
  }
  for (const [r, y] of pts) ctx.lineTo(r, y);
  ctx.lineTo(0, -len);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(-pts[i][0] * (0.9 + 0.2 * rnd()), pts[i][1]);
  ctx.closePath();
}

function drawLeaf(ctx, x, y, ang, len, wid, shape, pal, rnd) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // short petiole
  ctx.strokeStyle = hsl(pal.h - 10, 30, 22);
  ctx.lineWidth = Math.max(1, len * 0.04);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len * 0.12); ctx.stroke();
  ctx.translate(0, -len * 0.1);
  const under = rnd() < pal.under;
  const h = pal.h + (rnd() - 0.5) * pal.hv, s = pal.s + (rnd() - 0.5) * 14, l = pal.l + (rnd() - 0.5) * pal.lv + (under ? 9 : 0);
  const g = ctx.createLinearGradient(0, 0, wid * 0.5, -len);
  g.addColorStop(0, hsl(h - 4, s - 6, l - 6));
  g.addColorStop(0.6, hsl(h, s, l));
  g.addColorStop(1, hsl(h + 6, s + 4, l + 6));
  leafPath(ctx, len, wid, shape, rnd);
  ctx.fillStyle = g;
  ctx.fill();
  // midrib and a few veins
  ctx.strokeStyle = hsl(h + 8, s - 10, l + 12, 0.7);
  ctx.lineWidth = Math.max(0.8, len * 0.03);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len * 0.92); ctx.stroke();
  ctx.lineWidth = Math.max(0.5, len * 0.015);
  ctx.strokeStyle = hsl(h + 6, s - 10, l + 8, 0.45);
  for (let k = 1; k < 5; k++) {
    const t = k / 5.5;
    ctx.beginPath(); ctx.moveTo(0, -len * t); ctx.lineTo(wid * 0.6, -len * (t + 0.12));
    ctx.moveTo(0, -len * t); ctx.lineTo(-wid * 0.6, -len * (t + 0.12)); ctx.stroke();
  }
  ctx.restore();
}

const LEAF_PAL = {
  oak: { h: 92, hv: 16, s: 50, l: 25, lv: 10, under: 0.18, len: [24, 34], wr: 0.42, shape: 'oak', twig: 6, leafEvery: 15 },
  birch: { h: 78, hv: 14, s: 58, l: 33, lv: 10, under: 0.25, len: [16, 22], wr: 0.38, shape: 'birch', twig: 8, leafEvery: 10 },
  bush: { h: 100, hv: 18, s: 44, l: 23, lv: 10, under: 0.15, len: [18, 26], wr: 0.45, shape: 'ellipse', twig: 7, leafEvery: 10 },
};

// 512x512 leaf cluster: a twig with many leaves. Canvas rows 0..15 hold a solid bark strip
// (used by the low-detail trunks so a far tree is one draw call). Twig base is at the bottom.
export function leafClusterTexture(kind, seed = 1) {
  const pal = LEAF_PAL[kind];
  const rnd = mulberry32(seed * 977 + kind.length * 13);
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = kind === 'birch' ? '#d8d4c8' : '#4a3a2c';
  ctx.fillRect(0, 0, S, 14);
  ctx.lineCap = 'round';
  // twig skeleton
  const twigs = [];
  const main = [];
  let x = S / 2, y = S - 6, a = -Math.PI / 2;
  for (let i = 0; i < 30; i++) {
    main.push([x, y, a]);
    a += (rnd() - 0.5) * 0.12;
    x += Math.cos(a) * 15; y += Math.sin(a) * 15;
    if (y < 60) break;
  }
  twigs.push({ pts: main, w: 4 });
  for (let k = 0; k < pal.twig; k++) {
    const base = main[Math.min(main.length - 1, 3 + Math.floor((k + rnd() * 0.6) / pal.twig * (main.length - 6)))];
    const side = k % 2 ? 1 : -1;
    let [tx, ty] = base, ta = base[2] + side * (0.85 + rnd() * 0.6);
    const pts = [], L = 12 + Math.floor(rnd() * 6);
    for (let i = 0; i < L; i++) {
      pts.push([tx, ty, ta]);
      ta += (rnd() - 0.5) * 0.25 - side * 0.05;
      tx += Math.cos(ta) * 15; ty += Math.sin(ta) * 15;
      const d = Math.hypot(tx - S / 2, ty - S / 2 - 16);
      if (d > 215) break;
    }
    twigs.push({ pts, w: 2.4 });
  }
  for (const tw of twigs) {
    ctx.strokeStyle = hsl(25, 25, 20);
    ctx.lineWidth = tw.w;
    ctx.beginPath();
    tw.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
  // leaves along twigs, back to front so they overlap naturally
  const leaves = [];
  for (const tw of twigs) {
    const pts = tw.pts;
    for (let i = 1; i < pts.length; i++) {
      const [px, py, pa] = pts[i];
      const n = Math.max(2, Math.round(15 / pal.leafEvery * 2.2));
      for (let k = 0; k < n; k++) {
        const side = (i + k) % 2 ? 1 : -1;
        const ang = pa + Math.PI / 2 + side * (0.6 + rnd() * 0.7);
        const len = pal.len[0] + rnd() * (pal.len[1] - pal.len[0]);
        leaves.push([px + (rnd() - 0.5) * 6, py + (rnd() - 0.5) * 6, ang, len]);
      }
    }
    const [ex, ey, ea] = pts[pts.length - 1];
    leaves.push([ex, ey, ea + Math.PI / 2, pal.len[1]]);
  }
  for (let i = leaves.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [leaves[i], leaves[j]] = [leaves[j], leaves[i]]; }
  for (const [lx, ly, la, ll] of leaves) {
    if (Math.hypot(lx - S / 2, ly - S / 2 - 16) > 236 - ll) continue;
    drawLeaf(ctx, lx, ly, la, ll, ll * pal.wr, pal.shape, pal, rnd);
  }
  return canvasToTexture(c, ctx);
}

// 512x256 spruce branch seen from above: trunk side at u=0, tip at u=1.
// Canvas rows 240..255 hold a solid bark strip for far trunks.
export function needleTexture(seed = 3) {
  const rnd = mulberry32(seed * 131);
  const W = 512, H = 256, cy = 116;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#3d2c22';
  ctx.fillRect(0, H - 14, W, 14);
  ctx.lineCap = 'round';
  const axis = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    axis.push([8 + t * 492, cy + Math.sin(t * 3.1) * 4 * (rnd() - 0.2), t]);
  }
  const needleStroke = (x0, y0, ang, len, tip) => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    const l = tip ? 24 + rnd() * 8 : 12 + rnd() * 12;
    ctx.strokeStyle = tip ? hsl(100 + rnd() * 20, 40, l) : hsl(125 + rnd() * 30, 28 + rnd() * 16, l);
    ctx.stroke();
  };
  const twig = (pts, w) => {
    ctx.strokeStyle = hsl(22, 30, 18); ctx.lineWidth = w;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  };
  const twigs = [axis];
  // side twigs: outline broad at the base, tapering to the tip
  for (let i = 2; i < axis.length - 2; i += 2) {
    const [ax, ay, t] = axis[i];
    for (const side of [-1, 1]) {
      const L = (150 - t * 115) * (0.8 + rnd() * 0.3);
      const pts = [];
      let a = side * (0.8 + rnd() * 0.35), x = ax, y = ay;
      for (let k = 0; k < 8; k++) {
        pts.push([x, y]);
        x += Math.cos(a) * L / 8; y += Math.sin(a) * L / 8;
        a -= side * 0.04;
        y = Math.max(8, Math.min(H - 22, y));
      }
      twigs.push(pts);
    }
  }
  twig(axis, 5);
  for (let i = 1; i < twigs.length; i++) twig(twigs[i], 1.6);
  // needles
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? 1.3 : 1.8;
    for (const pts of twigs) {
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
        const a = Math.atan2(y1 - y0, x1 - x0), seg = Math.hypot(x1 - x0, y1 - y0);
        const tipSeg = k >= pts.length - 3;
        for (let d = 0; d < seg; d += 2.2) {
          const x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d;
          for (const side of [-1, 1]) {
            const na = a + side * (0.7 + rnd() * 0.5);
            const len = (pts === axis ? 14 : 10) * (0.7 + rnd() * 0.5);
            needleStroke(x, y, na, len, tipSeg && pass === 1 && rnd() < 0.3);
          }
        }
      }
    }
  }
  // keep the bark strip clean
  ctx.clearRect(0, H - 24, W, 10);
  return canvasToTexture(c, ctx);
}

// 256x512 fern frond, base at the bottom
export function fernTexture(seed = 5) {
  const rnd = mulberry32(seed * 71);
  const W = 256, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.lineCap = 'round';
  const rach = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    rach.push([W / 2 + Math.sin(t * 2.5) * 10, H - 4 - t * (H - 16), t]);
  }
  ctx.strokeStyle = hsl(80, 40, 22); ctx.lineWidth = 3;
  ctx.beginPath(); rach.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  for (let i = 4; i < rach.length; i++) {
    const [x, y, t] = rach[i];
    const L = 105 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.05) / 0.98)), 0.8);
    for (const side of [-1, 1]) {
      const a = -Math.PI / 2 + side * (1.15 - t * 0.3);
      const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
      ctx.strokeStyle = hsl(85, 40, 24); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      // pinnules
      const n = Math.max(2, Math.floor(L / 6));
      for (let k = 0; k < n; k++) {
        const u = k / n, px = x + (ex - x) * u, py = y + (ey - y) * u;
        const w = 5.5 * (1 - u * 0.7), l = 7 * (1 - u * 0.5);
        const h = 95 + rnd() * 18, li = 26 + rnd() * 10 + t * 6;
        ctx.fillStyle = hsl(h, 50, li);
        for (const s2 of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(px + Math.cos(a + s2 * 1.3) * l * 0.5, py + Math.sin(a + s2 * 1.3) * l * 0.5, l * 0.6, w * 0.5, a + s2 * 1.3, 0, TAU);
          ctx.fill();
        }
      }
    }
  }
  return canvasToTexture(c, ctx);
}

// ---------- bark (RGB colour + height in alpha), 256 wide (around the trunk) x 512 tall ----------
export function barkTexture(kind, seed = 7) {
  const W = 256, H = 512, data = new Uint8Array(W * H * 4);
  const rnd = mulberry32(seed * 19 + kind.length);
  if (kind === 'birch') {
    const hgt = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const n = fbm(u, v, 8, 8, 4, 11);
      const blotch = fbm(u, v, 3, 12, 4, 23);
      let r = 0.86 + (n - 0.5) * 0.12, g = 0.85 + (n - 0.5) * 0.12, b = 0.8 + (n - 0.5) * 0.1;
      const dark = Math.max(0, Math.min(1, (blotch - 0.6) * 7));
      r = r * (1 - dark) + 0.12 * dark; g = g * (1 - dark) + 0.11 * dark; b = b * (1 - dark) + 0.1 * dark;
      const i = (y * W + x) * 4;
      data[i] = r * 255; data[i + 1] = g * 255; data[i + 2] = b * 255;
      hgt[y * W + x] = 0.6 + n * 0.3 - dark * 0.3;
    }
    // horizontal lenticels
    for (let k = 0; k < 420; k++) {
      const cx = rnd() * W, cy = rnd() * H, len = 6 + rnd() * 34, th = 1 + rnd() * 2.2;
      const col = rnd() < 0.7 ? [70, 60, 55] : [25, 22, 20];
      for (let dx = -len / 2; dx < len / 2; dx++) for (let dy = 0; dy < th; dy++) {
        const x = ((Math.floor(cx + dx) % W) + W) % W, y = Math.floor(cy + dy + Math.sin(dx * 0.1) * 0.8) % H;
        const taper = 1 - Math.abs(dx) / (len / 2);
        if (rnd() > 0.15 + taper) continue;
        const i = (y * W + x) * 4, a = 0.85;
        data[i] = data[i] * (1 - a) + col[0] * a; data[i + 1] = data[i + 1] * (1 - a) + col[1] * a; data[i + 2] = data[i + 2] * (1 - a) + col[2] * a;
        hgt[y * W + x] = 0.2;
      }
    }
    for (let i = 0; i < W * H; i++) data[i * 4 + 3] = Math.max(0, Math.min(255, hgt[i] * 255));
    return toTexture(data, W, H, { repeat: true });
  }
  // furrowed bark: oak (grey-brown deep furrows), pine (reddish plates), dead (silver-grey)
  const pal = {
    oak: [[0.17, 0.14, 0.11], [0.5, 0.45, 0.39]],
    pine: [[0.12, 0.07, 0.05], [0.42, 0.27, 0.18]],
    dead: [[0.16, 0.15, 0.14], [0.55, 0.53, 0.5]],
  }[kind];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const warp = fbm(u, v, 4, 4, 3, 5) - 0.5;
    let ridge;
    if (kind === 'pine') {
      // irregular plates separated by cracks
      const n1 = fbm(u + warp * 0.08, v, 6, 6, 4, 9);
      const n2 = fbm(u, v + warp * 0.1, 12, 4, 3, 17);
      ridge = Math.min(1, Math.abs(n1 - 0.5) * 3.2 + 0.25) * (0.7 + 0.3 * n2);
      ridge = Math.pow(1 - Math.max(0, 1 - ridge * 1.8), 1.5);
    } else {
      const n = fbm(u + warp * 0.12, v, 10, 2, 4, 13);
      ridge = 1 - Math.abs(n - 0.5) * 2; // 1 on ridges
      ridge = Math.pow(Math.max(0, ridge), kind === 'dead' ? 0.6 : 1.6);
      ridge *= 0.75 + 0.25 * fbm(u, v, 8, 16, 3, 29);
    }
    const fine = fbm(u, v, 32, 32, 2, 41);
    const t = Math.max(0, Math.min(1, ridge * 0.85 + fine * 0.25));
    let r = pal[0][0] + (pal[1][0] - pal[0][0]) * t, g = pal[0][1] + (pal[1][1] - pal[0][1]) * t, b = pal[0][2] + (pal[1][2] - pal[0][2]) * t;
    // lichen / moss specks
    const lich = fbm(u, v, 6, 6, 4, 53);
    if (kind !== 'dead' && lich > 0.66) {
      const k = Math.min(1, (lich - 0.66) * 6) * ridge;
      r = r * (1 - k) + 0.36 * k; g = g * (1 - k) + 0.42 * k; b = b * (1 - k) + 0.26 * k;
    }
    const i = (y * W + x) * 4;
    data[i] = Math.min(255, r * 255); data[i + 1] = Math.min(255, g * 255); data[i + 2] = Math.min(255, b * 255);
    data[i + 3] = t * 255;
  }
  return toTexture(data, W, H, { repeat: true });
}

// ---------- rock: RGB colour + height in alpha, tileable 512x512 ----------
export function rockTexture() {
  const S = 512, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const n = fbm(u, v, 4, 4, 6, 101);
    const m = fbm(u, v, 16, 16, 3, 113);
    const cr = fbm(u, v, 6, 6, 5, 127);
    const crack = Math.max(0, 1 - Math.abs(cr - 0.5) * 60) * Math.max(0, Math.min(1, (fbm(u, v, 3, 3, 2, 139) - 0.5) * 6)); // sparse thin cracks
    const speck = ihash(x, y, 7) > 0.985 ? 1 : 0;
    let base = 0.42 + (n - 0.5) * 0.35 + (m - 0.5) * 0.12;
    let r = base * 1.02, g = base, b = base * 0.96;
    const lich = fbm(u, v, 8, 8, 4, 151);
    if (lich > 0.62) {
      const k = Math.min(1, (lich - 0.62) * 8) * 0.8;
      const yel = ihash(Math.floor(x / 9), Math.floor(y / 9), 3) > 0.7;
      const lc = yel ? [0.62, 0.58, 0.32] : [0.58, 0.6, 0.52];
      r = r * (1 - k) + lc[0] * k; g = g * (1 - k) + lc[1] * k; b = b * (1 - k) + lc[2] * k;
    }
    r = r * (1 - crack * 0.7) + speck * 0.25; g = g * (1 - crack * 0.7) + speck * 0.25; b = b * (1 - crack * 0.7) + speck * 0.25;
    const h = n * 0.7 + m * 0.3 - crack * 0.5;
    const i = (y * S + x) * 4;
    data[i] = Math.max(0, Math.min(255, r * 255)); data[i + 1] = Math.max(0, Math.min(255, g * 255));
    data[i + 2] = Math.max(0, Math.min(255, b * 255)); data[i + 3] = Math.max(0, Math.min(255, h * 255));
  }
  return toTexture(data, S, S, { repeat: true });
}
