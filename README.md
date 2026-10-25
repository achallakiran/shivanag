# Voxel Cricket

A voxel-based cricket game for mobile, starting with batting mechanics.

Hard requirements:
- **Fully offline.** No CDN or network calls; everything is bundled and generated in code.
- Hosted on GitHub Pages and installable to the iPhone home screen.
- Simulation-first physics; every tuning value is editable (menu in the game, or export/import JSON).
- Natural controls first (two floating relative sticks); assists come later as a toggleable layer.

## Status

**v0.3.0, Phase A (ball and bowling machine).** A bowling machine at the bowler's end delivers a ball
every few seconds: a cue warning, then release. The ball has real size and mass-free physics (gravity,
air drag, spin force, bounce with grip and slip, rolling). It is drawn larger with a trail, shadow and a
bounce marker. Speed, line and length are in Menu tuning (`machine.*`). The batter is still a placeholder
pose and cannot hit the ball yet; stances and the circle swing come next.
`node tools/preview.mjs` renders every camera and a delivery headless to PNG for a quick visual check.

## Play / install (iPhone)

1. Open the Pages address in Safari.
2. Share, then Add to Home Screen. Open it from the home screen once while online.
3. Menu shows "Offline: ready". Turn on airplane mode and relaunch to confirm.

## Develop

```
npm install
npm run build     # writes index.html, sw.js, manifest and icons into the repo root
npm test          # type-check + unit tests
npm run check     # tests + build + offline checks
```

Source is in `src/`; `tools/` has the build. The built files in the repo root are what
GitHub Pages serves, so rebuild before every push.

## Layout

- `src/core` loop, storage, rng
- `src/config` defaults, limits, merge/import/export
- `src/input` floating sticks, recorder and replayer
- `src/sim` deterministic simulation (toy for now)
- `src/render` Babylon scene
- `src/ui` HUD, menu, tuning editor
- `src/pwa` service worker registration and update prompt
