import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { writeFileSync, mkdirSync } from 'node:fs';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { createStage, frame } from '../src/voxel/stage';
import { createBatsman } from '../src/voxel/rig';
import { STANCES } from '../src/voxel/poses';
import { rasterize, png } from './raster';
const out = process.argv[2]!; mkdirSync(out, { recursive: true });
const stage = createStage(new NullEngine());
createBatsman(stage.scene, stage.voxelMat).apply(STANCES[0]!.pose);
const m = new StandardMaterial('b', stage.scene); m.disableLighting = true; m.emissiveColor = new Color3(0.9, 0.1, 0.1); m.diffuseColor = new Color3(0,0,0);
const b = CreateSphere('b', { diameter: 0.24, segments: 8 }, stage.scene); b.material = m; b.position.set(0.1, 1.2, 9);
const cams: Array<[string, [number, number, number], [number, number, number], number]> = [
  ['0', [0.15, 2.3, 21], [0, 0.9, 0], 0.5], ['1', [0, 5.5, 23], [0, 0.6, 1], 0.35], ['3', [-9, 1.6, 6], [0, 0.9, 6], 0.12], ['4', [0.3, 1.9, -5.5], [0, 0.9, 8], 0.1]];
for (const [n, p, t, f] of cams) { frame(stage.cam, p, t, f); writeFileSync(`${out}/c${n}.png`, png(rasterize(stage.scene, 560, 280), 560, 280)); }
