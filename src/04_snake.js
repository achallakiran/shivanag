/* Shivanag — the naga: head + 3 voxel body blocks + 3 shrinking round tail beads; grid movement, climbing */
// every solid surface is climbable except water, bars, leaves (soft) and the maze/cell walls
const CLIMB = new Set();
for (let m = 1; m < MD.length; m++) if (MD[m] && m !== M.WATER && m !== M.BARS && m !== M.WALLX && m !== M.CAPX && m !== M.LEAF && m !== M.LEAF2) CLIMB.add(m);
const SEGS = [
  { k: 'c', s: .70, d: .62 }, { k: 'c', s: .68, d: 1.22 }, { k: 'c', s: .66, d: 1.82 },
  { k: 'c', s: .64, d: 2.40 }, { k: 'c', s: .60, d: 2.96 },
  { k: 's', s: .50, d: 3.46 }, { k: 's', s: .38, d: 3.86 }, { k: 's', s: .26, d: 4.16 },
];
const soft = (m) => m === 0 || m === M.LEAF || m === M.LEAF2;
class Snake {
  constructor(scene, world, spawnCells, top, bevel) {
    this.scene = scene; this.world = world; this.bevel = bevel || null;
    this.path = spawnCells.map(c => ({ x: c.x + .5, y: top, z: c.z + .5 }));
    this.cell = { x: spawnCells[0].x, z: spawnCells[0].z, top };
    this.climb = null; this.climbF = 0; this.pitch = 0;
    this.t = 1; this.dur = 0.2; this.wish = null; this.speedMul = 1; this.actv = null;
    const a = this.path[1], b = this.path[0];
    this.heading = Math.atan2(b.x - a.x, b.z - a.z); this.targetHeading = this.heading;
    this.mv = 0; this.idle = 0; this.lift = 0; this.phase = 0; this.hood = 1;
    this.head = { x: b.x, y: top, z: b.z };
    this.meshes = [];
    this._build();
  }

  _mat(hexcol, spec, emi) {
    const m = new B.StandardMaterial('snk', this.scene);
    m.diffuseColor = col3(hexcol); const s = spec == null ? .2 : spec; m.specularColor = new B.Color3(s, s, s); m.specularPower = 30;
    if (emi) m.emissiveColor = col3(hexcol).scale(emi);
    return m;
  }

