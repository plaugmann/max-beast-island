// Cubes: throwing, capture animation, catch roll, inventory + their HUD
import * as THREE from 'three';
import { CUBES, RARITY, INVENTORY_SIZE, START_CUBES, fmtMoney } from './data.js';

const GRAV = 14, AIM_NDC = new THREE.Vector2(0, 0.22); // crosshair sits a bit above centre (over the player's head)
const $ = (id) => document.getElementById(id);

// Cube face art: frame + emblem in the glow colour (also used for the glow map and HUD icons)
function drawFace(g, c, glowOnly) {
  g.fillStyle = glowOnly ? '#000' : c.color; g.fillRect(0, 0, 128, 128);
  if (!glowOnly) {
    const gr = g.createLinearGradient(0, 0, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    if (c.id === 'rusty' || c.id === 'old') for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${c.id === 'rusty' ? '60,25,10' : '30,40,30'},${0.2 + Math.random() * 0.3})`;
      g.beginPath(); g.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 0, 7); g.fill();
    }
  }
  g.strokeStyle = c.glow; g.fillStyle = c.glow; g.lineWidth = 7; g.lineJoin = 'round';
  g.strokeRect(11, 11, 106, 106);
  g.lineWidth = 6; g.beginPath();
  if (c.id === 'rusty') g.rect(48, 48, 32, 32);
  else if (c.id === 'old') g.arc(64, 64, 18, 0, Math.PI * 2);
  else if (c.id === 'good') { g.moveTo(64, 38); g.lineTo(90, 64); g.lineTo(64, 90); g.lineTo(38, 64); g.closePath(); }
  else if (c.id === 'ultra') for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 11 : 27; g[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.stroke();
  if (c.id === 'master' || c.id === 'admin') {
    g.font = 'bold 56px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(c.id === 'master' ? 'M' : 'A', 64, 68);
  }
}
const faceCanvas = (c, glowOnly) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; drawFace(cv.getContext('2d'), c, glowOnly); return cv; };

// Isometric cube icon for the HUD
function iconURL(c) {
  const face = faceCanvas(c, false), cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), k = 1 / 128;
  const faces = [[24 * k, 12 * k, -24 * k, 12 * k, 32, 6, 0], [24 * k, 12 * k, 0, 28 * k, 8, 18, 0.25], [24 * k, -12 * k, 0, 28 * k, 32, 30, 0.45]];
  for (const [a, b, cc, d, e, f, dark] of faces) {
    g.setTransform(a, b, cc, d, e, f); g.drawImage(face, 0, 0);
    if (dark) { g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(0, 0, 128, 128); }
  }
  return cv.toDataURL();
}

export function createCubes(scene, world, animals, { player, camera, toast }) {
  const qs = new URLSearchParams(location.search);
  const admin = qs.has('admin');
  const types = CUBES; // the Admin Cube slot is hidden while you have none
  const state = { counts: { ...START_CUBES }, selected: 0, inventory: [], money: 0, catches: 0 };
  if (admin) state.counts.admin = Infinity;

  // ---------- Cube meshes ----------
  const boxGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const haloTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const looks = {};
  for (const c of types) {
    const map = new THREE.CanvasTexture(faceCanvas(c, false)), em = new THREE.CanvasTexture(faceCanvas(c, true));
    map.colorSpace = em.colorSpace = THREE.SRGBColorSpace; map.anisotropy = em.anisotropy = 4;
    looks[c.id] = {
      icon: iconURL(c),
      mat: new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 2.4,
        roughness: c.id === 'rusty' ? 0.85 : 0.35, metalness: c.id === 'rusty' || c.id === 'old' ? 0.2 : 0.55 }),
      halo: new THREE.SpriteMaterial({ map: haloTex, color: c.glow, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    };
  }
  function makeCube(c) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(boxGeo, looks[c.id].mat.clone()); box.castShadow = true;
    const halo = new THREE.Sprite(looks[c.id].halo); halo.scale.setScalar(1.3);
    g.add(box, halo);
    scene.add(g);
    return { group: g, box, halo };
  }

  // ---------- Burst particles (CPU pool) ----------
  const NP = 600;
  const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pAlpha = new Float32Array(NP);
  const pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP), pMax = new Float32Array(NP).fill(1);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute vec3 color; attribute float alpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = alpha > 0.0 ? 0.22 * uScale / max(-mv.z, 0.5) : 0.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
        float a = ((1.0 - smoothstep(0.0, 1.0, r)) * 0.6 + max(0.0, 1.0 - abs(d.x * d.y) * 90.0) * (1.0 - smoothstep(0.4, 1.0, r))) * vA;
        gl_FragColor = vec4(vC * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 4;
  scene.add(points);
  let pNext = 0;
  const _col = new THREE.Color();
  function burst(p, color, n = 40, speed = 4, up = 2, life = 1) {
    _col.set(color).multiplyScalar(2.2);
    for (let k = 0; k < n; k++) {
      const i = pNext; pNext = (pNext + 1) % NP;
      const a = Math.random() * Math.PI * 2, y = Math.random() * 2 - 1, r = Math.sqrt(1 - y * y), s = speed * (0.4 + Math.random() * 0.6);
      pPos.set([p.x, p.y, p.z], i * 3); pVel.set([Math.cos(a) * r * s, y * s + up, Math.sin(a) * r * s], i * 3);
      pCol.set([_col.r, _col.g, _col.b], i * 3); pLife[i] = pMax[i] = life * (0.6 + Math.random() * 0.6);
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < NP; i++) {
      if (pLife[i] <= 0) { pAlpha[i] = 0; continue; }
      pLife[i] -= dt;
      pVel[i * 3 + 1] -= 4 * dt;
      for (let k = 0; k < 3; k++) { pVel[i * 3 + k] *= 1 - 1.5 * dt; pPos[i * 3 + k] += pVel[i * 3 + k] * dt; }
      pAlpha[i] = Math.max(0, pLife[i] / pMax[i]);
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.alpha.needsUpdate = pGeo.attributes.color.needsUpdate = true;
    pMat.uniforms.uScale.value = window.innerHeight * Math.min(window.devicePixelRatio, 1.5) * 0.87;
  }

  // ---------- Throwing ----------
  const flying = [];
  const ray = new THREE.Raycaster(), _v = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
  let cooldown = 0, throwAnim = 1;

  function aimPoint() {
    ray.setFromCamera(AIM_NDC, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    // Gentle aim assist: the animal closest to the crosshair ray
    let best = null, bestT = Infinity;
    for (const a of animals.list) {
      if (a.captured || !a.root.visible) continue;
      animals.center(a, _c); _v.subVectors(_c, o);
      const t = _v.dot(d);
      if (t < 2 || t > 90) continue;
      const perp = _v.addScaledVector(d, -t).length();
      if (perp < a.radius + 0.3 + t * 0.015 && t < bestT) { best = a; bestT = t; }
    }
    if (best) return { point: animals.center(best, new THREE.Vector3()), target: best };
    for (let t = 2; t < 140; t += 1) {
      _v.copy(o).addScaledVector(d, t);
      if (_v.y < Math.max(world.heightAt(_v.x, _v.z), -1.3)) return { point: _v.clone(), target: null };
    }
    return { point: o.clone().addScaledVector(d, 70), target: null };
  }

  function throwCube() {
    if (cooldown > 0) return;
    const c = types[state.selected];
    if (!(state.counts[c.id] > 0)) { toast(`No ${c.name}s left!`); return; }
    if (state.inventory.length >= INVENTORY_SIZE) { toast(`Inventory full! (${INVENTORY_SIZE}/${INVENTORY_SIZE})`); return; }
    state.counts[c.id]--;
    cooldown = 0.45; throwAnim = 0;
    const { point } = aimPoint();
    // Face the throw, launch from the left hand
    const f = Math.atan2(point.x - player.pos.x, point.z - player.pos.z);
    player.facing = f;
    const start = new THREE.Vector3(player.pos.x - Math.cos(f) * 0.3 + Math.sin(f) * 0.3, player.pos.y + 1.6, player.pos.z + Math.sin(f) * 0.3 + Math.cos(f) * 0.3);
    const dx = point.x - start.x, dz = point.z - start.z, dy = point.y - start.y, hd = Math.hypot(dx, dz);
    const T = THREE.MathUtils.clamp(hd / 26, 0.22, 2.4);
    const vel = new THREE.Vector3(dx / T, (dy + 0.5 * GRAV * T * T) / T, dz / T);
    const cube = makeCube(c);
    cube.group.position.copy(start);
    flying.push({ type: c, ...cube, pos: start, vel, state: 'fly', t: 0, spin: new THREE.Vector3(Math.random() * 8 + 6, Math.random() * 8, Math.random() * 6) });
    renderHotbar();
  }

  function removeCube(cb) {
    scene.remove(cb.group); cb.box.material.dispose();
    flying.splice(flying.indexOf(cb), 1);
  }

  const ease = (x) => x * x * (3 - 2 * x);
  function hitAnimal(cb, prev) {
    for (const a of animals.list) {
      if (a.captured || !a.root.visible) continue;
      animals.center(a, _c);
      // Closest point on this frame's segment
      _v.subVectors(cb.pos, prev); const len2 = _v.lengthSq();
      const t = len2 > 0 ? THREE.MathUtils.clamp(_c.clone().sub(prev).dot(_v) / len2, 0, 1) : 0;
      const p = prev.clone().addScaledVector(_v, t);
      if (p.distanceTo(_c) < a.radius * 0.95 + 0.25) return a;
    }
    return null;
  }

  function update(dt) {
    cooldown -= dt;
    // Throw arm swing (left arm, the right one holds the briefcase)
    if (throwAnim < 1) {
      throwAnim = Math.min(1, throwAnim + dt / 0.35);
      const sh = player.model?.arms?.[0]?.shoulder;
      if (sh) sh.rotation.x = throwAnim < 0.3 ? THREE.MathUtils.lerp(0, 2.7, throwAnim / 0.3) : THREE.MathUtils.lerp(2.7, -0.9, ease((throwAnim - 0.3) / 0.7));
    }
    updateParticles(dt);
    for (let i = flying.length - 1; i >= 0; i--) {
      const cb = flying[i];
      cb.t += dt;
      const g = cb.group, box = cb.box;
      if (cb.state === 'fly') {
        const prev = cb.pos.clone();
        cb.vel.y -= GRAV * dt;
        cb.pos.addScaledVector(cb.vel, dt);
        box.rotation.x += cb.spin.x * dt; box.rotation.y += cb.spin.y * dt; box.rotation.z += cb.spin.z * dt;
        const a = hitAnimal(cb, prev);
        if (a) {
          // Capture starts: the animal is sucked into the cube
          a.captured = true; a.ring.visible = false; a.label.visible = false;
          cb.animal = a; cb.state = 'absorb'; cb.t = 0;
          cb.from = a.root.position.clone(); cb.hold = cb.pos.clone();
          const roll = Math.random() * 100 < cb.type.chances[RARITY[a.rarity].index] || cb.type.admin;
          cb.success = !!roll && RARITY[a.rarity].index < 10; // Ancient Legend needs a battle first
          cb.shakes = cb.success ? 3 : 1 + Math.floor(Math.random() * 3);
          burst(cb.pos, RARITY[a.rarity].color, 30, 3, 1, 0.7);
        } else {
          const gy = world.heightAt(cb.pos.x, cb.pos.z);
          if (cb.pos.y < Math.max(gy, -1.3) + 0.2 || cb.t > 6) {
            cb.state = 'miss'; cb.t = 0; cb.water = gy < -1.3;
            cb.pos.y = Math.max(gy, -1.3) + 0.2; cb.vel.set(cb.vel.x * 0.3, Math.abs(cb.vel.y) * 0.25, cb.vel.z * 0.3);
            if (cb.water) burst(cb.pos, '#9fd8ff', 20, 2.5, 2, 0.6);
            toast(`Missed! Your ${cb.type.name} is gone.`);
          }
        }
      } else if (cb.state === 'miss') {
        cb.vel.y -= GRAV * dt;
        cb.pos.addScaledVector(cb.vel, dt);
        const gy = Math.max(world.heightAt(cb.pos.x, cb.pos.z), -1.3) + 0.2 - (cb.water ? cb.t * 0.6 : 0);
        if (cb.pos.y < gy) { cb.pos.y = gy; cb.vel.multiplyScalar(0.3); cb.vel.y = Math.abs(cb.vel.y) * 0.4; }
        box.rotation.x *= 0.95;
        g.scale.setScalar(Math.max(0.001, 1 - Math.max(0, cb.t - 0.8) / 0.6));
        if (cb.t > 1.4) { if (!cb.water) burst(cb.pos, cb.type.glow, 12, 1.5, 1, 0.5); removeCube(cb); continue; }
      } else if (cb.state === 'absorb') {
        const a = cb.animal, k = Math.min(1, cb.t / 0.7), e = ease(k);
        cb.pos.copy(cb.hold); cb.pos.y += Math.sin(k * Math.PI) * 0.3;
        box.rotation.y += dt * 14; box.rotation.x *= 0.9; box.rotation.z *= 0.9;
        box.material.emissiveIntensity = 2.4 + Math.sin(k * Math.PI) * 3;
        const s = Math.max(0.001, 1 - e);
        a.root.scale.setScalar(s);
        a.root.position.lerpVectors(cb.from, cb.pos, e).y -= a.tpl.centerY * s;
        if (k >= 1) { a.root.visible = false; cb.state = 'drop'; cb.t = 0; cb.vel.set(0, 0, 0); }
      } else if (cb.state === 'drop') {
        cb.vel.y -= GRAV * dt;
        cb.pos.addScaledVector(cb.vel, dt);
        const gy = Math.max(world.heightAt(cb.pos.x, cb.pos.z), -1.3) + 0.25;
        if (cb.pos.y < gy) { cb.pos.y = gy; cb.vel.y = Math.abs(cb.vel.y) > 2 ? Math.abs(cb.vel.y) * 0.3 : 0; }
        _q.setFromEuler(new THREE.Euler(0, box.rotation.y, 0)); box.quaternion.slerp(_q, 1 - Math.exp(-10 * dt));
        box.material.emissiveIntensity = 2.4;
        if (cb.t > 0.7) { cb.state = 'shake'; cb.t = 0; cb.n = 0; }
      } else if (cb.state === 'shake') {
        const per = 0.8, k = cb.t % per;
        box.rotation.z = k < 0.5 ? Math.sin((k / 0.5) * Math.PI * 3) * 0.35 * (1 - k / 0.5) : 0;
        box.position.y = k < 0.5 ? Math.abs(Math.sin((k / 0.5) * Math.PI * 3)) * 0.06 : 0;
        box.material.emissiveIntensity = 2.4 + (k < 0.15 ? 1.5 : 0);
        if (cb.t >= per * cb.shakes) {
          box.rotation.z = 0; box.position.y = 0;
          const a = cb.animal;
          if (cb.success) {
            cb.state = 'caught'; cb.t = 0;
            burst(cb.pos, RARITY[a.rarity].color, 70, 5, 3, 1.2);
            burst(cb.pos, '#ffffff', 25, 3, 2, 0.8);
            state.inventory.push({ name: a.name, rarity: a.rarity, icon: a.info.icon, perSec: RARITY[a.rarity].perSec, id: a.id });
            state.catches++;
            animals.remove(a);
            toast(`Caught ${a.name}! (${a.rarity})`);
            renderInventory();
          } else {
            burst(cb.pos, cb.type.glow, 60, 6, 2, 0.9);
            burst(cb.pos, '#ffffff', 20, 4, 1, 0.5);
            a.root.visible = true; cb.state = 'free'; cb.t = 0; cb.group.visible = false;
            toast(`Oh no! The ${a.name} broke free. Your ${cb.type.name} is gone.`);
          }
        }
      } else if (cb.state === 'caught') {
        // Glow, then zip back to the player
        box.material.emissiveIntensity = 2.4 + Math.max(0, 1 - cb.t) * 4;
        box.rotation.y += dt * 4;
        if (cb.t > 0.8) {
          const k = Math.min(1, (cb.t - 0.8) / 0.5);
          _v.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
          cb.pos.lerp(_v, k); g.scale.setScalar(Math.max(0.001, 1 - k));
          if (k >= 1) { removeCube(cb); continue; }
        }
      } else if (cb.state === 'free') {
        // Animal pops back out where it stood
        const a = cb.animal, k = Math.min(1, cb.t / 0.35);
        a.root.scale.setScalar(Math.max(0.001, ease(k) * (1 + Math.sin(k * Math.PI) * 0.15)));
        a.root.position.copy(cb.from);
        if (k >= 1) { a.root.scale.setScalar(1); a.captured = false; a.state = 'idle'; a.timer = 2; removeCube(cb); continue; }
      }
      g.position.copy(cb.pos);
    }
  }

  // ---------- HUD ----------
  function renderHotbar() {
    const el = $('hotbar'); if (!el) return;
    if (types[state.selected].admin && !(state.counts.admin > 0)) state.selected = 0;
    el.innerHTML = types.map((c, i) => {
      const n = state.counts[c.id];
      if (c.admin && !(n > 0)) return '';
      return `<div class="slot${i === state.selected ? ' sel' : ''}${n > 0 ? '' : ' empty'}" data-i="${i}" style="--glow:${c.glow}">
        <span class="key">${i + 1}</span><img src="${looks[c.id].icon}" alt=""><span class="cnt">${n === Infinity ? '∞' : n}</span>
        <span class="nm">${c.name}</span></div>`;
    }).join('');
    $('money') && ($('money').textContent = fmtMoney(state.money));
    // Catch chances of the selected cube
    const info = $('cube-info'), c = types[state.selected];
    if (info) info.innerHTML = `<b>${c.name}</b> ` + c.chances.map((p, k) => p > 0 ? `<span style="color:${Object.values(RARITY)[k].color}">${Object.keys(RARITY)[k]} ${p}%</span>` : '').filter(Boolean).join(' · ');
  }
  function renderInventory() {
    const el = $('inv-grid'); if (!el) return;
    const inv = state.inventory;
    let html = '';
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const it = inv[i];
      if (!it) { html += '<div class="inv-slot empty"></div>'; continue; }
      const r = RARITY[it.rarity];
      html += `<div class="inv-slot r-${r.index}" style="--rc:${r.color}"><div class="ic">${it.icon}</div><div class="an">${it.name}</div>
        <div class="ar">${it.rarity}</div><div class="ps">${fmtMoney(it.perSec)}/s</div></div>`;
    }
    el.innerHTML = html;
    $('inv-count').textContent = `${inv.length}/${INVENTORY_SIZE}`;
    $('inv-total').textContent = fmtMoney(inv.reduce((s, it) => s + it.perSec, 0)) + '/s';
  }
  function select(i) {
    if (i < 0 || i >= types.length || (types[i].admin && !(state.counts.admin > 0))) return;
    state.selected = i; renderHotbar();
  }
  renderHotbar(); renderInventory();

  return { state, types, looks, flying, burst, throwCube, update, select, renderHotbar, renderInventory, aimPoint };
}
