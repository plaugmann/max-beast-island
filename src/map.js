// Island map (opens with Q): shaded relief, contour lines, labels and the player marker
import { FEATURES, FORESTS } from './world.js';
import { clamp } from './util.js';

const EXTENT = 1150; // world units from centre to map edge
const toSRGB = (c) => Math.round(255 * Math.pow(clamp(c, 0, 1), 1 / 2.2));

export function createMap(world, canvas) {
  const SIZE = 900;
  const base = document.createElement('canvas');
  base.width = base.height = SIZE;
  const bctx = base.getContext('2d');
  const img = bctx.createImageData(SIZE, SIZE);
  const { N, half, cell, colors, normals, heights } = world;
  const L = [-0.55, 0.7, -0.45];
  const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;

  const idxAt = (x, z) => {
    const ix = clamp(Math.round((x + half) / cell), 0, N - 1), iz = clamp(Math.round((z + half) / cell), 0, N - 1);
    return iz * N + ix;
  };
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const x = (px / SIZE * 2 - 1) * EXTENT, z = (py / SIZE * 2 - 1) * EXTENT;
    const i = idxAt(x, z), h = heights[i];
    let r, g, b;
    if (h < 0) {
      const t = clamp(-h / 25, 0, 1);
      r = 0.42 * (1 - t) + 0.05 * t; g = 0.82 * (1 - t) + 0.22 * t; b = 0.86 * (1 - t) + 0.42 * t;
      if (h > -0.8) { r = g = b = 0.95; }
    } else {
      const shade = 0.55 + 0.75 * Math.max(0, normals[i * 3] * L[0] + normals[i * 3 + 1] * L[1] + normals[i * 3 + 2] * L[2]);
      r = colors[i * 3] * shade; g = colors[i * 3 + 1] * shade; b = colors[i * 3 + 2] * shade;
      // contour lines every 30 m
      const hn = heights[idxAt(x + EXTENT * 2 / SIZE, z)], hs = heights[idxAt(x, z + EXTENT * 2 / SIZE)];
      if (Math.floor(h / 30) !== Math.floor(hn / 30) || Math.floor(h / 30) !== Math.floor(hs / 30)) { r *= 0.75; g *= 0.75; b *= 0.72; }
    }
    const o = (py * SIZE + px) * 4;
    img.data[o] = toSRGB(r); img.data[o + 1] = toSRGB(g); img.data[o + 2] = toSRGB(b); img.data[o + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.height = SIZE;
  const w2m = (x, z) => [(x / EXTENT * 0.5 + 0.5) * SIZE, (z / EXTENT * 0.5 + 0.5) * SIZE];

  const labels = [
    [FEATURES.ice, '❄️', FEATURES.ice.name], [FEATURES.stone, '⛰️', FEATURES.stone.name], [FEATURES.grey, '⛰️', FEATURES.grey.name],
    [FEATURES.volcano, '🌋', FEATURES.volcano.name], [FEATURES.cave, '💎', FEATURES.cave.name],
    [{ x: FORESTS[0].x - 40, z: FORESTS[0].z - 90 }, '🌲', FORESTS[0].name], [FORESTS[1], '🌲', FORESTS[1].name], [FORESTS[2], '🌳', FORESTS[2].name],
    [FEATURES.spawn, '⭐', 'Spawn'],
  ];

  // Gameplay markers (base, shops): { x, z, icon, name, color }
  const markers = [];
  const addMarker = (m) => { markers.push(m); return m; };

  function draw(player, camYaw) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(base, 0, 0);
    // subtle vignette
    const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.3, SIZE / 2, SIZE / 2, SIZE * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,20,40,0.45)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [f, icon, name] of labels) {
      const [x, y] = w2m(f.x, f.z);
      ctx.font = '30px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.fillText(icon, x, y - 4);
      ctx.font = '22px "Lilita One", system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,20,35,0.85)'; ctx.fillStyle = '#fff';
      ctx.strokeText(name, x, y + 26); ctx.fillText(name, x, y + 26);
    }

    for (const m of markers) {
      const [x0, y0] = w2m(m.x, m.z), x = x0 + (m.ox || 0), y = y0 + (m.oy || 0);
      if (m.ox || m.oy) { // leader line to the real spot
        ctx.strokeStyle = m.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y - 4); ctx.stroke();
        ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(x0, y0, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(10,20,35,0.75)'; ctx.strokeStyle = m.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y - 4, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '24px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(m.icon, x, y - 3);
      ctx.font = '22px "Lilita One", system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,20,35,0.9)'; ctx.fillStyle = m.color;
      ctx.strokeText(m.name, x, y + 34); ctx.fillText(m.name, x, y + 34);
    }

    // Compass
    ctx.save(); ctx.translate(SIZE - 70, 70);
    ctx.fillStyle = 'rgba(10,20,35,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(9, 0); ctx.lineTo(-9, 0); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(9, 0); ctx.lineTo(-9, 0); ctx.fill();
    ctx.font = '20px "Lilita One", sans-serif'; ctx.fillText('N', 0, -52 + 4); ctx.restore();

    // Player marker
    const [px, py] = w2m(player.pos.x, player.pos.z);
    const pulse = 1 + 0.25 * Math.sin(performance.now() * 0.006);
    ctx.fillStyle = 'rgba(255,215,64,0.25)'; ctx.beginPath(); ctx.arc(px, py, 22 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(px, py); ctx.rotate(-player.facing + Math.PI);
    ctx.fillStyle = '#ffd740'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(11, 12); ctx.lineTo(0, 6); ctx.lineTo(-11, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.font = '18px "Lilita One", sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#ffd740';
    ctx.strokeText('YOU', px, py - 30); ctx.fillText('YOU', px, py - 30);
  }
  return { draw, addMarker };
}
