// Terrain mesh: biome vertex colours + procedural texture splatting (grass, dirt, sand, rock, snow, ash),
// height-blended layers, triplanar rock on cliffs, underwater absorption + caustics, wet shoreline
// and glowing crusted lava rivers.
import * as THREE from 'three';
import { WORLD_SIZE, SEG, FEATURES } from './world.js';
import { GLSL_NOISE, smoothstep, clamp } from './util.js';
import { createTerrainTextures, GLSL_VORONOI } from './terrainTextures.js';
import { NIGHT_UNIFORM } from './sky.js';

// Per-vertex material weights derived from the same rules world.js uses for the biome colours
function computeWeights(world) {
  const { N, heights, normals, tex, half, cell } = world;
  const F = FEATURES;
  const wA = new Float32Array(N * N * 4), wB = new Float32Array(N * N * 2);
  for (let iz = 0; iz < N; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + ix * cell;
      const i = iz * N + ix;
      const h = heights[i], slope = 1 - normals[i * 3 + 1];
      const forest = tex[i * 4 + 2], snowW = tex[i * 4 + 3];
      const iceW = Math.max(
        1 - smoothstep(0.85, 1.15, Math.hypot(x - F.ice.x, z - F.ice.z) / F.ice.r),
        1 - smoothstep(0.8, 1.1, Math.hypot(x - F.ice2.x, z - F.ice2.z) / F.ice2.r));
      const volW = 1 - smoothstep(0.75, 1.02, Math.hypot(x - F.volcano.x, z - F.volcano.z) / F.volcano.r);
      const snow = clamp(snowW + iceW * smoothstep(0.42, 0.65, slope) * smoothstep(30, 60, h) * 0.8, 0, 1);
      const ash = volW * smoothstep(2, 14, h) * (1 - snow);
      const rockW = Math.max(smoothstep(0.26, 0.48, slope), smoothstep(70, 120, h) * (1 - iceW) * 0.75);
      const rock = rockW * (1 - snow) * (1 - ash * 0.55);
      const sand = smoothstep(3.6, 1.5, h) * (1 - rock) * (1 - snow) * (1 - ash);
      const rest = Math.max(0, 1 - snow - ash - rock - sand);
      const dirt = rest * clamp(forest * 0.85 + smoothstep(0.18, 0.3, slope) * 0.5, 0, 1);
      const grass = rest - dirt;
      wA[i * 4] = grass; wA[i * 4 + 1] = dirt; wA[i * 4 + 2] = sand; wA[i * 4 + 3] = rock;
      wB[i * 2] = snow; wB[i * 2 + 1] = ash;
    }
  }
  return { wA, wB };
}

