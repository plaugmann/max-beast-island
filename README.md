# Beast Island

A 3D island adventure in the browser: catch animals with cubes, build a base, earn money and explore.
Built with Three.js – plain HTML/JS, no build step.

## Play

**https://plaugmann.github.io/max-beast-island/**

Works on a computer (keyboard + mouse) and on iPad (touch).

### iPad
1. Open the link above in **Safari**.
2. Tap **Share → Add to Home Screen**. The game now opens full screen from its own icon.
3. Always start it from the home-screen icon: the save game lives there, separately from Safari.

| Touch | Action |
|---|---|
| Drag on the left side | Move (drag far to run) |
| Drag on the right side | Look around · two fingers to zoom |
| **THROW** | Throw the selected cube |
| **JUMP** | Jump |
| **E** | Use / talk (or tap the "E" bubble) |
| **MAP** / **BAG** | Map / inventory (tap again to close) |
| Tap a cube in the bottom bar | Pick that cube |

### Computer
| Key | Action |
|---|---|
| WASD / arrows | Move · Shift = run · Space = jump |
| Mouse | Look · scroll = zoom · click = throw cube |
| 1–6 | Pick cube |
| E | Use / talk · Tab = inventory · Q = map · H = hide help |

## Run locally
`index.html` does not work straight from disk (ES modules need a web server).
- **macOS:** double-click `start.command` (starts `server.py` on port 8124 and opens Chrome).
- **Other:** `python3 server.py 8124` and open http://localhost:8124.

Useful URL parameters: `?newgame` (delete the save), `?autoplay` (skip the start screen and intro),
`?touch` (touch controls on a computer), `?pr=1.5` (render resolution). `P` in the game opens the admin panel.

## Code
- `index.html` – UI, CSS, import map for Three.js. `PLAN.md` – the game design (in Danish).
- `src/main.js` – startup and game loop; every module gets a shared `game` object.
- `src/touch.js` – touch controls for iPad.
- `src/world.js`, `terrain.js`, `sky.js`, `water.js`, `vegetation.js`, … – the island.
- `src/animals.js`, `cubes.js`, `base.js`, `shops.js`, `npcs.js`, `tutorial.js`, `intro.js` – gameplay.
- `lib/three/` – a local copy of Three.js.

Hosted with GitHub Pages: every push to `main` goes live within a minute or two.
