// Arcade hit rules: pure functions, no rendering. Timing error e = (time the ball reaches the bat) - (time the bat
// reaches the ball), in seconds: positive means the swing was EARLY, negative means LATE.
export interface Windows { perfect: number; good: number; mistimed: number }

// Easy at first, narrower with every ball.
export function windowsFor(ballIndex: number): Windows {
  const s = Math.max(0.6, 1 - 0.06 * ballIndex);
  return { perfect: 0.06 * s, good: 0.11 * s, mistimed: 0.2 * s };
}

export type Grade = 'perfect' | 'good' | 'mistimed' | 'miss';
export function gradeOf(e: number, w: Windows): Grade {
  const a = Math.abs(e);
  return a <= w.perfect ? 'perfect' : a <= w.good ? 'good' : a <= w.mistimed ? 'mistimed' : 'miss';
}

export function gradeText(e: number, g: Grade): string {
  if (g === 'perfect') return 'PERFECT';
  if (g === 'good') return e > 0 ? 'Early' : 'Late';
  if (g === 'mistimed') return e > 0 ? 'Too early' : 'Too late';
  return e > 0 ? 'Missed: too early' : 'Missed: too late';
}

// How well a stance suits the ball. length = metres from the batting stumps to where it pitched; height = ball height at the bat.
export function stanceFit(stance: number, length: number, height: number): number {
  const full = length < 3.2 ? 1 : length < 4.5 ? (4.5 - length) / 1.3 : 0;
  const short = length > 6 ? 1 : length > 4.5 ? (length - 4.5) / 1.5 : 0;
  const good = Math.max(0, 1 - full - short);
  const table: Array<[number, number, number]> = [
    [0.75, 0.85, 0.75], // Ready: neutral
    [0.3, 0.75, 1], // Back foot
    [1, 0.85, 0.3], // Front foot
    [0.9, 0.7, 0.2], // Sweep
    [0.75, 0.55, 0.15], // Reverse sweep
    [0.9, 1, 0.35], // Step up and hit
  ];
  const [f, g, s] = table[stance]!;
  let fit = f * full + g * good + s * short;
  if ((stance === 3 || stance === 4) && height > 0.6) fit *= 0.4; // sweeps need a low ball
  return Math.max(0, Math.min(1, fit));
}

export interface HitInput {
  e: number;
  w: Windows;
  stance: number;
  length: number;
  height: number;
  lateral: number; // metres the ball is from the batter's line at the bat
  dx: number; // swipe direction on screen (unit), dy grows downward = toward the camera
  dy: number;
  speed: number; // swipe speed, screen heights per second
}
export interface HitResult {
  hit: boolean;
  grade: Grade;
  text: string;
  quality: number;
  vel: [number, number, number]; // sim frame: x screen-right, y up, z toward the bowler/camera
}

export const REACH = 1.0;

export function resolveHit(h: HitInput): HitResult {
  const grade = gradeOf(h.e, h.w);
  const miss = (text: string): HitResult => ({ hit: false, grade: 'miss', text, quality: 0, vel: [0, 0, 0] });
  if (grade === 'miss') return miss(gradeText(h.e, grade));
  if (Math.abs(h.lateral) > REACH) return miss('Missed: too wide');
  const gf = grade === 'perfect' ? 1 : grade === 'good' ? 0.88 : 0.5;
  const fit = stanceFit(h.stance, h.length, h.height);
  const q = gf * (0.35 + 0.65 * fit);
  const p = Math.max(0, Math.min(1, (h.speed - 0.8) / 2.7));
  let phi = Math.atan2(h.dx, h.dy); // 0 = toward the camera (straight)
  if (grade === 'mistimed') phi += (h.e > 0 ? 1 : -1) * 0.5;
  const edged = q < 0.3;
  if (edged) phi += (h.lateral >= 0 ? -1 : 1) * 0.6;
  const loftPref = [0.7, 0.8, 0.6, 0.9, 0.8, 1][h.stance]!;
  const speed = (5 + 24 * p * (0.35 + 0.65 * q)) * (edged ? 0.6 : 1);
  const el = ((4 + 34 * p * loftPref + (grade === 'mistimed' ? 14 : 0) + (1 - fit) * 10) * Math.PI) / 180;
  const vel: [number, number, number] = [speed * Math.cos(el) * Math.sin(phi), speed * Math.sin(el), speed * Math.cos(el) * Math.cos(phi)];
  const text = edged ? 'Edged!' : gradeText(h.e, grade);
  return { hit: true, grade, text, quality: q, vel };
}

// Runs for a ball that has come to rest `d` metres from the pitch centre.
export function runsFor(d: number): number {
  return d < 12 ? 0 : d < 25 ? 1 : d < 40 ? 2 : 3;
}
