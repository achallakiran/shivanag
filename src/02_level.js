/* Shivanag — level 1 "The Naga's Courtyard" (designed in map space, mirrored on X for LH camera) */
const LV = { W: 32, D: 30 };


// tall trees with a limb toward (cx, cz), bushes and rocks
function vegetation(w, cx, cz) {
  const tree = (x, z, h0) => {
    const H = h0 + 8; // very tall trunk: tree tops are well above the courtyard
    w.box(x, 2, z, x, 1 + H, z, M.TRUNK);
    // a limb off the trunk toward the courtyard centre, three voxels below the trunk top: the snake climbs the trunk on that side
    // and mounts the limb from below; a clear gap separates it from the leaf crown above
    const tx = cx - x, tz = cz - z, bx = Math.abs(tx) >= Math.abs(tz) ? Math.sign(tx) : 0, bz = bx ? 0 : Math.sign(tz);
    for (let k = 1; k <= (h0 >= 3 ? 3 : 2); k++) if (w.get(x + bx * k, H - 2, z + bz * k) === 0) w.set(x + bx * k, H - 2, z + bz * k, M.BRANCH);
    const cy = 2 + H;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 2; dy++) {
      const r2 = dx * dx + dz * dz + dy * dy * 1.6;
      if (r2 <= 3.3 + hash3(x + dx, cy + dy, z + dz) * 1.5 && w.get(x + dx, cy + dy, z + dz) === 0)
        w.set(x + dx, cy + dy, z + dz, hash3(x + dx, dy, z + dz) > .5 ? M.LEAF : M.LEAF2);
    }
  };
  const bush = (x, z) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) {
      if (Math.abs(dx) + Math.abs(dz) + dy * 1.2 <= 2.2 && w.get(x + dx, 2 + dy, z + dz) === 0)
        w.set(x + dx, 2 + dy, z + dz, hash3(x + dx, dy, z + dz) > .5 ? M.LEAF : M.LEAF2);
    }
  };
  const rock = (x, z, tall) => { w.set(x, 2, z, M.ROCK); if (tall) w.set(x, 3, z, M.ROCK2); };
  return { tree, bush, rock };
}

