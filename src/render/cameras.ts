import type { Vec } from '../sim/skeleton';

// Camera presets. Positions are in the "view frame" of the skeleton (X is screen-right
// as seen from the bowler's end, Z toward the bowler), so for a left-hander every X is
// mirrored automatically. The camera only looks at the sim; it never changes it.
export interface CamSpec {
  id: string;
  label: string;
  pos: Vec;
  target: Vec;
  fov: number; // vertical, radians
  follow?: 'head'; // first person: the position is the batter's head plus pos
}

const CREASE_Z = -20.12 / 2 + 1.22;

export const CAMERAS: CamSpec[] = [
  // Like the console cricket games: behind the bowler's stumps, raised, long lens, batter large and central.
  { id: 'broadcast', label: 'Broadcast (behind bowler)', pos: [0.2, 3.4, 11.8], target: [0.3, 0.95, CREASE_Z], fov: 0.22 },
  { id: 'high', label: 'Behind bowler, high', pos: [0.2, 6.5, 14.5], target: [0.3, 0.5, CREASE_Z], fov: 0.4 },
  { id: 'stump', label: 'Stump level', pos: [0.1, 0.55, 11.2], target: [0.3, 0.9, CREASE_Z], fov: 0.3 },
  { id: 'behind', label: 'Behind batter', pos: [0.1, 2.0, CREASE_Z - 4.5], target: [0, 1.0, CREASE_Z + 6], fov: 0.65 },
  { id: 'shoulder', label: 'Over the shoulder', pos: [1.0, 1.9, CREASE_Z - 1.6], target: [0, 0.8, CREASE_Z + 8], fov: 0.7 },
  { id: 'side', label: 'Side-on', pos: [-8, 1.5, CREASE_Z], target: [0.4, 1.0, CREASE_Z], fov: 0.5 },
  { id: 'first', label: 'First person', pos: [0.0, 0.0, 0.0], target: [0, 0.9, CREASE_Z + 12], fov: 1.0, follow: 'head' },
];
