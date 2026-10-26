import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

// The ground, pitch, creases and stumps around the batsman. World: +Z toward the bowler, the batter at the origin
// (hips), the batting crease 1.22 m in front of the batter's stumps. Looking from the bowler's end, screen-right is -X.
export const PITCH_HALF = 10.06;

export interface Stage { scene: Scene; cam: FreeCamera; voxelMat: StandardMaterial }

export function createStage(engine: AbstractEngine): Stage {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.75, 0.95, 1);
  const light = new HemisphericLight('sun', new Vector3(0, 1, 0), scene);
  light.intensity = 1;
  light.diffuse = new Color3(1, 1, 1);
  light.groundColor = new Color3(1, 1, 1);
  light.specular = new Color3(0, 0, 0);

  const flat = (name: string, r: number, g: number, b: number) => {
    const m = new StandardMaterial(name, scene);
    m.disableLighting = true;
    m.emissiveColor = new Color3(r, g, b);
    m.diffuseColor = new Color3(0, 0, 0);
    return m;
  };
  const grass = flat('grass', 0.2, 0.55, 0.25);
  const grass2 = flat('grass2', 0.24, 0.6, 0.29);
  const clay = flat('clay', 0.82, 0.7, 0.48);
  const wood = flat('wood', 0.95, 0.9, 0.75);
  const line = flat('line', 0.97, 0.97, 0.97);
  const box = (n: string, w: number, h: number, d: number, x: number, y: number, z: number, m: StandardMaterial) => {
    const b = CreateBox(n, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z);
    b.material = m;
    return b;
  };
  box('outfield', 200, 0.1, 200, 0, -0.05, 0, grass);
  for (let i = -8; i <= 8; i += 2) box('stripe', 6, 0.01, 200, i * 6, 0.003, 0, grass2);
  // the pitch runs along Z; the striker's stumps are 1.22 m behind the batting crease (z = -1.22 relative to the crease)
  const crease = -0.2; // batter's feet are about here
  const strikerStumps = crease - 1.22;
  box('pitch', 3.05, 0.02, 22.12 + 2.44, 0, 0.011, strikerStumps + 10.06, clay);
  for (const [z, dir] of [[strikerStumps, 1], [strikerStumps + 20.12, -1]] as const) {
    for (const dx of [-0.1143, 0, 0.1143]) box('stump', 0.04, 0.711, 0.04, dx, 0.37, z, wood);
    box('popping', 3.05, 0.004, 0.05, 0, 0.023, z + dir * 1.22, line);
    box('bowling', 2.64, 0.004, 0.05, 0, 0.023, z, line);
    for (const rx of [-1.32, 1.32]) box('return', 0.05, 0.004, 2.4, rx, 0.023, z + dir * 1.2, line);
  }

  const voxelMat = new StandardMaterial('voxel', scene);
  voxelMat.diffuseColor = new Color3(1, 1, 1);
  voxelMat.specularColor = new Color3(0, 0, 0);
  voxelMat.backFaceCulling = false;

  const cam = new FreeCamera('cam', new Vector3(0.1, 1.9, 20), scene);
  cam.minZ = 0.1;
  cam.maxZ = 400;
  cam.setTarget(new Vector3(0, 0.9, 0));
  return { scene, cam, voxelMat };
}

// Frame the batsman so he fills `fill` of the view height as seen from `pos`.
export function frame(cam: FreeCamera, pos: [number, number, number], target: [number, number, number], fill: number, height = 1.8): void {
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.setTarget(new Vector3(target[0], target[1], target[2]));
  const dist = Vector3.Distance(cam.position, new Vector3(target[0], target[1], target[2]));
  cam.fov = 2 * Math.atan(height / fill / 2 / dist);
}
