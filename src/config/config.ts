import { DEFAULT_CONFIG, LIMITS, type GameConfig } from './defaults';
import type { KV } from '../core/storage';

const KEY = 'config';
const FORMAT = 'voxel-cricket-settings';

type Rec = Record<string, unknown>;

export function cloneConfig(c: GameConfig): GameConfig {
  return JSON.parse(JSON.stringify(c)) as GameConfig;
}

// Copies known keys from `patch` onto a clone of `base`. Unknown keys, wrong
// types and non-finite numbers are ignored; numbers are clamped to LIMITS.
export function mergeConfig(base: GameConfig, patch: unknown): GameConfig {
  const out = cloneConfig(base);
  walk(out as unknown as Rec, patch, '');
  return out;
}

function walk(target: Rec, patch: unknown, path: string): void {
  if (typeof patch !== 'object' || patch === null) return;
  const p = patch as Rec;
  for (const key of Object.keys(target)) {
    const cur = target[key];
    const next = Object.prototype.hasOwnProperty.call(p, key) ? p[key] : undefined;
    const full = path ? `${path}.${key}` : key;
    if (cur !== null && typeof cur === 'object') {
      walk(cur as Rec, next, full);
    } else if (typeof cur === 'number') {
      if (typeof next === 'number' && Number.isFinite(next)) {
        const lim = LIMITS[full];
        target[key] = lim ? Math.min(lim[1], Math.max(lim[0], next)) : next;
      }
    } else if (typeof cur === 'boolean') {
      if (typeof next === 'boolean') target[key] = next;
    }
  }
}

export interface NumericSetting {
  path: string;
  value: number;
  min?: number;
  max?: number;
}

export function numericSettings(cfg: GameConfig): NumericSetting[] {
  const out: NumericSetting[] = [];
  const visit = (obj: Rec, prefix: string) => {
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      const full = prefix ? `${prefix}.${key}` : key;
      if (typeof v === 'number') {
        const lim = LIMITS[full];
        out.push({ path: full, value: v, min: lim?.[0], max: lim?.[1] });
      } else if (v !== null && typeof v === 'object') {
        visit(v as Rec, full);
      }
    }
  };
  visit(cfg as unknown as Rec, '');
  return out;
}

export function patchFromPath(path: string, value: number | boolean): Rec {
  const parts = path.split('.');
  const root: Rec = {};
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next: Rec = {};
    node[parts[i]] = next;
    node = next;
  }
  node[parts[parts.length - 1]] = value;
  return root;
}

export function loadConfig(store: KV): GameConfig {
  const raw = store.get(KEY);
  if (!raw) return cloneConfig(DEFAULT_CONFIG);
  try {
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    return cloneConfig(DEFAULT_CONFIG);
  }
}

export function saveConfig(store: KV, cfg: GameConfig): void {
  store.set(KEY, JSON.stringify(cfg));
}

export function resetConfig(store: KV): void {
  store.remove(KEY);
}

export function exportSettings(cfg: GameConfig): string {
  return JSON.stringify({ format: FORMAT, version: 1, config: cfg }, null, 2);
}

export function importSettings(text: string): GameConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }
  const obj = parsed as Rec | null;
  if (!obj || typeof obj !== 'object' || obj.format !== FORMAT) {
    throw new Error('Not a Voxel Cricket settings file');
  }
  return mergeConfig(DEFAULT_CONFIG, obj.config);
}
