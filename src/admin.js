// Admin panel – just for testing the game: fly, teleport, give money/cubes/animals, spawn, time of day.
// P = open/close, Esc = close, F = fly (Space up, C down, Shift fast).
// NOTE: when the game goes online, the admin panel must be locked to the owner and every admin
// action must be checked on the server – never trust the browser for this.
import { FEATURES, FORESTS } from './world.js';
import { ANIMALS, RARITY, RARITIES, CUBES, INVENTORY_SIZE, fmtMoney } from './data.js';

const MAP_EXTENT = 1150; // must match EXTENT in map.js
const $ = (id) => document.getElementById(id);

const CSS = `
#admin { position: fixed; top: 14px; right: 14px; z-index: 40; width: 400px; max-height: calc(100vh - 28px); display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(24,40,64,.96), rgba(10,18,32,.96)); border: 2px solid rgba(255,255,255,.15); border-radius: 22px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6); font-family: 'Nunito', system-ui, sans-serif; color: #fff; user-select: none;
  opacity: 0; transform: translateX(20px); pointer-events: none; transition: opacity .18s, transform .18s; }
#admin.show { opacity: 1; transform: none; pointer-events: auto; }
#admin .ah { display: flex; align-items: center; gap: 10px; padding: 14px 18px 8px; }
#admin h2 { font-family: 'Lilita One', sans-serif; font-size: 28px; letter-spacing: 1px; background: linear-gradient(180deg, #fff6c9, #ffcf3f 50%, #ff8a1f);
  -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 2px 0 #3a1d00); }
#admin .pill { font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 99px; background: #e5383b; letter-spacing: 1px; }
#admin .x { margin-left: auto; width: 30px; height: 30px; border-radius: 10px; border: none; background: rgba(255,255,255,.1); color: #fff; font-size: 16px; cursor: pointer; }
#admin .x:hover { background: rgba(255,255,255,.2); }
#admin .tabs { display: flex; gap: 6px; padding: 4px 16px 10px; }
#admin .tabs button { flex: 1; font-family: 'Lilita One', sans-serif; font-size: 16px; padding: 7px 0; border-radius: 12px; border: none; cursor: pointer;
  background: rgba(255,255,255,.08); color: rgba(255,255,255,.75); }
#admin .tabs button.on { background: linear-gradient(180deg, #ffe066, #ffb300); color: #3a2400; box-shadow: 0 3px 0 #a86a00; }
#admin .body { overflow-y: auto; padding: 0 16px 12px; flex: 1; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent; }
#admin .page { display: none; } #admin .page.on { display: block; }
#admin h3 { font-family: 'Lilita One', sans-serif; font-weight: 400; font-size: 17px; margin: 12px 0 6px; color: #bfe3ff; display: flex; align-items: center; gap: 8px; }
#admin h3 small { font-family: 'Nunito', sans-serif; font-size: 12px; font-weight: 800; color: #8dff8a; margin-left: auto; }
#admin .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
#admin .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
#admin .ab { font: 800 13px 'Nunito', sans-serif; padding: 7px 10px; border-radius: 10px; color: #fff; cursor: pointer;
  background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.16); transition: background .1s, transform .05s; text-align: left; }
#admin .ab:hover { background: rgba(255,255,255,.18); }
#admin .ab:active { transform: translateY(1px); }
#admin .ab.on { background: linear-gradient(180deg, #ffe066, #ffb300); color: #3a2400; border-color: #ffd34d; }
#admin .ab.go { background: linear-gradient(180deg, #4fe06a, #2bab47); border-color: #6ff08a; }
#admin .ab.red { background: rgba(229,56,59,.25); border-color: rgba(255,90,90,.5); }
#admin .ab.off { opacity: .35; }
#admin .ab.big { font-family: 'Lilita One', sans-serif; font-weight: 400; font-size: 17px; padding: 9px 14px; }
#admin .kbd { font-size: 11px; opacity: .7; font-weight: 800; }
#admin input[type=range] { flex: 1; accent-color: #ffcf3f; }
#admin input[type=text] { flex: 1; min-width: 0; font: 800 14px 'Nunito', sans-serif; padding: 7px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.2);
  background: rgba(0,0,0,.3); color: #fff; outline: none; user-select: text; }
#admin input[type=text]:focus { border-color: #ffcf3f; }
#admin .val { min-width: 62px; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
#admin .cube { display: grid; grid-template-columns: 16px 1fr 46px auto auto auto; gap: 6px; align-items: center; margin-bottom: 5px; font-weight: 800; font-size: 13px; }
#admin .cube i { width: 16px; height: 16px; border-radius: 4px; background: var(--c); box-shadow: 0 0 8px var(--g), inset 0 0 0 2px var(--g); }
#admin .cube .n { text-align: right; font-variant-numeric: tabular-nums; color: #8dff8a; }
#admin .cube .ab { padding: 4px 8px; }
#admin .rh { display: flex; align-items: center; gap: 8px; margin: 10px 0 5px; font-family: 'Lilita One', sans-serif; font-size: 15px; color: var(--rc); text-shadow: 0 0 2px #000, 0 0 6px rgba(0,0,0,.6); }
#admin .rh .ab { margin-left: auto; padding: 3px 8px; font-size: 11px; color: #fff; text-shadow: none; }
#admin .ag { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
#admin .an { display: flex; flex-direction: column; align-items: center; padding: 5px 2px 4px; border-radius: 10px; cursor: pointer; text-align: center;
  border: 2px solid var(--rc); background: radial-gradient(circle at 50% 25%, color-mix(in srgb, var(--rc) 35%, transparent), rgba(255,255,255,.04)); color: #fff;
  font: 800 10.5px/1.15 'Nunito', sans-serif; transition: transform .08s, filter .08s; }
#admin .an:hover { transform: translateY(-2px); filter: brightness(1.25); }
#admin .an span { font-size: 22px; line-height: 1.2; }
#admin .r-9 { --rc: #a050ff !important; } #admin .an.r-9 { background: radial-gradient(circle, #2a0a40, #000); }
#admin .an.r-8 { border-image: linear-gradient(90deg, #f44, #fb2, #ff3, #4f6, #3df, #65f, #f4e) 1; border-radius: 0; }
#admin .an.r-7 { box-shadow: 0 0 8px #ff7a1a; } #admin .an.r-10 { box-shadow: 0 0 10px #bfefff; }
#admin .seg { display: flex; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,.16); margin-bottom: 8px; }
#admin .seg .ab { flex: 1; border: none; border-radius: 0; text-align: center; }
#admin .note { font-size: 12px; opacity: .65; font-weight: 600; margin: 4px 0; }
#admin .foot { padding: 8px 16px 12px; border-top: 1px solid rgba(255,255,255,.1); font-size: 12px; font-weight: 800; color: #bfe3ff;
  font-variant-numeric: tabular-nums; display: flex; justify-content: space-between; gap: 8px; }
#admin-fly { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 11; pointer-events: none; padding: 6px 16px; border-radius: 14px;
  background: rgba(8,16,28,.6); backdrop-filter: blur(6px); border: 1px solid #ffcf3f; font: 800 14px 'Nunito', sans-serif; color: #fff; display: none;
  text-shadow: 0 1px 2px rgba(0,0,0,.6); }
#admin-fly.show { display: block; }
#admin-fly b { font-family: 'Lilita One', sans-serif; font-weight: 400; color: #ffcf3f; margin-right: 6px; }
#map-canvas.admin-tp { cursor: crosshair; }
body.admin-open #lock-hint { opacity: 0; }
`;

