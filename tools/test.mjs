// Type-checks, bundles the tests with esbuild, and runs them with Node's test runner.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });

const tsc = run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', '.']);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const entries = readdirSync(join(root, 'test'))
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => join(root, 'test', f));
const outdir = join(root, 'node_modules/.cache/test');
await build({
  entryPoints: entries,
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outExtension: { '.js': '.mjs' },
  sourcemap: 'inline',
  logLevel: 'warning',
});

const files = entries.map((f) => join(outdir, f.split('/').pop().replace(/\.ts$/, '.mjs')));
const r = run(process.execPath, ['--test', ...files]);
process.exit(r.status ?? 1);
