// Ocean: directional swell + detail normals, depth-based absorption/scatter, sky + sun reflection,
// sun glitter, subsurface glow on wave crests and soft shoreline foam
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_TERRAIN } from './util.js';
import { WORLD_SIZE, SEG } from './world.js';

export function createWater(world) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uAmbient: { value: new THREE.Color() },
    uWorldSize: { value: WORLD_SIZE }, uSeg: { value: SEG }, uTerrainTex: { value: null }, uDay: { value: 1 },
  }]);
  uniforms.uTerrainTex.value = world.terrainTex;

  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uDay; uniform vec3 uSunDir, uSunColor, uSky, uHorizon, uAmbient;
      varying vec3 vW;
      ${GLSL_NOISE}
      ${GLSL_TERRAIN}
      #include <fog_pars_fragment>
      // Sum of directional sine swells: returns height derivative (dh/dx, dh/dz) and crest height
      vec3 swell(vec2 p, float amp){
        vec3 r = vec3(0.0);
        const int NW = 5;
        vec2 dirs[NW] = vec2[NW](vec2(0.86, 0.5), vec2(0.6, 0.8), vec2(0.98, -0.2), vec2(0.3, 0.95), vec2(-0.5, 0.86));
        float lens[NW] = float[NW](38.0, 23.0, 14.0, 8.5, 5.2);
        for (int i = 0; i < NW; i++){
          float k = 6.2831 / lens[i];
          float c = sqrt(9.81 / k);
          float a = amp * lens[i] * 0.012;
          float ph = dot(dirs[i], p) * k - uTime * c * k + float(i) * 1.7;
          // sharpened crest shape
          float s = sin(ph), co = cos(ph);
          float crest = pow(s * 0.5 + 0.5, 2.0);
          r.xy += dirs[i] * (a * k * co * (s * 0.5 + 0.5) * 2.0);
          r.z += crest * a;
        }
        return r;
      }
      float ripples(vec2 p){
        float t = uTime;
        return vnoise(p * 0.55 + vec2(t * 0.21, t * 0.13)) * 0.5
             + vnoise(p * 1.3 - vec2(t * 0.27, -t * 0.19)) * 0.3
             + vnoise(p * 3.1 + vec2(-t * 0.45, t * 0.38)) * 0.2;
      }
      void main(){
        vec2 p = vW.xz;
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec3 V = toCam / dist;

        float ground = terrainSample(p).r;
        float depth = max(0.0, -ground);
        float shoreCalm = smoothstep(0.0, 4.0, depth);

        // Normals: swell (fades with distance) + ripples (finite difference, near only)
        float far = smoothstep(60.0, 1200.0, dist);
        vec3 sw = swell(p, mix(1.0, 0.55, 1.0 - shoreCalm));
        vec2 grad = sw.xy * mix(1.0, 0.35, far);
        if (dist < 260.0) {
          float e = 0.12;
          float r0 = ripples(p), rx = ripples(p + vec2(e, 0.0)), rz = ripples(p + vec2(0.0, e));
          grad += vec2(rx - r0, rz - r0) / e * 0.22 * (1.0 - smoothstep(80.0, 260.0, dist));
        }
        vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
        float crest = sw.z;

        // Fresnel (Schlick, water F0 = 0.02)
        float NdV = max(dot(n, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        fres = mix(fres, 0.7, far * 0.35);

        // Water body: scattered light that grows with depth (seabed shows through alpha)
        vec3 shallowC = vec3(0.05, 0.42, 0.40), deepC = vec3(0.006, 0.05, 0.11);
        float deepK = 1.0 - exp(-depth * 0.09);
        vec3 body = mix(shallowC, deepC, deepK);
        float sunUp = max(uSunDir.y, 0.0);
        vec3 light = uAmbient * 1.5 + uSunColor * (0.15 + 0.3 * sunUp);
        body *= light;
        // Subsurface glow through wave crests when looking towards the sun
        float sss = pow(max(dot(V, -vec3(uSunDir.x, 0.0, uSunDir.z)), 0.0), 3.0) * crest * 2.2;
        body += vec3(0.05, 0.38, 0.32) * uSunColor * sss * 0.18;

        // Reflection: sky gradient + sun halo
        vec3 R = reflect(-V, n); R.y = abs(R.y);
        vec3 refl = mix(uHorizon, uSky, pow(clamp(R.y, 0.0, 1.0), 0.6));
        float halo = pow(max(dot(R, uSunDir), 0.0), 12.0);
        refl += uSunColor * halo * 0.08;
        vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));

        // Sun specular + glitter
        vec3 H = normalize(uSunDir + V);
        float NdH = max(dot(n, H), 0.0);
        float spec = pow(NdH, 2500.0) * 4.0 + pow(NdH, 220.0) * 0.08;
        float glit = 0.0;
        if (dist > 30.0 && dist < 450.0) {
          // tiny facets with jittered normals: sparkle where one happens to mirror the sun
          vec2 gp = floor(p * 5.0);
          vec2 j = vec2(hash12(gp + floor(uTime * 3.0 + hash12(gp) * 7.0)), hash12(gp.yx + 17.0)) - 0.5;
          vec3 ng = normalize(n + vec3(j.x, 0.0, j.y) * 0.22);
          vec2 cf = fract(p * 5.0) - 0.5;
          float dot2 = 1.0 - smoothstep(0.05, 0.3, length(cf));
          glit = pow(max(dot(ng, H), 0.0), 1500.0) * 3.0 * dot2 * smoothstep(30.0, 60.0, dist) * (1.0 - smoothstep(200.0, 450.0, dist));
        }
        col += uSunColor * (spec + glit) * smoothstep(-0.02, 0.06, uSunDir.y) * (0.15 + fres) * 2.0;

        // Shoreline foam: soft wash + receding bands, broken up by a foam texture
        float shore = 1.0 - smoothstep(0.0, 1.4, depth);
        float wave = sin(depth * 3.2 - uTime * 1.3 + vnoise(p * 0.15) * 4.0) * 0.5 + 0.5;
        float band = smoothstep(0.7, 0.95, wave) * (1.0 - smoothstep(0.4, 3.0, depth));
        float foamTex = vnoise(p * 1.4 + uTime * 0.15) * 0.6 + vnoise(p * 4.2 - uTime * 0.2) * 0.4;
        float foam = clamp(shore * 0.9 + band * 0.7, 0.0, 1.0) * smoothstep(0.32, 0.62, foamTex + shore * 0.3);
        foam = clamp(foam, 0.0, 1.0);
        vec3 foamCol = (uAmbient * 1.8 + uSunColor * (0.25 + 0.5 * sunUp)) * 0.9;
        col = mix(col, foamCol, foam);

        float alpha = 1.0 - exp(-depth * 0.55);
        alpha = mix(alpha, 1.0, fres);
        alpha = clamp(alpha, 0.0, 1.0) * smoothstep(0.0, 0.08, depth + 0.02);
        alpha = max(alpha, foam);
        alpha = mix(alpha, 1.0, smoothstep(200.0, 700.0, dist));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 0;

  function update(t, sky) {
    uniforms.uTime.value = t;
    uniforms.uSunDir.value.copy(sky.state.lightDir);
    uniforms.uSunColor.value.copy(sky.state.sunColor);
    uniforms.uSky.value.copy(sky.state.skyColor);
    uniforms.uHorizon.value.copy(sky.state.horizon);
    uniforms.uAmbient.value.copy(sky.state.ambient);
    uniforms.uDay.value = sky.state.day;
  }
  return { mesh, update };
}
