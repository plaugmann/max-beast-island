// The player: movement, physics and animation of the businessman
import * as THREE from 'three';
import { BOUNDARY_R, FEATURES } from './world.js';
import { clamp, lerp } from './util.js';

// The businessman model itself lives in character.js
export { createBusinessman } from './character.js';

export class Player {
  constructor(world, model, { colliders, cave, volcano, onRespawn }) {
    this.world = world; this.model = model; this.colliders = colliders; this.cave = cave; this.volcano = volcano;
    this.onRespawn = onRespawn;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.facing = 0; this.grounded = true; this.swimming = false; this.phase = 0; this.speedNow = 0;
    this.inCave = false;
    this.flying = false; this.flySpeed = 25; // admin fly mode (admin.js)
    this.respawn();
  }

  respawn() {
    const s = FEATURES.spawn;
    this.pos.set(s.x, this.world.heightAt(s.x, s.z), s.z);
    this.vel.set(0, 0, 0);
    this.facing = Math.PI * 0.75;
  }

  // Admin teleport: stand on the ground at x, z
  teleport(x, z, y = this.world.heightAt(x, z)) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.grounded = !this.flying;
    this.syncCave();
  }

  // The cave only tracks walking through its door; fix it up after flying/teleporting out
  syncCave() {
    const C = FEATURES.cave;
    if (!this.cave.isInside() || Math.hypot(this.pos.x - C.x, this.pos.z - C.z) < C.r) return;
    const p = new THREE.Vector3();
    for (let a = 0; a < Math.PI * 2; a += 0.05) { // probe until we find the door, which resets "inside"
      p.set(C.x + Math.cos(a) * 100, 0, C.z + Math.sin(a) * 100);
      if (!this.cave.collide(p)) break;
    }
    this.inCave = false;
  }

  // Admin fly mode: no gravity, no collisions. Space up, C down (input.down), Shift fast
  fly(dt, input, camYaw) {
    let mx = 0, mz = 0;
    if (input.forward) mz -= 1; if (input.back) mz += 1;
    if (input.left) mx -= 1; if (input.right) mx += 1;
    const len = Math.hypot(mx, mz) || 1, sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const dx = (mx * cos + mz * sin) / len, dz = (-mx * sin + mz * cos) / len;
    const speed = input.sprint ? this.flySpeed * 3.2 : this.flySpeed;
    const my = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
    const k = 1 - Math.exp(-5 * dt);
    this.vel.x = lerp(this.vel.x, dx * speed, k);
    this.vel.z = lerp(this.vel.z, dz * speed, k);
    this.vel.y = lerp(this.vel.y, my * speed * 0.7, k);
    this.pos.addScaledVector(this.vel, dt);
    if (mx || mz) {
      const diff = Math.atan2(Math.sin(Math.atan2(dx, dz) - this.facing), Math.cos(Math.atan2(dx, dz) - this.facing));
      this.facing += diff * (1 - Math.exp(-8 * dt));
    }
    // Keep above the ground / water and inside the map
    const floor = Math.max(this.world.heightAt(this.pos.x, this.pos.z), -1.3);
    if (this.pos.y < floor) { this.pos.y = floor; this.vel.y = Math.max(0, this.vel.y); }
    this.pos.y = Math.min(this.pos.y, 1500);
    const lim = this.world.half - 10;
    this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
    this.grounded = false; this.swimming = false;
    this.syncCave();
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    this.animate(dt);
  }

  update(dt, input, camYaw) {
    if (this.flying) { this.fly(dt, input, camYaw); return; }
    const w = this.world;
    // Desired movement relative to the camera
    let mx = 0, mz = 0;
    if (input.forward) mz -= 1; if (input.back) mz += 1;
    if (input.left) mx -= 1; if (input.right) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const len = Math.hypot(mx, mz) || 1;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const dx = (mx * cos + mz * sin) / len, dz = (-mx * sin + mz * cos) / len;

    const ground = w.heightAt(this.pos.x, this.pos.z);
    const depth = -ground;
    this.swimming = depth > 1.35 && this.pos.y <= -1.2;

    let speed = input.sprint ? 10 : 5.2;
    if (this.swimming) speed = input.sprint ? 4.5 : 3;
    // Slow down when walking up steep slopes
    if (moving && this.grounded && !this.swimming) {
      const ahead = w.heightAt(this.pos.x + dx * 1.5, this.pos.z + dz * 1.5);
      const climb = (ahead - ground) / 1.5;
      speed *= clamp(1.15 - Math.max(0, climb - 0.35) * 1.1, 0.3, 1);
    }

    const targetVx = moving ? dx * speed : 0, targetVz = moving ? dz * speed : 0;
    const accel = this.grounded || this.swimming ? 12 : 3;
    this.vel.x = lerp(this.vel.x, targetVx, 1 - Math.exp(-accel * dt));
    this.vel.z = lerp(this.vel.z, targetVz, 1 - Math.exp(-accel * dt));

    if (moving) {
      const target = Math.atan2(dx, dz);
      let diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += diff * (1 - Math.exp(-12 * dt));
    }

    if (input.jump && this.grounded && !this.swimming) { this.vel.y = 7; this.grounded = false; }
    if (!this.swimming) this.vel.y -= 22 * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // Trees and rocks
    for (const c of this.colliders(this.pos.x, this.pos.z)) {
      const ox = this.pos.x - c.x, oz = this.pos.z - c.z, d = Math.hypot(ox, oz), min = c.r + 0.35;
      if (d < min && d > 1e-4) { this.pos.x = c.x + (ox / d) * min; this.pos.z = c.z + (oz / d) * min; }
    }
    this.inCave = this.cave.collide(this.pos);

    // Stay within the world
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > BOUNDARY_R) { this.pos.x *= BOUNDARY_R / r; this.pos.z *= BOUNDARY_R / r; }

    const g = w.heightAt(this.pos.x, this.pos.z);
    const waterLevel = -1.3;
    if (-g > 1.35 && this.pos.y <= waterLevel + 0.05) {
      // Floating in deep water
      this.pos.y = lerp(this.pos.y, waterLevel + Math.sin(performance.now() * 0.002) * 0.05, 1 - Math.exp(-8 * dt));
      this.vel.y = 0; this.grounded = false; this.swimming = true;
    } else if (this.pos.y <= g) {
      this.pos.y = g; this.vel.y = 0; this.grounded = true;
    } else if (this.pos.y - g > 0.3) {
      this.grounded = false;
    } else if (this.vel.y <= 0) {
      this.pos.y = g; this.grounded = true; // stick to the ground going downhill
    }

    if (this.volcano.inLava(this.pos)) { this.respawn(); this.onRespawn('You fell into the lava! 🔥'); }

    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    this.animate(dt);
  }

  animate(dt) {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.facing;
    const s = this.speedNow;
    const amt = clamp(s / 5.2, 0, 1.4);
    this.phase += dt * (s > 0.2 ? 2.2 + s * 0.95 : 0);
    const p = this.phase;
    const k = 1 - Math.exp(-14 * dt);
    const set = (obj, axis, v) => { obj.rotation[axis] = lerp(obj.rotation[axis], v, k); };
    const t = performance.now() * 0.001;
    const breath = Math.sin(t * 1.6);
    if (m.chest) for (const c of m.chest) c.scale.set(1 + 0.005 * breath, 1, 1 + 0.01 * breath);
    const hand = (a, v) => { if (a.hand) set(a.hand, 'x', v); };
    const ankle = (l, v) => { if (l.ankle) set(l.ankle, 'x', v); };

    if (this.flying) {
      // Superhero pose: lean into the flight, arms out like wings, legs trailing
      const f = clamp(s / 40, 0, 1), up = clamp(this.vel.y / 20, -1, 1);
      set(m.body, 'x', 0.1 + f * 1.15 - up * 0.15);
      m.body.position.y = lerp(m.body.position.y, 0.3 + f * 0.75, k);
      set(m.hips, 'y', 0); set(m.hips, 'z', Math.sin(t * 1.3) * 0.05); set(m.torso, 'x', 0); set(m.torso, 'y', 0); set(m.torso, 'z', 0);
      set(m.head, 'x', -f * 0.95); set(m.head, 'y', 0);
      m.legs.forEach((l, i) => { set(l.hip, 'x', 0.12 + Math.sin(t * 2.4 + i * 1.7) * 0.07); set(l.knee, 'x', 0.18 + i * 0.25); ankle(l, 0.55); });
      m.arms.forEach((a, i) => {
        set(a.shoulder, 'x', -0.15 + Math.sin(t * 1.8 + i) * 0.05); set(a.shoulder, 'z', (i ? 1 : -1) * (1.35 - f * 0.2));
        set(a.elbow, 'x', -0.12); hand(a, 0);
      });
      return;
    }
    if (this.swimming) {
      set(m.body, 'x', 1.3);
      m.body.position.y = lerp(m.body.position.y, 1.15, k);
      const sp = performance.now() * 0.004;
      set(m.hips, 'y', 0); set(m.hips, 'z', 0); set(m.head, 'x', -0.9); set(m.head, 'y', 0);
      m.legs.forEach((l, i) => { set(l.hip, 'x', Math.sin(sp * 2 + i * Math.PI) * 0.35); set(l.knee, 'x', 0.3); ankle(l, 0.6); });
      m.arms.forEach((a, i) => { set(a.shoulder, 'x', Math.PI + Math.sin(sp + i * Math.PI) * 1.4); set(a.shoulder, 'z', 0); set(a.elbow, 'x', -0.3); hand(a, 0); });
      return;
    }
    set(m.body, 'x', 0);
    if (!this.grounded) {
      m.body.position.y = lerp(m.body.position.y, 0, k);
      set(m.hips, 'y', 0); set(m.hips, 'z', 0); set(m.torso, 'x', 0.05); set(m.torso, 'y', 0); set(m.head, 'x', -0.05); set(m.head, 'y', 0);
      m.legs.forEach((l, i) => { set(l.hip, 'x', i ? 0.45 : -0.55); set(l.knee, 'x', i ? 0.95 : 0.55); ankle(l, i ? 0.35 : -0.1); });
      m.arms.forEach((a, i) => {
        const bc = i === 1;
        set(a.shoulder, 'x', bc ? -0.2 : -0.7); set(a.shoulder, 'z', (i ? 1 : -1) * (bc ? 0.35 : 0.6));
        set(a.elbow, 'x', bc ? -0.15 : -0.7); hand(a, bc ? 0.35 : 0);
      });
      return;
    }
    const run = clamp((s - 6) / 4, 0, 1);
    const idle = 1 - clamp(s / 1.2, 0, 1);
    // Body is lowest when the legs are spread (heel strike) and highest as they pass
    m.body.position.y = s > 0.2
      ? (0.01 - Math.abs(Math.sin(p)) * (0.028 + run * 0.008)) * amt - run * 0.012
      : breath * 0.003;
    // Pelvis twists and rolls with the stride, shoulders counter-rotate, head stays on target
    const hipYaw = Math.sin(p) * 0.11 * amt;
    set(m.hips, 'y', hipYaw);
    set(m.hips, 'z', -Math.sin(p) * 0.035 * amt * (1 - run * 0.5) + idle * Math.sin(t * 0.5) * 0.012);
    const torsoYaw = -hipYaw * 1.9;
    set(m.torso, 'y', torsoYaw);
    const lean = 0.04 * amt + run * 0.16 + idle * breath * 0.008;
    set(m.torso, 'x', lean);
    set(m.torso, 'z', -m.hips.rotation.z * 0.6);
    set(m.head, 'y', -(hipYaw + torsoYaw) + idle * Math.sin(t * 0.31) * Math.sin(t * 0.13) * 0.35);
    set(m.head, 'x', -lean * 0.7 + idle * Math.sin(t * 0.23) * 0.04);
    m.legs.forEach((l, i) => {
      const ph = p + i * Math.PI;
      const hipA = -Math.sin(ph) * (0.5 + run * 0.15) * amt;
      const swing = Math.max(0, Math.cos(ph - 0.25)); // knee folds while the leg swings forwards
      const kneeA = (swing * (0.95 + run * 0.7) + 0.08) * amt + idle * 0.03;
      set(l.hip, 'x', hipA - run * 0.1);
      set(l.knee, 'x', kneeA);
      // keep the sole roughly level, push off with the toes at the end of stance
      const toeOff = Math.max(0, -Math.sin(ph)) * Math.max(0, Math.cos(ph)) * 1.4 * amt;
      ankle(l, -(hipA + kneeA) * 0.85 + toeOff - swing * 0.15 * amt);
    });
    m.arms.forEach((a, i) => {
      const ph = p + i * Math.PI;
      const bc = i === 1; // carries the briefcase
      const sw = Math.sin(ph) * (bc ? 0.22 : 0.5 + run * 0.25) * amt;
      set(a.shoulder, 'x', sw + idle * (bc ? 0 : breath * 0.01));
      set(a.shoulder, 'z', (i ? 1 : -1) * (bc ? 0.14 : 0.07 + run * 0.1));
      const el = bc ? -0.05 : -0.18 - Math.max(0, -Math.sin(ph)) * 0.35 * amt - run * 1.0;
      set(a.elbow, 'x', el);
      hand(a, bc ? -(sw + el) * 0.9 : -0.05);
      if (bc && a.hand) set(a.hand, 'z', -0.12);
    });
  }
}