  _build() {
    const sc = this.scene, n = SEGS.length;
    this.seg = []; this.dots = [];
    const c0 = hex(0x1f9a5e), c1 = hex(0x1a7a80);
    const dotMat = this._mat(0xe9bf4a, .3, .16);
    SEGS.forEach((sg, i) => {
      const t = i / (n - 1);
      const mat = new B.StandardMaterial('seg', sc);
      const f = (i % 2 ? .9 : 1);
      mat.diffuseColor = new B.Color3(lerp(c0[0], c1[0], t) * f, lerp(c0[1], c1[1], t) * f, lerp(c0[2], c1[2], t) * f);
      mat.specularColor = new B.Color3(.14, .14, .14); mat.specularPower = 28;
      mat.emissiveColor = mat.diffuseColor.scale(.10);
      const m = B.MeshBuilder.CreateSphere('s' + i, { diameter: 1, segments: 12 }, sc);
      m.material = mat; m.isPickable = false; m.scaling.setAll(sg.s);
      this.seg.push(m); this.meshes.push(m);
      if (sg.k === 'c') {
        const d = B.MeshBuilder.CreateSphere('d' + i, { diameter: 1, segments: 8 }, sc);
        d.material = dotMat; d.isPickable = false; d.segIndex = i;
        this.dots.push(d); this.meshes.push(d);
      }
    });
    this.fx = B.MeshBuilder.CreateSphere('fx', { diameter: 1, segments: 10 }, sc); this.fx.isPickable = false; this.fx.setEnabled(false);
    this.fxMat = new B.StandardMaterial('fxm', sc); this.fxMat.disableLighting = true; this.fxMat.emissiveColor = new B.Color3(1, .9, .4); this.fxMat.diffuseColor = B.Color3.Black(); this.fxMat.alpha = .8; this.fxMat.disableDepthWrite = true; this.fx.material = this.fxMat;
    // head
    const head = new B.TransformNode('head', sc); this.headNode = head;
    const skin = this._mat(0x1f9a5e, .2, .10), hoodMat = this._mat(0x2fb877, .15, .12);
    const part = (m, parent, x, y, z, mat, sx, sy, sz) => {
      m.parent = parent; m.position.set(x, y, z); m.material = mat; m.scaling.set(sx, sy, sz); m.isPickable = false; this.meshes.push(m); return m;
    };
    part(B.MeshBuilder.CreateSphere('skull', { diameter: 1, segments: 14 }, sc), head, 0, 0, .06, skin, .56, .44, .68);
    this.hoodRoot = new B.TransformNode('hoodRoot', sc); this.hoodRoot.parent = head; this.hoodRoot.position.set(0, .1, -.2);
    part(B.MeshBuilder.CreateSphere('hood', { diameter: 1, segments: 16 }, sc), this.hoodRoot, 0, 0, 0, hoodMat, 1.3, 1.05, .15);
    part(B.MeshBuilder.CreateSphere('mark', { diameter: 1, segments: 10 }, sc), this.hoodRoot, 0, .03, -.085, this._mat(0xe8b940, .3, .18), .62, .58, .03);
    part(B.MeshBuilder.CreateSphere('markIn', { diameter: 1, segments: 8 }, sc), this.hoodRoot, 0, .03, -.102, this._mat(0x1a1420, .2), .3, .27, .02);
    const white = this._mat(0xffffff, .6, .5), black = this._mat(0x0a0a10, .8);
    [-1, 1].forEach(s => {
      part(B.MeshBuilder.CreateSphere('eye', { diameter: 1, segments: 8 }, sc), head, s * .15, .07, .28, white, .13, .13, .12);
      part(B.MeshBuilder.CreateSphere('pup', { diameter: 1, segments: 6 }, sc), head, s * .16, .07, .335, black, .07, .08, .05);
    });
    this.tongue = part(B.MeshBuilder.CreateBox('tongue', { width: 1, height: 1, depth: 1 }, sc), head, 0, -.04, .45, this._mat(0xd8343c, .1, .3), .03, .012, .2);
    this.yaws = SEGS.map(() => 0);
    this._buildGhost();
  }

  // x-ray silhouette: a translucent copy drawn only where something is in front of the snake (depth GREATER), so blocks never hide it
  _buildGhost() {
    const sc = this.scene;
    const gm = new B.StandardMaterial('ghost', sc);
    gm.diffuseColor = col3(0x8ff5d0); gm.emissiveColor = col3(0x8ff5d0); gm.specularColor = new B.Color3(0, 0, 0);
    gm.disableLighting = true; gm.alpha = .45; gm.depthFunction = B.Constants.GREATER; gm.zOffset = -4; gm.disableDepthWrite = true;
    this.ghosts = []; const gn = new Map();
    const node = (n) => {
      if (!n) return null; if (gn.has(n)) return gn.get(n);
      const g = new B.TransformNode('g' + n.name, sc); g.parent = node(n.parent); gn.set(n, g); this.ghosts.push([n, g]); return g;
    };
    for (const m of this.meshes.slice()) {
      const g = m.clone('g_' + m.name, null); g.parent = node(m.parent); g.material = gm; g.isPickable = false; g.alphaIndex = 30;
      this.ghosts.push([m, g]);
    }
  }
  _syncGhost() {
    for (const [a, b] of this.ghosts) { b.position.copyFrom(a.position); b.scaling.copyFrom(a.scaling); if (a.rotation) b.rotation.copyFrom(a.rotation); }
  }

  // sample a point along polyline at arc-length s
  _sample(poly, cum, s, out) {
    if (s <= 0) { out.x = poly[0].x; out.y = poly[0].y; out.z = poly[0].z; return out; }
    for (let i = 1; i < poly.length; i++) {
      if (s <= cum[i]) {
        const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        out.x = lerp(poly[i - 1].x, poly[i].x, t); out.y = lerp(poly[i - 1].y, poly[i].y, t); out.z = lerp(poly[i - 1].z, poly[i].z, t);
        return out;
      }
    }
    const l = poly[poly.length - 1]; out.x = l.x; out.y = l.y; out.z = l.z; return out;
  }

