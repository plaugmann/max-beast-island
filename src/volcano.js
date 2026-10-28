// Mount Ember: bubbling lava lake, glow, smoke column and flying embers
import * as THREE from 'three';
import { FEATURES } from './world.js';
import { GLSL_NOISE } from './util.js';
import { GLSL_VORONOI } from './terrainTextures.js';

export function createVolcano(world, scene) {
  const V = FEATURES.volcano;
  const group = new THREE.Group();
  const lavaY = world.lavaY;

  // Lava lake: drifting dark crust plates with glowing cracks, molten upwellings and a cooler rim
  const lavaMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Vector3(V.x, 0, V.z) }, uR: { value: V.crater * 0.95 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_NOISE + GLSL_VORONOI + `
      uniform float uTime, uR; uniform vec3 uC; varying vec3 vW;
      void main(){
        vec2 rel = vW.xz - uC.xz;
        float r = length(rel) / uR;
        // slow swirl of the whole lake surface
        float ang = uTime * 0.004 * (1.2 - r);
        vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * rel;
        vec2 p = q * 0.11;
        float warp = fbm2(p * 0.5 + uTime * 0.01);
        vec2 vo = voronoi2(p + (warp - 0.5) * 1.6 + vec2(vnoise(p * 1.7 + 3.0), vnoise(p * 1.7 + 9.0)) * 0.5, uTime * 0.08);
        float edge = vo.y - vo.x;
        float cw = 0.03 + 0.11 * vnoise(p * 0.9 + 4.0);
        float crack = 1.0 - smoothstep(0.0, cw, edge);
        vec2 vo2 = voronoi2(p * 2.7 + 7.0, uTime * 0.12);
        float crack2 = (1.0 - smoothstep(0.0, 0.04, vo2.y - vo2.x)) * 0.35 * smoothstep(0.45, 0.7, vnoise(p * 1.3 + 2.0));
        // molten upwellings that open and close
        float well = smoothstep(0.55, 0.8, fbm2(q * 0.035 + vec2(uTime * 0.02, -uTime * 0.015)));
        float coolRim = smoothstep(0.7, 1.0, r);
        float crust = clamp(1.0 - well * 1.3 + coolRim * 0.4, 0.0, 1.0);
        float heat = max(crack, crack2) * (1.0 - coolRim * 0.5);
        vec3 crustCol = mix(vec3(0.025, 0.018, 0.015), vec3(0.32, 0.04, 0.005), (1.0 - smoothstep(0.0, 0.35, edge)) * 0.6);
        vec3 molten = mix(vec3(3.2, 0.55, 0.05), vec3(9.0, 3.0, 0.45), vnoise(p * 3.0 - uTime * 0.05) * 0.6 + vnoise(p * 7.0 + uTime * 0.04) * 0.4);
        vec3 crackCol = mix(vec3(2.4, 0.35, 0.03), vec3(7.5, 2.2, 0.3), heat);
        vec3 col = mix(molten, crustCol, crust);
        col = mix(col, crackCol, heat * crust);
        col *= 0.85 + 0.15 * sin(uTime * 1.7 + warp * 6.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const lava = new THREE.Mesh(new THREE.CircleGeometry(V.crater * 0.95, 64), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(V.x, lavaY, V.z);
  group.add(lava);

  const glow = new THREE.PointLight(0xff5a1a, 9000, 160, 1.7);
  glow.position.set(V.x, lavaY + 25, V.z);
  group.add(glow);

  // Embers: tiny additive sparks. Smoke: noisy, sun-lit puffs, lit orange from below by the lava
  const spriteShader = (additive) => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uScale: { value: window.innerHeight },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uNight: { value: 0 },
    },
    vertexShader: `
      attribute vec4 aData; uniform float uTime; uniform float uScale; uniform vec3 uSunDir;
      varying float vA; varying float vH; varying float vSeed; varying vec3 vSunV; varying float vRot;
      void main(){
        float life = fract(aData.x + uTime * aData.y);
        vec3 p = position;
        ${additive
          ? 'p += vec3(sin(aData.z * 6.28) * life * 40.0, life * 160.0 - life * life * 120.0, cos(aData.z * 6.28) * life * 40.0);'
          : 'p += vec3(life * 120.0 + sin(life * 6.0 + aData.z * 6.28) * 18.0 * (0.3 + life), life * 420.0, life * 60.0 + cos(aData.z * 6.28) * 18.0 * (0.3 + life));'}
        vA = ${additive ? 'sin(life * 3.14159)' : 'smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.45, 1.0, life)) * 0.8'};
        ${additive ? 'vA *= 1.0 - smoothstep(150.0, 400.0, -(modelViewMatrix * vec4(p, 1.0)).z);' : ''}
        vH = life; vSeed = aData.z; vRot = aData.w * 6.2831 + life * (aData.z - 0.5) * 2.0;
        vSunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = ${additive ? 'min((1.0 + aData.w * 1.5) * uScale / -mv.z, 5.0)' : '(40.0 + life * 240.0) * (0.6 + aData.w) * uScale / -mv.z'};
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: GLSL_NOISE + `
      uniform vec3 uColor, uSunCol, uAmb; uniform float uNight;
      varying float vA; varying float vH; varying float vSeed; varying vec3 vSunV; varying float vRot;
      void main(){
        vec2 pc = gl_PointCoord - 0.5;
        float d = length(pc);
        ${additive
          ? 'float a = (1.0 - smoothstep(0.05, 0.5, d)) * vA; gl_FragColor = vec4(vec3(6.0, 2.0, 0.4), a);'
          : `
        vec2 rp = mat2(cos(vRot), -sin(vRot), sin(vRot), cos(vRot)) * pc;
        float n = vnoise(rp * 5.0 + vSeed * 37.0) * 0.6 + vnoise(rp * 11.0 + vSeed * 91.0) * 0.4;
        float shape = d + (n - 0.5) * 0.5;
        float a = (1.0 - smoothstep(0.12, 0.46, shape)) * vA;
        if (a < 0.003) discard;
        // fake sphere normal for sun shading (screen-space y is flipped in gl_PointCoord)
        vec3 nrm = normalize(vec3(pc.x, -pc.y, sqrt(max(0.0, 0.25 - d * d)) + 0.15) + (n - 0.5) * 0.6);
        float sun = clamp(dot(nrm, vSunV) * 0.6 + 0.45, 0.0, 1.0);
        vec3 c = uColor * (uAmb * 1.6 + uSunCol * sun * 0.32);
        // glow of the lava lake on the underside of young smoke
        float under = (1.0 - smoothstep(0.0, 0.35, vH)) * clamp(0.5 - pc.y * 1.6 + 0.5, 0.0, 1.5);
        c += vec3(0.8, 0.2, 0.04) * under * (0.15 + 0.45 * uNight);
        gl_FragColor = vec4(c, a * (0.35 + 0.6 * n));`}
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  const makePoints = (n, additive) => {
    const pos = new Float32Array(n * 3), data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * V.crater * 0.6;
      pos[i * 3] = V.x + Math.cos(a) * r; pos[i * 3 + 1] = lavaY + 2; pos[i * 3 + 2] = V.z + Math.sin(a) * r;
      data[i * 4] = Math.random(); data[i * 4 + 1] = additive ? 0.25 + Math.random() * 0.3 : 0.018 + Math.random() * 0.01;
      data[i * 4 + 2] = Math.random(); data[i * 4 + 3] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    const pts = new THREE.Points(g, spriteShader(additive));
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    return pts;
  };
  const smoke = makePoints(290, false);
  const embers = makePoints(220, true);
  group.add(smoke, embers);
  scene.add(group);

  function update(t, sky) {
    lavaMat.uniforms.uTime.value = t;
    smoke.material.uniforms.uTime.value = t;
    embers.material.uniforms.uTime.value = t;
    const day = sky.state.day;
    const su = smoke.material.uniforms;
    su.uColor.value.setRGB(0.42, 0.41, 0.4);
    su.uSunDir.value.copy(sky.state.lightDir);
    su.uSunCol.value.copy(sky.state.sunColor);
    su.uAmb.value.copy(sky.state.ambient);
    su.uNight.value = 1 - day;
    smoke.material.uniforms.uScale.value = embers.material.uniforms.uScale.value = window.innerHeight * 0.6;
    glow.intensity = 9000 * (0.85 + 0.15 * Math.sin(t * 2.3) * Math.sin(t * 0.7));
  }

  const inLava = (p) => Math.hypot(p.x - V.x, p.z - V.z) < V.crater * 0.9 && p.y < lavaY + 0.3;
  return { update, inLava, lavaY };
}
