// Third-person orbit camera (mouse look, scroll zoom, doesn't clip into hills or the cave)
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

export class ThirdPersonCamera {
  constructor(camera, dom, isBlocked) {
    this.camera = camera; this.isBlocked = isBlocked;
    this.yaw = Math.PI * 0.75 + Math.PI; this.pitch = 0.32;
    this.dist = 7; this.wantDist = 7; this.curDist = 7;
    this.target = new THREE.Vector3();
    this.enabled = true;
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom || !this.enabled) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = clamp(this.pitch + e.movementY * 0.0022, -0.45, 1.35);
    });
    dom.addEventListener('wheel', (e) => { this.wantDist = clamp(this.wantDist + e.deltaY * 0.01, 2.5, 22); }, { passive: true });
  }

  update(dt, focus) {
    this.dist = lerp(this.dist, this.wantDist, 1 - Math.exp(-10 * dt));
    this.target.lerp(new THREE.Vector3(focus.x, focus.y + 1.6, focus.z), 1 - Math.exp(-20 * dt));
    if (this.target.distanceTo(focus) > 20) this.target.set(focus.x, focus.y + 1.6, focus.z);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // March outwards until we hit something
    let allowed = this.dist;
    const p = new THREE.Vector3();
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const d = (this.dist * i) / steps;
      p.copy(this.target).addScaledVector(dir, d);
      if (this.isBlocked(p)) { allowed = Math.max(0.8, d - this.dist / steps); break; }
    }
    // Snap in quickly, ease back out slowly
    this.curDist = allowed < this.curDist ? allowed : lerp(this.curDist, allowed, 1 - Math.exp(-4 * dt));
    this.camera.position.copy(this.target).addScaledVector(dir, this.curDist);
    this.camera.lookAt(this.target);
  }
}