function buildCourtyard() {
  const W = LV.W, D = LV.D;
  const w = new VoxelWorld(W, D, -8, 22);
  const rnd = mulberry32(11);

  // ---- floating island underside ----
  for (let k = 1; k <= 7; k++) {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const edge = Math.min(x, W - 1 - x, z, D - 1 - z);
      const inset = k * 1.7 + hash3(x, k, z) * 1.6;
      if (edge >= inset) w.set(x, -k, z, (k & 1) ? M.ROCK : M.ROCK2);
    }
  }
  // ---- base slab + courtyard floor ----
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    w.set(x, 0, z, M.BASE);
    w.set(x, 1, z, ((x + z) & 1) ? M.SAND : M.SAND2);
  }
  const grass = (x0, z0, x1, z1) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const r = hash3(x, 9, z);
      let m = ((x * 3 + z * 5) % 7 < 3) ? M.GRASS : M.GRASS2;
      if (r > .972) m = M.FLOWER1; else if (r > .94) m = M.FLOWER2;
      w.set(x, 1, z, m);
    }
  };
  grass(1, 8, 8, 19); grass(0, 0, 9, 6); grass(22, 0, 31, 6); grass(0, 24, 31, 29);
  grass(0, 7, 0, 19); grass(9, 7, 9, 7);
  // paths
  w.box(15, 1, 18, 17, 1, 21, M.PATH);
  w.box(15, 1, 7, 17, 1, 10, M.PATH);
  w.box(15, 1, 24, 17, 1, 27, M.PATH);

  // ---- moat + bridge ----
  for (let x = 0; x < W; x++) for (let z = 22; z <= 23; z++) w.set(x, 1, z, M.WATER);
  w.box(15, 1, 22, 17, 1, 23, M.WOOD);
  w.box(14, 2, 22, 14, 2, 23, M.WALL); w.box(18, 2, 22, 18, 2, 23, M.WALL);
  w.box(14, 3, 22, 14, 3, 23, M.CAP); w.box(18, 3, 22, 18, 3, 23, M.CAP);

  // ---- shrine ----
  w.box(13, 2, 11, 19, 2, 17, M.STEP);
  w.box(14, 3, 12, 18, 3, 16, M.STEP);
  w.box(15, 4, 13, 17, 4, 15, M.STEP);
  w.box(16, 5, 14, 16, 7, 14, M.DARK); // shivalinga

  // ---- pillars ----
  const pillar = (px, pz, h) => {
    w.box(px, 2, pz, px + 1, 2, pz + 1, M.BASE);
    w.box(px, 3, pz, px + 1, 2 + h, pz + 1, M.PILLAR);
    if (h >= 4) w.box(px - 1, 3 + h, pz - 1, px + 2, 3 + h, pz + 2, M.CAP);
  };
  pillar(10, 9, 4); pillar(10, 18, 2); pillar(21, 9, 4); pillar(21, 18, 1);
  w.box(10, 7, 12, 11, 7, 14, M.BEAM);
  w.box(21, 7, 12, 22, 7, 13, M.BEAM);
  for (let z = 16; z <= 21; z++) for (let x = 19; x <= 23; x++) {
    if (x >= 21 && x <= 22 && z >= 18 && z <= 19) continue;
    if (hash3(x, 4, z) > .74) w.set(x, 2, z, M.RUBBLE);
  }

  // poles: slim climbable shafts (one reaches the high pillar's cap)
  w.box(8, 2, 10, 8, 7, 10, M.POLE); w.box(7, 2, 13, 7, 4, 13, M.POLE);

  // ---- king's cell ----
  const bars = [];
  w.box(12, 2, 1, 20, 2, 1, M.WALLX); w.box(12, 2, 1, 12, 2, 6, M.WALLX); w.box(20, 2, 1, 20, 2, 6, M.WALLX);
  w.box(12, 3, 1, 20, 3, 1, M.CAPX); w.box(12, 3, 1, 12, 3, 6, M.CAPX); w.box(20, 3, 1, 20, 3, 6, M.CAPX);
  for (let x = 12; x <= 20; x++) {
    if (x === 12 || x === 20) { w.set(x, 2, 6, M.WALLX); w.set(x, 3, 6, M.CAPX); }
    else { w.set(x, 2, 6, M.BARS); w.set(x, 3, 6, M.BARS); if (x % 2 === 0) bars.push(x); }
  }
  w.box(13, 1, 2, 19, 1, 5, M.STEP);
  w.box(14, 1, 2, 18, 1, 4, M.RUG);

  // ---- maze (east) ----
  const mx = 24, mz = 8, mw = 7, mh = 13;
  w.box(mx, 2, mz, mx + mw - 1, 3, mz + mh - 1, M.WALLX);
  const cols = (mw - 1) / 2, rows = (mh - 1) / 2;
  const seen = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const carve = (x, z) => { w.set(x, 2, z, 0); w.set(x, 3, z, 0); };
  const stack = [[0, 0]]; seen[0][0] = true; carve(mx + 1, mz + 1);
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => {
      const ni = i + a, nj = j + b; return ni >= 0 && ni < cols && nj >= 0 && nj < rows && !seen[nj][ni];
    });
    if (!nb.length) { stack.pop(); continue; }
    const [a, b] = nb[Math.floor(rnd() * nb.length)];
    const ni = i + a, nj = j + b;
    carve(mx + 1 + 2 * ni, mz + 1 + 2 * nj);
    carve(mx + 1 + 2 * i + a, mz + 1 + 2 * j + b);
    seen[nj][ni] = true; stack.push([ni, nj]);
  }
  carve(mx, mz + 1 + 2 * 3); // entrance
  for (let z = mz; z < mz + mh; z++) for (let x = mx; x < mx + mw; x++)
    if (w.get(x, 3, z) === M.WALLX) w.set(x, 3, z, M.CAPX);

  // ---- torch posts ----
  const torches = [
    { x: 12, z: 10, light: false }, { x: 20, z: 10, light: false },
    { x: 12, z: 18, light: true }, { x: 20, z: 18, light: true },
    { x: 14, z: 21, light: false }, { x: 18, z: 21, light: false },
    { x: 14, z: 7, light: true }, { x: 18, z: 7, light: false },
  ];
  for (const t of torches) { w.set(t.x, 2, t.z, M.BASE); w.set(t.x, 3, t.z, M.PILLAR); }

  // ---- vegetation ----
  const { tree, bush, rock } = vegetation(w, 16, 14);
  [[3, 10, 3], [6, 16, 2], [2, 18, 2], [4, 3, 3], [7, 4, 2], [26, 3, 3], [29, 2, 3], [3, 27, 2], [10, 28, 2], [27, 27, 2], [30, 25, 2]]
    .forEach(([x, z, h]) => tree(x, z, h));
  [[5, 9], [8, 18], [2, 13], [10, 3], [23, 4], [13, 25], [19, 26], [7, 27]].forEach(([x, z]) => bush(x, z));
  [[8, 9, 1], [1, 16, 0], [29, 26, 1], [20, 25, 0], [6, 13, 0], [12, 5, 0]].forEach(([x, z, t]) => { if (w.get(x, 1, z) !== M.WATER) rock(x, z, t); });

  // ---- mirror on X so the default LH camera shows the map as designed ----
  w.mirrorX();
  const mx_ = (x) => W - x; // continuous design x -> world x
  const cell = (x, z) => ({ x: W - 1 - x, z });
  return {
    world: w, W, D,
    torches: torches.map(t => ({ x: mx_(t.x + .5), z: t.z + .5, light: t.light })),
    king: { x: mx_(16.5), y: 2.0, z: 3.5 },
    linga: { x: mx_(16.5), top: 8, z: 14.5 },
    spawnCells: [[15, 14], [15, 15], [16, 15], [17, 15], [17, 14], [17, 13], [16, 13], [15, 13]].map(c => cell(c[0], c[1])),
    spawnTop: 5,
    bars: bars.map(x => W - (x + .5)),
  };
}


