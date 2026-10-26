// Nudges a pose's bat, hands and trunk the least amount needed so nothing passes through the body (see clearance.ts).
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { createStage } from '../src/voxel/stage';
import { createBatsman, type PoseData } from '../src/voxel/rig';
import { STANCES, lerpPose } from '../src/voxel/poses';
import { CLIPS, withKey, approach, type Key } from '../src/game/swing';
import { clearance } from '../src/voxel/clearance';

const stage = createStage(new NullEngine());
const man = createBatsman(stage.scene, stage.voxelMat);
const MARGIN = Number(process.env.MARGIN ?? 0.012);

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

type Path = (p: PoseData) => PoseData[];
let path: Path = (p) => [p];
function cost(p: PoseData, ref: PoseData): number {
  let c = 0;
  for (const q of path(p)) {
    const j = man.apply(q);
    c += j.gripError * 400;
    for (const g of clearance(j)) if (g.gap < MARGIN) c += (MARGIN - g.gap) ** 2 * 20000;
  }
  c += ((p.bat.pos[0] - ref.bat.pos[0]) ** 2 + (p.bat.pos[1] - ref.bat.pos[1]) ** 2 + (p.bat.pos[2] - ref.bat.pos[2]) ** 2) * 6;
  c += ((p.bat.az - ref.bat.az) ** 2 + (p.bat.el - ref.bat.el) ** 2) * 0.0015;
  c += ((p.spine[0] - ref.spine[0]) ** 2 + (p.spine[1] - ref.spine[1]) ** 2) * 0.004;
  c += (p.elbowOut - ref.elbowOut) ** 2 * 0.5;
  return c;
}
function fit(start: PoseData, free: { spine: boolean }): { pose: PoseData; cost: number; worst: number } {
  let best: PoseData = start;
  let bc = cost(best, start);
  let step = 1;
  for (let i = 0; i < 2500; i++) {
    if (i % 500 === 499) step *= 0.5;
    const q: PoseData = {
      ...best,
      bat: { ...best.bat, pos: [best.bat.pos[0] + rnd() * 0.03 * step, best.bat.pos[1] + rnd() * 0.03 * step, best.bat.pos[2] + rnd() * 0.03 * step], az: best.bat.az + rnd() * 8 * step, el: Math.max(-89, Math.min(89, best.bat.el + rnd() * 8 * step)) },
      spine: free.spine ? [best.spine[0] + rnd() * 2 * step, best.spine[1] + rnd() * 2 * step, best.spine[2]] : best.spine,
      elbowOut: Math.max(0, Math.min(1, best.elbowOut + rnd() * 0.08 * step)),
    };
    const c = cost(q, start);
    if (c < bc) { best = q; bc = c; }
  }
  let worst = Infinity;
  for (const q of path(best)) worst = Math.min(worst, clearance(man.apply(q))[0]!.gap);
  return { pose: best, cost: bc, worst };
}
const r = (n: number, d = 2) => Number(n.toFixed(d));
const fmtBat = (b: PoseData['bat']) => `bat: { pos: [${b.pos.map((v) => r(v)).join(', ')}], az: ${r(b.az, 0)}, el: ${r(b.el, 0)}, roll: ${b.roll} }`;

const which = process.argv[2] ?? 'all';
const out: string[] = [];
STANCES.forEach((s, i) => {
  if (which !== 'all' && which !== 'stance') return;
  const f = fit(s.pose, { spine: false });
  out.push(`STANCE ${i} ${s.name}: ${fmtBat(f.pose.bat)}, elbowOut ${r(f.pose.elbowOut)}  worst ${r(f.worst * 100, 1)}cm grip ${r(man.apply(f.pose).gripError, 3)}`);
});
STANCES.forEach((s, i) => {
  if (which !== 'all' && which !== 'clips') return;
  for (const k of ['contact', 'follow'] as const) {
    const key: Key = CLIPS[i]![k];
    const base = s.pose;
    const contact = withKey(base, CLIPS[i]!.contact, 0);
    path = k === 'contact' ? (p) => [0.2, 0.35, 0.5, 0.65, 0.8, 1].map((t) => approach(i, p, t)) : (p) => [0.25, 0.5, 0.75, 1].map((t) => lerpPose(contact, p, t)).concat([0.3, 0.6].map((t) => lerpPose(p, STANCES[0]!.pose, t)));
    const f = fit(withKey(s.pose, key, 0), { spine: true });
    path = (p) => [p];
    out.push(`CLIP ${i} ${s.name} ${k}: { ${fmtBat(f.pose.bat)}, spine: [${r(f.pose.spine[0] - s.pose.spine[0], 0)}, ${r(f.pose.spine[1] - s.pose.spine[1], 0)}], elbowOut: ${r(f.pose.elbowOut)} }  worst ${r(f.worst * 100, 1)}cm grip ${r(man.apply(f.pose).gripError, 3)}`);
  }
});
console.log(out.join('\n'));
