// Headless software renderer for checking how the scene looks without a GPU.
// It rasterises the real Babylon scene (same meshes, materials, cameras) with flat
// shading and a z-buffer. It is a sanity check for framing and proportions, not a
// pixel-exact copy of the WebGL output.
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createWorld } from '../src/render/world';
import { CAMERAS } from '../src/render/cameras';
import { createSimState } from '../src/sim/sim';
import { DEFAULT_CONFIG } from '../src/config/defaults';

const W = 1280;
const H = 590;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

interface Shot {
  rgb: Uint8Array;
  headFrac: number; // batter head-to-foot height as a fraction of image height
}

function render(world: ReturnType<typeof createWorld>, engine: NullEngine): Shot {
  const scene = world.scene;
  scene.render();
  const cam = scene.activeCamera!;
  const view = cam.getViewMatrix(true);
  const proj = cam.getProjectionMatrix(true);
  const vp = view.multiply(proj);
  const sky = scene.clearColor;
  const rgb = new Uint8Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) {
    rgb[i * 3] = sky.r * 255;
    rgb[i * 3 + 1] = sky.g * 255;
    rgb[i * 3 + 2] = sky.b * 255;
  }
  const lightDir = new Vector3(0.3, 1, -0.4).normalize();
  const meshes = scene.meshes.filter((m) => m.isEnabled() && m.getTotalVertices() > 0) as Mesh[];
  for (const group of [0, 1]) {
    if (group === 1) depth.fill(Infinity);
    for (const m of meshes) {
      if ((m.renderingGroupId ?? 0) !== group) continue;
      const wm = m.computeWorldMatrix(true);
      const pos = m.getVerticesData('position')!;
      const idx = m.getIndices()!;
      const mat = m.material as StandardMaterial;
      const col = mat.emissiveColor && mat.disableLighting ? mat.emissiveColor : mat.diffuseColor;
      const vv: Vector3[] = [];
      const wp: Vector3[] = [];
      for (let i = 0; i < pos.length; i += 3) {
        const w3 = Vector3.TransformCoordinates(new Vector3(pos[i]!, pos[i + 1]!, pos[i + 2]!), wm);
        wp.push(w3);
        vv.push(Vector3.TransformCoordinates(w3, view));
      }
      const NEAR = 0.1;
      for (let t = 0; t < idx.length; t += 3) {
        const i0 = idx[t]!;
        const i1 = idx[t + 1]!;
        const i2 = idx[t + 2]!;
        let n = Vector3.Cross(wp[i1]!.subtract(wp[i0]!), wp[i2]!.subtract(wp[i0]!)).normalize();
        if (Vector3.Dot(n, cam.position.subtract(wp[i0]!)) < 0) n = n.scale(-1);
        const dd = Vector3.Dot(n, lightDir);
        const lit = mat.disableLighting ? 1 : (0.5 + 0.5 * dd) + (0.5 - 0.5 * dd) * 0.72;
        const r = Math.min(255, col.r * lit * 255);
        const g = Math.min(255, col.g * lit * 255);
        const bl = Math.min(255, col.b * lit * 255);
        // clip the triangle against the near plane (view space z = NEAR)
        let poly: Vector3[] = [vv[i0]!, vv[i1]!, vv[i2]!];
        const out: Vector3[] = [];
        for (let k = 0; k < poly.length; k++) {
          const p = poly[k]!;
          const q = poly[(k + 1) % poly.length]!;
          const pin = p.z >= NEAR;
          const qin = q.z >= NEAR;
          if (pin) out.push(p);
          if (pin !== qin) out.push(Vector3.Lerp(p, q, (NEAR - p.z) / (q.z - p.z)));
        }
        poly = out;
        if (poly.length < 3) continue;
        const sv = poly.map((p) => ({ x: (p.x * proj.m[0]! / p.z * 0.5 + 0.5) * W, y: (1 - (p.y * proj.m[5]! / p.z * 0.5 + 0.5)) * H, z: p.z }));
        for (let f = 1; f + 1 < sv.length; f++) {
          const a = sv[0]!;
          const b = sv[f]!;
          const c = sv[f + 1]!;
          const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
          const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
          const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
          const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
          const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
          if (Math.abs(den) < 1e-9) continue;
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const px = x + 0.5;
              const py = y + 0.5;
              const l1 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / den;
              const l2 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / den;
              const l3 = 1 - l1 - l2;
              if (l1 < 0 || l2 < 0 || l3 < 0) continue;
              const z = l1 * a.z + l2 * b.z + l3 * c.z;
              const di = y * W + x;
              if (z >= depth[di]!) continue;
              depth[di] = z;
              rgb[di * 3] = r;
              rgb[di * 3 + 1] = g;
              rgb[di * 3 + 2] = bl;
            }
          }
        }
      }
    }
  }
  // batter height on screen
  const p = world.pose();
  const proj2 = (v: [number, number, number]) => Vector3.TransformCoordinates(new Vector3(-v[0], v[1], v[2]), vp);
  const top = proj2([p.head[0], p.head[1] + 0.22, p.head[2]]);
  const foot = proj2([p.ankleL[0], 0, p.ankleL[2]]);
  void engine;
  return { rgb, headFrac: Math.abs(top.y - foot.y) / 2 };
}

const outDir = process.argv[2] ?? 'preview';
mkdirSync(outDir, { recursive: true });
const engine = new NullEngine({ renderWidth: W, renderHeight: H, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 });
const world = createWorld(engine, DEFAULT_CONFIG.body);
const s = createSimState();
const poses: [string, number, number][] = [['rest', 0, 0], ['swing', 0.9, 0.3]];
const summary: string[] = [];
for (const [pname, bx, by] of poses) {
  s.bx = s.pbx = bx;
  s.by = s.pby = by;
  for (const rh of [true, false]) {
    CAMERAS.forEach((c, i) => {
      if (pname === 'swing' && !(i === 0 || i === 3)) return;
      if (!rh && !(pname === 'rest' && i === 0)) return;
      world.setView({ camera: i, rightHanded: rh, skeleton: true });
      world.update(s, 1);
      const shot = render(world, engine);
      const name = `${pname}-${rh ? 'RH' : 'LH'}-${c.id}`;
      writeFileSync(`${outDir}/${name}.png`, png(shot.rgb, W, H));
      summary.push(`${name}: batter is ${(shot.headFrac * 100).toFixed(0)}% of image height`);
    });
  }
}
console.log(summary.join('\n'));
