// Intro cutscene (plays after PLAY): the city explodes, you escape by plane at the last second,
// then a fire beam from Mount Ember shoots the plane down and you crash-land on the island.
// Shots 1-2 use a small city scene of their own, shots 3-4 the real island. Space / click skips.
import * as THREE from 'three';
import { FEATURES } from './world.js';
import { clamp, lerp, mulberry32 } from './util.js';

const $ = (id) => document.getElementById(id);
const T_CITY = 9.5;            // shots 1-2 (city) end here
const T_HIT = T_CITY + 1.75;   // the fire beam hits the plane
const FALL = 3.0;              // seconds from hit to crash
const T_BOOM = 6.9;            // the whole city goes up
const CAPTIONS = [
  [0.3, 4.6, 'The city is exploding – get to the plane!'],
  [7.7, 9.3, '...that was close.'],
  [T_CITY + 0.2, T_CITY + 1.4, 'Safe at last...'],
  [T_HIT - 0.1, T_HIT + 1.4, 'WHAT WAS THAT?!'],
  [T_HIT + 1.5, T_HIT + FALL, 'MAYDAY! MAYDAY!'],
];

// Soft round blob used for every fire and smoke sprite
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Pool of sprites: fire = additive, bright HDR colours that bloom; smoke = dark and see-through
function createParticles(scene, tex, n, fire) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false,
      blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending, color: fire ? 0xffffff : 0x1c1a19 });
    const s = new THREE.Sprite(mat); s.visible = false; s.renderOrder = fire ? 2 : 1; scene.add(s);
    list.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), size0: 1, size1: 1, spin: 0 });
  }
  let next = 0;
  const cold = new THREE.Color(3, 0.7, 0.08), hot = new THREE.Color(9, 6, 2.5);
  return {
    emit(pos, vel, life, size0, size1) {
      const p = list[next]; next = (next + 1) % n;
      p.s.position.copy(pos); p.vel.copy(vel); p.life = 0; p.max = life; p.size0 = size0; p.size1 = size1;
      p.s.material.rotation = Math.random() * 6.3; p.spin = (Math.random() - 0.5) * 2; p.s.visible = true;
    },
    update(dt) {
      for (const p of list) {
        if (!p.s.visible) continue;
        p.life += dt;
        const u = p.life / p.max;
        if (u >= 1) { p.s.visible = false; continue; }
        p.s.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.exp(-1.6 * dt));
        if (!fire) p.vel.y += 3 * dt; // smoke keeps rising
        p.s.scale.setScalar(lerp(p.size0, p.size1, Math.sqrt(u)));
        p.s.material.rotation += p.spin * dt;
        if (fire) { p.s.material.color.lerpColors(hot, cold, Math.min(1, u * 1.6)); p.s.material.opacity = (1 - u) * (1 - u); }
        else p.s.material.opacity = 0.75 * Math.min(1, u * 6) * (1 - u);
      }
    },
    dispose() { for (const p of list) { scene.remove(p.s); p.s.material.dispose(); } },
  };
}

// Small passenger plane, nose towards +Z (so Object3D.lookAt points it where it flies)
function createPlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.35, metalness: 0.3 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2456a8, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1a2a, roughness: 0.1, metalness: 0.8 });
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(1.1, 10, 6, 16), white, 0, 0, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(14, 0.25, 2.4), white, 0, -0.35, 0.6);
  add(new THREE.BoxGeometry(5, 0.2, 1.3), white, 0, 0.25, -5.2);
  add(new THREE.BoxGeometry(0.22, 2.6, 1.8), blue, 0, 1.5, -5.1);
  add(new THREE.BoxGeometry(1.5, 0.5, 1.1), glass, 0, 0.55, 5.1);
  add(new THREE.BoxGeometry(2.3, 0.18, 9), blue, 0, -0.15, 0).scale.x = 0.98; // stripe along the body
  for (const x of [-3.6, 3.6]) add(new THREE.CylinderGeometry(0.5, 0.6, 2.4, 12), blue, x, -0.9, 1.3, Math.PI / 2);
  return g;
}

