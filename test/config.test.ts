import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import {
  exportSettings,
  importSettings,
  loadConfig,
  mergeConfig,
  numericSettings,
  patchFromPath,
  saveConfig,
} from '../src/config/config';
import { Store } from '../src/core/storage';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

test('merge clamps numbers to limits and ignores bad input', () => {
  const c = mergeConfig(DEFAULT_CONFIG, {
    sim: { stepHz: 99999, maxStepsPerFrame: 'lots' },
    input: { deadZone: -3, smoothing: Number.NaN },
    unknown: { x: 1 },
    swing: { maxOmega: 12 },
  });
  assert.equal(c.sim.stepHz, 480);
  assert.equal(c.sim.maxStepsPerFrame, DEFAULT_CONFIG.sim.maxStepsPerFrame);
  assert.equal(c.input.deadZone, 0);
  assert.equal(c.input.smoothing, DEFAULT_CONFIG.input.smoothing);
  assert.equal(c.swing.maxOmega, 12);
  assert.equal((c as unknown as Record<string, unknown>).unknown, undefined);
});

test('merge does not mutate the base and ignores prototype tricks', () => {
  const before = JSON.stringify(DEFAULT_CONFIG);
  mergeConfig(DEFAULT_CONFIG, JSON.parse('{"__proto__":{"polluted":true},"sim":{"stepHz":100}}'));
  assert.equal(JSON.stringify(DEFAULT_CONFIG), before);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('patchFromPath builds a nested patch', () => {
  const c = mergeConfig(DEFAULT_CONFIG, patchFromPath('stance.footSpeed', 6));
  assert.equal(c.stance.footSpeed, 6);
  assert.equal(c.stance.hipSpeed, DEFAULT_CONFIG.stance.hipSpeed);
});

test('export then import round-trips', () => {
  const c = mergeConfig(DEFAULT_CONFIG, { input: { stickRadiusPx: 120 }, debug: { hud: false } });
  const back = importSettings(exportSettings(c));
  assert.deepEqual(back, c);
});

test('import rejects wrong files', () => {
  assert.throws(() => importSettings('nope'), /JSON/);
  assert.throws(() => importSettings('{"format":"other"}'), /settings file/);
});

test('every numeric setting is listed with limits', () => {
  const list = numericSettings(DEFAULT_CONFIG);
  assert.ok(list.length >= 10);
  for (const s of list) {
    assert.ok(s.min !== undefined && s.max !== undefined, `${s.path} has no limits`);
    assert.ok(s.value >= s.min! && s.value <= s.max!, `${s.path} default outside its limits`);
  }
});

test('store saves under a prefix and reloads', () => {
  const raw = fakeStorage();
  const store = new Store(raw);
  saveConfig(store, mergeConfig(DEFAULT_CONFIG, { sim: { stepHz: 120 } }));
  assert.ok([...raw.m.keys()].every((k) => k.startsWith('shivanag.cricket.v1.')));
  assert.equal(loadConfig(new Store(raw)).sim.stepHz, 120);
});

test('store falls back to memory when storage throws', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  const store = new Store(broken);
  store.set('a', '1');
  assert.equal(store.get('a'), '1');
  store.remove('a');
  assert.equal(store.get('a'), null);
  assert.equal(new Store(null).persistent, false);
});

test('corrupt stored config falls back to defaults', () => {
  const raw = fakeStorage();
  raw.setItem('shivanag.cricket.v1.config', '{not json');
  assert.deepEqual(loadConfig(new Store(raw)), DEFAULT_CONFIG);
});