  _gp(x, z, top) { return { x: x + .5, y: top, z: z + .5 }; }
  _cp(x, z, h, fx, fz) { return { x: x + .5 + fx * .2, y: h + .2, z: z + .5 + fz * .2 }; }
  _go(pt, cell, dur) {
    this.path.unshift(pt); if (this.path.length > 48) this.path.length = 48;
    this.cell = cell; this.t = 0; this.dur = dur / 1.25 / (this.speedMul || 1); return true;
  }

  tryStep(dir) { return this.climb ? this._stepClimb(dir[0], dir[1]) : this._stepGround(dir[0], dir[1]); }

  _stepGround(dx, dz) {
    const w = this.world, c = this.cell, top = c.top;
    this.targetHeading = Math.atan2(dx, dz);
    const nx = c.x + dx, nz = c.z + dz;
    const s = w.surface(nx, nz, top);
    if (s !== null) return this._go(this._gp(nx, nz, s), { x: nx, z: nz, top: s }, .2);
    // wall ahead at foot level: cling to it
    if (CLIMB.has(w.get(nx, top, nz))) {
      this.climb = { fx: dx, fz: dz };
      return this._go(this._cp(c.x, c.z, top, dx, dz), { x: c.x, z: c.z, top }, .18);
    }
    // ledge: lean over the edge and climb down, if we are standing on a climbable block
    if (soft(w.get(nx, top, nz)) && soft(w.get(nx, top - 1, nz)) && CLIMB.has(w.get(c.x, top - 1, c.z))) {
      this.climb = { fx: -dx, fz: -dz };
      return this._go(this._cp(nx, nz, top - 1, -dx, -dz), { x: nx, z: nz, top: top - 1 }, .26);
    }
    return false;
  }

  _stepClimb(dx, dz) {
    const w = this.world, c = this.cell, { fx, fz } = this.climb, h = c.top, x = c.x, z = c.z;
    const dot = dx * fx + dz * fz, D = .26;
    if (dot > 0) { // up the wall
      const above = w.get(x, h + 1, z);
      if (soft(above)) {
        if (CLIMB.has(w.get(x + fx, h + 1, z + fz))) return this._go(this._cp(x, z, h + 1, fx, fz), { x, z, top: h + 1 }, D);
        if (CLIMB.has(w.get(x + fx, h, z + fz)) && soft(w.get(x + fx, h + 1, z + fz))) { // over the top onto the ledge
          this.climb = null; this.targetHeading = Math.atan2(fx, fz);
          return this._go(this._gp(x + fx, z + fz, h + 1), { x: x + fx, z: z + fz, top: h + 1 }, .3);
        }
        return false;
      }
      if (MD[above] && MD[above].walk && w.get(x, h + 2, z) === 0) { // overhang (capital): mount it
        this.climb = null;
        return this._go(this._gp(x, z, h + 2), { x, z, top: h + 2 }, .3);
      }
      return false;
    }
    if (dot < 0) { // down
      if (w.walk(x, h - 1, z)) { this.climb = null; return this._go(this._gp(x, z, h), { x, z, top: h }, .22); }
      if (soft(w.get(x, h - 1, z)) && CLIMB.has(w.get(x + fx, h - 1, z + fz))) return this._go(this._cp(x, z, h - 1, fx, fz), { x, z, top: h - 1 }, D);
      // tuck under an overhang (e.g. a capital) onto the narrower shaft below
      if (w.get(x + fx, h - 1, z + fz) === 0 && CLIMB.has(w.get(x + 2 * fx, h - 1, z + 2 * fz))) return this._go(this._cp(x + fx, z + fz, h - 1, fx, fz), { x: x + fx, z: z + fz, top: h - 1 }, D);
      return false;
    }
    // sideways along the wall
    const nx = x + dx, nz = z + dz, nm = w.get(nx, h, nz);
    if (CLIMB.has(nm)) { // inside corner: turn onto the new wall
      this.climb = { fx: dx, fz: dz };
      return this._go(this._cp(x, z, h, dx, dz), { x, z, top: h }, D);
    }
    if (!soft(nm)) return false;
    if (CLIMB.has(w.get(nx + fx, h, nz + fz))) return this._go(this._cp(nx, nz, h, fx, fz), { x: nx, z: nz, top: h }, D);
    // outside corner: wrap around onto the side face
    if (CLIMB.has(w.get(x + fx, h, z + fz)) && soft(w.get(nx + fx, h, nz + fz))) {
      this.climb = { fx: -dx, fz: -dz };
      return this._go(this._cp(nx + fx, nz + fz, h, -dx, -dz), { x: nx + fx, z: nz + fz, top: h }, .3);
    }
    return false;
  }

