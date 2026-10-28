// NPCs you can talk to (E): a castaway, the professor, an ancient turtle and a secret crystal in Crystal Cave.
// They tell the island's story: people lived here before you and built the Cube Shop, the cubes are old tech,
// and the animals get their powers from the Great Beast God somewhere up there.
import * as THREE from 'three';
import { FEATURES } from './world.js';
import { createBusinessman } from './player.js';

const $ = (id) => document.getElementById(id);
const S = FEATURES.spawn, CV = FEATURES.cave;

const NPCS = [
  {
    id: 'barnaby', name: 'Barnaby the Castaway', color: '#ffd28a', kind: 'human', x: -31, z: 163, hat: true,
    look: { suit: 0xb59a6a, shirt: 0xd8cfb8, tie: 0x6b8a3a, hair: 0xa8a49c },
    lines: [
      'Whoa! Another one fell out of the sky? You\'re lucky to be alive, kid.',
      'Name\'s Barnaby. My boat sank here... about thirty years ago. Or was it three? I stopped counting.',
      'Listen. You\'re not the first people on this island. Long before us, there were others.',
      'They built that Cube Shop over there. Nobody knows who they were... or where they went.',
      'But they left their cubes behind. Go talk to the Professor next to the shop – that one knows all about them.',
    ],
    again: [
      'Still here? Go catch some animals!',
      'Thirty years on this island and I still haven\'t caught a Unicorn. Don\'t be like me.',
      'The people who were here before... sometimes I think they\'re still watching.',
    ],
  },
  {
    id: 'professor', name: 'Professor Ada Volt', color: '#8fe3ff', kind: 'human', x: -33, z: 158, glasses: true,
    look: { suit: 0xeef0f2, shirt: 0x9fc8e8, tie: 0x2456a8, hair: 0x2a1a12 },
    lines: [
      'Ah, a new arrival! Fascinating. Please don\'t touch anything. Except the cubes. DO touch the cubes.',
      'These cubes are made of OLD tech. Ancient technology – far older than anything we know how to build.',
      'Throw one at an animal and – ZAP! – it\'s inside. I have studied them for years and I still have no idea how.',
      'The people who lived here before us built this shop. It still makes new cubes all by itself. Better cubes catch rarer animals.',
      'And the animals here are not normal animals. Their powers come from somewhere... Ask the old turtle. It has been here longer than anyone.',
    ],
    again: [
      'Rusty cubes are cheap, Master Cubes are... not. Science is expensive.',
      'If you find any more old tech, bring it to me! For science!',
      'Hypothesis: the cubes are older than the island itself. Conclusion: wow.',
    ],
  },
  {
    id: 'shell', name: 'Grandpa Shell', color: '#9be36b', kind: 'turtle', x: -19, z: 178,
    lines: [
      'Hmmmm... a young one. Sit down... slowly... I am... in no hurry.',
      'I have lived on this island... for nine hundred years. Give or take... a Tuesday.',
      'The animals here... are special. Fire foxes... thunder hawks... unicorns. Do you know... where their power comes from?',
      'From the Great Beast God. The biggest... and the oldest... of all the animals.',
      'It lives... somewhere up there. Nobody has ever seen it... and come back to tell about it.',
      'Now go... catch animals... I will be... right here. Obviously.',
    ],
    again: [
      'Hmmm... still... here...? Me too.',
      'The Great Beast God... is watching... somewhere... up there.',
      'Slow and steady... catches... the Rabbit. Probably.',
    ],
  },
  {
    id: 'crystal', name: 'The Secret Crystal', color: '#d6a8ff', kind: 'crystal', x: CV.x, z: CV.z,
    lines: [
      '...',
      'Oh! Hello. You found me. I am... THE SECRET CRYSTAL.',
      'I know a very, very important secret. Are you ready?',
      '...',
      'The secret is: I am a crystal.',
      'Here, have one dollar. Don\'t spend it all at once.',
    ],
    again: [
      'Fun fact: if you walk backwards, you are still walking.',
      'I have been in this cave for 10,000 years. Nothing has happened. It was great.',
      'Rocks are just very slow animals. Probably.',
      'I once saw a frog. It was green. The end.',
      'Your briefcase is empty. I checked.',
      'Shhh. I am glowing. It takes a lot of concentration.',
      'Press E to talk to me. Oh wait. You already did.',
      'The Great Beast God? Never heard of it. I only know about rocks. Mostly me.',
      'Did you know? The sky is up. You\'re welcome.',
      'I can count to three. One. Two. Purple.',
    ],
    onFirstEnd: (game) => game.addMoney(1),
  },
];