export function createAdmin(game) {
  const { world, player, sky, animals, cubes, camCtl } = game;
  const canvas = $('game');
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  // ---------- Places ----------
  const peak = (f, rr = 0.45) => { // highest point near a mountain's centre
    let best = { x: f.x, z: f.z }, bh = -Infinity;
    for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) {
      const x = f.x + (i / 20) * f.r * rr, z = f.z + (j / 20) * f.r * rr, h = world.heightAt(x, z);
      if (h > bh) { bh = h; best = { x, z }; }
    }
    return best;
  };
  const V = FEATURES.volcano;
  const emberRim = (() => { // crater rim on the side facing the island centre (away from the lava rivers)
    const a = Math.atan2(-V.z, -V.x); let best = null, bh = -Infinity;
    for (let d = V.crater; d < V.crater * 1.6; d += 1) {
      const x = V.x + Math.cos(a) * d, z = V.z + Math.sin(a) * d, h = world.heightAt(x, z);
      if (h > bh) { bh = h; best = { x: V.x + Math.cos(a) * (d - 5), z: V.z + Math.sin(a) * (d - 5) }; } // just inside the rim
    }
    return best;
  })();
  const forest = (f) => { // deep in the woods, close to the forest's centre (and away from the cave clearing)
    let best = f, bs = -Infinity; const C = FEATURES.cave;
    for (let i = -16; i <= 16; i++) for (let j = -16; j <= 16; j++) {
      const x = f.x + (i / 16) * f.r * 0.6, z = f.z + (j / 16) * f.r * 0.6;
      if (world.heightAt(x, z) < 2 || Math.hypot(x - C.x, z - C.z) < 70) continue;
      const sc = world.forestAt(x, z) - Math.hypot(x - f.x, z - f.z) / f.r * 0.5;
      if (sc > bs) { bs = sc; best = { x, z }; }
    }
    return best;
  };
  const beach = (() => { // walk south from the spawn until we hit sand
    const s = FEATURES.spawn;
    for (let z = s.z; z < 1100; z += 2) { const h = world.heightAt(s.x, z); if (h < 2.6 && h > 1.4) return { x: s.x, z }; }
    return s;
  })();
  const places = [
    ['⭐', 'Spawn', FEATURES.spawn], ['❄️', FEATURES.ice.name, peak(FEATURES.ice)], ['⛰️', 'Stonecrown', peak(FEATURES.stone)],
    ['⛰️', 'Greyridge', peak(FEATURES.grey)], ['🌋', 'Mount Ember rim', { ...emberRim, look: { x: V.x, z: V.z, pitch: 0.6 } }], ['💎', FEATURES.cave.name, FEATURES.cave],
    ...FORESTS.map((f, i) => [i === 2 ? '🌳' : '🌲', f.name + (FORESTS.findIndex((g) => g.name === f.name) !== i ? ' (West)' : ''), forest(f)]),
    ['🏖️', 'Sunny Beach', beach], ['☁️', 'Sky view', { x: 0, z: 250, y: 380, look: { x: 0, z: -300 } }],
  ];
  // Base and shops are made by other modules – look them up when clicked
  const locOf = (o) => {
    if (!o) return null;
    for (const p of [o.spawn, o.door, o.entrance, o.pos, o.position, o.center, o.root?.position, o.group?.position, o]) {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return p;
    }
    return null;
  };
  const findShop = (re) => {
    const s = game.shops; if (!s) return null;
    const list = Array.isArray(s) ? s : Array.isArray(s.list) ? s.list : Object.entries(s).map(([k, v]) => (v && typeof v === 'object' ? { k, v } : null)).filter(Boolean);
    for (const it of list) {
      const v = it.v ?? it, key = it.k ?? '';
      if (re.test(key) || re.test(v.name ?? '') || re.test(v.id ?? '') || re.test(v.type ?? '')) { const p = locOf(v); if (p) return p; }
    }
    return null;
  };
  const dynPlaces = [
    ['🏠', 'Your Base', () => locOf(game.base)], ['🛒', 'Market', () => findShop(/market|sell/i)], ['🧊', 'Cube Shop', () => findShop(/cube/i)],
  ];

  function teleport(x, z, name, y, look) {
    if (y != null) { player.flying = true; syncFly(); }
    player.teleport(x, z, y ?? (player.flying ? Math.max(world.heightAt(x, z), -1.3) : world.heightAt(x, z)));
    camCtl.target.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    if (look) { camCtl.yaw = Math.atan2(x - look.x, z - look.z); player.facing = camCtl.yaw + Math.PI; if (look.pitch) camCtl.pitch = look.pitch; } // face the sight
    game.toast(`Teleported to ${name}`);
  }

  // ---------- DOM ----------
  const root = document.createElement('div'); root.id = 'admin';
  const tabs = [['move', 'Move'], ['give', 'Give'], ['animals', 'Animals'], ['world', 'World']];
  const rarities = RARITIES.map((r) => r.name);
  const cubeRow = (c) => `<div class="cube" style="--c:${c.color};--g:${c.glow}"><i></i><span>${c.name}</span><span class="n" data-count="${c.id}">0</span>
    ${[1, 10, 100].map((n) => `<button class="ab" data-cube="${c.id}" data-n="${n}">+${n}</button>`).join('')}</div>`;
  root.innerHTML = `
    <div class="ah"><h2>ADMIN PANEL</h2><span class="pill">TEST</span><button class="x" data-act="close" title="Close (P / Esc)">✕</button></div>
    <div class="tabs">${tabs.map(([id, n], i) => `<button data-tab="${id}" class="${i ? '' : 'on'}">${n}</button>`).join('')}</div>
    <div class="body">
      <div class="page on" data-page="move">
        <h3>Fly <span class="kbd">F · Space up · C down · Shift fast</span></h3>
        <div class="row"><button class="ab big" data-act="fly">🕊️ Fly: OFF</button></div>
        <div class="row"><span class="kbd">Speed</span><input type="range" id="adm-speed" min="5" max="150" step="1" value="25"><span class="val" id="adm-speed-v">25 m/s</span></div>
        <h3>Teleport</h3>
        <div class="grid2">${places.map(([ic, n], i) => `<button class="ab" data-tp="${i}">${ic} ${n}</button>`).join('')}
          ${dynPlaces.map(([ic, n], i) => `<button class="ab" data-dtp="${i}">${ic} ${n}</button>`).join('')}</div>
        <h3>Map teleport</h3>
        <div class="row"><button class="ab" data-act="maptp">🗺️ Click map to teleport: OFF</button></div>
        <div class="note">While this panel is open, clicking the map (Q) always teleports you. Turn this on to do it with the panel closed too.</div>
      </div>
      <div class="page" data-page="give">
        <h3>Money <small id="adm-money">$0</small></h3>
        <div class="row">${[1e3, 1e5, 1e7].map((n) => `<button class="ab go" data-money="${n}">+${n >= 1e6 ? n / 1e6 + 'M' : n / 1e3 + 'k'}</button>`).join('')}
          <button class="ab red" data-act="money0">Set to $0</button></div>
        <div class="row"><input type="text" id="adm-amount" placeholder="Amount, e.g. 5000 or 2.5m"><button class="ab go" data-act="moneyc">Give</button></div>
        <h3>Cubes</h3>
        ${CUBES.map(cubeRow).join('')}
        <div class="note" id="adm-admincube"></div>
      </div>
      <div class="page" data-page="animals">
        <div class="seg"><button class="ab on" data-mode="give">🎒 Give to inventory</button><button class="ab" data-mode="spawn">✨ Spawn in front</button></div>
        <div class="row"><input type="text" id="adm-search" placeholder="Search animals..."></div>
        <div id="adm-animals"></div>
        <h3>Wild animals <small id="adm-wild"></small></h3>
        <div class="row"><button class="ab red" data-act="clearwild">🧹 Clear all wild animals</button><button class="ab red" data-act="clearinv">🗑️ Empty inventory</button></div>
      </div>
      <div class="page" data-page="world">
        <h3>Time of day <small id="adm-time-v">12:00</small></h3>
        <div class="row"><input type="range" id="adm-time" min="0" max="1" step="0.001"></div>
        <div class="row">${[['🌅 Morning', 0.3], ['☀️ Noon', 0.5], ['🌇 Sunset', 0.74], ['🌙 Night', 0.95]].map(([n, t]) => `<button class="ab" data-time="${t}">${n}</button>`).join('')}</div>
        <div class="row"><button class="ab" data-act="freeze">⏸️ Freeze time: OFF</button></div>
        <h3>Game</h3>
        <div class="row" id="adm-game"><button class="ab" data-act="tutorial">⏭️ Skip tutorial</button><button class="ab red" data-act="reset">♻️ Reset save</button></div>
        <div class="note">Admin is just for testing. When the game goes online, only the owner will have it.</div>
      </div>
    </div>
    <div class="foot"><span id="adm-pos"></span><span id="adm-zone"></span><span id="adm-fps"></span></div>`;
  document.body.appendChild(root);
  const flyChip = document.createElement('div'); flyChip.id = 'admin-fly';
  flyChip.innerHTML = '<b>FLYING</b>Space up · C down · Shift fast · F to land';
  document.body.appendChild(flyChip);
  const help = $('help');
  if (help) { const d = document.createElement('div'); d.innerHTML = '<b>P</b>Admin · <b>F</b>Fly'; help.appendChild(d); }
  const q = (sel) => root.querySelector(sel);

  // Animal grid grouped by rarity
  const animalHTML = () => rarities.map((r) => {
    const ri = RARITY[r].index;
    return `<div class="rh r-${ri}" style="--rc:${RARITY[r].color}" data-rh="${r}">${r}<button class="ab" data-rand="${r}">🎲 Random</button></div>
      <div class="ag" data-ag="${r}">${ANIMALS[r].map((a) => `<button class="an r-${ri}" style="--rc:${RARITY[r].color}" data-an="${a.name}" data-r="${r}"><span>${a.icon}</span>${a.name}</button>`).join('')}</div>`;
  }).join('');
  q('#adm-animals').innerHTML = animalHTML();

  // ---------- Actions ----------
  let open = false, mapTp = false, frozen = null, animalMode = 'give', uid = 0;
  const money = () => cubes.state.money;
  function addMoney(n) {
    if (game.addMoney) game.addMoney(n); else cubes.state.money = Math.max(0, cubes.state.money + n);
    cubes.renderHotbar(); refresh();
  }
  function setMoney0() {
    if (game.setMoney) game.setMoney(0); else if (game.addMoney) game.addMoney(-money()); else cubes.state.money = 0;
    cubes.state.money = 0; cubes.renderHotbar(); refresh();
  }
  const parseAmount = (s) => {
    const m = String(s).trim().toLowerCase().replace(/[$,\s]/g, '').match(/^(-?\d*\.?\d+)([kmb]?)$/);
    return m ? Math.round(+m[1] * { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2]]) : NaN;
  };
  function giveAnimal(name, rarity) {
    if (game.giveAnimal) {
      if (game.giveAnimal(name, rarity) === false) { game.toast(`Inventory full! (${INVENTORY_SIZE}/${INVENTORY_SIZE})`); return; }
      game.toast(`Gave ${name} (${rarity})`);
    } else {
      const inv = cubes.state.inventory;
      if (inv.length >= INVENTORY_SIZE) { game.toast(`Inventory full! (${INVENTORY_SIZE}/${INVENTORY_SIZE})`); return; }
      const info = ANIMALS[rarity].find((a) => a.name === name);
      inv.push({ name, rarity, icon: info.icon, perSec: RARITY[rarity].perSec, id: 1e9 + ++uid });
      game.toast(`Gave ${name} (${rarity})`);
    }
    cubes.renderInventory(); cubes.renderHotbar();
  }
  function spawnAnimal(name, rarity) {
    const yaw = camCtl.yaw, d = 7;
    const x = player.pos.x - Math.sin(yaw) * d, z = player.pos.z - Math.cos(yaw) * d;
    const a = animals.create(name, rarity, x, z);
    a.heading = Math.atan2(player.pos.x - x, player.pos.z - z); // look at the player
    game.toast(`Spawned ${name} (${rarity})`);
  }
  const animalAction = (name, rarity) => (animalMode === 'give' ? giveAnimal : spawnAnimal)(name, rarity);

  function syncFly() {
    q('[data-act=fly]').textContent = `🕊️ Fly: ${player.flying ? 'ON' : 'OFF'}`;
    q('[data-act=fly]').classList.toggle('on', player.flying);
    flyChip.classList.toggle('show', player.flying);
  }
  function toggleFly() {
    player.flying = !player.flying;
    if (player.flying) player.vel.set(0, 6, 0); // small hop into the air
    syncFly();
    game.toast(player.flying ? 'Fly mode ON 🕊️' : 'Fly mode OFF');
  }
  function syncMapTp() {
    const b = q('[data-act=maptp]');
    b.textContent = `🗺️ Click map to teleport: ${mapTp ? 'ON' : 'OFF'}`; b.classList.toggle('on', mapTp);
    $('map-canvas')?.classList.toggle('admin-tp', mapTp || open);
  }
  const clock = (t) => { const m = Math.floor(t * 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

  function refresh() {
    q('#adm-money').textContent = fmtMoney(money());
    for (const el of root.querySelectorAll('[data-count]')) { const n = cubes.state.counts[el.dataset.count] ?? 0; el.textContent = n === Infinity ? '∞' : n; }
    const hasAdmin = cubes.types.some((c) => c.id === 'admin');
    const note = q('#adm-admincube'), want = hasAdmin ? '' : 'The Admin Cube only shows in the hotbar when the game runs with <b>?admin</b>. <button class="ab" data-act="admincube">Reload with Admin Cube</button>';
    if (note.dataset.html !== want) { note.innerHTML = want; note.dataset.html = want; }
    for (const b of root.querySelectorAll('[data-cube=admin]')) b.classList.toggle('off', !hasAdmin);
    dynPlaces.forEach(([, , fn], i) => q(`[data-dtp="${i}"]`).classList.toggle('off', !fn()));
    q('[data-act=tutorial]').classList.toggle('hidden', !game.skipTutorial);
    q('[data-act=reset]').classList.toggle('hidden', !game.resetSave);
    q('#adm-game').classList.toggle('hidden', !game.skipTutorial && !game.resetSave);
    q('#adm-wild').textContent = `${animals.list.filter((a) => !a.captured).length} alive`;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.tab) {
      for (const t of root.querySelectorAll('[data-tab]')) t.classList.toggle('on', t === b);
      for (const p of root.querySelectorAll('[data-page]')) p.classList.toggle('on', p.dataset.page === d.tab);
    } else if (d.tp) {
      const [, n, p] = places[+d.tp]; teleport(p.x, p.z, n, p.y, p.look);
    } else if (d.dtp) {
      const [, n, fn] = dynPlaces[+d.dtp], p = fn();
      if (p) teleport(p.x, p.z, n, undefined, d.dtp === '0' ? game.base.pos : null); else game.toast(`${n} doesn't exist yet`);
    } else if (d.money) addMoney(+d.money);
    else if (d.cube) {
      if (!cubes.types.some((c) => c.id === d.cube)) { game.toast('Reload with ?admin to use the Admin Cube'); return; }
      cubes.state.counts[d.cube] = (cubes.state.counts[d.cube] ?? 0) + +d.n;
      cubes.renderHotbar(); refresh(); game.toast(`+${d.n} ${CUBES.find((c) => c.id === d.cube).name}`);
    } else if (d.an) animalAction(d.an, d.r);
    else if (d.rand) { const list = ANIMALS[d.rand]; animalAction(list[Math.floor(Math.random() * list.length)].name, d.rand); }
    else if (d.mode) {
      animalMode = d.mode;
      for (const m of root.querySelectorAll('[data-mode]')) m.classList.toggle('on', m === b);
    } else if (d.time) { sky.state.time = +d.time; if (frozen != null) frozen = +d.time; }
    else switch (d.act) {
      case 'close': setOpen(false); break;
      case 'fly': toggleFly(); break;
      case 'maptp': mapTp = !mapTp; syncMapTp(); break;
      case 'money0': setMoney0(); break;
      case 'moneyc': {
        const n = parseAmount(q('#adm-amount').value);
        if (Number.isFinite(n)) { addMoney(n); q('#adm-amount').value = ''; } else game.toast('Type an amount like 5000, 25k or 2.5m');
        break;
      }
      case 'clearwild': { const wild = animals.list.filter((a) => !a.captured); wild.forEach((a) => animals.remove(a)); game.toast(`Removed ${wild.length} wild animals`); break; }
      case 'clearinv': cubes.state.inventory.length = 0; cubes.renderInventory(); game.toast('Inventory emptied'); break;
      case 'freeze': frozen = frozen == null ? sky.state.time : null; b.textContent = `⏸️ Freeze time: ${frozen != null ? 'ON' : 'OFF'}`; b.classList.toggle('on', frozen != null); break;
      case 'tutorial': game.skipTutorial?.(); game.toast('Tutorial skipped'); break;
      case 'reset': if (confirm('Reset your save? All progress is lost.')) game.resetSave?.(); break;
      case 'admincube': { const u = new URL(location.href); u.searchParams.set('admin', ''); location.href = u.toString().replace('admin=&', 'admin&').replace(/admin=$/, 'admin'); break; }
    }
    refresh();
  });
  q('#adm-amount').addEventListener('keydown', (e) => { if (e.code === 'Enter') q('[data-act=moneyc]').click(); });
  q('#adm-speed').addEventListener('input', (e) => { player.flySpeed = +e.target.value; q('#adm-speed-v').textContent = `${player.flySpeed} m/s`; });
  q('#adm-time').addEventListener('input', (e) => { sky.state.time = +e.target.value; if (frozen != null) frozen = sky.state.time; });
  q('#adm-search').addEventListener('input', (e) => {
    const s = e.target.value.trim().toLowerCase();
    for (const b of root.querySelectorAll('[data-an]')) b.classList.toggle('hidden', !!s && !b.dataset.an.toLowerCase().includes(s) && !b.dataset.r.toLowerCase().includes(s));
    for (const r of rarities) {
      const any = root.querySelector(`[data-ag="${r}"] [data-an]:not(.hidden)`);
      q(`[data-rh="${r}"]`).classList.toggle('hidden', !any); q(`[data-ag="${r}"]`).classList.toggle('hidden', !any);
    }
  });

  // Map click → teleport (map canvas is square, EXTENT world units from centre to edge)
  $('map-canvas')?.addEventListener('click', (e) => {
    if (!open && !mapTp) return;
    const c = e.currentTarget, x = (e.offsetX / c.clientWidth * 2 - 1) * MAP_EXTENT, z = (e.offsetY / c.clientHeight * 2 - 1) * MAP_EXTENT;
    teleport(x, z, world.zoneAt(x, z, false));
  });

  // The map doesn't free the mouse by itself – do it so the map can be clicked
  const mapEl = $('map');
  if (mapEl) new MutationObserver(() => { if (mapTp && mapEl.classList.contains('show')) document.exitPointerLock?.(); }).observe(mapEl, { attributes: true, attributeFilter: ['class'] });

  // ---------- Open / close ----------
  function setOpen(v) {
    open = v;
    root.classList.toggle('show', v); document.body.classList.toggle('admin-open', v);
    if (v) { game.panels.add('admin'); document.exitPointerLock?.(); refresh(); syncTime(); }
    else {
      game.panels.delete('admin'); document.activeElement?.blur?.();
      if (!game.panels.size && !$('map')?.classList.contains('show') && !$('inventory')?.classList.contains('show')) canvas.requestPointerLock?.()?.catch?.(() => {});
    }
    syncMapTp();
  }
  const syncTime = () => {
    if (document.activeElement !== q('#adm-time')) q('#adm-time').value = sky.state.time;
    q('#adm-time-v').textContent = clock(sky.state.time);
  };

  // ---------- Keys ----------
  const typing = (e) => e.target instanceof HTMLInputElement && e.target.type === 'text';
  game.onKey.push((e) => {
    if (!$('loading')?.classList.contains('gone')) return false;
    if (e.code === 'Escape' && open) { setOpen(false); return true; }
    if (typing(e)) return true; // don't run game hotkeys while typing in the panel
    if (e.code === 'KeyP' && !e.repeat) { setOpen(!open); return true; }
    if (e.code === 'KeyF' && !e.repeat) { toggleFly(); return true; }
    if (e.code === 'KeyC' && game.input) game.input.down = true;
    return false;
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyC' && game.input) game.input.down = false; });
  window.addEventListener('blur', () => { if (game.input) game.input.down = false; });

  // ---------- Per frame ----------
  let tick = 0, frames = 0, ft = 0, fps = 0;
  game.onFrame.push((dt) => {
    if (frozen != null) sky.state.time = frozen;
    frames++; ft += dt;
    if (ft > 0.5) { fps = Math.round(frames / ft); frames = 0; ft = 0; }
    if (!open || (tick += dt) < 0.25) return;
    tick = 0;
    const p = player.pos;
    q('#adm-pos').textContent = `X ${p.x.toFixed(0)}  Y ${p.y.toFixed(1)}  Z ${p.z.toFixed(0)}`;
    q('#adm-zone').textContent = '📍 ' + world.zoneAt(p.x, p.z, player.inCave);
    q('#adm-fps').textContent = `${fps} FPS`;
    syncTime(); refresh();
  });

  return { setOpen, toggleFly, teleport, isOpen: () => open };
}
