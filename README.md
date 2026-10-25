# Voxel Cricket

A voxel-based cricket game for mobile, starting with batting mechanics.

Hard requirements:
- **Fully offline.** No CDN or network calls; everything is bundled and generated in code.
- Hosted on GitHub Pages and installable to the iPhone home screen.
- Simulation-first physics; every tuning value is editable (menu in the game, or export/import JSON).
- Natural controls first (two floating relative sticks); assists come later as a toggleable layer.

## Status

**v0.2.0, Phase 0.2 (visible batter).** Fixed-step loop, tunable config, two-thumb input,
input recorder with replay verification, offline install, version/update prompt.
A voxel batter with a visible joint skeleton stands at the crease, seen from a behind-the-bowler
broadcast camera. Left stick moves the body, right stick moves the bat (placeholder pose, not the
final joint-driven model). Buttons: Camera (7 views), Skeleton, and Menu (left/right-handed).
`node tools/preview.mjs` renders every camera headless to PNG for a quick visual check.

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
