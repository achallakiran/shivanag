// Reference matcher: poses the skeleton in a reference's stance and fits camera azimuth, scale and offset to the
// landmarks marked on the reference image. Reports the residual per landmark as a percent of body height.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { targetPose } from '../src/sim/stance';
import { solvePose, type Pose, type Vec } from '../src/sim/skeleton';

interface Ref { id: string; stance: number; lifted: boolean; rightHanded: boolean; pts: Record<string, [number, number]>; }
export const refs: Ref[] = JSON.parse(readFileSync(join(process.cwd(), 'test/refs/refs.json'), 'utf8')).refs;

function joint(p: Pose, name: string, swap: boolean, rh: boolean): Vec | null {
  const pair = (base: string, side: string): Vec => {
    const s = swap ? (side === 'A' ? 'B' : 'A') : side;
    return (p as any)[base + (s === 'A' ? 'L' : 'R')];
  };
  const m = /^(knee|ankle|shoulder|elbow|wrist)([AB])$/.exec(name);
  if (m) return pair(m[1]!, m[2]!);
  switch (name) {
    case 'head': return p.head;
    case 'neck': return p.neck;
    case 'pelvis': return p.pelvis;
    case 'grip': return p.batGrip;
    case 'batToe': return p.batToe;
    case 'batTop': return p.batTop;
  }
  void rh;
  return null;
}

export function matchRef(r: Ref, stancePose?: ReturnType<typeof targetPose>) {
  const sp = stancePose ?? targetPose(r.stance, DEFAULT_CONFIG.stance, r.rightHanded, r.lifted);
  const pose = solvePose({ stance: sp, alpha: 0, yaw: 0, rightHanded: r.rightHanded, baseZ: -8.84 }, DEFAULT_CONFIG.body);
  const names = Object.keys(r.pts);
  let best = { rms: 1e9, az: 0, swap: false, per: {} as Record<string, number> };
  for (const swap of [false, true]) {
    for (let deg = 0; deg < 360; deg += 3) {
      const a = (deg * Math.PI) / 180;
      const proj: [number, number][] = [];
      const img: [number, number][] = [];
      const used: string[] = [];
      for (const n of names) {
        const j = joint(pose, n, swap, r.rightHanded);
        if (!j) continue;
        proj.push([j[0] * Math.cos(a) + j[2] * Math.sin(a), j[1]]);
        img.push([r.pts[n]![0], -r.pts[n]![1]]);
        used.push(n);
      }
      // least squares: img = s * proj + t (uniform scale, translation)
      const k = proj.length;
      const mp = [proj.reduce((s, p) => s + p[0], 0) / k, proj.reduce((s, p) => s + p[1], 0) / k];
      const mi = [img.reduce((s, p) => s + p[0], 0) / k, img.reduce((s, p) => s + p[1], 0) / k];
      let num = 0, den = 0;
      for (let i = 0; i < k; i++) { num += (proj[i]![0] - mp[0]!) * (img[i]![0] - mi[0]!) + (proj[i]![1] - mp[1]!) * (img[i]![1] - mi[1]!); den += (proj[i]![0] - mp[0]!) ** 2 + (proj[i]![1] - mp[1]!) ** 2; }
      const s = den > 1e-9 ? num / den : 1;
      if (s <= 0) continue;
      let sum = 0;
      const per: Record<string, number> = {};
      for (let i = 0; i < k; i++) {
        const dx = (s * (proj[i]![0] - mp[0]!) + mi[0]! - img[i]![0]) / s;
        const dy = (s * (proj[i]![1] - mp[1]!) + mi[1]! - img[i]![1]) / s;
        const e = Math.sqrt(dx * dx + dy * dy) / 1.8;
        per[used[i]!] = e;
        sum += e * e;
      }
      const rms = Math.sqrt(sum / k);
      if (rms < best.rms) best = { rms, az: deg, swap, per };
    }
  }
  return best;
}

if (process.argv[1] && process.argv[1].endsWith('refmatch.ts')) {
  for (const r of refs) {
    const b = matchRef(r);
    console.log(`${r.id.padEnd(14)} rms ${(b.rms * 100).toFixed(1)}% of height  azimuth ${b.az}°${b.swap ? ' (swapped sides)' : ''}`);
    console.log('   ' + Object.entries(b.per).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join('  '));
  }
}
