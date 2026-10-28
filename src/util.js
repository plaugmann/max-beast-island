// Small shared helpers (math, seeded random, GLSL snippets)

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
`;

// Samples the terrain data texture (R = height, G = grass, B = forest, A = snow)
export const GLSL_TERRAIN = /* glsl */ `
uniform sampler2D uTerrainTex; uniform float uWorldSize; uniform float uSeg;
vec4 terrainSample(vec2 xz){
  vec2 f = (xz + uWorldSize * 0.5) / uWorldSize * uSeg;
  if (f.x < 0.0 || f.y < 0.0 || f.x > uSeg || f.y > uSeg) return vec4(-40.0, 0.0, 0.0, 0.0);
  f = clamp(f, 0.0, uSeg - 0.001);
  ivec2 i = ivec2(floor(f)); vec2 t = fract(f);
  vec4 a = texelFetch(uTerrainTex, i, 0), b = texelFetch(uTerrainTex, i + ivec2(1, 0), 0);
  vec4 c = texelFetch(uTerrainTex, i + ivec2(0, 1), 0), d = texelFetch(uTerrainTex, i + ivec2(1, 1), 0);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
`;
