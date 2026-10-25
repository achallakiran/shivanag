import type { ShotState } from '../sim/contact';

export function directionName(dir: number): string {
  const a = Math.abs(dir);
  const off = dir >= 0;
  if (a < 12) return 'straight';
  if (a < 50) return off ? 'cover' : 'mid-wicket';
  if (a < 95) return off ? 'point' : 'square leg';
  if (a < 150) return off ? 'third man' : 'fine leg';
  return 'behind the keeper';
}

function contactName(k: ShotState, sweet: number, halfWidth: number): string {
  if (Math.abs(k.lat) > 0.75 * halfWidth) return 'edge';
  if (k.s > 0.9) return 'toe';
  if (k.s < 0.6) return 'low on the bat, near the handle';
  if (Math.abs(k.s - sweet) < 0.05 && Math.abs(k.lat) < 0.4 * halfWidth) return 'middle of the bat';
  return 'off the sweet spot';
}

export function shotText(k: ShotState, sweet: number, halfWidth: number): string {
  if (k.state === 0) return '';
  if (k.state === 2) {
    const a = k.crossAlpha;
    const why = a < 20 || a > 340 ? 'no swing' : a < 150 ? `early (bat at ${a.toFixed(0)}°)` : a > 210 ? `late (bat at ${a.toFixed(0)}°)` : `bat at ${a.toFixed(0)}° but the line was off`;
    return `MISSED: ${why}`;
  }
  const lines = [`HIT ${(k.speed * 3.6).toFixed(0)} km/h, ${k.launch.toFixed(0)}° up, ${directionName(k.dir)} (${Math.abs(k.dir).toFixed(0)}° ${k.dir >= 0 ? 'off' : 'leg'})`];
  lines.push(`${contactName(k, sweet, halfWidth)}, bat ${k.batSpeed.toFixed(0)} m/s at ${k.alphaHit.toFixed(0)}°`);
  if (k.state === 3) lines.push(`carried ${k.carry.toFixed(0)} m, ended ${k.end.toFixed(0)} m from the crease`);
  return lines.join('\n');
}