  reset(cells, top) {
    this.path = cells.map(c => ({ x: c.x + .5, y: top, z: c.z + .5 }));
    this.cell = { x: cells[0].x, z: cells[0].z, top }; this.climb = null; this.climbF = 0; this.t = 1; this.wish = null; this.lift = 0; this.idle = 0; this.actv = null;
    const a = this.path[1], b = this.path[0]; this.heading = Math.atan2(b.x - a.x, b.z - a.z); this.targetHeading = this.heading;
  }

  get moving() { return this.t < 1; }

  // leap from a perch down onto the ground cell (x,z,top)
  dropTo(x, z, top) {
    this.climb = null; this.t = 1; this.wish = null;
    this.actv = { type: 'drop', t: 0, dur: .66, dx: 0, dz: 0, reach: 0, steps: 0, side: 1 };
    this._go(this._gp(x, z, top), { x, z, top }, .5); this.dur = .5;
    const dx = x + .5 - this.path[1].x, dz = z + .5 - this.path[1].z; if (Math.hypot(dx, dz) > .2) { this.targetHeading = Math.atan2(dx, dz); }
  }

  // short scripted moves: 'strike' (lunge bite toward dx,dz) and 'dodge' (weave sideways away from an incoming hit)
  act(type, dx, dz, reach, steps) {
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    this.actv = { type, t: 0, dur: type === 'strike' ? .42 : type === 'roll' ? .5 : .38, dx, dz, reach: reach || 2, steps: steps || 0, side: Math.abs(dx) >= Math.abs(dz) ? (dz >= 0 ? 1 : -1) : (dx >= 0 ? -1 : 1) };
    if (type === 'roll') this.actv.hd = this.heading;
    if (type === 'strike') { this.targetHeading = Math.atan2(dx, dz); this.heading = this.targetHeading; }
    this.idle = 0;
  }

  update(dt, time) {
    let rem = dt, guard = 0;
    while (rem > 0 && guard++ < 6) {
      if (this.t < 1) {
        const need = (1 - this.t) * this.dur, use = Math.min(rem, need);
        this.t += use / this.dur; rem -= use;
        if (this.t >= 0.9999) this.t = 1; else break;
      }
      if (this.actv && this.actv.type === 'roll' && this.actv.steps > 0) { // the roll really carries the snake sideways
        this.actv.steps--; this.speedMul = 1.7; const ok = this.tryStep([Math.round(this.actv.dx), Math.round(this.actv.dz)]); this.speedMul = 1;
        if (ok && this.t === 0) continue; this.actv.steps = 0;
      }
      const wi = this.wishFn ? this.wishFn() : this.wish; // re-read the input before EVERY step, so held keys stay right as the wall turns
      if (wi && !this.actv) { this.tryStep(wi); if (this.t === 0) continue; }
      break;
    }
    if (this.climb) this.targetHeading = Math.atan2(this.climb.fx, this.climb.fz);
    this.heading += angDiff(this.heading, this.targetHeading) * (1 - Math.exp(-dt * 16));

    const moving = this.t < 1 || !!this.wish;
    this.mv += ((moving ? 1 : 0) - this.mv) * (1 - Math.exp(-dt * 8));
    this.idle = moving ? 0 : this.idle + dt;
    const liftT = (this.idle > .45 && !this.climb) ? 1 : 0;
    this.lift += (liftT - this.lift) * (1 - Math.exp(-dt * 4.5));
    this.climbF += ((this.climb ? 1 : 0) - this.climbF) * (1 - Math.exp(-dt * 9));
    this.phase += dt * (7 * this.mv);
    this.hood += ((moving ? .52 : 1) - this.hood) * (1 - Math.exp(-dt * 7));

    if (this.actv) { this.actv.t += dt; if (this.actv.t >= this.actv.dur) this.actv = null; }
    this._visual(time);
  }

