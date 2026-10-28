// Dense waving grass (with a few flowers) that follows the player.
// Each blade has a fixed spot in the world; the patch just wraps around the player.
// Two layers: a very dense inner patch near the camera and a wider outer patch.
// Blade colour is taken from the terrain colour underneath so grass and ground always match.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_TERRAIN } from './util.js';
import { WORLD_SIZE, SEG } from './world.js';
import { NIGHT_UNIFORM } from './sky.js';

// Ground colour (biome vertex colours) as a texture; stored as sqrt() for 8-bit precision
function makeGroundColorTex(world) {
  const N = world.N, src = world.colors, data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.sqrt(Math.min(1, src[i * 3])) * 255;
    data[i * 4 + 1] = Math.sqrt(Math.min(1, src[i * 3 + 1])) * 255;
    data[i * 4 + 2] = Math.sqrt(Math.min(1, src[i * 3 + 2])) * 255;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function bladeGeometry(segs, width) {
  const pts = [], side = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = width * (1 - Math.pow(t, 1.4) * 0.9);
    pts.push(-w, t, 0, w, t, 0);
    side.push(-1, 1);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return { pts, side, idx };
}

const VERT = /* glsl */ `
  attribute vec2 aOffset; attribute vec4 aRand; attribute float aSide;
  uniform float uTime, uR, uInner; uniform vec3 uCenter; uniform sampler2D uGround;
  varying float vY; varying vec3 vCol; varying vec3 vN; varying vec3 vWP; varying float vSide;
  ${GLSL_NOISE}
  ${GLSL_TERRAIN}
  #include <fog_pars_vertex>
  void main(){
    vec2 wp = aOffset + floor((uCenter.xz - aOffset) / (2.0 * uR) + 0.5) * (2.0 * uR);
    vec4 ts = terrainSample(wp);
    float dist = length(wp - uCenter.xz);
    float fade = 1.0 - smoothstep(uR * 0.55, uR, dist);
    float patchy = vnoise(wp * 0.08);
    float dens = ts.g * (0.55 + 0.7 * patchy);
    float keep = step(aRand.x, dens);
    float flower = step(0.988, aRand.w) * step(0.4, ts.g) * (1.0 - uInner);
    float tall = vnoise(wp * 0.21 + 5.0);
    float h = (0.22 + 0.45 * aRand.y + 0.25 * tall) * (0.55 + 0.6 * ts.g) * keep * fade * mix(1.0, 0.65, flower);
    h *= mix(1.0, 0.8, uInner);
    float ang = aRand.z * 6.2831;
    vec3 p = position;
    // blades get a bit wider with distance so they don't alias into noise
    float widen = 1.0 + smoothstep(8.0, 45.0, length(cameraPosition.xz - wp)) * 1.2;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec3 local = vec3(p.x * widen * dir.x, p.y * h, p.x * widen * dir.y);
    // wind: slow gusts rolling over the field + flutter
    float gust = vnoise(wp * 0.035 - vec2(uTime * 0.35, uTime * 0.22));
    float wind = (sin(uTime * 1.6 + wp.x * 0.13 + wp.y * 0.09) * 0.35 + 0.65) * gust * 1.3
               + sin(uTime * 3.7 + wp.x * 0.7 + wp.y * 0.5 + aRand.w * 6.0) * 0.12;
    float lean = 0.15 + 0.35 * aRand.w;
    float bend = p.y * p.y * h * (lean + 0.55 * wind);
    vec2 bendDir = normalize(vec2(-dir.y, dir.x) * lean + vec2(0.8, 0.6) * wind + 1e-4);
    local.x += bend * bendDir.x; local.z += bend * bendDir.y;
    local.y -= bend * bend * 0.35;
    vec3 world = vec3(wp.x, ts.r - 0.04, wp.y) + local;
    vY = p.y; vSide = aSide; vWP = world;

    // colour from the ground beneath, with per-blade variety
    vec2 guv = (wp + uWorldSize * 0.5) / uWorldSize;
    vec3 g = texture2D(uGround, guv).rgb; g *= g;
    float var = aRand.y * 0.6 + vnoise(wp * 0.6) * 0.4;
    vec3 baseC = g * vec3(0.62, 0.68, 0.55);
    vec3 tipC = g * mix(vec3(1.05, 1.12, 0.8), vec3(1.25, 1.18, 0.75), var) * (0.85 + 0.3 * aRand.x);
    float dry = step(0.93, fract(aRand.x * 7.13 + aRand.z * 3.1)) * (1.0 - ts.b);
    tipC = mix(tipC, vec3(0.42, 0.36, 0.17) * (0.7 + 0.6 * var), dry * 0.7);
    tipC = mix(tipC, g * 0.85, ts.b * 0.5);
    vCol = mix(baseC, tipC, smoothstep(0.0, 1.0, p.y));
    vec3 fc = aRand.y < 0.33 ? vec3(0.9, 0.9, 0.85) : (aRand.y < 0.66 ? vec3(0.95, 0.75, 0.12) : vec3(0.55, 0.3, 0.8));
    vCol = mix(vCol, fc, flower * step(0.7, p.y));
    // normal: blade face, rounded across the width, tilted by the bend
    vec3 face = vec3(-dir.y, 0.0, dir.x);
    vec3 across = vec3(dir.x, 0.0, dir.y);
    vN = normalize(face + across * aSide * 0.45 + vec3(0.0, 0.55, 0.0) + vec3(bendDir.x, 0.0, bendDir.y) * bend * 0.6);
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Hidden blades: move every vertex to one point outside the view (sliver triangles flicker)
    if (h < 0.02) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uSunDir, uSunColor, uAmbient; uniform float uNightK;
  varying float vY; varying vec3 vCol; varying vec3 vN; varying vec3 vWP; varying float vSide;
  #include <fog_pars_fragment>
  void main(){
    float y = clamp(vY, 0.0, 1.0);
    vec3 n = length(vN) > 0.001 ? normalize(vN) : vec3(0.0, 1.0, 0.0);
    vec3 V = normalize(cameraPosition - vWP);
    if (dot(n.xz, V.xz) < 0.0) n.xz = -n.xz;
    vec3 baseCol = clamp(vCol, 0.0, 1.0);
    float ndl = dot(n, uSunDir);
    float diff = max(ndl, 0.0) * 0.7 + 0.3 * max(uSunDir.y, 0.0);
    // light shining through thin blades when backlit
    float trans = pow(max(dot(-V, uSunDir), 0.0), 3.0) * y * 0.9;
    float ao = mix(0.45, 1.0, pow(y, 0.8));
    vec3 col = baseCol * (uAmbient * 1.25 * ao + uSunColor * (diff * 0.5 * ao + trans * 0.45 * vec3(0.9, 1.1, 0.5)));
    // faint waxy sheen
    vec3 Hh = normalize(uSunDir + V);
    col += uSunColor * pow(max(dot(n, Hh), 0.0), 40.0) * 0.04 * y;
    gl_FragColor = vec4(col, 1.0);
        // moonlight: low-light vision is desaturated and bluish (Purkinje shift)
        { float lum = dot(gl_FragColor.rgb, vec3(0.25, 0.65, 0.1));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, lum * vec3(0.72, 0.9, 1.45), uNightK * 0.7); }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function createGrass(world, count = 220000, radius = 50) {
  const groundTex = makeGroundColorTex(world);
  const shared = {
    uNightK: NIGHT_UNIFORM, uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uAmbient: { value: new THREE.Color() },
  };

  function layer(n, R, segs, width, inner) {
    const b = bladeGeometry(segs, width);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(b.idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pts, 3));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(b.side, 1));
    const off = new Float32Array(n * 2), rnd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      off[i * 2] = (Math.random() * 2 - 1) * R; off[i * 2 + 1] = (Math.random() * 2 - 1) * R;
      rnd[i * 4] = Math.random(); rnd[i * 4 + 1] = Math.random(); rnd[i * 4 + 2] = Math.random(); rnd[i * 4 + 3] = Math.random();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 4));
    geo.instanceCount = n;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uR: { value: R }, uInner: { value: inner ? 1 : 0 },
      uWorldSize: { value: WORLD_SIZE }, uSeg: { value: SEG }, uTerrainTex: { value: null }, uGround: { value: null },
    }]);
    Object.assign(uniforms, shared);
    uniforms.uTerrainTex.value = world.terrainTex;
    uniforms.uGround.value = groundTex;
    const mat = new THREE.ShaderMaterial({ uniforms, fog: true, side: THREE.DoubleSide, vertexShader: VERT, fragmentShader: FRAG });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = 'grass';
    return mesh;
  }

  const group = new THREE.Group();
  group.add(layer(count, radius, 4, 0.034, false));
  group.add(layer(Math.round(count * 0.45), 15, 4, 0.03, true));

  function update(t, center, sky) {
    shared.uTime.value = t;
    shared.uCenter.value.copy(center);
    shared.uSunDir.value.copy(sky.state.lightDir);
    shared.uSunColor.value.copy(sky.state.sunColor);
    shared.uAmbient.value.copy(sky.state.ambient);
  }
  return { mesh: group, update };
}
