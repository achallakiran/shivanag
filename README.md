# Voxel Cricket

A voxel-based cricket game for mobile, starting with batting mechanics.

Hard requirements:
- **Fully offline.** No CDN or network calls; everything is bundled and generated in code.
- Hosted on GitHub Pages and installable to the iPhone home screen.
- Simulation-first physics; every tuning value is editable (menu in the game, or export/import JSON).
- Natural controls first (two floating relative sticks); assists come later as a toggleable layer.

## Status

**v0.5.0, Phase C+D (circle swing and first hit).** The right stick now swings the bat round a circle: the
bat starts in the backlift (thumb up) and follows your thumb's angle, up, left, down, right for a right-hander
(mirrored for a left-hander). Faster thumb means faster bat; stop the thumb and the bat stops (a defence);
lift it and the bat carries on round to the backlift. The swing plane depends on the stance and the left
stick's line. The ball now reacts to the bat: speed, contact point (sweet spot, toe, edges), face angle and
friction give pace, direction, loft and spin. A card shows the shot. The aim guide (Menu) shows the plane.
Tuning: `swing.*`, `bat.*`.

Earlier: **v0.4.0, Phase B (stances).** The left stick is now a gear selector, not free movement. With the thumb
down: push up for Back foot; the middle is Ready; pull down for Sit (sweep), then Front foot, then Step out.
Labels sit beside the stick. Release the thumb and the batter returns to Ready. Left/right on the stick slides
the working foot across or out. The body moves to each stance at limited foot, hip and lean speeds (all in
Menu tuning, `stance.*`), so choosing late means the feet have not arrived. The bat rests in the backlift;
the right stick still moves it as a placeholder until the circle swing arrives. The bowling machine (v0.3)
keeps delivering. `node tools/preview.mjs` renders every camera, every stance and a delivery to PNG.

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
