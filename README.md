# Shivanag — The Naga's Rescue (look & feel prototype, M0–M2)

A devotee king prays to Shiva; a naga uncoils from the shivalinga and slithers to the rescue.
This build covers **M0** (camera rig), **M1** (voxel look), **M2** (the snake) and the first part of **M3** (climbing pillars and walls).

## Play
Open `dist/index.html` (or `docs/index.html`) in any modern browser. It is one self-contained file — no network needed.

| Input | Action |
|---|---|
| WASD / arrows, or swipe/drag on touch | Move one voxel at a time (relative to the camera) |
| Q / E (or ⟲ ⟳) | Rotate the view in 90° steps |
| 1 / 2 / 3 / 4 | Camera: Isometric · 3/4 · Steep · Dynamic |
| G | Cycle quality (Low / Medium / High) |
| Mouse wheel | Zoom |
| Walk into a pillar / wall / tree | Cling and climb; toward the wall = up, away = down, sideways = crawl |
| T (or the See-through button) | Blocks between the camera and the snake dissolve (off by default) |
| F / H | Toggle FPS / help |

## Build
```
npm install
node build.mjs      # writes dist/index.html and docs/index.html
```

## Deploy to GitHub Pages
Option A (Actions): push to `main`, then in the repo go to Settings → Pages → Source: **GitHub Actions**. `.github/workflows/pages.yml` builds and deploys.
Option B (no build step): commit `docs/index.html`, then Settings → Pages → Deploy from branch → `main` / `/docs`.

## Layout
- `src/00_util.js` helpers · `01_voxel.js` world + mesher (baked AO, bevel texture) · `02_level.js` level 1
- `03_props.js` torches, shivalinga, king, water · `04_snake.js` the naga · `05_camera.js` camera presets · `05_occlude.js` see-through blocks · `06_main.js` engine, post, quality tiers, input
- Files are concatenated in name order by `build.mjs`.

## Next (from the plan)
M3 pole-crawling · M4 guards, vision cones, light/dark stealth · M5 sleep-bite takedowns · M6 puzzles and levels · M7 story, audio, polish.
Size note: Babylon is inlined whole (~8 MB, ~2 MB gzipped on Pages); a tree-shaken build is planned for M7.
