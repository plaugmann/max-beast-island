// Beast Island – step 2: the island + animals and cubes
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { generateWorld, FEATURES } from './world.js';
import { createTerrain } from './terrain.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createVegetation } from './vegetation.js';
import { createGrass } from './grass.js';
import { createVolcano } from './volcano.js';
import { createCave } from './cave.js';
import { createBusinessman, Player } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { createMap } from './map.js';
import { createSnow } from './snow.js';
import { nextFrame } from './util.js';
import { createAnimals } from './animals.js';
import { createCubes } from './cubes.js';
import { createAdmin } from './admin.js';
import { createShops } from './shops.js';
import { createBase } from './base.js';
import { createTutorial } from './tutorial.js';
import { createIntro } from './intro.js';
import { createNPCs } from './npcs.js';
import { loadSave, applySave, createSave } from './save.js';
import { RARITY } from './data.js';

const $ = (id) => document.getElementById(id);
const setProgress = async (pct, text) => {
  $('load-bar').style.width = pct + '%';
  $('load-text').textContent = text;
  await nextFrame(); await nextFrame();
};

async function main() {
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 16000);

  await setProgress(5, 'Raising the island from the sea...');
  const world = generateWorld(1337);

  await setProgress(35, 'Painting mountains, beaches and snow...');
  const terrain = createTerrain(world, renderer);
  scene.add(terrain.mesh);
  const sky = createSky(scene, renderer);
  const water = createWater(world);
  water.mesh.name = 'water';
  scene.add(water.mesh);

  await setProgress(55, 'Growing forests...');
  const veg = createVegetation(world, scene);
  const grass = createGrass(world);
  grass.mesh.name = 'grass';
  scene.add(grass.mesh);

  await setProgress(75, 'Waking up the volcano...');
  const volcano = createVolcano(world, scene);
  const cave = createCave(world, scene);
  const snow = createSnow();
  scene.add(snow.mesh);

  await setProgress(88, 'Ironing the suit...');
  const model = createBusinessman();
  scene.add(model.root);
  const player = new Player(world, model, {
    colliders: veg.nearbyColliders, cave, volcano, onRespawn: (msg) => toast(msg),
  });
  const camCtl = new ThirdPersonCamera(camera, canvas, (p) => p.y < world.heightAt(p.x, p.z) + 0.4 || cave.camBlocked(p));
  const map = createMap(world, $('map-canvas'));

  await setProgress(92, 'Releasing the animals...');
  await document.fonts.load('40px "Lilita One"').catch(() => {});
  const animals = createAnimals(scene, world, {
    onSpawn: (a) => { if (RARITY[a.rarity].index >= 4 && performance.now() - lastToast > 3500) toast(`A ${a.rarity} ${a.name} appeared nearby!`); },
  });
  const cubes = createCubes(scene, world, animals, { player, camera, toast });

  // Shared handle for gameplay modules (base, shops, tutorial, admin panel).
  // panels: names of open UI panels (mouse is free, no throwing). onFrame: per-frame callbacks (dt, elapsed).
  // onKey: keydown callbacks (e) → return true to swallow the key.
  const game = { world, scene, camera, camCtl, player, sky, animals, cubes, toast, input: null, panels: new Set(), onFrame: [], onKey: [] };
  window.game = game;
  // Gameplay: save → shops (+ shared UI) → base → tutorial
  game.map = map;
  game.model = model;
  const saved = loadSave();
  applySave(game, saved);
  createShops(game);
  createBase(game, saved);
  createTutorial(game, saved);
  createNPCs(game);
  createSave(game);
  createAdmin(game); // P = admin panel (testing only)

  // Post-processing: HDR + MSAA, soft bloom on lava, crystals and the sun
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new THREE.Vector2(window.innerWidth, window.innerHeight);
  const qb = new URLSearchParams(location.search);
  composer.addPass(new UnrealBloomPass(bloom, +(qb.get('bs') ?? 0.5), 0.6, +(qb.get('bt') ?? 4.0)));
  composer.addPass(new OutputPass());
  const intro = createIntro(game, renderPass); // cutscene after PLAY

  await setProgress(96, 'Compiling shaders...');
  sky.update(0, 0, player.pos, camera);
  camCtl.update(1, player.pos);
  renderer.compile(scene, camera);
  await setProgress(100, 'Ready!');

  // ---------- Input ----------
  const input = { forward: false, back: false, left: false, right: false, sprint: false, jump: false };
  game.input = input;
  const keymap = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump',
  };
  let mapOpen = false, invOpen = false;
  const setMap = (open) => {
    if (open && invOpen) setInv(false);
    mapOpen = open;
    $('map').classList.toggle('show', open);
    camCtl.enabled = !open;
  };
  const setInv = (open) => {
    if (open && mapOpen) setMap(false);
    invOpen = open;
    $('inventory').classList.toggle('show', open);
    camCtl.enabled = !open;
    if (open) { cubes.renderInventory(); document.exitPointerLock?.(); }
    else if ($('loading').classList.contains('gone')) canvas.requestPointerLock();
  };
  window.addEventListener('keydown', (e) => {
    if (game.onKey.some((f) => f(e))) return;
    if (keymap[e.code]) { input[keymap[e.code]] = true; e.preventDefault(); }
    if (e.code === 'KeyQ' && !e.repeat) setMap(!mapOpen);
    if (e.code === 'KeyH' && !e.repeat) $('help').classList.toggle('hidden');
    if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat && $('loading').classList.contains('gone')) setInv(!invOpen); }
    if (e.code === 'Escape' && invOpen) setInv(false);
    if (/^Digit[1-6]$/.test(e.code)) cubes.select(+e.code[5] - 1);
  });
  window.addEventListener('keyup', (e) => { if (keymap[e.code]) input[keymap[e.code]] = false; });
  window.addEventListener('blur', () => { for (const k in input) input[k] = false; });

  $('play').addEventListener('click', () => {
    canvas.requestPointerLock();
    intro.play(() => {
      $('loading').classList.add('gone');
      $('hud').classList.remove('hidden');
      setTimeout(() => toast('You crash-landed on Beast Island! Press Q for the map'), 900);
    });
  });
  canvas.addEventListener('click', () => { if (!mapOpen && !invOpen && !game.panels.size) canvas.requestPointerLock(); });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement === canvas && !mapOpen && !invOpen && !game.panels.size) cubes.throwCube();
  });
  document.addEventListener('pointerlockchange', () => {
    $('lock-hint').classList.toggle('show', document.pointerLockElement !== canvas && $('loading').classList.contains('gone') && !invOpen);
  });
  $('play').disabled = false;
  $('play').textContent = 'PLAY';

  // Dev shortcuts, e.g. ?autoplay&x=400&z=300&yaw=1&pitch=0.3&dist=12&time=0.5
  const qs = new URLSearchParams(location.search);
  if (qs.has('autoplay')) { $('loading').classList.add('gone'); $('hud').classList.remove('hidden'); }
  if (qs.has('x')) { player.pos.set(+qs.get('x'), world.heightAt(+qs.get('x'), +qs.get('z')), +qs.get('z')); }
  if (qs.has('yaw')) camCtl.yaw = +qs.get('yaw');
  if (qs.has('pitch')) camCtl.pitch = +qs.get('pitch');
  if (qs.has('dist')) camCtl.wantDist = camCtl.dist = camCtl.curDist = +qs.get('dist');
  if (qs.has('time')) sky.state.time = +qs.get('time');
  if (qs.has('map')) setMap(true);
  if (qs.has('autoplay')) window.BI = { animals, cubes, player, camCtl, camera, setInv };
  if (qs.has('off')) {
    const off = qs.get('off').split(',');
    scene.traverse((o) => {
      const kind = o.isInstancedMesh ? 'veg' : o.isPoints ? 'points' : o.isLight ? 'light' : o.material?.type ?? '';
      if (off.includes(kind) || off.includes(o.name)) o.visible = false;
    });
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- HUD ----------
  let toastTimer = 0, lastToast = 0;
  function toast(msg) {
    lastToast = performance.now();
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  let lastZone = '', zoneTimer = 0;
  function showZone(name) {
    $('zone').textContent = name;
    const big = $('zone-banner');
    big.textContent = name; big.classList.remove('show'); void big.offsetWidth; big.classList.add('show');
    clearTimeout(zoneTimer); zoneTimer = setTimeout(() => big.classList.remove('show'), 2600);
  }
  function clockText(t) {
    const mins = Math.floor(t * 24 * 60), h = Math.floor(mins / 60), m = mins % 60;
    const icon = t > 0.25 && t < 0.75 ? '☀️' : '🌙';
    return `${icon} ${String(h).padStart(2, '0')}:${String(m - (m % 5)).padStart(2, '0')}`;
  }

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let elapsed = 0, hudTimer = 0, fpsFrames = 0, fpsTime = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const playing = $('loading').classList.contains('gone') && !mapOpen && !invOpen && !game.panels.size;
    player.update(dt, playing ? input : {}, camCtl.yaw);
    if (intro.active) intro.update(dt); else camCtl.update(dt, player.pos);
    animals.update(dt, elapsed, player.pos, camera);
    for (const f of game.onFrame) f(dt, elapsed);
    cubes.update(dt);
    sky.update(dt, elapsed, intro.active ? intro.focus : player.pos, camera);
    terrain.update(elapsed);
    water.update(elapsed, sky);
    grass.update(elapsed, player.pos, sky);
    veg.update(elapsed);
    volcano.update(elapsed, sky);
    cave.update(elapsed);
    const iceSnow = Math.hypot(player.pos.x - FEATURES.ice.x, player.pos.z - FEATURES.ice.z) < FEATURES.ice.r * 0.95 && player.pos.y > 25 ? 1 : 0;
    snow.update(elapsed, dt, camera.position, iceSnow, 0.4 + 0.8 * sky.state.day);

    composer.render();

    if (mapOpen) map.draw(player, camCtl.yaw);
    hudTimer += dt;
    if (hudTimer > 0.25) {
      hudTimer = 0;
      const zone = world.zoneAt(player.pos.x, player.pos.z, player.inCave);
      if (zone !== lastZone) { lastZone = zone; showZone(zone); }
      $('clock').textContent = clockText(sky.state.time);
    }
    fpsFrames++; fpsTime += dt;
    if (fpsTime > 1) { $('fps').textContent = Math.round(fpsFrames / fpsTime) + ' FPS'; fpsFrames = 0; fpsTime = 0; }
    requestAnimationFrame(frame);
  }
  frame();
}

main().catch((err) => {
  console.error(err);
  $('load-text').textContent = 'Something went wrong: ' + err.message;
});