export function createTerrain(world, renderer) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, world.heights[i]);
  geo.setAttribute('normal', new THREE.BufferAttribute(world.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(world.colors, 3));
  geo.setAttribute('lava', new THREE.BufferAttribute(world.lava, 1));
  const { wA, wB } = computeWeights(world);
  geo.setAttribute('matA', new THREE.BufferAttribute(wA, 4));
  geo.setAttribute('matB', new THREE.BufferAttribute(wB, 2));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const texs = createTerrainTextures(renderer);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  const uniforms = { uNightK: NIGHT_UNIFORM, uTime: { value: 0 }, uVolc: { value: new THREE.Vector2(FEATURES.volcano.x, FEATURES.volcano.z) }, uAlb: { value: texs.albedo }, uNrm: { value: texs.normal } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float lava; attribute vec4 matA; attribute vec2 matB;
        varying float vLava; varying vec3 vWPos; varying vec3 vWN; varying vec4 vMatA; varying vec2 vMatB;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLava = lava; vMatA = matA; vMatB = matB; vWN = normal;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uNightK; uniform vec2 uVolc; uniform sampler2DArray uAlb; uniform sampler2DArray uNrm;
        varying float vLava; varying vec3 vWPos; varying vec3 vWN; varying vec4 vMatA; varying vec2 vMatB;
        ${GLSL_NOISE}
        ${GLSL_VORONOI}
        // Two differently scaled/rotated taps hide tiling; mix ratio wanders across the world
        vec4 tapAlb(vec2 uv, float L, float k){
          vec4 a = texture(uAlb, vec3(uv, L));
          vec4 b = texture(uAlb, vec3(mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.37 + 0.31, L));
          return mix(a, b, k);
        }
        vec3 tapNrm(vec2 uv, float L){ return texture(uNrm, vec3(uv, L)).xyz * 2.0 - 1.0; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float camDist = length(cameraPosition - vWPos);
        vec3 nGeo = normalize(vWN);
        float W[6]; W[0] = vMatA.x; W[1] = vMatA.y; W[2] = vMatA.z; W[3] = vMatA.w; W[4] = vMatB.x; W[5] = vMatB.y;
        float wsum = W[0] + W[1] + W[2] + W[3] + W[4] + W[5] + 1e-4;
        const float SCL[6] = float[6](0.22, 0.3, 0.25, 0.11, 0.14, 0.24);
        float mixK = clamp(vnoise(vWPos.xz * 0.013) * 1.2 - 0.1, 0.15, 0.85);
        vec3 tint = vec3(0.5); vec3 nPert = vec3(0.0); float roughMod = 0.0;
        float detailFade = 1.0 - smoothstep(350.0, 700.0, camDist);
        // triplanar weights for rock on cliffs
        vec3 tw = pow(abs(nGeo), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        if (detailFade > 0.0) {
          vec4 A[6]; float hb[6]; float hmax = -1.0;
          for (int L = 0; L < 6; L++) {
            float w = clamp(W[L] / wsum, 0.0, 1.0);
            hb[L] = -1.0; A[L] = vec4(0.5, 0.5, 0.5, 0.0);
            if (w < 0.01) continue;
            float fL = float(L);
            vec4 a;
            if (L == 3 && tw.y < 0.92) {
              a = tapAlb(vWPos.zy * SCL[3], fL, mixK) * tw.x + tapAlb(vWPos.xy * SCL[3], fL, mixK) * tw.z + tapAlb(vWPos.xz * SCL[3], fL, mixK) * tw.y;
            } else {
              a = tapAlb(vWPos.xz * SCL[L], fL, mixK);
            }
            A[L] = a;
            hb[L] = a.a + w * 1.6;
            hmax = max(hmax, hb[L]);
          }
          float bsum = 0.0; vec4 acc = vec4(0.0); vec4 bw4 = vec4(0.0); vec2 bw2 = vec2(0.0);
          for (int L = 0; L < 6; L++) {
            float b = max(hb[L] - hmax + 0.35, 0.0);
            if (hb[L] < 0.0) b = 0.0;
            bsum += b;
            acc += A[L] * b;
            if (b > 0.0) {
              float fL = float(L);
              vec3 tn;
              vec3 pw;
              if (L == 3 && tw.y < 0.92) {
                vec3 t1 = tapNrm(vWPos.zy * SCL[3], fL), t2 = tapNrm(vWPos.xy * SCL[3], fL), t3 = tapNrm(vWPos.xz * SCL[3], fL);
                pw = vec3(0.0, t1.y, t1.x) * tw.x + vec3(t2.x, t2.y, 0.0) * tw.z + vec3(t3.x, 0.0, t3.y) * tw.y;
                roughMod += b * (texture(uNrm, vec3(vWPos.xz * SCL[3], fL)).a - 0.5);
              } else {
                vec4 nr = texture(uNrm, vec3(vWPos.xz * SCL[L], fL));
                tn = nr.xyz * 2.0 - 1.0;
                pw = vec3(tn.x, 0.0, tn.y);
                roughMod += b * (nr.a - 0.5);
              }
              nPert += pw * b;
            }
          }
          if (bsum > 0.0) {
            vec4 t4 = acc / bsum;
            tint = mix(vec3(0.5), t4.rgb, detailFade);
            nPert *= detailFade / bsum;
            roughMod /= bsum;
          }
        }
        float nA = vnoise(vWPos.xz * 0.045), nB = vnoise(vWPos.xz * 0.29);
        diffuseColor.rgb *= 0.86 + 0.2 * nA + 0.08 * nB;
        diffuseColor.rgb *= clamp(tint * 2.0, 0.0, 1.8);
        // lift the near-black basalt a little so the volcano reads as a surface (esp. at night)
        float ashW = clamp(W[5] / wsum, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3 + vec3(0.022, 0.019, 0.017), ashW);
        // wet sand at the waterline
        float wet = (1.0 - smoothstep(0.05, 1.1, vWPos.y)) * step(-0.6, vWPos.y);
        diffuseColor.rgb *= 1.0 - 0.35 * wet;
        // underwater: absorption with depth + animated caustics
        float depthW = max(0.0, -vWPos.y);
        if (depthW > 0.0) {
          diffuseColor.rgb *= exp(-depthW * vec3(0.32, 0.085, 0.06));
          if (camDist < 220.0 && depthW < 9.0) {
            vec2 cp = vWPos.xz * 0.42;
            vec2 v1 = voronoi2(cp + vec2(uTime * 0.11, uTime * 0.05), uTime * 0.9);
            vec2 v2 = voronoi2(cp * 1.37 + vec2(-uTime * 0.08, uTime * 0.1) + 3.1, uTime * 1.1 + 2.0);
            float c1 = 1.0 - smoothstep(0.0, 0.12, v1.y - v1.x);
            float c2 = 1.0 - smoothstep(0.0, 0.14, v2.y - v2.x);
            float caust = min(c1 + c2, 1.4) * smoothstep(0.0, 0.5, depthW) * (1.0 - smoothstep(4.0, 9.0, depthW)) * (1.0 - smoothstep(120.0, 220.0, camDist));
            diffuseColor.rgb *= 1.0 + caust * 1.6;
          }
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.017, 0.012), vLava * 0.9);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          float rL = (W[0] * 0.95 + W[1] * 0.93 + W[2] * 0.86 + W[3] * 0.78 + W[4] * 0.5 + W[5] * 0.88) / wsum;
          roughnessFactor = clamp(rL + roughMod * 0.5, 0.3, 1.0);
          roughnessFactor = mix(roughnessFactor, 0.3, wet);
          if (depthW > 0.0) roughnessFactor = 0.6;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float nStr = 0.85 * (1.0 - wet * 0.6);
          vec3 nW = normalize(nGeo + nPert * nStr);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // faint warm bounce from the lava lake / glowing plume on the volcano's upper slopes
        {
          float dv = length(vWPos.xz - uVolc.xy);
          totalEmissiveRadiance += vec3(0.024, 0.008, 0.003) * ashW * (1.0 - smoothstep(60.0, 300.0, dv)) * smoothstep(20.0, 120.0, vWPos.y);
        }
        if (vLava > 0.02) {
          float lv = smoothstep(0.25, 0.6, vLava + (vnoise(vWPos.xz * 0.35) - 0.5) * 0.35 + (vnoise(vWPos.xz * 1.3) - 0.5) * 0.12);
          vec2 lp = vWPos.xz * 0.16 + vec2(uTime * 0.05, uTime * 0.03);
          vec2 cr = voronoi2(lp, uTime * 0.25);
          float edge = 1.0 - smoothstep(0.0, 0.16, cr.y - cr.x);
          float flow = vnoise(vWPos.xz * 0.09 + vec2(uTime * 0.12, uTime * 0.07));
          float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + vWPos.x * 0.05 + vWPos.z * 0.04);
          float hot = lv * (0.18 + 0.82 * max(edge, smoothstep(0.55, 0.9, flow) * 0.8)) * pulse;
          vec3 lavaCol = mix(vec3(1.6, 0.18, 0.02), vec3(6.0, 1.7, 0.25), clamp(hot * 1.2, 0.0, 1.0));
          totalEmissiveRadiance += lavaCol * hot;
          // dull red heat around the rim (no bloom)
          totalEmissiveRadiance += vec3(0.35, 0.06, 0.01) * smoothstep(0.02, 0.3, vLava) * (1.0 - lv);
        }`)
      .replace('#include <tonemapping_fragment>', `
        if (vLava < 0.05) {
        // moonlight: low-light vision is desaturated and bluish (Purkinje shift)
        { float lum = dot(gl_FragColor.rgb, vec3(0.25, 0.65, 0.1));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, lum * vec3(0.72, 0.9, 1.45), uNightK * 0.7); }
        }
        #include <tonemapping_fragment>`);
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return { mesh, update: (t) => { uniforms.uTime.value = t; } };
}
