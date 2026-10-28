// Graphics settings: Normal / Low. Opened with the ⚙️ button (start screen + HUD) or O, remembered on this device.
// Low = lower resolution, no shadows, no bloom, no MSAA. ?pr=… still overrides the resolution.
import { IS_TOUCH } from './touch.js';

const $ = (id) => document.getElementById(id);
const KEY = 'beastIsland.quality';
export const QUALITY = {
  normal: { name: 'Normal', desc: 'Best looks: sharp picture, shadows and glow', pr: IS_TOUCH ? 1 : 1.5, samples: IS_TOUCH ? 2 : 4, shadows: true, bloom: true },
  low: { name: 'Low', desc: 'Faster on older iPads and computers: lower resolution, no shadows or glow', pr: 0.75, samples: 0, shadows: false, bloom: false },
};
const prParam = new URLSearchParams(location.search).get('pr');

export function loadQuality() {
  try { const q = localStorage.getItem(KEY); return QUALITY[q] ? q : 'normal'; } catch { return 'normal'; }
}
export const pixelRatio = (q) => Math.min(window.devicePixelRatio, prParam ? +prParam : QUALITY[q].pr);

export function createSettings(game, { renderer, composer, bloomPass }) {
  let current = loadQuality();

  function set(q) {
    if (q === current || !QUALITY[q]) return;
    current = q;
    try { localStorage.setItem(KEY, q); } catch { /* private mode: just this session */ }
    const Q = QUALITY[q];
    renderer.setPixelRatio(pixelRatio(q));
    composer.setPixelRatio(renderer.getPixelRatio());
    if (composer.renderTarget1.samples !== Q.samples) {
      const rt = composer.renderTarget1.clone(); rt.samples = Q.samples;
      composer.reset(rt);
    }
    bloomPass.enabled = Q.bloom;
    if (renderer.shadowMap.enabled !== Q.shadows) {
      renderer.shadowMap.enabled = Q.shadows;
      game.scene.traverse((o) => { for (const m of [].concat(o.material ?? [])) m.needsUpdate = true; }); // recompile with/without shadows
    }
  }

  function open() {
    game.ui.openPanel('settings', {
      title: 'SETTINGS', sub: 'Graphics', color: '#8fe3ff',
      note: 'Try Low if the game feels slow or jerky. The choice is saved on this device.',
      render: () => `<div class="gp-quality">${Object.entries(QUALITY).map(([k, Q]) =>
        `<button class="gp-q${k === current ? ' sel' : ''}" data-act="${k}"><span class="qn">${Q.name}</span><span class="qd">${Q.desc}</span></button>`).join('')}</div>`,
      onClick: set,
    });
  }

  for (const id of ['load-gear', 'hud-gear']) {
    $(id).classList.remove('hidden');
    $(id).addEventListener('click', open);
  }
  game.onKey.push((e) => {
    if (e.code !== 'KeyO' || e.repeat || game.panels.size) return false;
    open(); return true;
  });
}