  _visual(time) {
    const p = this.path;
    const a = p[Math.min(1, p.length - 1)], b = p[0];
    const t = this.t;
    this.head.x = lerp(a.x, b.x, t); this.head.y = lerp(a.y, b.y, t); this.head.z = lerp(a.z, b.z, t);
    const poly = [{ x: this.head.x, y: this.head.y, z: this.head.z }];
    for (let i = 1; i < p.length; i++) poly.push(p[i]);
    const cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y, poly[i].z - poly[i - 1].z));
    const q0 = {}, q1 = {}, q2 = {}, d = .22;
    const lift = this.lift * .62, cf = this.climbF;
    // head
    this.pitch += ((this.climb ? -1.3 : 0) - this.pitch) * (1 - Math.exp(-.016 * 11));
    const A = this.actv; let ox = 0, oy = 0, oz = 0, roll = 0, apitch = 0, hoodK = 0, cur = 0;
    const off = (sd) => { // visual offset for a body point at distance sd behind the head
      if (!A) return [0, 0, 0];
      const k = A.t / A.dur;
      if (A.type === 'drop') { const dk = Math.min(1, k / .76); return [0, Math.sin(Math.PI * dk) * 1.1 * Math.max(0, 1 - sd / 3), 0]; }
      if (A.type === 'strike') {
        const c = k < .3 ? 1 - Math.pow(1 - k / .3, 3) : 1 - Math.pow((k - .3) / .7, 2) * (3 - 2 * (k - .3) / .7); // fast out, eased back
        const w = Math.pow(Math.max(0, 1 - sd / 3.4), 1.6) * c * A.reach; return [A.dx * w, .28 * c * Math.max(0, 1 - sd / 2.4), A.dz * w];
      }
      const kk = Math.min(1, Math.max(0, k - sd * .06)), v = Math.sin(Math.PI * kk) * 1.35 * Math.max(.35, 1 - sd * .12);
      return [-A.dz * A.side * v, .12 * Math.sin(Math.PI * kk), A.dx * A.side * v];
    };
    const RO = A && A.type === 'roll' ? (() => { // curl into a wheel and roll sideways
      const k = A.t / A.dur, c = k < .22 ? Math.pow(k / .22, 2) * (3 - 2 * k / .22) : k > .78 ? Math.pow((1 - k) / .22, 2) * (3 - 2 * (1 - k) / .22) : 1;
      return { c: Math.min(1, c * 1.15), th: k * Math.PI * 2.6 * (A.side || 1), dx: A.dx, dz: A.dz, R: .5 };
    })() : null;
    const ring = (a, r, i) => { const lat = ((i % 3) - 1) * .3 * (1 - Math.abs(Math.sin(a * .5)) * .3); return [this.head.x + RO.dx * RO.R * Math.sin(a) - RO.dz * lat, this.head.y + r + .12 + RO.R * (1 + Math.cos(a)) * .9, this.head.z + RO.dz * RO.R * Math.sin(a) + RO.dx * lat]; }; // tight ball: loops stacked side by side
    if (A) { const k = A.t / A.dur; [ox, oy, oz] = off(0); roll = A.type === 'dodge' ? A.side * .55 * Math.sin(Math.PI * k) : 0; apitch = A.type === 'strike' ? .3 * Math.sin(Math.PI * Math.min(1, k * 1.6)) : 0; hoodK = Math.sin(Math.PI * k); cur = k; }
    if (RO) { const q = ring(RO.th, .3, 0); ox = (q[0] - this.head.x) * RO.c; oz = (q[2] - this.head.z) * RO.c; oy = (q[1] - this.head.y - .36 - lift) * RO.c; roll = RO.c * RO.th * .9; hoodK = RO.c * .3; }
    this.headNode.position.set(this.head.x + ox, this.head.y + .36 + lift + oy, this.head.z + oz);
    this.headNode.rotation.y = this.heading;
    this.headNode.rotation.z = roll;
    this.headNode.rotation.x = this.pitch * this.climbF + .18 * this.lift + apitch;
    // impact flash / whoosh puff
    if (A) {
      const k = A.t / A.dur, on = A.type === 'strike' ? (k > .22 && k < .62) : A.type === 'drop' ? k > .74 : (k < .7);
      this.fx.setEnabled(on);
      if (on) {
        const f = A.type === 'strike' ? (k - .22) / .4 : A.type === 'drop' ? (k - .74) / .26 : k / .7;
        this.fx.position.set(this.head.x + (A.type === 'strike' ? ox + A.dx * .7 : 0), this.head.y + .6 + (A.type === 'strike' ? oy : 0), this.head.z + (A.type === 'strike' ? oz + A.dz * .7 : 0)); if (A.type === 'drop') this.fx.position.set(this.head.x, this.head.y + .5, this.head.z);
        const sc = A.type === 'strike' ? .5 + f * 1.3 : .8 + f * 1.8; this.fx.scaling.setAll(sc);
        this.fxMat.alpha = (1 - f) * .85; this.fxMat.emissiveColor = A.type === 'strike' ? new B.Color3(1, .9, .4) : new B.Color3(.5, .85, 1);
      }
    } else if (this.fx.isEnabled()) this.fx.setEnabled(false);
    this.hoodRoot.scaling.x = Math.max(this.hood, 1 + .25 * hoodK);
    this.hoodRoot.scaling.y = .85 + .15 * this.hood;
    const fl = Math.max(0, Math.sin(time * 2.4)); const tf = Math.pow(fl, 10);
    this.tongue.scaling.z = .02 + .2 * tf; this.tongue.position.z = .4 + .1 * tf;
    // body
    const pos = [];
    SEGS.forEach((sg, i) => {
      const s = sg.d;
      this._sample(poly, cum, Math.max(0, s - d), q0); this._sample(poly, cum, s, q1); this._sample(poly, cum, s + d, q2);
      let x = (q0.x + 2 * q1.x + q2.x) / 4, y = (q0.y + 2 * q1.y + q2.y) / 4, z = (q0.z + 2 * q1.z + q2.z) / 4;
      let tx = q2.x - q0.x, tz = q2.z - q0.z; const tl = Math.hypot(tx, tz);
      if (tl > .05) { this.yaws[i] = Math.atan2(tx, tz); tx /= tl; tz /= tl; } else { tx = 0; tz = 0; }
      const amp = .05 * this.mv * (1 - cf) * Math.min(1, (i + 1) / 2);
      const wv = Math.sin(this.phase - i * 1.1) * amp;
      x += -tz * wv; z += tx * wv;
      const r = sg.s / 2;
      const lf = lift * Math.pow(Math.max(0, 1 - s / 2.8), 2);
      const o = off(s); x += o[0]; z += o[2]; y += o[1];
      if (RO) { const q = ring(RO.th - (i + 1) * 1.15, sg.s / 2, i + 1), cc = RO.c; x = lerp(x, q[0], cc); z = lerp(z, q[2], cc); y = lerp(y + sg.s / 2, q[1], cc) - sg.s / 2; }
      const m = this.seg[i];
      m.position.set(x, y + r + lf, z);
      pos.push([x, y + r + lf, z, r]);
    });
    for (const dt_ of this.dots) {
      const q = pos[dt_.segIndex];
      dt_.position.set(q[0], q[1] + q[3] * .98, q[2]);
      dt_.scaling.set(q[3] * 1.0, q[3] * .5, q[3] * 1.0);
    }
    this._syncGhost();
  }
}