// The burning city: blocks of buildings around a runway that runs along +Z
function createCity(tex) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5a1c08);
  scene.fog = new THREE.Fog(0x4a1a0a, 300, 1900);
  scene.add(new THREE.HemisphereLight(0xffa070, 0x2a1008, 4));
  const sun = new THREE.DirectionalLight(0xff7a3a, 3.5); sun.position.set(-300, 200, -500); scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const runway = new THREE.Mesh(new THREE.BoxGeometry(32, 0.1, 900), new THREE.MeshStandardMaterial({ color: 0x3b3b3e, roughness: 0.9 }));
  runway.position.set(0, 0.05, 250); scene.add(runway);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.12, 8), new THREE.MeshBasicMaterial({ color: 0xdddddd }), 36);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) dashes.setMatrixAt(i, m.makeTranslation(0, 0.06, -180 + i * 25));
  scene.add(dashes);

  const rnd = mulberry32(7), spots = [];
  for (let x = -700; x <= 700; x += 40) {
    for (let z = -950; z <= 650; z += 40) {
      if ((Math.abs(x) < 80 && z > -220) || rnd() < 0.22) continue;
      const core = Math.hypot(x, z + 420) < 380;
      spots.push({ x: x + (rnd() - 0.5) * 8, z: z + (rnd() - 0.5) * 8, w: 18 + rnd() * 16, d: 18 + rnd() * 16,
        h: core ? 40 + rnd() * rnd() * 190 : 10 + rnd() * 55 });
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const blocks = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), spots.length);
  const col = new THREE.Color(), a = new THREE.Color(0x3a3f4a), b = new THREE.Color(0x7a6e66);
  spots.forEach((s, i) => {
    blocks.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, 0, s.z), new THREE.Quaternion(), new THREE.Vector3(s.w, s.h, s.d)));
    blocks.setColorAt(i, col.lerpColors(a, b, rnd()));
  });
  scene.add(blocks);

  const lights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xff7a2a, 0, 700, 1); scene.add(l); return l; });
  const additive = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), additive(new THREE.Color(8, 4.5, 1.4)));
  boom.position.set(0, 0, -420); boom.visible = false; scene.add(boom);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), additive(new THREE.Color(6, 3, 1)));
  ring.material.side = THREE.DoubleSide; ring.rotation.x = -Math.PI / 2; ring.position.set(0, 3, -420); ring.visible = false; scene.add(ring);

  return { scene, spots, lights, boom, ring, fire: createParticles(scene, tex, 320, true), smoke: createParticles(scene, tex, 220, false) };
}

