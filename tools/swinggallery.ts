// Renders each stance's swing (start, mid, contact, follow-through) from two cameras to PNGs for review.
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createStage, frame } from '../src/voxel/stage';
import { createBatsman } from '../src/voxel/rig';
import { STANCES } from '../src/voxel/poses';
import { swingPose } from '../src/game/swing';
import { rasterize, png } from './raster';

const W = 360, H = 360;
const out = process.argv[2] ?? 'preview-swing';
mkdirSync(out, { recursive: true });
const engine = new NullEngine();
const stage = createStage(engine);
const man = createBatsman(stage.scene, stage.voxelMat);
const views: Record<string, [number, number, number]> = { front: [0.1, 1.7, 9], side: [-6, 1.2, 0] };
const T = 0.2;
const times = [0, 0.6 * T, T, T + 0.15];
STANCES.forEach((s, i) => {
  for (const [v, pos] of Object.entries(views)) {
    times.forEach((t, k) => {
      const j = man.apply(swingPose(i, t, T));
      if (j.gripError > 0.06) console.log(`${s.name} t=${t.toFixed(2)} ${v}: grip off by ${j.gripError.toFixed(3)}`);
      frame(stage.cam, pos, [0, 0.85, 0], 0.8);
      writeFileSync(`${out}/${i}-${v}-${k}.png`, png(rasterize(stage.scene, W, H), W, H));
    });
  }
});
