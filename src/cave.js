// Crystal Cave: a rocky dome with an entrance, glowing crystals inside
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FEATURES } from './world.js';

export function createCave(world, scene) {
  const C = FEATURES.cave;
  const floor = world.caveFloor;
  const R = C.r, H = 0.72;
  // Entrance faces the spawn area
  const entrance = Math.atan2(FEATURES.spawn.z - C.z, FEATURES.spawn.x - C.x);
  const OPEN = 0.36; // half-angle of the opening (radians)
  const OPEN_H = 11;

  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  // Thick shell: outer + inner hemisphere, displaced with noise, opening cut out
  const shell = (radius, inward) => {
    let g = new THREE.SphereGeometry(radius, 72, 28, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      const ang = Math.atan2(v.z, v.x);
      const n = world.simplex.noise3d(v.x * 0.12, v.y * 0.12, v.z * 0.12) * 0.1 + world.simplex.noise3d(v.x * 0.4, v.y * 0.4, v.z * 0.4) * 0.03;
      const low = 1 - Math.min(1, v.y / (radius * 0.3));
      v.multiplyScalar(1 + n * (1 - low * 0.6));
      v.y *= H;
      // round the entrance arch a little
      if (angDiff(ang, entrance) < OPEN + 0.15 && v.y < OPEN_H + 3) v.y += 0.5;
      p.setXYZ(i, v.x, v.y - 1.5, v.z);
    }
    // Cut out triangles in the doorway
    const keep = [];
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const a = angDiff(Math.atan2(cz, cx), entrance);
      const archH = OPEN_H * Math.sqrt(Math.max(0, 1 - (a / OPEN) ** 2));
      if (a < OPEN && cy < archH) continue;
      keep.push(i, i + 1, i + 2);
    }
    const ng = new THREE.BufferGeometry();
    const arr = new Float32Array(keep.length * 3);
    keep.forEach((src, j) => { arr[j * 3] = p.getX(src); arr[j * 3 + 1] = p.getY(src); arr[j * 3 + 2] = p.getZ(src); });
    ng.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (inward) { // flip winding so the inside faces are front faces
      for (let j = 0; j < arr.length; j += 9) for (let k = 0; k < 3; k++) { const t = arr[j + 3 + k]; arr[j + 3 + k] = arr[j + 6 + k]; arr[j + 6 + k] = t; }
    }
    const smooth = mergeVertices(ng, 0.01);
    smooth.computeVertexNormals();
    return smooth;
  };

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d675f, roughness: 0.95, flatShading: false });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x3b3a44, roughness: 0.9 });
  const outer = new THREE.Mesh(shell(R + 2.2, false), rockMat);
  const inner = new THREE.Mesh(shell(R, true), innerMat);
  const group = new THREE.Group();
  group.position.set(C.x, floor, C.z);
  outer.castShadow = true; outer.receiveShadow = true;
  inner.receiveShadow = true;
  group.add(outer, inner);

  // Moss and boulders around the dome
  const bould = new THREE.IcosahedronGeometry(1, 1);
  const bm = new THREE.InstancedMesh(bould, rockMat, 40);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let i = 0; i < 40; i++) {
    let a = Math.random() * Math.PI * 2;
    if (angDiff(a, entrance) < OPEN + 0.25) a += Math.PI * 0.6;
    const r = R + 2 + Math.random() * 6;
    const sc = 1.5 + Math.random() * 3.5;
    pos.set(Math.cos(a) * r, sc * 0.3 - 1, Math.sin(a) * r);
    q.setFromEuler(new THREE.Euler(Math.random(), Math.random() * 6, Math.random()));
    s.set(sc, sc * 0.7, sc * 0.9);
    bm.setMatrixAt(i, m.compose(pos, q, s));
  }
  bm.castShadow = bm.receiveShadow = true;
  group.add(bm);

  // Crystals
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  crystalGeo.scale(0.35, 1.6, 0.35);
  const palette = [new THREE.Color(0x48e8ff), new THREE.Color(0xb46bff), new THREE.Color(0x6bffb8)];
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
  // Glow in each crystal's own color
  crystalMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  const NC = 70;
  const crystals = new THREE.InstancedMesh(crystalGeo, crystalMat, NC);
  const col = new THREE.Color();
  for (let i = 0; i < NC; i++) {
    let a = Math.random() * Math.PI * 2;
    if (angDiff(a, entrance) < OPEN + 0.3) a += Math.PI;
    const r = R * (0.55 + Math.random() * 0.38);
    const sc = 0.6 + Math.random() * 1.6;
    pos.set(Math.cos(a) * r, sc * 0.6 - 0.3, Math.sin(a) * r);
    q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.9, Math.random() * 6, (Math.random() - 0.5) * 0.9));
    s.setScalar(sc);
    crystals.setMatrixAt(i, m.compose(pos, q, s));
    col.copy(palette[i % 3]).multiplyScalar(0.9 + Math.random() * 0.4);
    crystals.setColorAt(i, col);
  }
  crystals.castShadow = false;
  group.add(crystals);
  const l1 = new THREE.PointLight(0x55d8ff, 160, 40, 1.6); l1.position.set(-6, 5, 4);
  const l2 = new THREE.PointLight(0xb070ff, 130, 40, 1.6); l2.position.set(7, 4, -5);
  group.add(l1, l2);
  scene.add(group);

  const WALL_IN = R - 1.3, WALL_OUT = R + 3.2;
  let inside = false;

  // Keep the player out of the rock; returns whether they are inside
  function collide(p) {
    const dx = p.x - C.x, dz = p.z - C.z, d = Math.hypot(dx, dz);
    const inDoor = angDiff(Math.atan2(dz, dx), entrance) < OPEN - 0.06;
    if (!inDoor) {
      if (inside && d > WALL_IN) { p.x = C.x + (dx / d) * WALL_IN; p.z = C.z + (dz / d) * WALL_IN; }
      else if (!inside && d < WALL_OUT && d > WALL_IN - 2) { p.x = C.x + (dx / d) * WALL_OUT; p.z = C.z + (dz / d) * WALL_OUT; }
    }
    const nd = Math.hypot(p.x - C.x, p.z - C.z);
    inside = nd < R;
    return inside;
  }
  // Camera must stay inside the dome while the player is in there (and outside the rock otherwise)
  const domeY = (d) => floor - 1.5 + (R + 2) * H * Math.sqrt(Math.max(0, 1 - (d / (R + 2)) ** 2));
  const camBlocked = (v) => {
    const dx = v.x - C.x, dz = v.z - C.z, d = Math.hypot(dx, dz);
    const door = angDiff(Math.atan2(dz, dx), entrance) < OPEN && v.y < floor + OPEN_H - 1;
    if (inside) return !door && (d > WALL_IN - 0.5 || v.y > domeY(d) - 1.5);
    return !door && d < WALL_OUT + 0.5 && v.y < domeY(d) + 0.5;
  };

  return {
    collide, camBlocked, isInside: () => inside,
    update: (t) => { crystalMat.emissiveIntensity = 3 + 0.8 * Math.sin(t * 1.5); },
  };
}
