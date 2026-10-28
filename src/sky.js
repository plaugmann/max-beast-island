// Day/night cycle: physical sky, sun + moon light, stars, clouds, fog and reflections
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { smoothstep, lerp, GLSL_NOISE } from './util.js';

export const DAY_LENGTH = 20 * 60; // seconds for a full day
// Shared uniform (0 = day, 1 = full night) used by terrain/grass for moonlight desaturation
export const NIGHT_UNIFORM = { value: 0 };

const cA = new THREE.Color(), cB = new THREE.Color();
function mixHex(a, b, t, out) { return out.copy(cA.set(a)).lerp(cB.set(b), t); }

// Adds a moonlit night gradient and an overall gain to the Preetham sky shader
function patchSky(s) {
  const u = s.material.uniforms;
  u.uNightZ = { value: new THREE.Color(0.004, 0.009, 0.028) };
  u.uNightH = { value: new THREE.Color(0.016, 0.03, 0.062) };
  u.uNight = { value: 0 };
  u.uGain = { value: 1 };
  s.material.fragmentShader = s.material.fragmentShader
    .replace('uniform vec3 up;', 'uniform vec3 up; uniform vec3 uNightZ, uNightH; uniform float uNight, uGain;')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', `
      float hy = max(direction.y, 0.0);
      retColor = retColor * uGain + mix(uNightH, uNightZ, sqrt(hy)) * uNight;
      gl_FragColor = vec4( retColor, 1.0 );`);
  return u;
}

function makeMoonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, '#f4f2ea'); grd.addColorStop(0.92, '#d9d6cc'); grd.addColorStop(1, '#bdb9ae');
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill();
  // maria and craters
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 9; i++) {
    const x = 60 + r() * 140, y = 60 + r() * 130, rad = 18 + r() * 34;
    const m = g.createRadialGradient(x, y, 0, x, y, rad);
    m.addColorStop(0, 'rgba(120,118,112,0.55)'); m.addColorStop(1, 'rgba(120,118,112,0)');
    g.fillStyle = m; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 40; i++) {
    const x = 20 + r() * 216, y = 20 + r() * 216, rad = 1.5 + r() * 6;
    g.fillStyle = 'rgba(90,88,84,0.35)'; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,250,0.25)'; g.beginPath(); g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.6, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Height fog / aerial perspective: exponential-squared fog weighted by the air density integrated
// along the view ray (denser near sea level, thinner on mountain tops). Patches the global fog chunks.
function installHeightFog() {
  const C = THREE.ShaderChunk;
  if (C.fog_fragment.includes('vFogWorld')) return;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogWorld;\n#endif\n';
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogWorld = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz + cameraPosition;\n#endif\n';
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n varying vec3 vFogWorld;');
  C.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogDy = vFogWorld.y - cameraPosition.y;
    float fogK = 0.0055;
    float fogT = fogK * fogDy;
    float fogInteg = exp(-fogK * max(cameraPosition.y, 0.0)) * (abs(fogT) > 0.001 ? (1.0 - exp(-fogT)) / fogT : 1.0 - 0.5 * fogT);
    float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth * clamp(fogInteg, 0.0, 4.0) * 1.35);
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}

export function createSky(scene, renderer) {
  installHeightFog();
  const sky = new Sky();
  patchSky(sky);
  sky.scale.setScalar(10000);
  const su = sky.material.uniforms;
  su.turbidity.value = 5;
  su.rayleigh.value = 1.6;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.8;
  scene.add(sky);

  // Separate sky used only to bake reflections (environment map)
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  patchSky(envSky);
  envSky.scale.setScalar(50);
  Object.assign(envSky.material.uniforms.turbidity, { value: 5 });
  envSky.material.uniforms.rayleigh.value = 1.6;
  envSky.material.uniforms.mieCoefficient.value = 0.004;
  envSky.material.uniforms.mieDirectionalG.value = 0.8;
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, lastEnvSun = new THREE.Vector3(0, -2, 0);

  // Stars
  const starCount = 3000;
  const sp = new Float32Array(starCount * 3), ss = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    sp[i * 3] = r * Math.cos(a) * 9000; sp[i * 3 + 1] = Math.abs(u) * 9000; sp[i * 3 + 2] = r * Math.sin(a) * 9000;
    ss[i] = Math.pow(Math.random(), 3) * 2.6 + 0.8;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(ss, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `attribute float size; varying float vTw; uniform float uTime;
      void main(){ vTw = 0.7 + 0.3 * sin(uTime * 2.0 + position.x * 0.01 + position.z * 0.013);
        gl_PointSize = size * ${renderer.getPixelRatio().toFixed(2)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uOpacity; varying float vTw;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = 1.0 - smoothstep(0.0, 0.5, d); gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * 2.0, a * uOpacity * vTw); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);

  // Moon
  const moon = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.0, 2.05, 2.2), map: makeMoonTexture(), fog: false, transparent: true, depthWrite: false }));
  scene.add(moon);

  // Cloud layer: domain-warped fbm, self-shadowed towards the sun, silver lining and horizon haze
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uLit: { value: new THREE.Color() },
      uShade: { value: new THREE.Color() }, uOpacity: { value: 1 }, uCam: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_NOISE + `
      uniform float uTime, uOpacity; uniform vec3 uSunDir, uLit, uShade, uCam, uHorizon, uSunCol; varying vec3 vW;
      float gThick;
      float cloudD(vec2 pw, float cov){
        float n = fbm2(pw);
        float hi = fbm2(pw * 4.1 + 1.3);
        n = n - (1.0 - n) * 0.5 * hi + 0.25 * hi;
        gThick = n - cov;
        return smoothstep(cov, cov + 0.12, n);
      }
      void main(){
        vec3 vd = normalize(vW - uCam);
        float fade = (1.0 - smoothstep(2500.0, 6500.0, length(vW.xz - uCam.xz))) * smoothstep(0.0, 0.06, vd.y);
        if (fade < 0.002) discard;
        vec2 wind = vec2(uTime * 0.0016, uTime * 0.0007);
        vec2 p = vW.xz * 0.00042 + wind;
        vec2 q = vec2(fbm2(p * 0.6 + 3.0), fbm2(p * 0.6 + 7.7 - wind * 0.5));
        vec2 pw = p + q * 0.75;
        float cov = mix(0.36, 0.58, fbm2(p * 0.17 + 11.0));
        float d = cloudD(pw, cov);
        if (d < 0.003) discard;
        float thick = gThick;
        float detail = fbm2(pw * 14.0 + 5.0);
        // density a little towards the sun: thinner there = lit edge
        vec2 so = normalize(uSunDir.xz + 1e-4) * 0.03;
        float dl = cloudD(pw + so, cov);
        float lit = clamp(0.72 + (d - dl) * 2.6 - d * 0.2, 0.0, 1.0);
        lit = mix(lit, 1.0, smoothstep(0.1, 0.5, uSunDir.y) * 0.25);
        vec3 col = mix(uShade, uLit, lit);
        // thick parts are darker underneath; fine billows break up the flat interior
        col *= 1.0 - 0.42 * smoothstep(0.02, 0.32, thick);
        col *= 0.74 + 0.5 * detail;
        // forward scattering around the sun (silver lining on thin parts)
        float mu = max(dot(vd, uSunDir), 0.0);
        col += uSunCol * (pow(mu, 8.0) * 0.5 + pow(mu, 40.0) * 1.2) * (1.0 - d * 0.8) * 0.25;
        // aerial perspective towards the horizon
        col = mix(col, uHorizon, (1.0 - smoothstep(0.03, 0.3, vd.y)) * 0.65);
        gl_FragColor = vec4(col, d * fade * uOpacity * (0.75 + 0.25 * detail));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), cloudMat);
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = 1000;
  clouds.renderOrder = 1;
  clouds.name = 'clouds';
  scene.add(clouds);

  // Lights
  const mainLight = new THREE.DirectionalLight(0xffffff, 3);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(4096, 4096);
  const sc = mainLight.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 1400;
  mainLight.shadow.bias = -0.0004;
  mainLight.shadow.normalBias = 0.5;
  scene.add(mainLight, mainLight.target);
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4b5a3a, 1);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(0xb7cde0, 0.00032);

  const state = {
    time: 0.375, // 0 = midnight, 0.25 = 06:00, 0.5 = noon
    sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3(),
    day: 1, sunColor: new THREE.Color(), ambient: new THREE.Color(), skyColor: new THREE.Color(), horizon: new THREE.Color(),
  };
  const tmpC = new THREE.Color();

  function update(dt, elapsed, focus, camera) {
    state.time = (state.time + dt / DAY_LENGTH) % 1;
    const t = state.time;
    const el = Math.sin((t - 0.25) * Math.PI * 2) * THREE.MathUtils.degToRad(72);
    const az = (t - 0.25) * Math.PI * 2;
    state.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az) * 0.8 + 0.25).normalize();
    state.moonDir.copy(state.sunDir).multiplyScalar(-1);
    state.moonDir.y = Math.abs(state.moonDir.y) * 0.9 + 0.1; state.moonDir.normalize();

    const sy = state.sunDir.y;
    const day = smoothstep(-0.1, 0.18, sy);
    const golden = smoothstep(0.35, 0.02, sy) * smoothstep(-0.12, 0.02, sy);
    state.day = day;

    su.sunPosition.value.copy(state.sunDir);
    su.rayleigh.value = lerp(0.6, 1.6, day) + golden * 1.2;
    su.turbidity.value = lerp(3.2, 9, golden);
    su.mieCoefficient.value = lerp(0.003, 0.009, golden);
    su.mieDirectionalG.value = lerp(0.8, 0.86, golden);
    const night = 1 - smoothstep(-0.2, 0.02, sy);
    su.uNight.value = night;
    NIGHT_UNIFORM.value = night;
    su.uGain.value = lerp(0.25, 1, smoothstep(-0.2, 0.0, sy));

    // Pick the light source that casts shadows (sun by day, moon by night)
    const useSun = sy > -0.04;
    state.lightDir.copy(useSun ? state.sunDir : state.moonDir);
    const sunCol = mixHex(0xff9a5a, 0xfff2e2, smoothstep(0.02, 0.4, sy), tmpC);
    if (useSun) {
      mainLight.color.copy(sunCol);
      mainLight.intensity = 3.4 * smoothstep(-0.04, 0.12, sy);
    } else {
      mainLight.color.set(0x9db4ff);
      mainLight.intensity = 1.5 * smoothstep(-0.04, -0.2, sy);
    }
    state.sunColor.copy(mainLight.color).multiplyScalar(mainLight.intensity);

    // Keep the shadow box centred on the player, snapped to texels to avoid shimmering
    const texel = 220 / 4096;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    mainLight.target.position.set(fx, focus.y, fz);
    mainLight.position.set(fx, focus.y, fz).addScaledVector(state.lightDir, 600);

    mixHex(0x3d5490, 0xbcd8ff, day, hemi.color);
    mixHex(0x161c2a, 0x5a5a40, day, hemi.groundColor);
    hemi.color.lerp(tmpC.set(0xffc9a0), golden * 0.35);
    hemi.intensity = lerp(0.95, 0.75, day);
    state.ambient.copy(hemi.color).multiplyScalar(hemi.intensity * 0.6);

    mixHex(0x0c1628, 0xa6c2dc, day, scene.fog.color);
    scene.fog.color.lerp(tmpC.set(0xe39a6e), golden * 0.6);
    state.horizon.copy(scene.fog.color);
    mixHex(0x08122a, 0x4b86c9, day, state.skyColor);
    renderer.toneMappingExposure = lerp(1.0, 0.52, day);
    scene.environmentIntensity = lerp(0.3, 0.55, day);

    // Stars / moon / clouds
    starMat.uniforms.uOpacity.value = 1 - smoothstep(-0.2, 0.05, sy);
    starMat.uniforms.uTime.value = elapsed;
    stars.position.copy(camera.position);
    moon.position.copy(camera.position).addScaledVector(state.moonDir, 8500);
    moon.visible = state.moonDir.y > -0.05;
    moon.material.opacity = lerp(0.18, 1, night);
    moon.lookAt(camera.position);
    const cu = cloudMat.uniforms;
    cu.uTime.value = elapsed;
    cu.uSunDir.value.copy(state.sunDir);
    cu.uCam.value.copy(camera.position);
    mixHex(0x1c2438, 0xffffff, day, cu.uLit.value).lerp(tmpC.set(0xffa070), golden * 0.85);
    mixHex(0x0b0f1a, 0x8c97aa, day, cu.uShade.value).lerp(tmpC.set(0x6e5068), golden * 0.6);
    cu.uHorizon.value.copy(scene.fog.color);
    cu.uSunCol.value.copy(sunCol).multiplyScalar(smoothstep(-0.05, 0.1, sy));
    cu.uOpacity.value = lerp(0.6, 1, day);
    clouds.position.x = camera.position.x; clouds.position.z = camera.position.z;

    // Re-bake reflections when the sun has moved noticeably
    if (state.sunDir.distanceTo(lastEnvSun) > 0.02) {
      lastEnvSun.copy(state.sunDir);
      envSky.material.uniforms.sunPosition.value.copy(state.sunDir);
      for (const k of ['rayleigh', 'turbidity', 'mieCoefficient', 'mieDirectionalG', 'uNight', 'uGain']) envSky.material.uniforms[k].value = su[k].value;
      const rt = pmrem.fromScene(envScene, 0, 0.1, 100);
      scene.environment = rt.texture;
      if (envRT) envRT.dispose();
      envRT = rt;
    }
  }

  return { state, update, mainLight, hemi };
}
