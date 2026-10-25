import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { SimState } from '../sim/sim';

// Metres. The batting crease sits at z = BAT_Z; the bowler's end is at +z.
const PITCH_LEN = 20.12;
const BAT_Z = -PITCH_LEN / 2 + 1.22;

export interface World {
  scene: Scene;
  update(s: SimState, alpha: number): void;
}

function mat(scene: Scene, r: number, g: number, b: number): StandardMaterial {
  const m = new StandardMaterial(`m${r}${g}${b}`, scene);
  m.diffuseColor = new Color3(r, g, b);
  m.specularColor = Color3.Black();
  m.freeze();
  return m;
}

function box(scene: Scene, name: string, w: number, h: number, d: number, x: number, y: number, z: number, m: StandardMaterial): Mesh {
  const b = CreateBox(name, { width: w, height: h, depth: d }, scene);
  b.position.set(x, y, z);
  b.material = m;
  b.freezeWorldMatrix();
  return b;
}

// Minimal scene: outfield, pitch, stumps, and two toy markers driven by the sim.
export function createWorld(engine: AbstractEngine): World {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.75, 0.95, 1);
  scene.skipPointerMovePicking = true;
  scene.autoClearDepthAndStencil = true;

  const light = new HemisphericLight('sun', new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 1.05;

  const cam = new FreeCamera('cam', new Vector3(0, 3.2, PITCH_LEN / 2 + 7), scene);
  cam.setTarget(new Vector3(0, 1, BAT_Z));
  cam.fov = 0.8;
  cam.minZ = 0.1;
  cam.maxZ = 400;

  const grass = mat(scene, 0.2, 0.55, 0.25);
  const clay = mat(scene, 0.82, 0.7, 0.48);
  const wood = mat(scene, 0.95, 0.9, 0.75);
  const playerMat = mat(scene, 0.2, 0.35, 0.85);
  const batMat = mat(scene, 0.9, 0.75, 0.4);

  box(scene, 'outfield', 200, 0.1, 200, 0, -0.05, 0, grass);
  box(scene, 'pitch', 3.05, 0.02, PITCH_LEN + 2.44, 0, 0.01, 0, clay);
  for (const end of [-PITCH_LEN / 2, PITCH_LEN / 2]) {
    for (const dx of [-0.1143, 0, 0.1143]) box(scene, 'stump', 0.04, 0.711, 0.04, dx, 0.355, end, wood);
  }

  const player = box(scene, 'player', 0.5, 1.8, 0.35, 0, 0.9, BAT_Z, playerMat);
  const bat = box(scene, 'bat', 0.1, 0.9, 0.06, 0.4, 0.9, BAT_Z + 0.4, batMat);
  player.unfreezeWorldMatrix();
  bat.unfreezeWorldMatrix();

  return {
    scene,
    update(s, a) {
      const px = s.ppx + (s.px - s.ppx) * a;
      const pz = s.ppz + (s.pz - s.ppz) * a;
      const bx = s.pbx + (s.bx - s.pbx) * a;
      const by = s.pby + (s.by - s.pby) * a;
      player.position.set(px, 0.9, BAT_Z + pz);
      bat.position.set(px + 0.4 + bx, 0.9 + by * 0.6, BAT_Z + pz + 0.4);
    },
  };
}
