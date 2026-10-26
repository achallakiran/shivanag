import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Joints } from './rig';

// Body-versus-bat/hand clearance. The body is a handful of capsules around the joint lines; the bat and forearms are
// sampled along their length. `gap` is the distance beyond what the two shapes need (negative = they pass through each
// other). Used by the tests so no pose or swing frame can put the bat or hands through the player.
export interface Gap { what: string; gap: number }

function segDist(p: Vector3, a: Vector3, b: Vector3): number {
  const ab = b.subtract(a);
  const l2 = ab.lengthSquared();
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, Vector3.Dot(p.subtract(a), ab) / l2));
  return Vector3.Distance(p, a.add(ab.scale(t)));
}

const R = { torso: 0.16, thigh: 0.1, shin: 0.12, head: 0.14, boot: 0.08 };
const BAT_HANDLE = 0.03;
const BAT_BLADE = 0.07;
const HAND = 0.07;
const FOREARM = 0.04;

export function clearance(j: Joints): Gap[] {
  const neck = j.shoulderL.add(j.shoulderR).scale(0.5);
  const bodies: Array<{ name: string; a: Vector3; b: Vector3; r: number }> = [
    { name: 'torso', a: j.pelvis, b: neck, r: R.torso },
    { name: 'thighL', a: j.hipL, b: j.kneeL, r: R.thigh },
    { name: 'thighR', a: j.hipR, b: j.kneeR, r: R.thigh },
    { name: 'shinL', a: j.kneeL, b: j.ankleL, r: R.shin },
    { name: 'shinR', a: j.kneeR, b: j.ankleR, r: R.shin },
    { name: 'head', a: j.head, b: j.head, r: R.head },
    { name: 'bootL', a: j.ankleL, b: j.ankleL, r: R.boot },
    { name: 'bootR', a: j.ankleR, b: j.ankleR, r: R.boot },
  ];
  const out = new Map<string, number>();
  const note = (what: string, gap: number) => {
    if (gap < (out.get(what) ?? Infinity)) out.set(what, gap);
  };

  // the bat: handle (the first 0.4 m) is thin, the blade is wider
  const dir = j.batToe.subtract(j.batTop);
  const len = dir.length();
  for (let d = 0.05; d <= len; d += 0.03) {
    const p = j.batTop.add(dir.scale(d / len));
    const rb = d < 0.4 ? BAT_HANDLE : BAT_BLADE;
    for (const b of bodies) {
      // the hands hold the handle, so the part of it between the hands and the top is excused against the arms' own body
      note(`bat vs ${b.name}`, segDist(p, b.a, b.b) - b.r - rb);
    }
  }
  // hands and forearms against the body (the arm leaves the shoulder, so the upper arm is not tested against the torso)
  for (const [name, w, e] of [['L', j.wristL, j.elbowL], ['R', j.wristR, j.elbowR]] as const) {
    for (const b of bodies) {
      note(`hand${name} vs ${b.name}`, segDist(w, b.a, b.b) - b.r - HAND);
      if (b.name !== 'torso') note(`forearm${name} vs ${b.name}`, Math.min(segDist(e, b.a, b.b), segDist(w.add(e).scale(0.5), b.a, b.b)) - b.r - FOREARM);
    }
    note(`forearm${name} vs torso`, segDist(w.add(e).scale(0.5), bodies[0]!.a, bodies[0]!.b) - R.torso - FOREARM);
  }
  return [...out].map(([what, gap]) => ({ what, gap })).sort((x, y) => x.gap - y.gap);
}

export const worst = (j: Joints): Gap => clearance(j)[0]!;
