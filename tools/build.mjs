// Builds the game into the repo root: index.html (everything inlined), sw.js,
// manifest.webmanifest and icons. GitHub Pages serves the repo root from main.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateIcons } from './make-icons.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const result = await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2022', 'safari16'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});

// Keep the script safe to inline inside an HTML <script> element.
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const template = readFileSync(join(root, 'tools/index.template.html'), 'utf8');
const build_ = createHash('sha256').update(js).update(template).update(pkg.version).digest('hex').slice(0, 8);
const appInfo = JSON.stringify({ version: pkg.version, build: build_ });

// Function replacers: the bundle contains "$" characters that String.replace would otherwise interpret.
const html = template.replace('%%APPINFO%%', () => appInfo).replace('%%BUNDLE%%', () => js);
writeFileSync(join(root, 'index.html'), html);

const assets = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const swTemplate = readFileSync(join(root, 'tools/sw.template.js'), 'utf8');
const sw = swTemplate
  .replace('__CACHE_NAME__', () => `voxel-cricket-${pkg.version}-${build_}`)
  .replace('__ASSETS__', () => JSON.stringify(assets));
writeFileSync(join(root, 'sw.js'), sw);

writeFileSync(
  join(root, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'Voxel Cricket',
      short_name: 'Voxel Cricket',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'landscape',
      background_color: '#0d1f16',
      theme_color: '#0d1f16',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  ) + '\n',
);

generateIcons(root);

console.log(`built v${pkg.version} (${build_}): index.html ${(html.length / 1024).toFixed(0)} KB`);
