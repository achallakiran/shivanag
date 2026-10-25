// Draws the app icons in code (no image files needed) and writes them as PNGs.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size, size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));

function icon(u, v, size) {
  let c = [31, 90, 54]; // grass
  const px = 1 / size;
  // pitch strip
  if (Math.abs(u - 0.5) < 0.15) c = [210, 178, 122];
  // bat blade and handle
  if (Math.abs(u - 0.5) < 0.05 && v > 0.52 && v < 0.82) c = [241, 217, 166];
  if (Math.abs(u - 0.5) < 0.02 && v > 0.44 && v <= 0.52) c = [120, 80, 50];
  // ball with soft edge
  const d = Math.hypot(u - 0.5, v - 0.3);
  const cover = Math.min(1, Math.max(0, (0.14 - d) / (1.5 * px) + 0.5));
  c = mix(c, [192, 40, 45], cover);
  return c;
}

export function generateIcons(dir) {
  writeFileSync(join(dir, 'icon-192.png'), png(192, icon));
  writeFileSync(join(dir, 'icon-512.png'), png(512, icon));
  writeFileSync(join(dir, 'apple-touch-icon.png'), png(180, icon));
}
