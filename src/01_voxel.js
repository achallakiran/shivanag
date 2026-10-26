/* Shivanag — voxel world + mesher with baked AO and bevel texture (M1) */
const M = {
  AIR: 0, SAND: 1, SAND2: 2, BASE: 3, WALL: 4, CAP: 5, PILLAR: 6, STEP: 7, DARK: 8,
  GRASS: 9, GRASS2: 10, WOOD: 11, LEAF: 12, LEAF2: 13, TRUNK: 14, ROCK: 15, ROCK2: 16,
  WATER: 17, BARS: 18, RUG: 19, FLOWER1: 20, FLOWER2: 21, BEAM: 22, RUBBLE: 23, PATH: 24, WALLX: 25, CAPX: 26
};
const MD = [];
function defMat(id, color, jitter, walk) { MD[id] = { c: hex(color), j: jitter, walk: !!walk }; }
defMat(M.SAND, 0xdcbc8c, .05, 1); defMat(M.SAND2, 0xd0ae7e, .05, 1);
defMat(M.BASE, 0xb08a5e, .06); defMat(M.WALL, 0xcaa070, .07); defMat(M.CAP, 0xdbb888, .05, 1);
defMat(M.PILLAR, 0xe0c79e, .04, 1); defMat(M.STEP, 0xe6cd9f, .04, 1); defMat(M.DARK, 0x3b3843, .04);
defMat(M.GRASS, 0x74a64c, .06, 1); defMat(M.GRASS2, 0x68994a, .06, 1); defMat(M.WOOD, 0x9c6b3e, .06, 1);
defMat(M.LEAF, 0x5f9a3b, .09); defMat(M.LEAF2, 0x7db048, .09); defMat(M.TRUNK, 0x7b5233, .05);
defMat(M.ROCK, 0x8d7260, .07); defMat(M.ROCK2, 0x75604f, .07); defMat(M.WATER, 0x3f93b8, 0);
defMat(M.BARS, 0x34333a, .03); defMat(M.RUG, 0xb4483a, .04, 1);
defMat(M.FLOWER1, 0xe8809f, .05, 1); defMat(M.FLOWER2, 0xf0d25a, .05, 1);
defMat(M.BEAM, 0xc89a6c, .05, 1); defMat(M.WALLX, 0xcaa070, .07); defMat(M.CAPX, 0xdbb888, .05); defMat(M.RUBBLE, 0xb99a76, .1); defMat(M.PATH, 0xc3a273, .05, 1);

class VoxelWorld {
  constructor(sx, sz, ymin, ymax) {
    this.sx = sx; this.sz = sz; this.y0 = ymin; this.sy = ymax - ymin + 1;
    this.d = new Uint8Array(sx * this.sy * sz);
  }
  idx(x, y, z) { return x + (y - this.y0) * this.sx + z * this.sx * this.sy; }
  inb(x, y, z) { return x >= 0 && x < this.sx && z >= 0 && z < this.sz && y >= this.y0 && y < this.y0 + this.sy; }
  get(x, y, z) { return this.inb(x, y, z) ? this.d[this.idx(x, y, z)] : 0; }
  set(x, y, z, m) { if (this.inb(x, y, z)) this.d[this.idx(x, y, z)] = m; }
  box(x0, y0, z0, x1, y1, z1, m) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, m);
  }
  solid(x, y, z) { const m = this.get(x, y, z); return m !== 0 && m !== M.WATER && m !== M.BARS; }
  walk(x, y, z) { const m = this.get(x, y, z); return m !== 0 && MD[m].walk; }
  mirrorX() {
    const n = new Uint8Array(this.d.length);
    for (let z = 0; z < this.sz; z++) for (let y = 0; y < this.sy; y++) for (let x = 0; x < this.sx; x++)
      n[x + y * this.sx + z * this.sx * this.sy] = this.d[(this.sx - 1 - x) + y * this.sx + z * this.sx * this.sy];
    this.d = n;
  }
  // walkable surface height (top of voxel) for a column, reachable from height `from` (step up/down by 1)
  surface(x, z, from) {
    const tries = [0, 1, -1];
    for (const dy of tries) {
      const top = from + dy;
      const a = this.get(x, top, z);
      if (this.walk(x, top - 1, z) && (a === 0 || a === M.LEAF || a === M.LEAF2)) return top;
    }
    return null;
  }
}

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_B = [0.50, 0.68, 0.84, 1.0];
const WATER_TOP = 0.82;

function vertexAO(w, x, y, z, n, c, t1, t2) {
  const p = [x + n[0], y + n[1], z + n[2]];
  const s1 = c[t1] ? 1 : -1, s2 = c[t2] ? 1 : -1;
  const a = p.slice(); a[t1] += s1;
  const b = p.slice(); b[t2] += s2;
  const k = p.slice(); k[t1] += s1; k[t2] += s2;
  const sa = w.solid(a[0], a[1], a[2]) ? 1 : 0;
  const sb = w.solid(b[0], b[1], b[2]) ? 1 : 0;
  const sk = w.solid(k[0], k[1], k[2]) ? 1 : 0;
  if (sa && sb) return 0;
  return 3 - (sa + sb + sk);
}

