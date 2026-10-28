// New-game tutorial: 1 Master Cube → follow the arrow → aim → throw. Then 15 Rusty Cubes and soft follow-up tips.
import * as THREE from 'three';
import { ANIMALS, START_CUBES, TUTORIAL_CUBES } from './data.js';
import { IS_TOUCH } from './touch.js';

const $ = (id) => document.getElementById(id);
const STEPS = IS_TOUCH
  ? ['Follow the arrow to the animal', 'Drag on the screen to aim (crosshair)', 'Tap THROW to throw your Master Cube!']
  : ['Follow the arrow to the animal', 'Aim at it with the mouse (crosshair)', 'Left click to throw your Master Cube!'];
const TIPS = [
  { text: 'Put your animal in your base', sub: `Follow the arrow, then ${IS_TOUCH ? 'tap' : 'press'} <b>E</b> at a pedestal` },
  { text: 'Collect your money', sub: 'Your animal earns money every second – step on the glowing <b>COLLECT</b> pad' },
  { text: 'Sell animals & buy cubes', sub: 'Sell animals at the <b>Market</b>, buy better cubes at the <b>Cube Shop</b> (near spawn)' },
];

export function createTutorial(game, saved) {
  const { scene, world, player, camera, camCtl, animals, cubes } = game;
  const st = cubes.state, qs = new URLSearchParams(location.search);
  const tut = { done: !!saved?.tutorialDone || qs.has('zoo') || qs.has('skiptut'), tip: saved?.tip ?? 0, step: 0 };
  if (tut.done && !saved?.tutorialDone) tut.tip = TIPS.length; // dev skip: no tips either
  game.tutorial = tut;
  const setCounts = (c) => { for (const t of cubes.types) st.counts[t.id] = t.admin ? st.counts[t.id] : c[t.id] ?? 0; };
  if (!tut.done) { setCounts(TUTORIAL_CUBES); cubes.select(cubes.types.findIndex((t) => t.id === 'master')); }

  // ---------- 3D guide arrow (on the ground next to the player) + marker above the target ----------
  const shape = new THREE.Shape();
  [[-0.17, 0], [0.17, 0], [0.17, 0.7], [0.45, 0.7], [0, 1.25], [-0.45, 0.7], [-0.17, 0.7]].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  const arrowGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  arrowGeo.rotateX(-Math.PI / 2); // shape +y → world -z
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0xff8a00, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.2 });
  const arrow = new THREE.Mesh(arrowGeo, arrowMat); arrow.rotation.order = 'YXZ'; arrow.rotation.x = 0.55; arrow.visible = false; scene.add(arrow); // tip tilted up so it reads from behind
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), arrowMat); marker.rotation.x = Math.PI; marker.visible = false; scene.add(marker);

  const pointer = $('tut-pointer'), hint = $('tut-hint');
  let target = null, targetLabel = '', markerH = 2.6, tutAnimal = null, catchesAtStart = 0, refundT = 0, tipTimer = 0, frame = 0, finishedAt = -1;

  function spawnTutorialAnimal() {
    const fx = -Math.sin(camCtl.yaw), fz = -Math.cos(camCtl.yaw);
    const names = ANIMALS.Common.filter((a) => a.name !== 'Pigeon').map((a) => a.name);
    for (let k = 0; k < 40; k++) {
      const ang = (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.25, d = 18 + (k % 3) * 3;
      const x = player.pos.x + (fx * Math.cos(ang) - fz * Math.sin(ang)) * d, z = player.pos.z + (fx * Math.sin(ang) + fz * Math.cos(ang)) * d;
      if (world.heightAt(x, z) < 1.6) continue;
      if (game.shops && Object.values(game.shops).some((s) => Math.hypot(s.x - x, s.z - z) < 7)) continue;
      if (game.base?.inside(new THREE.Vector3(x, 0, z))) continue;
      tutAnimal = animals.create(names[Math.floor(Math.random() * names.length)], 'Common', x, z, true);
      return;
    }
    tutAnimal = animals.spawnNear(player.pos, 'Common');
  }
  const nearestAnimal = () => {
    let best = null, bd = Infinity;
    for (const a of animals.list) { if (a.captured) continue; const d = a.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = a; } }
    return best;
  };

  function finishTutorial() {
    tut.done = true; tut.step = 3; tut.tip = 0; finishedAt = performance.now();
    setCounts(START_CUBES); cubes.select(0); cubes.renderHotbar();
    game.banner('Tutorial complete!', `You got ${START_CUBES.rusty} Rusty Cubes`);
    game.save?.();
  }
  game.skipTutorial = () => {
    if (!tut.done) { setCounts(START_CUBES); cubes.select(0); cubes.renderHotbar(); }
    tut.done = true; tut.tip = TIPS.length; hint.classList.remove('show'); game.save?.();
  };

  // Events from base / shops advance the follow-up tips
  game.onBase = (what) => {
    if (!tut.done) return;
    if (what === 'place' && tut.tip === 0) nextTip();
    if (what === 'collect' && tut.tip === 1) nextTip();
  };
  game.onShop = () => { if (tut.done && tut.tip === 2) nextTip(); };
  function nextTip() { tut.tip++; tipTimer = 0; game.save?.(); }
  game.onKey.push((e) => {
    if (e.code === 'Enter' && tut.done && tut.tip < TIPS.length && !game.panels.size) { nextTip(); return true; }
    return false;
  });

  function setHint(html) { if (hint._html !== html) { hint.innerHTML = html; hint._html = html; } hint.classList.add('show'); }

  const _v = new THREE.Vector3();
  game.onFrame.push((dt, t) => {
    frame++;
    const live = $('loading').classList.contains('gone');
    target = null; markerH = 2.6;
    if (!tut.done) {
      if (!live || frame < 3) { hint.classList.remove('show'); arrow.visible = marker.visible = false; pointer.classList.remove('show'); return; }
      if (!tutAnimal) { spawnTutorialAnimal(); catchesAtStart = st.catches; }
      if (st.catches > catchesAtStart) { finishTutorial(); } // only a real cube catch counts
      else {
        // Lost the animal (despawned)? Bring a new one
        if (tutAnimal && !tutAnimal.captured && !animals.list.includes(tutAnimal)) tutAnimal = null;
        const a = tutAnimal && animals.list.includes(tutAnimal) ? tutAnimal : nearestAnimal();
        if (a) {
          target = animals.center(a, new THREE.Vector3()); targetLabel = a.name; markerH = a.tpl.top - a.tpl.centerY + 0.8;
          const d = Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z);
          if (d > 16) tut.step = 0;
          else if (tut.step === 0) tut.step = 1;
          if (tut.step >= 1 && frame % 5 === 0) tut.step = cubes.aimPoint().target === a ? 2 : 1;
          if (a.captured) target = null;
        }
        // Missed or broke free → the Master Cube comes back while learning
        if (!(st.counts.master > 0) && !cubes.flying.length) {
          refundT += dt;
          if (refundT > 0.8) { st.counts.master = 1; cubes.select(cubes.types.findIndex((c) => c.id === 'master')); game.toast('Here is your Master Cube back – try again!'); refundT = 0; }
        } else refundT = 0;
        setHint(`<div class="tt">TUTORIAL</div>${STEPS.map((s, i) => `<div class="st ${i < tut.step ? 'ok' : i === tut.step ? 'cur' : ''}"><span>${i < tut.step ? '✓' : i + 1}</span>${s}</div>`).join('')}`);
      }
    }
    if (tut.done) {
      // Follow-up tips (wait for the "complete" banner first)
      const ready = live && performance.now() - finishedAt > 3500 && tut.tip < TIPS.length;
      const B = game.base;
      if (ready && tut.tip === 0 && B && !st.inventory.length && !B.slots.some(Boolean)) nextTip(); // nothing to place
      if (ready && tut.tip < TIPS.length) {
        tipTimer += dt;
        if (tut.tip === 2 && tipTimer > 40) nextTip();
      }
      if (ready && tut.tip < TIPS.length) {
        const tip = TIPS[tut.tip];
        setHint(`<div class="tt">TIP ${tut.tip + 1}/${TIPS.length}</div><div class="st cur">${tip.text}</div><div class="sub">${tip.sub}</div><div class="skip">${IS_TOUCH ? 'Tap to skip tip' : 'Enter: skip tip'}</div>`);
        const atBase = B && (B.inside(player.pos) || B.door.distanceTo(player.pos) < 5);
        if (B && tut.tip === 0) { target = atBase ? B.nearestEmpty(player.pos) : B.door; targetLabel = atBase ? 'Pedestal' : 'Your Base'; }
        if (B && tut.tip === 1) { target = atBase ? B.pad : B.door; targetLabel = atBase ? 'COLLECT pad' : 'Your Base'; }
        if (tut.tip === 2 && game.shops) {
          const m = game.shops.market, c = game.shops.cubeShop;
          const near = m.distanceTo(player.pos) < c.distanceTo(player.pos);
          target = near ? m : c; targetLabel = near ? 'Market' : 'Cube Shop';
        }
      } else hint.classList.remove('show');
    }

    // Arrow + marker + screen pointer
    if (!target || game.panels.size) { arrow.visible = marker.visible = false; pointer.classList.remove('show'); return; }
    const dx = target.x - player.pos.x, dz = target.z - player.pos.z, dist = Math.hypot(dx, dz);
    arrow.visible = dist > 4 && (tut.done || tut.step === 0); // out of the way while aiming
    if (arrow.visible) {
      // Floats above the head (never hidden behind the body) and slides towards the target
      const k = (t * 0.8) % 1, r = -0.3 + k * 0.7;
      arrow.position.set(player.pos.x + (dx / dist) * r, player.pos.y + 2.35 + Math.sin(t * 4) * 0.05, player.pos.z + (dz / dist) * r);
      arrow.rotation.y = Math.atan2(-dx, -dz);
      arrow.scale.setScalar(1.1 * (k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1));
    }
    marker.visible = true;
    marker.position.set(target.x, target.y + markerH + Math.abs(Math.sin(t * 3)) * 0.35, target.z);
    marker.rotation.y = t * 2;
    arrowMat.emissiveIntensity = 0.55 + Math.sin(t * 5) * 0.25;
    // Screen pointer: above the target when visible, else on the screen edge pointing at it
    _v.copy(target); _v.y += 1; _v.project(camera);
    const behind = _v.z > 1;
    let x = _v.x, y = _v.y;
    const on = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85;
    if (!on) {
      if (behind) { x = -x; y = -y; }
      const m = Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.8, 1e-3);
      x /= m; y /= m;
      if (y < -0.5) { x *= -0.5 / y; y = -0.5; } // stay above the hotbar
    }
    pointer.style.left = (x * 0.5 + 0.5) * innerWidth + 'px';
    pointer.style.top = (-y * 0.5 + 0.5) * innerHeight + 'px';
    pointer.querySelector('.ar').style.transform = on ? 'rotate(180deg)' : `rotate(${Math.atan2(x, y)}rad)`;
    pointer.querySelector('.lb').textContent = `${targetLabel} · ${Math.round(dist)} m`;
    pointer.classList.toggle('edge', !on);
    pointer.classList.add('show');
  });
  return tut;
}
