// Save game in localStorage: money, cubes, inventory, base (plot + animals) and tutorial progress.
// ?newgame ignores and deletes the save.
import { RARITY, CUBES } from './data.js';
import { invItem } from './base.js';

const KEY = 'beastIsland.save.v1';
const $ = (id) => document.getElementById(id);

export function loadSave() {
  try {
    if (new URLSearchParams(location.search).has('newgame')) { localStorage.removeItem(KEY); return null; }
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.v === 1 ? s : null;
  } catch { return null; }
}

// Money, cube counts and inventory go straight into cubes.state (the single source of truth)
export function applySave(game, s) {
  if (!s) return;
  const st = game.cubes.state;
  st.money = Math.max(0, Math.floor(+s.money || 0));
  for (const c of CUBES) if (!c.admin && Number.isFinite(s.counts?.[c.id])) st.counts[c.id] = Math.max(0, Math.floor(s.counts[c.id]));
  st.inventory.length = 0;
  for (const it of s.inventory || []) if (RARITY[it.rarity]) st.inventory.push(invItem(it.name, it.rarity));
  game.cubes.renderHotbar(); game.cubes.renderInventory();
}

export function createSave(game) {
  const st = game.cubes.state;
  let off = false;
  const snapshot = () => ({
    v: 1, t: Date.now(), money: Math.floor(st.money),
    counts: Object.fromEntries(CUBES.filter((c) => !c.admin).map((c) => [c.id, st.counts[c.id] | 0])),
    inventory: st.inventory.map(({ name, rarity }) => ({ name, rarity })),
    base: game.base && { plot: game.base.plot, slots: game.base.slots.map((s) => s && { name: s.name, rarity: s.rarity, stored: Math.round(s.stored * 100) / 100 }) },
    tutorialDone: !!game.tutorial?.done, tip: game.tutorial?.tip ?? 0,
  });
  game.save = () => {
    if (off) return false;
    try { localStorage.setItem(KEY, JSON.stringify(snapshot())); return true; } catch { return false; }
  };
  game.resetSave = (reload = true) => {
    off = true;
    try { localStorage.removeItem(KEY); } catch { /* private mode */ }
    if (reload) location.reload();
  };
  // Autosave every 5 s once the game is running, and when leaving
  setInterval(() => { if ($('loading').classList.contains('gone')) game.save(); }, 5000);
  addEventListener('beforeunload', () => { if ($('loading').classList.contains('gone')) game.save(); });
  addEventListener('visibilitychange', () => { if (document.hidden && $('loading').classList.contains('gone')) game.save(); });
}