function meshWorld(w, scene, voxMat, waterMat) {
  const P = [], N = [], C = [], U = [], I = [];
  const WP = [], WN = [], WU = [], WI = [];
  for (let z = 0; z < w.sz; z++) for (let y = w.y0; y < w.y0 + w.sy; y++) for (let x = 0; x < w.sx; x++) {
    const m = w.get(x, y, z);
    if (m === 0 || m === M.BARS) continue; // BARS = invisible collision (drawn as real bars in props)
    if (m === M.WATER) {
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        if (F.n[1] === -1) continue;
        if (w.get(x + F.n[0], y + F.n[1], z + F.n[2]) !== 0) continue;
        const base = WP.length / 3;
        for (let k = 0; k < 4; k++) {
          const c = F.c[k];
          WP.push(x + c[0], y + (c[1] ? WATER_TOP : 0), z + c[2]);
          WN.push(F.n[0], F.n[1], F.n[2]);
          WU.push((x + c[0]) / 5, (z + c[2]) / 5);
        }
        WI.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      continue;
    }
    const md = MD[m];
    const jit = 1 + (hash3(x, y, z) - 0.5) * 2 * md.j;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nm = w.get(x + F.n[0], y + F.n[1], z + F.n[2]);
      if (nm !== 0 && nm !== M.WATER && nm !== M.BARS) continue;
      const axis = F.n[0] ? 0 : (F.n[1] ? 1 : 2);
      const t1 = (axis + 1) % 3, t2 = (axis + 2) % 3;
      const ao = [0, 0, 0, 0];
      const fj = 1 + (hash3(x * 7 + f, y * 3, z * 5) - 0.5) * 0.04;
      const base = P.length / 3;
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        ao[k] = vertexAO(w, x, y, z, F.n, c, t1, t2);
        P.push(x + c[0], y + c[1], z + c[2]);
        N.push(F.n[0], F.n[1], F.n[2]);
        const b = AO_B[ao[k]] * jit * fj;
        C.push(md.c[0] * b, md.c[1] * b, md.c[2] * b, 1);
        U.push(UVS[k][0], UVS[k][1]);
      }
      if (ao[0] + ao[2] < ao[1] + ao[3]) I.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const out = {};
  const vd = new B.VertexData();
  vd.positions = P; vd.normals = N; vd.colors = C; vd.uvs = U; vd.indices = new Uint32Array(I);
  const mesh = new B.Mesh('voxels', scene);
  vd.applyToMesh(mesh, false);
  mesh.material = voxMat; mesh.receiveShadows = true;
  mesh.isPickable = false;
  out.solid = mesh;
  if (WI.length) {
    const wd = new B.VertexData();
    wd.positions = WP; wd.normals = WN; wd.uvs = WU; wd.indices = WI;
    const wm = new B.Mesh('water', scene);
    wd.applyToMesh(wm, false);
    wm.material = waterMat; wm.isPickable = false; wm.alphaIndex = 5;
    out.water = wm;
  }
  out.faces = I.length / 6;
  return out;
}

function makeBevelTexture(scene) {
  const S = 128;
  const tex = new B.DynamicTexture('bevel', S, scene, true, B.Texture.TRILINEAR_SAMPLINGMODE);
  const g = tex.getContext();
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(5);
  for (let i = 0; i < 700; i++) {
    const v = rnd(), s = 1 + rnd() * 3;
    g.fillStyle = v > .5 ? `rgba(255,255,255,${(.07 * rnd()).toFixed(3)})` : `rgba(0,0,0,${(.09 * rnd()).toFixed(3)})`;
    g.fillRect(rnd() * S, rnd() * S, s, s);
  }
  const e = 13;
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(0,0,0,0.27)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
  };
  edge(0, 0, e, 0, 0, 0, e, S); edge(S, 0, S - e, 0, S - e, 0, e, S);
  edge(0, 0, 0, e, 0, 0, S, e); edge(0, S, 0, S - e, 0, S - e, S, e);
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2;
  g.strokeRect(e * 0.7, e * 0.7, S - e * 1.4, S - e * 1.4);
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 3; g.strokeRect(1, 1, S - 2, S - 2);
  tex.update(true);
  tex.wrapU = tex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

function makeWaterTexture(scene) {
  const S = 256;
  const tex = new B.DynamicTexture('waterfx', S, scene, true);
  const g = tex.getContext();
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(21);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, len = 14 + rnd() * 26;
    g.strokeStyle = `rgba(255,255,255,${(.10 + rnd() * .2).toFixed(2)})`;
    g.lineWidth = 1.5 + rnd() * 1.5;
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const px = x + (t - .5) * len, py = y + Math.sin(t * 6 + i) * 2.5;
      // wrap-friendly: draw twice offset
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  tex.update(true);
  tex.wrapU = tex.wrapV = B.Texture.WRAP_ADDRESSMODE;
  return tex;
}
