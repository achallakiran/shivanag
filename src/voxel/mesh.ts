import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { PALETTE } from './palette';

// A voxel part: a small 3D grid of palette indices. `pivot` is the joint position inside the grid, in voxels.
export interface VoxelPart {
  name: string;
  size: [number, number, number];
  pivot: [number, number, number];
  cells: Uint8Array; // x + nx * (y + ny * z)
}

export const VOXEL = 0.05; // metres per voxel

export function makePart(name: string, size: [number, number, number], pivot: [number, number, number], fill: (x: number, y: number, z: number) => number): VoxelPart {
  const [nx, ny, nz] = size;
  const cells = new Uint8Array(nx * ny * nz);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) cells[x + nx * (y + ny * z)] = fill(x, y, z);
  return { name, size, pivot, cells };
}

// Face shading baked into the vertex colours gives the classic blocky voxel look without any lights.
const SHADE = { top: 1.0, bottom: 0.55, px: 0.82, nx: 0.7, pz: 0.9, nz: 0.62 };

const FACES = [
  { n: [1, 0, 0], s: SHADE.px, v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], s: SHADE.nx, v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], s: SHADE.top, v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], s: SHADE.bottom, v: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { n: [0, 0, 1], s: SHADE.pz, v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], s: SHADE.nz, v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
] as const;

export function buildVoxelData(part: VoxelPart): { positions: number[]; indices: number[]; colors: number[]; normals: number[] } {
  const [nx, ny, nz] = part.size;
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? 0 : part.cells[x + nx * (y + ny * z)]!);
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const c = at(x, y, z);
        if (!c) continue;
        const rgb = PALETTE[c]!;
        for (const f of FACES) {
          if (at(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
          const base = positions.length / 3;
          for (const v of f.v) {
            positions.push((x + v[0] - part.pivot[0]) * VOXEL, (y + v[1] - part.pivot[1]) * VOXEL, (z + v[2] - part.pivot[2]) * VOXEL);
            colors.push(rgb[0] * f.s, rgb[1] * f.s, rgb[2] * f.s, 1);
            normals.push(f.n[0], f.n[1], f.n[2]);
          }
          // Babylon is left-handed: wind so the outward face is front-facing
          indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
        }
      }
    }
  }
  return { positions, indices, colors, normals };
}

export function buildMesh(part: VoxelPart, scene: Scene, material: import('@babylonjs/core/Materials/material').Material): Mesh {
  const d = buildVoxelData(part);
  const mesh = new Mesh(part.name, scene);
  const vd = new VertexData();
  vd.positions = d.positions;
  vd.indices = d.indices;
  vd.colors = d.colors;
  vd.normals = d.normals;
  vd.applyToMesh(mesh);
  mesh.material = material;
  mesh.hasVertexAlpha = false;
  return mesh;
}
