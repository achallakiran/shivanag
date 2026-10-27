/* Shivanag — camera rig (M0): four presets blended by a dolly-zoom trick, 90-degree snap rotation */
const PRESETS = [
  { id: 'iso', label: 'Isometric', yaw: 45, pitch: 35.26, fov: 6, size: 30 },
  { id: 'three', label: '3/4 View', yaw: 28, pitch: 52, fov: 22, size: 21 },
  { id: 'steep', label: 'Steep', yaw: 18, pitch: 72, fov: 26, size: 23 },
  { id: 'dyn', label: 'Dynamic', yaw: 28, pitch: 50, fov: 24, size: 23, dynamic: true },
];

class CamRig {
  constructor(scene, engine, bounds) {
    this.engine = engine; this.bounds = bounds;
    this.cam = new B.FreeCamera('cam', new B.Vector3(0, 20, -20), scene);
    this.cam.minZ = 1; this.cam.maxZ = 400; this.cam.inertia = 0;
    scene.activeCamera = this.cam;
    this.preset = 1; this.yawStep = 0; this.zoom = 1;
    this.cur = null; this.target = new B.Vector3(bounds.W / 2, 2, bounds.D / 2);
    this.first = true; this.shot = null; this.shotW = 0; this.world = null;
  }

  // close-up slow-motion shot: a low, tight orbit around (x,y,z), from the first of several angles with a clear view
  startShot(x, y, z, dx, dz, dur) {
    const base = Math.atan2(dz, dx), b = this.bounds; let pick = null;
    const angs = [base + Math.PI / 2, base - Math.PI / 2, base + Math.PI * .8, base - Math.PI * .8, base + Math.PI * .3, base - Math.PI * .3];
    for (const D of [8.5, 7, 5.6]) for (const a of angs) {
      const px = x + Math.cos(a) * D, pz = z + Math.sin(a) * D, py = y + 1.6 + D * .2;
      if (px < 1 || pz < 1 || px > b.W - 1 || pz > b.D - 1) continue;
      if (this.world && [[0, 0], [1.4, 0], [-1.4, 0]].some(o => sightBlocked(this.world, px, py, pz, x + Math.cos(base) * o[0], y - (o[0] ? 1 : 0), z + Math.sin(base) * o[0]))) continue; // snake and guard both in clear view
      pick = { a, D }; break;
    }
    if (!pick) pick = { a: base + Math.PI / 2, D: 3.2 };
    this.shot = { t: 0, dur: dur || 1.5, x, y, z, a: pick.a, D: pick.D, spin: (Math.random() < .5 ? -1 : 1) * .28 };
  }
  setPreset(i) { this.preset = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length; }
  rotate(dir) { this.yawStep += dir; }
  get yawLogical() { return rad(PRESETS[this.preset].yaw) + this.yawStep * Math.PI / 2; }

  // screen-space input (ux right, uy up) -> grid axis [dx,dz] relative to the camera
  worldDir(ux, uy) {
    const th = 0.12; // tiny bias so exact diagonals resolve consistently
    const sx = ux * Math.cos(th) - uy * Math.sin(th), sy = ux * Math.sin(th) + uy * Math.cos(th);
    const y = this.yawLogical;
    const fx = -Math.sin(y), fz = -Math.cos(y);   // camera forward on the ground
    const rx = -Math.cos(y), rz = Math.sin(y);    // camera right (left-handed: up x forward)
    const wx = fx * sy + rx * sx, wz = fz * sy + rz * sx;
    return Math.abs(wx) > Math.abs(wz) ? [Math.sign(wx), 0] : [0, Math.sign(wz)];
  }

  update(dt, head, moving) {
    const P = PRESETS[this.preset];
    let tp = P.pitch, ts = P.size;
    if (P.dynamic) { tp += moving ? 7 : -4; ts *= moving ? 1.04 : .9; }
    const want = { yaw: this.yawLogical, pitch: rad(tp), fov: rad(P.fov), size: ts * this.zoom };
    if (!this.cur) this.cur = Object.assign({}, want);
    const k = this.first ? 1 : 1 - Math.exp(-dt * 5);
    for (const key in want) this.cur[key] += (want[key] - this.cur[key]) * k;
    const kt = this.first ? 1 : 1 - Math.exp(-dt * 4.5);
    const b = this.bounds;
    const tx = clamp(head.x, 9, b.W - 9), tz = clamp(head.z, 9, b.D - 9);
    this.target.x += (tx - this.target.x) * kt;
    this.target.z += (tz - this.target.z) * kt;
    this.target.y += ((2.2 + (head.y - 2) * .6) - this.target.y) * kt;
    this.first = false;

    const asp = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    const f = asp < 1.15 ? Math.pow(1.15 / asp, .62) : 1;
    const size = this.cur.size * f;
    const dist = (size / 2) / Math.tan(this.cur.fov / 2);
    const hd = dist * Math.cos(this.cur.pitch);
    const c = this.cam;
    c.fov = this.cur.fov;
    c.minZ = Math.max(.5, dist - 70); c.maxZ = dist + 90;
    c.position.set(this.target.x + hd * Math.sin(this.cur.yaw), this.target.y + dist * Math.sin(this.cur.pitch), this.target.z + hd * Math.cos(this.cur.yaw));
    const S = this.shot;
    if (S) {
      S.t += dt; const sm = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
      const w = .55 * sm(S.t / .22) * sm((S.dur - S.t) / .4); this.shotW = w * 1.8; // a gentle push-in, not a full close-up
      const a = S.a + S.spin * S.t, D = S.D * (1 - .18 * S.t / S.dur);
      const sx = S.x + Math.cos(a) * D, sy = S.y + 1.6 + D * .2, sz = S.z + Math.sin(a) * D;
      const p = c.position; p.set(lerp(p.x, sx, w), lerp(p.y, sy, w), lerp(p.z, sz, w));
      c.fov = lerp(c.fov, rad(40), w); c.minZ = w > .01 ? Math.min(c.minZ, 4) : c.minZ;
      c.setTarget(new B.Vector3(lerp(this.target.x, S.x, w), lerp(this.target.y, S.y, w), lerp(this.target.z, S.z, w)));
      if (S.t >= S.dur) this.shot = null;
    } else { this.shotW = 0; c.setTarget(this.target); }
  }
}