export function createIntro(game, renderPass) {
  const { world, scene, camera, sky } = game;
  const ui = $('intro'), cap = ui.querySelector('.cap'), flash = ui.querySelector('.flash'), fade = $('intro-fade');
  let city = null, plane = null, fire = null, smoke = null, tex = null, onDone = null;
  let t = 0, shake = 0, nextBlast = 0, lightIdx = 0, hitDone = false, crashed = false, lookAt = new THREE.Vector3();
  const v = new THREE.Vector3(), w = new THREE.Vector3(), vel = new THREE.Vector3(0, 0, 0);
  const intro = { active: false, focus: new THREE.Vector3(), play, update };

  // Island flight path: straight in from the sea (A → B), hit at B, then a curve down to the crash site K
  const A = new THREE.Vector3(880, 265, 290), B = new THREE.Vector3(520, 262, 250);
  const fwd = B.clone().sub(A).normalize();
  const P1 = B.clone().addScaledVector(fwd, 260).setY(250);
  const K = new THREE.Vector3(25, 0, 215); K.y = world.heightAt(K.x, K.z);
  const V = FEATURES.volcano, crater = new THREE.Vector3(V.x, V.h - 35, V.z);
  const wideCam = new THREE.Vector3(640, Math.max(285, world.heightAt(640, 150) + 25), 150);
  const dir = fwd.clone(); // the plane's flight direction while falling
  let beam = null;

  game.onKey.unshift((e) => {
    if (!intro.active) return false;
    if (!e.repeat && ['Space', 'Enter', 'Escape'].includes(e.code)) finish();
    return true;
  });
  addEventListener('mousedown', () => { if (intro.active && t > 0.5) finish(); });

  function play(done) {
    onDone = done;
    tex = glowTexture();
    city = createCity(tex);
    fire = city.fire; smoke = city.smoke;
    plane = createPlane(); plane.position.set(0, 1.6, -60); city.scene.add(plane); dir.copy(fwd);
    renderPass.scene = city.scene;
    game.model.root.visible = false;
    game.panels.add('intro');
    t = 0; shake = 0; nextBlast = 0; hitDone = crashed = false; vel.set(0, 0, 0);
    intro.active = true;
    $('loading').classList.add('intro');
    ui.classList.add('show');
    fade.style.transition = 'none'; fade.style.opacity = 1; void fade.offsetWidth;
    fade.style.transition = ''; fade.style.opacity = 0;
  }

  function blast(pos, big, particles = fire, sm = smoke) {
    for (let i = 0; i < 10; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).multiplyScalar(30 * big);
      particles.emit(w.copy(pos).addScaledVector(v, 0.1), v, 0.8 + Math.random() * 0.8, 6 * big, 28 * big);
    }
    for (let i = 0; i < 5; i++) {
      v.set(Math.random() - 0.5, Math.random() + 0.4, Math.random() - 0.5).multiplyScalar(12 * big);
      sm.emit(pos, v, 3 + Math.random() * 2, 10 * big, 45 * big);
    }
  }

  // ---------- Shots 1-2: the city ----------
  function updateCity(dt) {
    // Explosions all over town, more of them close to the runway during the take-off shot
    if (t > nextBlast) {
      nextBlast = t + 0.06 + Math.random() * 0.14;
      const near = t < 5.2 && Math.random() < 0.6;
      let s; do { s = city.spots[(Math.random() * city.spots.length) | 0]; } while (near && (Math.abs(s.x) > 260 || s.z < -320 || s.z > 260));
      const p = v.set(s.x, s.h * (0.4 + Math.random() * 0.6), s.z).clone();
      blast(p, 1.5 + Math.random() * 1.5);
      const l = city.lights[lightIdx++ % city.lights.length];
      l.position.copy(p).y += 25; l.intensity = 900;
      if (near) shake = Math.max(shake, 0.25);
    }
    for (const l of city.lights) l.intensity *= Math.exp(-5 * dt);

    // The plane: speeds down the runway, lifts off and climbs away
    vel.z = Math.min(24 * t, 115);
    vel.y = t > 3.4 ? Math.min((t - 3.4) * 16, 32) : 0;
    plane.position.addScaledVector(vel, dt);
    plane.lookAt(v.copy(plane.position).add(vel).setY(plane.position.y + vel.y * 0.6));

    // The whole city goes up: a giant fireball, a shockwave and a white flash
    const bt = t - T_BOOM;
    if (bt > 0) {
      if (!city.boom.visible) {
        city.boom.visible = city.ring.visible = true;
        flash.style.transition = 'none'; flash.style.opacity = 0.95; void flash.offsetWidth;
        flash.style.transition = 'opacity .9s ease-out'; flash.style.opacity = 0;
        shake = 2.2;
      }
      const r = 430 * (1 - Math.exp(-2.4 * bt));
      city.boom.scale.set(r, r * 0.75, r);
      city.boom.material.opacity = clamp(1.4 - bt * 0.45, 0, 1);
      city.ring.scale.setScalar(80 + bt * 900);
      city.ring.material.opacity = clamp(1 - bt * 0.4, 0, 1);
      if (Math.random() < 0.7) {
        v.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(r * 0.8);
        w.set(0, r * 0.75, -420).add(v);
        smoke.emit(w, v.set(0, 20, 0), 4, 90, 260);
        fire.emit(w, v.set((Math.random() - 0.5) * 60, 30, (Math.random() - 0.5) * 60), 1.5, 60, 160);
      }
    }

    if (t < 5.2) { // shot 1: standing next to the runway as the plane roars past
      camera.position.set(30, 4, 70);
      v.copy(plane.position); v.y += 2;
      if (t < 0.05) lookAt.copy(v); else lookAt.lerp(v, 1 - Math.exp(-6 * dt));
    } else { // shot 2: in the air, looking back past the plane at the city
      camera.position.copy(plane.position).add(v.set(-26, 9, 38));
      lookAt.copy(plane.position).y -= 4;
    }
    intro.focus.copy(game.player.pos);
  }

  // ---------- Shots 3-4: over the island ----------
  function bezier(u, out) {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    return out.set(a * B.x + b * P1.x + c * K.x, a * B.y + b * P1.y + c * K.y, a * B.z + b * P1.z + c * K.z);
  }
  const tangent = (u, out) => out.subVectors(P1, B).multiplyScalar(2 * (1 - u)).addScaledVector(w.subVectors(K, P1), 2 * u);

  function enterIsland() {
    scene.add(plane); // moves it out of the city scene
    plane.scale.setScalar(2.2);
    disposeCity();
    renderPass.scene = scene;
    fire = createParticles(scene, tex, 260, true);
    smoke = createParticles(scene, tex, 260, false);
    const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const geo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true); geo.translate(0, 0.5, 0);
    beam = new THREE.Group();
    beam.add(new THREE.Mesh(geo, glow(new THREE.Color(12, 8, 3), 1)), new THREE.Mesh(geo, glow(new THREE.Color(6, 1.2, 0.1), 0.45)));
    beam.children[1].scale.set(2.6, 1, 2.6);
    beam.position.copy(crater); beam.visible = false;
    scene.add(beam);
    camera.position.copy(wideCam);
    lookAt.copy(A);
  }

  function updateIsland(dt) {
    const s = t - T_CITY;
    const u = clamp((t - T_HIT) / FALL, 0, 1);
    if (t < T_HIT) {
      plane.position.lerpVectors(A, B, s / (T_HIT - T_CITY));
      plane.lookAt(v.copy(plane.position).add(fwd));
    } else if (!crashed) {
      const e = Math.pow(u, 1.5);
      bezier(e, plane.position);
      tangent(e, dir).normalize();
      plane.lookAt(v.copy(plane.position).add(dir));
      plane.rotateZ(u * u * 9); // spinning out of control
      fire.emit(plane.position, v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(14), 0.3 + Math.random() * 0.2, 4, 11);
      smoke.emit(plane.position, v.set(Math.random() - 0.5, 0.5, Math.random() - 0.5).multiplyScalar(6), 3.5, 6, 30);
      if (u >= 1 || plane.position.y < world.heightAt(plane.position.x, plane.position.z) + 1) crash();
    }

    // The fire beam: shoots out of Mount Ember's crater and follows the plane until it hits
    const bs = t - (T_HIT - 0.3);
    beam.visible = bs > 0 && bs < 0.9;
    if (beam.visible) {
      v.copy(plane.position).sub(crater);
      const len = v.length() * Math.min(1, bs / 0.3);
      beam.quaternion.setFromUnitVectors(w.set(0, 1, 0), v.normalize());
      const wid = 6 * (1 + 0.15 * Math.sin(t * 60)) * clamp((0.9 - bs) * 3, 0, 1);
      beam.scale.set(wid, len, wid);
      fire.emit(crater, v.set(Math.random() - 0.5, 1.5, Math.random() - 0.5).multiplyScalar(25), 0.8, 10, 30);
    }
    if (!hitDone && t >= T_HIT) {
      hitDone = true; shake = 1.4;
      blast(plane.position, 1.1, fire, smoke);
      flash.style.background = '#ff9a3a';
      flash.style.transition = 'none'; flash.style.opacity = 0.55; void flash.offsetWidth;
      flash.style.transition = 'opacity .6s ease-out'; flash.style.opacity = 0;
    }

    // Camera: a wide shot that shows the beam, then a chase camera behind the falling plane
    if (s < 2.7) {
      camera.position.copy(wideCam);
      const mix = clamp((s - 0.9) / 0.8, 0, 0.45);
      lookAt.lerp(v.lerpVectors(plane.position, crater, mix), 1 - Math.exp(-5 * dt));
    } else if (!crashed) {
      v.copy(dir).setY(0).normalize();
      w.copy(plane.position).addScaledVector(v, -42).y += 12;
      if (s - dt < 2.7) camera.position.copy(w); else camera.position.lerp(w, 1 - Math.exp(-4 * dt));
      camera.position.y = Math.max(camera.position.y, world.heightAt(camera.position.x, camera.position.z) + 5);
      lookAt.copy(plane.position);
    }
    intro.focus.copy(plane.position);
  }

  function crash() {
    crashed = true; shake = 2.5;
    blast(plane.position, 2.2, fire, smoke);
    plane.visible = false;
    flash.style.background = '#fff';
    flash.style.transition = 'none'; flash.style.opacity = 1; void flash.offsetWidth;
    flash.style.transition = 'opacity .5s ease-out'; flash.style.opacity = 0;
    fade.style.transition = 'opacity .5s ease-in .35s'; fade.style.opacity = 1;
    setTimeout(finish, 1400);
  }

  function update(dt) {
    if (!intro.active) return;
    t += dt;
    if (city && t >= T_CITY) enterIsland();
    if (city) updateCity(dt); else updateIsland(dt);
    fire.update(dt); smoke.update(dt);

    camera.lookAt(lookAt);
    shake *= Math.exp(-3 * dt);
    if (shake > 0.01) {
      camera.rotation.x += (Math.random() - 0.5) * 0.03 * shake;
      camera.rotation.y += (Math.random() - 0.5) * 0.03 * shake;
    }
    const c = CAPTIONS.find(([a, b]) => t > a && t < b);
    cap.textContent = c ? c[2] : '';
    cap.classList.toggle('show', !!c);
  }

  function disposeCity() {
    city.fire.dispose(); city.smoke.dispose();
    city.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    city = null;
  }

  // Ends the cutscene (also when skipped): clean up, then fade from black into the game
  function finish() {
    if (!intro.active) return;
    intro.active = false;
    if (city) disposeCity();
    else {
      fire.dispose(); smoke.dispose();
      scene.remove(plane, beam);
      beam.traverse((o) => o.geometry?.dispose());
    }
    plane.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    tex.dispose();
    renderPass.scene = scene;
    game.model.root.visible = true;
    game.panels.delete('intro');
    cap.classList.remove('show');
    fade.style.transition = 'none'; fade.style.opacity = 1; void fade.offsetWidth;
    fade.style.transition = 'opacity 1.2s ease'; fade.style.opacity = 0;
    ui.classList.remove('show');
    onDone?.();
  }

  return intro;
}
