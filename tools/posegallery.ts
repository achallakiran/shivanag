// Renders the batsman's poses from several cameras to PNGs (and a contact sheet) for review.
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createStage, frame } from '../src/voxel/stage';
import { createBatsman, type PoseData } from '../src/voxel/rig';
import * as P from '../src/voxel/poses';
import { rasterize, png } from './raster';

const W = Number(process.env.PW ?? 480);
const H = Number(process.env.PH ?? 440);
const out = process.argv[2] ?? 'preview-poses';
mkdirSync(out, { recursive: true });

const engine = new NullEngine();
const stage = createStage(engine);
const man = createBatsman(stage.scene, stage.voxelMat);

const VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number]; fill: number }> = {
  front: { pos: [0.1, 1.7, 9], target: [0, 0.85, 0], fill: 0.8 }, // the bowler-end broadcast view
  side: { pos: [-6, 1.2, 0], target: [0, 0.85, 0], fill: 0.8 }, // from the leg side
  behind: { pos: [0, 1.6, -6], target: [0, 0.85, 0], fill: 0.8 }, // from behind the batter
  three: { pos: [-3.5, 1.5, 4.5], target: [0, 0.85, 0], fill: 0.8 },
};

export function shoot(name: string, pose: PoseData, views = Object.keys(VIEWS)): string[] {
  const j = man.apply(pose);
  const files: string[] = [];
  for (const v of views) {
    const c = VIEWS[v]!;
    frame(stage.cam, c.pos, c.target, c.fill);
    const rgb = rasterize(stage.scene, W, H);
    const f = `${out}/${name}-${v}.png`;
    writeFileSync(f, png(rgb, W, H));
    files.push(f);
  }
  if (j.gripError > 0.01) console.log(`${name}: hands miss the handle by ${j.gripError.toFixed(3)} m`);
  return files;
}

const only = process.argv[3];
for (const [k, pose] of Object.entries(P.POSES)) {
  if (only && !k.toLowerCase().includes(only.toLowerCase())) continue;
  shoot(k, pose as PoseData);
}
