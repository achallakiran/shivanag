// Headless software rasteriser for checking how the scene looks without a GPU. It draws the real Babylon scene (same
// meshes, cameras) with a z-buffer. Meshes with vertex colours are drawn with those colours, unlit; other meshes use
// their material colour. It is a sanity check for poses, framing and proportions, not pixel-exact WebGL output.
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { deflateSync } from 'node:zlib';

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
export function png(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function rasterize(scene: Scene, W: number, H: number): Uint8Array {
  scene.render();
  const cam = scene.activeCamera!;
  const view = cam.getViewMatrix(true);
  const proj = cam.getProjectionMatrix(true);
  const sky = scene.clearColor;
  const rgb = new Uint8Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) {
    rgb[i * 3] = sky.r * 255;
    rgb[i * 3 + 1] = sky.g * 255;
    rgb[i * 3 + 2] = sky.b * 255;
  }
  const meshes = scene.meshes.filter((m) => m.isEnabled() && m.getTotalVertices() > 0) as Mesh[];
  for (const m of meshes) {
    const wm = m.computeWorldMatrix(true);
    const pos = m.getVerticesData('position')!;
    const idx = m.getIndices()!;
    const colors = m.getVerticesData('color');
    const mat = m.material as StandardMaterial;
    const flat = mat.emissiveColor && mat.disableLighting ? mat.emissiveColor : mat.diffuseColor;
    const wp: Vector3[] = [];
    const vv: Vector3[] = [];
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
      let r: number, g: number, bl: number;
      if (colors) {
        r = ((colors[i0 * 4]! + colors[i1 * 4]! + colors[i2 * 4]!) / 3) * 255;
        g = ((colors[i0 * 4 + 1]! + colors[i1 * 4 + 1]! + colors[i2 * 4 + 1]!) / 3) * 255;
        bl = ((colors[i0 * 4 + 2]! + colors[i1 * 4 + 2]! + colors[i2 * 4 + 2]!) / 3) * 255;
      } else {
        r = flat.r * 255; g = flat.g * 255; bl = flat.b * 255;
      }
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
        const a = sv[0]!, b = sv[f]!, c = sv[f + 1]!;
        const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(den) < 1e-9) continue;
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5, py = y + 0.5;
            const l1 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / den;
            const l2 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / den;
            const l3 = 1 - l1 - l2;
            if (l1 < 0 || l2 < 0 || l3 < 0) continue;
            const z = l1 * a.z + l2 * b.z + l3 * c.z;
            const di = y * W + x;
            if (z >= depth[di]!) continue;
            depth[di] = z;
            rgb[di * 3] = Math.min(255, r);
            rgb[di * 3 + 1] = Math.min(255, g);
            rgb[di * 3 + 2] = Math.min(255, bl);
          }
        }
      }
    }
  }
  return rgb;
}