// ---------- Models ----------
function strawHat() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9b56a, roughness: 0.9 });
  const g = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.012, 28), mat); brim.position.y = 0.075;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.088, 0.09, 24), mat); crown.position.y = 0.12;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.089, 0.089, 0.022, 24), new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 }));
  band.position.y = 0.088;
  g.add(brim, crown, band); g.rotation.x = -0.12; g.position.z = -0.01;
  g.traverse((o) => { o.castShadow = true; });
  return g;
}
function glasses() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.6 });
  const g = new THREE.Group();
  for (const x of [-0.031, 0.031]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 20), mat); r.position.set(x, 0.012, 0.106); g.add(r); }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.004), mat); bridge.position.set(0, 0.016, 0.108); g.add(bridge);
  return g;
}
function crystalModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xd6a8ff, emissive: 0x8a3cff, emissiveIntensity: 2.2, roughness: 0.15, transparent: true, opacity: 0.93 }));
  body.scale.set(0.9, 1.8, 0.9); body.rotation.y = Math.PI / 4; // a flat face points forwards (+z)
  const dark = new THREE.MeshBasicMaterial({ color: 0x14061f });
  const eyes = [-0.17, 0.17].map((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), dark); e.position.set(x, 0.32, 0.56); e.scale.z = 0.5; return e; });
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), dark); mouth.position.set(0, -0.05, 0.66); mouth.scale.set(1, 0.25, 0.4);
  const light = new THREE.PointLight(0xb070ff, 60, 18, 1.6); light.position.y = 0.5;
  g.add(body, ...eyes, mouth, light);
  return { root: g, eyes, mouth };
}
function nameTag(text, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const g = cv.getContext('2d');
  g.font = '56px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = 'rgba(10,16,28,0.9)'; g.strokeText(text, 256, 50);
  g.fillStyle = color; g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.set(2.6, 0.49, 1); s.center.set(0.5, 0); s.renderOrder = 5;
  return s;
}
const angTo = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createNPCs(game) {
  const { scene, world, player, animals, camera, camCtl } = game;
  const talkCam = new THREE.Vector3(), talkLook = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
  const box = $('talk'), who = box.querySelector('.who'), txt = box.querySelector('.txt');
  const talked = new Set();
  let talk = null; // { npc, lines, i, chars }

  const npcs = NPCS.map((def) => {
    const y = def.kind === 'crystal' ? world.caveFloor : world.heightAt(def.x, def.z);
    const n = { def, pos: new THREE.Vector3(def.x, y, def.z), home: Math.atan2(S.x - def.x, S.z - def.z), face: 0, seed: Math.random() * 10, lastAgain: -1 };
    n.face = n.home;
    let tagY = 2.05; n.headY = 1.6;
    if (def.kind === 'human') {
      n.model = createBusinessman(def.look);
      n.model.briefcase.visible = false;
      if (def.hat) n.model.head.add(strawHat());
      if (def.glasses) n.model.head.add(glasses());
      n.root = n.model.root;
      game.addBoxCollider(def.x, def.z, 0.35, 0.35);
    } else if (def.kind === 'turtle') {
      // Same model as the wild Moss Turtle, but bigger, older and not catchable
      const a = animals.create('Moss Turtle', 'Epic', def.x, def.z, true);
      animals.list.splice(animals.list.indexOf(a), 1);
      a.label.visible = false; a.ring.visible = false;
      a.root.scale.setScalar(1.5 / a.tpl.radius);
      n.root = a.root; n.root.rotation.set(0, 0, 0); a.model.rotation.set(0, 0, 0);
      tagY = 2.4; n.headY = 0.9;
      game.addBoxCollider(def.x, def.z, 1.3, 1.3);
    } else {
      n.crystal = crystalModel();
      n.root = n.crystal.root;
      n.face = n.home = Math.atan2(S.x - CV.x, S.z - CV.z); // looks at the cave entrance
      tagY = 3.4; n.headY = 2.1;
      game.addBoxCollider(def.x, def.z, 0.9, 0.9);
    }
    n.root.position.copy(n.pos);
    if (n.root.parent !== scene) scene.add(n.root);
    n.tag = nameTag(def.kind === 'crystal' ? '???' : def.name, def.color);
    n.tag.position.set(def.x, y + tagY, def.z);
    scene.add(n.tag);
    game.addInteract({ pos: n.pos, r: def.kind === 'human' ? 3.5 : 4, h: tagY - 0.2, label: () => (talk ? null : `Talk to ${def.kind === 'crystal' && !talked.has(def.id) ? '???' : def.name}`), action: () => startTalk(n) });
    return n;
  });

  // ---------- Talking ----------
  function startTalk(n) {
    const d = n.def;
    let lines = d.lines;
    if (talked.has(d.id)) { // later visits: one short line (never the same twice in a row)
      let k; do { k = Math.floor(Math.random() * d.again.length); } while (d.again.length > 1 && k === n.lastAgain);
      n.lastAgain = k; lines = [d.again[k]];
    }
    talk = { npc: n, lines, i: 0, chars: 0, first: !talked.has(d.id) };
    game.panels.add('talk');
    player.facing = Math.atan2(n.pos.x - player.pos.x, n.pos.z - player.pos.z);
    camCtl.yaw = player.facing + Math.PI; // so the normal camera ends up behind the player afterwards
    talkCam.copy(camera.position); talkLook.copy(n.pos).y += n.headY - 0.5;
    who.textContent = d.name; who.style.color = d.color;
    if (d.kind === 'crystal') { scene.remove(n.tag); n.tag = nameTag(d.name, d.color); n.tag.position.set(d.x, n.pos.y + 3.4, d.z); scene.add(n.tag); }
    box.classList.add('show');
  }
  function advance() {
    const line = talk.lines[talk.i];
    if (talk.chars < line.length) { talk.chars = line.length; return; }
    if (++talk.i < talk.lines.length) { talk.chars = 0; return; }
    endTalk(true);
  }
  // finished = listened to the last line (Esc stops early: the story starts over next time)
  function endTalk(finished) {
    const { npc, first } = talk;
    talk = null;
    game.panels.delete('talk');
    box.classList.remove('show');
    if (!finished) return;
    talked.add(npc.def.id);
    if (first) npc.def.onFirstEnd?.(game);
  }
  game.onKey.unshift((e) => {
    if (!talk) return false;
    if (!e.repeat && ['KeyE', 'Space', 'Enter'].includes(e.code)) advance();
    else if (e.code === 'Escape') endTalk(false);
    return true;
  });
  addEventListener('mousedown', (e) => { if (talk && e.button === 0) advance(); });

  // ---------- Per frame: typewriter text, face the player, idle animation ----------
  game.onFrame.push((dt, t) => {
    if (talk) {
      const line = talk.lines[talk.i];
      talk.chars = Math.min(line.length, talk.chars + dt * 48);
      txt.textContent = line.slice(0, Math.floor(talk.chars));
      box.classList.toggle('done', talk.chars >= line.length);
      // Over-the-shoulder camera looking at whoever is talking
      const n = talk.npc, k = 1 - Math.exp(-5 * dt);
      _d.set(player.pos.x - n.pos.x, 0, player.pos.z - n.pos.z).normalize();
      _c.copy(player.pos).addScaledVector(_d, 2.3).add(new THREE.Vector3(_d.z, 0, -_d.x).multiplyScalar(1.1));
      _c.y = Math.max(player.pos.y + 1.9, world.heightAt(_c.x, _c.z) + 0.6);
      talkCam.lerp(_c, k);
      talkLook.lerp(_c.copy(n.root.position).setY(n.pos.y + n.headY - 0.5), k); // aim a bit low so they sit above the text box
      camera.position.copy(talkCam); camera.lookAt(talkLook);
    }
    for (const n of npcs) {
      const dx = player.pos.x - n.pos.x, dz = player.pos.z - n.pos.z, d = Math.hypot(dx, dz);
      const speaking = talk?.npc === n && talk.chars < talk.lines[talk.i].length;
      const want = d < 10 ? Math.atan2(dx, dz) : n.home;
      n.face += (angTo(n.face, want) - n.face) * (1 - Math.exp(-4 * dt));
      n.root.rotation.y = n.face;
      n.tag.visible = d < 22;
      if (n.model) poseHuman(n.model, t + n.seed, speaking, talk?.npc === n);
      else if (n.crystal) {
        n.root.position.y = n.pos.y + 2 + Math.sin(t * 1.4) * 0.25;
        n.crystal.mouth.scale.y = speaking ? 0.25 + Math.abs(Math.sin(t * 14)) * 0.8 : 0.25;
        const blink = Math.sin(t * 0.9 + 1) > 0.97 ? 0.15 : 1;
        for (const e of n.crystal.eyes) e.scale.y = blink;
      } else {
        // The old turtle slowly bobs, and nods while it talks
        n.root.position.y = n.pos.y + (speaking ? Math.abs(Math.sin(t * 5)) * 0.06 : 0);
        n.root.rotation.x = speaking ? Math.sin(t * 2.5) * 0.04 : 0;
      }
    }
  });

  function poseHuman(m, t, speaking, listening) {
    const breath = Math.sin(t * 1.6);
    for (const c of m.chest) c.scale.set(1 + 0.005 * breath, 1, 1 + 0.01 * breath);
    m.body.position.y = breath * 0.003;
    m.head.rotation.x = speaking ? Math.sin(t * 7) * 0.05 : listening ? 0.06 : Math.sin(t * 0.23) * 0.04;
    m.head.rotation.y = listening ? 0 : Math.sin(t * 0.31) * Math.sin(t * 0.13) * 0.4;
    m.arms.forEach((a, i) => {
      const gesture = speaking && i === 0;
      a.shoulder.rotation.x = gesture ? -0.55 + Math.sin(t * 3.2) * 0.25 : breath * 0.01;
      a.shoulder.rotation.z = (i ? 1 : -1) * (gesture ? 0.25 : 0.08);
      a.elbow.rotation.x = gesture ? -0.9 + Math.sin(t * 4.1) * 0.2 : -0.12;
    });
  }

  return { npcs };
}
