# Voxel Cricket

**v1 branch, Phase 1 (v0.9.0): voxel batsman and stance poses.** The physics simulator (v0.8.0, tag `sim-v0.8.0`) is being replaced by an arcade-style game: a voxel batsman posed from authored pose data, a timing-based hit resolver, and swipe control. This build is a pose viewer: tap a stance, drag to look around, cycle cameras. `main` still serves the old simulator until the new game is playable.

Plan: Phase 2 first playable over (easy ball, swipe to hit), Phase 3 shot depth, Phase 4 match, Phase 5 feel, Phase 6 tuning.

Tools: `npm run check` (types, tests, build, offline check); `npx tsx tools/posegallery.ts <dir>` renders every pose from four cameras.
