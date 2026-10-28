// The player's base: walls with a doorway, 10 pedestals where animals earn money, and a COLLECT pad
import * as THREE from 'three';
import { BASE_PLOTS, BASE_SIZE, plotToWorld } from './world.js';
import { RARITY, ANIMALS, BASE_SLOTS, INVENTORY_SIZE, fmtMoney } from './data.js';
import { materials, repMat, box, makeSign, lantern } from './shops.js';

const $ = (id) => document.getElementById(id);
const ICON = Object.fromEntries(Object.values(ANIMALS).flat().map((a) => [a.name, a.icon]));
export const invItem = (name, rarity) => ({ name, rarity, icon: ICON[name] || '❔', perSec: RARITY[rarity].perSec });

// Pedestal layout (plot-local): two columns facing the centre aisle, COLLECT pad at the back
const SLOT_POS = Array.from({ length: BASE_SLOTS }, (_, i) => [i < 5 ? -7.8 : 7.8, -7.2 + (i % 5) * 3.55]);
const PAD = [0, -6.6], PED_H = 0.72;

function canvasTex(w, h, draw, rep) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); }
  t.userData.cv = cv;
  return t;
}
// Sandstone flagstones
const drawFloor = (g, w, h) => {
  g.fillStyle = '#5c5246'; g.fillRect(0, 0, w, h);
  let s = 3; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = 4, c = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = 0.85 + R() * 0.25, base = [196, 176, 142].map((v) => v * k | 0);
    g.fillStyle = `rgb(${base})`; g.beginPath(); g.roundRect(x * c + 3, y * c + 3, c - 6, c - 6, 5); g.fill();
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${R() > 0.5 ? '255,245,225' : '70,55,35'},${R() * 0.1})`; g.beginPath(); g.arc(x * c + R() * c, y * c + R() * c, 1 + R() * 5, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(x * c + c / 2, y * c + c / 2, 4, x * c + c / 2, y * c + c / 2, c * 0.7);
    gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)'); g.fillStyle = gr; g.fillRect(x * c + 3, y * c + 3, c - 6, c - 6);
  }
};
// Royal red carpet with gold border (along v)
const drawCarpet = (g, w, h) => {
  g.fillStyle = '#8e1620'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,120,120' : '40,0,0'},${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = '#e2b04a'; g.fillRect(10, 0, 14, h); g.fillRect(w - 24, 0, 14, h);
  g.fillStyle = '#6a0e16'; g.fillRect(30, 0, 6, h); g.fillRect(w - 36, 0, 6, h);
  g.strokeStyle = 'rgba(226,176,74,0.55)'; g.lineWidth = 4;
  for (let y = 32; y < h; y += 64) { g.beginPath(); g.moveTo(w / 2, y - 22); g.lineTo(w / 2 + 22, y); g.lineTo(w / 2, y + 22); g.lineTo(w / 2 - 22, y); g.closePath(); g.stroke(); }
};

export function createBase(game, saved) {
  const { scene, world, animals, cubes, player } = game;
  const st = cubes.state, M = materials();
  const plotIdx = saved?.base?.plot ?? Math.floor(Math.random() * BASE_PLOTS.length);
  const pl = BASE_PLOTS[plotIdx];
  const toW = (lx, lz, y = 0) => { const [x, z] = plotToWorld(pl, lx, lz); return new THREE.Vector3(x, pl.y + y, z); };
  const root = new THREE.Group();
  root.position.set(pl.x, pl.y, pl.z); root.rotation.y = pl.ry;
  scene.add(root);
  const W = BASE_SIZE.w, D = BASE_SIZE.d, WH = 1.5, WT = 0.5;
  const collide = (lx, lz, hx, hz) => { const [x, z] = plotToWorld(pl, lx, lz); game.addBoxCollider(x, z, hx, hz, pl.ry); };

  // ---------- Building ----------
  const floorMat = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, drawFloor, [W / 4, D / 4]), roughness: 0.85 });
  const floor = box(W, 0.6, D, floorMat, 0, -0.25, 0, root); floor.castShadow = false;
  box(W + 0.5, 0.5, D + 0.5, repMat(M.cap, W / 3, 0.3), 0, -0.3, 0, root).castShadow = false; // plinth edge
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.4, D / 2 + 5.2), new THREE.MeshStandardMaterial({ map: canvasTex(128, 512, drawCarpet, [1, 4]), roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.065, PAD[1] + (D / 2 + 5.2) / 2 + 0.8); carpet.receiveShadow = true; root.add(carpet);

  const wall = (cx, cz, w, d, h = WH) => {
    const len = Math.max(w, d);
    box(w, h, d, repMat(M.brick, len / 2, h / 1.5), cx, h / 2, cz, root);
    box(w + 0.16, 0.14, d + 0.16, repMat(M.cap, len / 2, 0.1), cx, h + 0.07, cz, root);
    collide(cx, cz, w / 2, d / 2);
  };
  const door = 2.4;
  wall(-(W / 2 + door) / 2, D / 2 - WT / 2, W / 2 - door, WT); wall((W / 2 + door) / 2, D / 2 - WT / 2, W / 2 - door, WT); // front, with doorway
  wall(-W / 2 + WT / 2, 0, WT, D - WT * 2); wall(W / 2 - WT / 2, 0, WT, D - WT * 2);
  wall(-(W / 2 + 3) / 2 - 0, -D / 2 + WT / 2, W / 2 - 3, WT); wall((W / 2 + 3) / 2, -D / 2 + WT / 2, W / 2 - 3, WT);
  wall(0, -D / 2 + WT / 2, 6, WT, 3.6); // taller vault wall behind the COLLECT pad
  const pillar = (x, z, h, s = 1) => {
    box(s, h, s, repMat(M.brick, s / 1.5, h / 1.5), x, h / 2, z, root);
    box(s + 0.24, 0.18, s + 0.24, M.cap, x, h + 0.09, z, root);
    box(s + 0.12, 0.25, s + 0.12, M.cap, x, 0.12, z, root);
    collide(x, z, s / 2 + 0.06, s / 2 + 0.06);
  };
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { pillar(x * (W / 2 - 0.4), z * (D / 2 - 0.4), 2.1); lantern(root, x * (W / 2 - 0.4), 2.62, z * (D / 2 - 0.4), 1.2); }
  for (const z of [-3.8, 3.8]) for (const x of [-1, 1]) pillar(x * (W / 2 - 0.3), z, 1.8, 0.7);
  for (const x of [-4.2, 4.2]) pillar(x, -D / 2 + 0.3, 1.8, 0.7);
  // Gate: two tall pillars, a beam and the sign
  for (const x of [-1, 1]) { pillar(x * (door + 0.45), D / 2 - 0.25, 3.6, 0.9); lantern(root, x * (door + 0.45), 4.1, D / 2 - 0.25, 1.1); }
  box(door * 2 + 1.9, 0.34, 0.5, M.darkWood, 0, 3.55, D / 2 - 0.25, root);
  const sign = makeSign('YOUR BASE', null, { w: 4.2, h: 1.05, color: '#9dff6a' });
  sign.position.set(0, 4.42, D / 2 - 0.25); root.add(sign);
  for (const x of [-1.5, 1.5]) box(0.07, 0.5, 0.07, M.iron, x, 3.85, D / 2 - 0.25, root);
  // Vault emblem: big gold coin with a $
  const coinTex = canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(110, 100, 10, 128, 128, 128); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.6, '#e7b244'); gr.addColorStop(1, '#a66d10');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    g.strokeStyle = '#8a5a0c'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, 0, 7); g.stroke();
    g.font = '170px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#8a5a0c'; g.fillText('$', 133, 141); g.fillStyle = '#ffe9a0'; g.fillText('$', 128, 136);
  });
  coinTex.center.set(0.5, 0.5); coinTex.rotation = Math.PI / 2;
  const emblem = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 40), [M.gold, new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.9, roughness: 0.3 }), M.gold]);
  emblem.rotation.x = Math.PI / 2; emblem.position.set(0, 2.3, -D / 2 + WT + 0.08); root.add(emblem);
  // Flag on a pole (seen from far away)
  const poleX = -W / 2 + 0.4, poleZ = -D / 2 + 0.4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 8.5, 8), M.iron); pole.position.set(poleX, 2.4 + 4.25, poleZ); pole.castShadow = true; root.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), M.gold); knob.position.set(poleX, 11, poleZ); root.add(knob);
  const flagTex = canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#2f9a3c'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f6e2a'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#ffd34a'; g.beginPath();
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 52; g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + 4 + Math.sin(a) * r); }
    g.fill();
  });
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.5, 12, 6); flagGeo.translate(1.2, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(poleX + 0.06, 10.1, poleZ); flag.castShadow = true; root.add(flag);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);

  // ---------- Pedestals ----------
  const pedMat = repMat(M.cap, 2, 0.5), topMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.22, metalness: 0.2 });
  const pedGeo = new THREE.CylinderGeometry(1.0, 1.16, PED_H - 0.08, 8), trimGeo = new THREE.CylinderGeometry(1.06, 1.06, 0.08, 8), topGeo = new THREE.CylinderGeometry(0.94, 0.94, 0.03, 8);
  const ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.6), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const ghostGeo = new THREE.TorusGeometry(0.42, 0.04, 8, 40);
  const views = [];
  SLOT_POS.forEach(([lx, lz], i) => {
    const g = new THREE.Group(); g.position.set(lx, 0, lz); root.add(g);
    const p = new THREE.Mesh(pedGeo, pedMat); p.position.y = (PED_H - 0.08) / 2; p.castShadow = p.receiveShadow = true; g.add(p);
    const trim = new THREE.Mesh(trimGeo, M.gold); trim.position.y = PED_H - 0.04; g.add(trim);
    const top = new THREE.Mesh(topGeo, topMat); top.position.y = PED_H + 0.005; top.receiveShadow = true; g.add(top);
    const num = canvasTex(128, 128, (c) => { c.fillStyle = '#e8b348'; c.beginPath(); c.arc(64, 64, 58, 0, 7); c.fill(); c.fillStyle = '#3a2408'; c.font = '78px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), 64, 70); });
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshStandardMaterial({ map: num, metalness: 0.6, roughness: 0.35 }));
    const face = lx < 0 ? 1 : -1; // towards the aisle
    plate.position.set(face * 1.1, 0.36, 0); plate.rotation.y = face * Math.PI / 2; plate.rotation.x = 0; g.add(plate);
    const ghost = new THREE.Mesh(ghostGeo, ghostMat); ghost.rotation.x = -Math.PI / 2; ghost.position.y = PED_H + 0.5; g.add(ghost);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(512, 256, () => {}), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    label.center.set(0.5, 0); label.renderOrder = 6; g.add(label);
    const wpos = toW(lx, lz);
    collide(lx, lz, 1.1, 1.1);
    const v = { i, g, ghost, label, wpos, face, animal: null, shown: -1 };
    views.push(v);
    game.addInteract({ pos: wpos, r: 2.6, h: 2.6, label: () => slots[i] ? `Take back ${slots[i].name}` : 'Place an animal', action: () => (slots[i] ? take(i) : choose(i)) });
  });

  // ---------- COLLECT pad ----------
  const padTex = canvasTex(512, 512, (g) => {
    const c = 256;
    const gr = g.createRadialGradient(c, c, 20, c, c, 256); gr.addColorStop(0, '#2b5a1c'); gr.addColorStop(1, '#0e2410');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, 254, 0, 7); g.fill();
    g.strokeStyle = '#9dff6a'; g.lineWidth = 14; g.beginPath(); g.arc(c, c, 238, 0, 7); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.arc(c, c, 150, 0, 7); g.stroke();
    g.font = '64px "Lilita One", sans-serif'; g.fillStyle = '#d8ffb0'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const word = 'COLLECT  •  COLLECT  •  ';
    for (let k = 0; k < word.length; k++) { const a = (k / word.length) * Math.PI * 2; g.save(); g.translate(c + Math.sin(a) * 194, c - Math.cos(a) * 194); g.rotate(a); g.fillText(word[k], 0, 0); g.restore(); }
    g.font = '200px "Lilita One", sans-serif'; g.fillStyle = '#ffe27a'; g.fillText('$', c, c + 12);
  });
  const pad = new THREE.Group(); pad.position.set(PAD[0], 0, PAD[1]); root.add(pad);
  const padRim = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, 0.12, 48), M.gold); padRim.position.y = 0.06; padRim.receiveShadow = true; pad.add(padRim);
  const padTopMat = new THREE.MeshStandardMaterial({ map: padTex, emissiveMap: padTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 });
  const padTop = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), padTopMat); padTop.rotation.x = -Math.PI / 2; padTop.position.y = 0.125; pad.add(padTop);
  const beamU = { uTime: { value: 0 }, uOn: { value: 0 } };
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 3.2, 40, 1, true), new THREE.ShaderMaterial({
    uniforms: beamU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uOn; varying vec2 vUv;
      void main(){
        float f = clamp(1.0 - vUv.y, 0.0, 1.0), fall = f * f * (0.4 + 0.6 * f);
        float streak = 0.6 + 0.4 * sin(vUv.x * 62.83 + uTime * 1.5) * sin(vUv.x * 25.13 - uTime * 0.7);
        float rise = 0.75 + 0.25 * sin(vUv.y * 18.0 - uTime * 4.0);
        float a = fall * streak * rise * (0.12 + 0.45 * uOn);
        vec3 col = mix(vec3(0.5, 1.6, 0.35), vec3(1.6, 1.3, 0.35), uOn);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  beam.position.y = 1.72; beam.renderOrder = 2; pad.add(beam);
  const padLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(512, 192, () => {}), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  padLabel.center.set(0.5, 0); padLabel.scale.set(2.6, 0.98, 1); padLabel.position.y = 2.5; padLabel.renderOrder = 6; pad.add(padLabel);
  const padW = toW(PAD[0], PAD[1]);
  let padShown = -1;

  // ---------- Slot data + labels ----------
  const slots = Array.from({ length: BASE_SLOTS }, (_, i) => {
    const s = saved?.base?.slots?.[i];
    return s && RARITY[s.rarity] && ICON[s.name] ? { name: s.name, rarity: s.rarity, stored: +s.stored || 0 } : null;
  });
  function drawLabel(v) {
    const s = slots[v.i], tex = v.label.material.map, cv = tex.userData.cv, g = cv.getContext('2d');
    g.clearRect(0, 0, 512, 256); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (!s) {
      g.font = '44px "Lilita One", sans-serif'; g.lineWidth = 9; g.strokeStyle = 'rgba(0,0,0,.6)';
      g.strokeText('EMPTY', 256, 200); g.fillStyle = 'rgba(200,255,255,.85)'; g.fillText('EMPTY', 256, 200);
    } else {
      const r = RARITY[s.rarity];
      g.font = '50px "Lilita One", sans-serif'; g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.85)';
      g.strokeText(s.name, 256, 40); g.fillStyle = r.index === 9 ? '#c89cff' : r.color; g.fillText(s.name, 256, 40);
      g.font = '800 34px Nunito, sans-serif'; g.lineWidth = 8;
      g.strokeText(`${fmtMoney(r.perSec)}/s`, 256, 92); g.fillStyle = '#8dff8a'; g.fillText(`${fmtMoney(r.perSec)}/s`, 256, 92);
      const txt = fmtMoney(Math.floor(s.stored)); g.font = '52px "Lilita One", sans-serif';
      const tw = g.measureText(txt).width + 90;
      g.fillStyle = 'rgba(20,14,4,.72)'; g.beginPath(); g.roundRect(256 - tw / 2, 130, tw, 76, 38); g.fill();
      g.strokeStyle = '#e8b348'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#ffcf3f'; g.beginPath(); g.arc(256 - tw / 2 + 40, 168, 22, 0, 7); g.fill();
      g.fillStyle = '#8a5a0c'; g.font = '30px "Lilita One", sans-serif'; g.fillText('$', 256 - tw / 2 + 40, 170);
      g.font = '52px "Lilita One", sans-serif'; g.fillStyle = '#ffe27a'; g.fillText(txt, 256 + 20, 170);
    }
    tex.needsUpdate = true;
  }
  function drawPad(total) {
    const tex = padLabel.material.map, g = tex.userData.cv.getContext('2d');
    g.clearRect(0, 0, 512, 192); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = '58px "Lilita One", sans-serif'; g.lineWidth = 11; g.strokeStyle = 'rgba(0,0,0,.8)';
    g.strokeText('COLLECT', 256, 50); g.fillStyle = '#9dff6a'; g.fillText('COLLECT', 256, 50);
    g.font = '64px "Lilita One", sans-serif';
    g.strokeText(fmtMoney(total), 256, 130); g.fillStyle = '#ffe27a'; g.fillText(fmtMoney(total), 256, 130);
    tex.needsUpdate = true;
  }

  // Display animal on a pedestal (static, not part of the wild animal list)
  function showAnimal(v) {
    if (v.animal) { animals.remove(v.animal); v.animal = null; }
    const s = slots[v.i];
    v.ghost.visible = !s; v.shown = -1;
    if (!s) { v.label.scale.set(1.6, 0.8, 1); v.label.position.y = PED_H + 0.4; drawLabel(v); return; }
    const a = animals.create(s.name, s.rarity, v.wpos.x, v.wpos.z, true);
    animals.list.splice(animals.list.indexOf(a), 1);
    const k = Math.min(1, 1.25 / a.tpl.radius);
    a.root.scale.setScalar(k); a.label.visible = false; a.alt = 0;
    a.root.position.set(v.wpos.x, pl.y + PED_H + 0.02, v.wpos.z);
    a.heading = pl.ry + v.face * Math.PI / 2 + (v.i % 5 - 2) * 0.12;
    a.root.rotation.y = a.heading;
    a.ring.position.set(v.wpos.x, pl.y + PED_H + 0.04, v.wpos.z); a.ring.rotation.set(-Math.PI / 2, 0, 0);
    a.ring.scale.setScalar(Math.min(1.9, a.ring.scale.x * k)); a.ring.visible = true;
    a.tpl.parts.forEach((p, j) => { if (p.type === 'wing') { a.objs[j].rotation.z = -p.side * 1.15; a.objs[j].rotation.y = p.side * 1.25; } });
    v.animal = a;
    v.label.scale.set(2.9, 1.45, 1); v.label.position.y = PED_H + a.tpl.top * k + 0.35;
  }
  views.forEach(showAnimal);

  // ---------- Actions ----------
  function changed() { cubes.renderHotbar(); cubes.renderInventory(); game.emit?.('change'); }
  function place(i, invIndex) {
    const it = st.inventory[invIndex]; if (!it || slots[i]) return false;
    st.inventory.splice(invIndex, 1);
    slots[i] = { name: it.name, rarity: it.rarity, stored: 0 };
    showAnimal(views[i]);
    cubes.burst(views[i].wpos.clone().setY(pl.y + PED_H + 0.8), RARITY[it.rarity].color, 40, 3, 2, 0.9);
    game.toast(`${it.name} now earns ${fmtMoney(RARITY[it.rarity].perSec)}/s in your base!`);
    changed(); game.onBase?.('place', i);
    return true;
  }
  function take(i) {
    const s = slots[i]; if (!s) return;
    if (st.inventory.length >= INVENTORY_SIZE) { game.toast(`Inventory full! (${INVENTORY_SIZE}/${INVENTORY_SIZE})`); return; }
    if (s.stored >= 1) collect([i]);
    slots[i] = null;
    st.inventory.push(invItem(s.name, s.rarity));
    cubes.burst(views[i].wpos.clone().setY(pl.y + PED_H + 0.8), '#ffffff', 25, 2.5, 2, 0.6);
    showAnimal(views[i]);
    game.toast(`${s.name} is back in your inventory`);
    changed(); game.onBase?.('take', i);
  }
  function choose(i) {
    if (!st.inventory.length) { game.toast('Your inventory is empty – catch an animal first!'); return; }
    game.ui.openPanel('place', {
      title: `PEDESTAL ${i + 1}`, sub: 'Pick an animal to put here', color: '#9dff6a',
      note: 'Animals in your base earn money every second. Collect it on the COLLECT pad. (E / Esc to close)',
      render: () => `<div class="gp-grid">${st.inventory.map((it, j) => {
        const r = RARITY[it.rarity];
        return `<div class="gp-card pick r-${r.index}" style="--rc:${r.color}" data-act="${j}"><div class="ic">${it.icon}</div><div class="an">${it.name}</div><div class="ar">${it.rarity}</div><div class="ps">${fmtMoney(r.perSec)}/s</div></div>`;
      }).join('')}</div>`,
      onClick: (act) => { if (place(i, +act)) game.ui.closePanel(); },
    });
  }

  // Coins flying from the pedestals into the player
  const coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.045, 20);
  const coins = Array.from({ length: 50 }, () => { const m = new THREE.Mesh(coinGeo, M.gold); m.visible = false; scene.add(m); return { m, t: 1, d: 1, from: new THREE.Vector3() }; });
  let coinNext = 0;
  function spawnCoins(from, n) {
    for (let k = 0; k < n; k++) {
      const c = coins[coinNext]; coinNext = (coinNext + 1) % coins.length;
      c.from.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      c.t = -k * 0.07 - Math.random() * 0.05; c.d = 0.55 + Math.random() * 0.25; c.m.visible = false;
    }
  }
  function collect(which = slots.map((_, i) => i)) {
    let sum = 0;
    for (const i of which) {
      const s = slots[i]; if (!s || s.stored < 1) continue;
      const n = Math.floor(s.stored); s.stored -= n; sum += n;
      spawnCoins(views[i].wpos.clone().setY(pl.y + PED_H + 1.2), Math.min(6, 1 + Math.floor(Math.log10(n + 1) * 1.5)));
    }
    if (sum > 0) {
      game.addMoney(sum);
      cubes.burst(padW.clone().setY(pl.y + 0.6), '#ffd34a', 40, 3.5, 3, 1);
      game.onBase?.('collect', sum);
    }
    return sum;
  }
  const total = () => slots.reduce((s, x) => s + (x ? Math.floor(x.stored) : 0), 0);
  const perSec = () => slots.reduce((s, x) => s + (x ? RARITY[x.rarity].perSec : 0), 0);

  // ---------- Per frame ----------
  let labelTimer = 0, padTimer = 0;
  const _p = new THREE.Vector3();
  game.onFrame.push((dt, t) => {
    const live = $('loading').classList.contains('gone');
    if (live) for (const s of slots) if (s) s.stored += RARITY[s.rarity].perSec * dt;
    // Idle animation of the displayed animals
    for (const v of views) {
      const a = v.animal; if (!a) { v.ghost.position.y = PED_H + 0.45 + Math.sin(t * 2 + v.i) * 0.08; v.ghost.rotation.z = t; continue; }
      a.model.rotation.y = Math.sin(t * 0.35 + v.i * 1.7) * 0.45;
      a.model.position.y = Math.sin(t * 1.6 + v.i) * 0.012 * a.tpl.length;
      a.tpl.parts.forEach((p, j) => {
        const o = a.objs[j];
        if (p.type === 'tail') o.rotation.y = Math.sin(t * 2.6 + a.seed + p.idx) * 0.3;
        else if (p.type === 'head') o.rotation.y = Math.sin(t * 0.5 + a.seed) * 0.4;
        else if (p.type === 'seg') o.rotation.y = Math.sin(t * 2 - p.idx * 0.9 + a.seed) * 0.15;
        else if (p.type === 'orb') o.rotation.y = t * 1.2;
      });
    }
    // Labels (redraw only when the shown amount changes)
    labelTimer -= dt;
    if (labelTimer <= 0) {
      labelTimer = 0.2;
      for (const v of views) { const s = slots[v.i], n = s ? Math.floor(s.stored) : -2; if (n !== v.shown) { v.shown = n; drawLabel(v); } }
      const tot = total(); if (tot !== padShown) { padShown = tot; drawPad(tot); }
    }
    const on = padShown > 0 ? 1 : 0;
    beamU.uTime.value = t; beamU.uOn.value += (on - beamU.uOn.value) * Math.min(1, dt * 3);
    padTopMat.emissiveIntensity = 0.7 + 0.5 * beamU.uOn.value * (0.6 + 0.4 * Math.sin(t * 4));
    // Standing on the pad collects
    padTimer -= dt;
    if (live && padTimer <= 0 && Math.hypot(player.pos.x - padW.x, player.pos.z - padW.z) < 1.7 && Math.abs(player.pos.y - padW.y) < 2) {
      padTimer = 0.5; collect();
    }
    // Flying coins
    for (const c of coins) {
      if (c.t >= c.d) { c.m.visible = false; continue; }
      c.t += dt; if (c.t < 0) continue;
      const k = Math.min(1, c.t / c.d), e = k * k * (3 - 2 * k);
      _p.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
      c.m.position.lerpVectors(c.from, _p, e); c.m.position.y += Math.sin(k * Math.PI) * 1.6;
      c.m.rotation.set(t * 9, t * 5, 0); c.m.scale.setScalar(k > 0.85 ? (1 - k) / 0.15 + 0.01 : 1); c.m.visible = true;
    }
    // Waving flag
    const fp = flag.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = flagBase[i * 3];
      fp.setZ(i, Math.sin(x * 2.4 - t * 5) * 0.16 * x / 2.4 + Math.sin(x * 4 + t * 3.1) * 0.04 * x);
    }
    fp.needsUpdate = true; flag.geometry.computeVertexNormals();
  });

  // Inventory → base helpers for the admin panel / other modules
  game.giveAnimal = (name, rarity) => {
    if (!RARITY[rarity] || !ICON[name] || st.inventory.length >= INVENTORY_SIZE) return false;
    st.inventory.push(invItem(name, rarity)); changed();
    return true;
  };
  const base = {
    pos: toW(0, 0), door: toW(0, D / 2 + 1.5), pad: padW, plot: plotIdx, slots, views,
    place, take, collect, total, perSec, slotPos: (i) => views[i].wpos,
    nearestEmpty: (p) => views.filter((v) => !slots[v.i]).sort((a, b) => a.wpos.distanceTo(p) - b.wpos.distanceTo(p))[0]?.wpos ?? null,
    inside: (p) => { const [lx, lz] = [p.x - pl.x, p.z - pl.z], c = Math.cos(pl.ry), s = Math.sin(pl.ry); return Math.abs(lx * c - lz * s) < W / 2 && Math.abs(lx * s + lz * c) < D / 2; },
  };
  game.base = base;
  game.map?.addMarker({ x: pl.x, z: pl.z, icon: '🏠', name: 'Your Base', color: '#9dff6a' });
  return base;
}
