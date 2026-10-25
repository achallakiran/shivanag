// Usage: node tools/preview.mjs [outDir]   (writes PNGs of every camera; see tools/preview.ts)
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'node_modules/.cache/preview/preview.mjs');
await build({ entryPoints: [join(root, 'tools/preview.ts')], outfile: out, bundle: true, format: 'esm', platform: 'node', target: 'node22', logLevel: 'warning' });
const r = spawnSync(process.execPath, [out, process.argv[2] ?? join(root, 'node_modules/.cache/preview/out')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
