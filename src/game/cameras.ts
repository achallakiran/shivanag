// Camera presets. The ball is released 17.9 m from the batter, so the useful views sit behind the bowler's stumps
// (z about 18.7). `fill` is how much of the view height a 1.8 m figure at the target fills; `fov` (degrees) sets a fixed lens instead.
export type V3 = [number, number, number];
export interface Cam { name: string; pos: V3; target: V3; fill: number; fov?: number; ball: number }
// Cameras. The ball is released 17.9 m from the batter, so the first views sit behind the bowler's stumps with a long lens.
export const CAMS: Cam[] = [
  { name: 'Bowler end', pos: [0.15, 2.3, 21], target: [0, 0.9, 0], fill: 0.5, ball: 1 },
  { name: 'Photo view', pos: [0.3, 2.3, 29], target: [0, 0.6, 12], fill: 0, fov: 16, ball: 2.2 },
  { name: 'Photo, batsman bigger', pos: [0.3, 2.3, 29], target: [0, 1.0, 4], fill: 0, fov: 10.5, ball: 1.8 },
  { name: 'Tele, batsman big', pos: [0.2, 2.2, 22.8], target: [0, 0.95, 0], fill: 0.72, ball: 1 },
  { name: 'Low over the stumps', pos: [0, 1.0, 21.4], target: [0, 0.9, 0], fill: 0.4, ball: 1.1 },
  { name: 'Medium, wide pitch', pos: [0.1, 2.6, 25.5], target: [0, 0.7, 5], fill: 0, fov: 18, ball: 1.8 },
  { name: 'Off-side angle', pos: [2.6, 2.0, 22], target: [0, 0.95, 0], fill: 0.55, ball: 1.1 },
  { name: 'Leg-side angle', pos: [-2.6, 2.0, 22], target: [0, 0.95, 0], fill: 0.55, ball: 1.1 },
  { name: 'High behind bowler', pos: [0, 5.5, 23], target: [0, 0.6, 1], fill: 0.35, ball: 1.3 },
  { name: 'Batsman close', pos: [0.1, 1.7, 9], target: [0, 0.85, 0], fill: 0.8, ball: 1 },
  { name: 'Side on', pos: [-9, 1.6, 6], target: [0, 0.9, 6], fill: 0.2, ball: 1.5 },
  { name: 'Behind batsman', pos: [0.3, 1.9, -5.5], target: [0, 0.9, 8], fill: 0.2, ball: 1.3 },
];
