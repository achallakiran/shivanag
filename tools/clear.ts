// Lists every pose and swing frame where the bat or hands pass through the body.
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { createStage } from '../src/voxel/stage';
import { createBatsman, type PoseData } from '../src/voxel/rig';
import { STANCES } from '../src/voxel/poses';
import { swingPose, SWING_TOTAL } from '../src/game/swing';
import { clearance } from '../src/voxel/clearance';

const stage = createStage(new NullEngine());
const man = createBatsman(stage.scene, stage.voxelMat);
const tol = Number(process.env.TOL ?? -0.01);
const report = (label: string, p: PoseData) => {
  const j = man.apply(p);
  const bad = clearance(j).filter((g) => g.gap < tol).slice(0, 4);
  if (bad.length) console.log(label.padEnd(26), bad.map((g) => `${g.what} ${(g.gap * 100).toFixed(0)}cm`).join(' | '));
};
STANCES.forEach((s, i) => {
  report(`${s.name} stance`, s.pose);
  const T = 0.2;
  for (let t = 0; t <= T + SWING_TOTAL; t += 0.03) report(`${s.name} swing t=${t.toFixed(2)}`, swingPose(i, t, T));
});
