// Colours for the voxel batsman. Index 0 is "empty".
export type Rgb = [number, number, number];
export const PALETTE: Rgb[] = [
  [0, 0, 0], // 0 empty
  [0.85, 0.6, 0.44], // 1 skin
  [0.12, 0.34, 0.8], // 2 shirt
  [0.08, 0.24, 0.6], // 3 shirt shade
  [0.93, 0.93, 0.9], // 4 whites
  [0.78, 0.78, 0.74], // 5 pad strap / shade
  [0.07, 0.13, 0.38], // 6 helmet navy
  [0.13, 0.13, 0.16], // 7 dark (grill, boots, handle)
  [0.9, 0.72, 0.4], // 8 willow
  [0.74, 0.55, 0.26], // 9 willow edge
  [0.97, 0.97, 0.95], // 10 glove
];
export const C = { skin: 1, shirt: 2, shade: 3, white: 4, strap: 5, navy: 6, dark: 7, wood: 8, edge: 9, glove: 10 } as const;