/* scale the hand-designed courtyard up so walkways, pillars and walls are big enough for the characters */
const SC = 2;
function scaleCourtyard(I) {
  const S = SC, w = new VoxelWorld(I.W * S, I.D * S, -8, 22), src = I.world;
  for (let z = 0; z < I.D; z++) for (let y = -8; y <= 22; y++) for (let x = 0; x < I.W; x++) {
    const m = src.get(x, y, z); if (m === 0) continue;
    if (y <= 1) { for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) w.set(x * S + i, y, z * S + j, m); continue; }
    const by = 2 + (y - 2) * S;
    for (let k = 0; k < S; k++) for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      if (m === M.POLE && (i || j)) continue; // poles stay a single slim shaft
      w.set(x * S + i, by + k, z * S + j, m);
    }
  }
  return w;
}

/* the full island: the enlarged courtyard sits in a grassy border with a few trees and a patrol lane */
const OX = 6, OZ = 6;
function buildLevel() {
  const I = buildCourtyard(), S = SC, SW = scaleCourtyard(I), IW = I.W * S, ID = I.D * S, W = IW + 2 * OX, D = ID + 2 * OZ;
  const w = new VoxelWorld(W, D, -8, 22);
  for (let k = 1; k <= 8; k++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const edge = Math.min(x, W - 1 - x, z, D - 1 - z), inset = k * 1.8 + hash3(x, k, z) * 1.7;
    if (edge >= inset) w.set(x, -k, z, (k & 1) ? M.ROCK : M.ROCK2);
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    w.set(x, 0, z, M.BASE);
    const r = hash3(x, 9, z); let m = ((x * 3 + z * 5) % 7 < 3) ? M.GRASS : M.GRASS2;
    if (r > .975) m = M.FLOWER1; else if (r > .95) m = M.FLOWER2;
    w.set(x, 1, z, m);
  }
  for (let x = 0; x < W; x++) for (let z = 22 * S + OZ; z < 24 * S + OZ; z++) w.set(x, 1, z, M.WATER); // the moat runs the full width
  for (let x = 6; x < W - 6; x++) for (let z = D - OZ + 2; z <= D - OZ + 3; z++) w.set(x, 1, z, ((x + z) & 1) ? M.SAND : M.SAND2); // outer patrol lane
  for (let z = 0; z < ID; z++) for (let y = -8; y <= 22; y++) for (let x = 0; x < IW; x++) { const m = SW.get(x, y, z); if (m !== 0 && y >= 1) w.set(x + OX, y, z + OZ, m); }
  const inside = (x, z, m) => x >= OX - m && x < OX + IW + m && z >= OZ - m && z < OZ + ID + m;
  const veg = vegetation(w, W / 2, D / 2);
  for (let gz = 3; gz < D - 2; gz += 6) for (let gx = 3; gx < W - 2; gx += 6) {
    const x = gx + Math.floor(hash3(gx, 3, gz) * 3), z = gz + Math.floor(hash3(gx, 4, gz) * 3), r = hash3(gx, 5, gz);
    if (inside(x, z, 2) || (z >= D - OZ + 1 && z <= D - OZ + 4)) continue;
    if (r < .45) veg.tree(x, z, 2 + (r < .2 ? 1 : 0)); else if (r < .75) veg.bush(x, z); else veg.rock(x, z, r > .88);
  }
  const fy = (y) => 2 + (y - 2) * S;
  const bars = []; I.bars.forEach(x => { bars.push(x * S + OX, x * S + OX + S); });
  return {
    world: w, W, D, IW: I.W, I0W: I.W, OX, OZ, S,
    torches: I.torches.map(t => ({ x: t.x * S + OX, z: t.z * S + OZ, light: t.light })), torchTop: fy(4),
    king: { x: I.king.x * S + OX, y: I.king.y, z: I.king.z * S + OZ },
    linga: { x: I.linga.x * S + OX, top: fy(I.linga.top), z: I.linga.z * S + OZ },
    spawnCells: I.spawnCells.map(c => ({ x: c.x * S + OX, z: c.z * S + OZ })), spawnTop: fy(I.spawnTop),
    bars, barZ: 6.5 * S + OZ, barY: fy(3), barH: 2 * S, railX: (I.W - 16.5) * S + OX, railW: 7 * S, railYs: [fy(2.35), fy(3.6)],
  };
}
