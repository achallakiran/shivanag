// Single-file build: inlines Babylon.js + game sources into dist/index.html (works offline, from file:// and GitHub Pages)
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const babylon = esc(fs.readFileSync(path.join(root, 'node_modules/babylonjs/babylon.js'), 'utf8'));
const srcDir = path.join(root, 'src');
const game = esc(fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort().map(f => fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n'));
const css = fs.readFileSync(path.join(root, 'template.css'), 'utf8');
const body = fs.readFileSync(path.join(root, 'template.html'), 'utf8');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#3a2a58">
<title>Shivanag</title>
<style>${css}</style></head>
<body>${body}
<script>${babylon}</script>
<script>${game}</script>
</body></html>`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), html); // for 'Deploy from branch /docs' on GitHub Pages
console.log('dist/index.html', (html.length / 1048576).toFixed(2), 'MB');
