// Falling snow around the camera, only visible up on the ice mountain
import * as THREE from 'three';

export function createSnow(count = 6000, box = 60) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) pos[i] = Math.random() * box;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uOpacity: { value: 0 }, uLight: { value: 1 } },
    vertexShader: `uniform float uTime, uBox; uniform vec3 uCam; varying float vA;
      void main(){
        vec3 p = position;
        p.y -= uTime * (2.0 + fract(position.x * 7.1) * 1.5);
        p.x += sin(uTime * 0.7 + position.z) * 1.5; p.z += cos(uTime * 0.5 + position.x) * 1.5;
        p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = 1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(mv.xyz));
        gl_PointSize = (3.0 + fract(position.y * 3.3) * 4.0) * 30.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uOpacity, uLight; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(uLight), (1.0 - smoothstep(0.1, 0.5, d)) * vA * uOpacity); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let amount = 0;
  return {
    mesh: points,
    update(t, dt, camPos, want, light) {
      amount += (want - amount) * Math.min(1, dt * 0.8);
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCam.value.copy(camPos);
      mat.uniforms.uOpacity.value = amount * 0.9;
      mat.uniforms.uLight.value = light;
      points.visible = amount > 0.01;
    },
  };
}
