// Post-build offline checks. Run after `npm run build`.
//  1. index.html pulls nothing from the network.
//  2. Our own source never calls the network.
//  3. The service worker logic is exercised against mocks: precache, cache-first
//     serving with the network down, navigation fallback, cleanup, update flow.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let failures = 0;
const ok = (msg) => console.log(`  ok   ${msg}`);
const fail = (msg) => {
  failures++;
  console.log(`  FAIL ${msg}`);
};
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

// 1. index.html
console.log('index.html');
const html = read('index.html');
const external = [...html.matchAll(/<(?:script|link|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)=["'](?:https?:)?\/\/[^"']+/gi)];
check(external.length === 0, 'no external script/link/img/iframe references');
check(!/url\(\s*["']?(?:https?:)?\/\//i.test(html), 'no external url() in CSS');
check(!/@import/i.test(html), 'no @import');
for (const rel of ['manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'sw.js']) {
  check(existsSync(join(root, rel)), `${rel} exists`);
}
check(/rel="manifest"/.test(html) && /rel="apple-touch-icon"/.test(html), 'manifest and touch icon linked');
check(/window\.__APP__=\{"version":"[^"]+","build":"[0-9a-f]{8}"\}/.test(html), 'version and build stamped');
console.log(`  info index.html is ${(statSync(join(root, 'index.html')).size / 1024).toFixed(0)} KB`);

// URL-looking strings inside the bundle (report only: library code contains doc links and unused fallbacks)
const urls = new Set([...html.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0].toLowerCase()));
console.log(`  info hosts mentioned inside bundle strings: ${[...urls].sort().join(', ') || 'none'}`);

// 2. our own source
console.log('source');
const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const bad = [];
for (const f of walk(join(root, 'src')).filter((f) => f.endsWith('.ts'))) {
  const t = readFileSync(f, 'utf8');
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\//.test(t)) bad.push(f.replace(root + '/', ''));
}
check(bad.length === 0, `src has no network calls or URLs${bad.length ? ': ' + bad.join(', ') : ''}`);

// 3. service worker, against mocks
console.log('service worker');
const swSrc = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
check(manifest.start_url === './' && manifest.scope === './', 'manifest start_url and scope are relative');

const BASE = 'https://example.test/shivanag/sw.js';
class MockRequest {
  constructor(input, init = {}) {
    this.url = new URL(typeof input === 'string' ? input : input.url, BASE).href;
    this.method = init.method || input.method || 'GET';
    this.mode = init.mode || input.mode || 'cors';
  }
}
function makeEnv({ networkUp }) {
  const stores = new Map();
  const handlers = {};
  const norm = (u) => {
    const x = new URL(u, BASE);
    x.search = '';
    return x.href;
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        async addAll(reqs) {
          for (const r of reqs) {
            if (!env.network.up) throw new TypeError('network down');
            m.set(norm(r.url), new Response(`body:${norm(r.url)}`));
          }
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async match(req) {
      const key = norm(typeof req === 'string' ? req : req.url);
      for (const m of stores.values()) if (m.has(key)) return m.get(key).clone();
      return undefined;
    },
  };
  const env = {
    stores,
    handlers,
    network: { up: networkUp, calls: [] },
    skipWaitingCalled: false,
    claimed: false,
  };
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: () => (env.skipWaitingCalled = true),
    clients: { claim: async () => (env.claimed = true) },
  };
  const fetchMock = async (req) => {
    env.network.calls.push(req.url);
    if (!env.network.up) throw new TypeError('offline');
    return new Response('from-network');
  };
  runInNewContext(swSrc, { self, caches, fetch: fetchMock, Request: MockRequest, Response, URL, Promise });
  return env;
}
const event = (extra) => {
  const e = { ...extra, _p: null, _r: null, waitUntil(p) { e._p = p; }, respondWith(p) { e._r = p; } };
  return e;
};

try {
  const env = makeEnv({ networkUp: true });
  const cacheName = swSrc.match(/const CACHE = '([^']+)'/)[1];
  check(/^voxel-cricket-\d+\.\d+\.\d+-[0-9a-f]{8}$/.test(cacheName), `cache name is versioned (${cacheName})`);

  // install precaches everything, and does not auto-skip waiting
  const inst = event({});
  env.handlers.install(inst);
  await inst._p;
  const cached = [...env.stores.get(cacheName).keys()].map((u) => u.replace('https://example.test', ''));
  assert.ok(cached.includes('/shivanag/') && cached.includes('/shivanag/index.html'), 'precached page');
  assert.ok(cached.length === 6, `precached 6 files, got ${cached.length}`);
  ok('install precaches the page, manifest and icons');
  check(env.skipWaitingCalled === false, 'install does not skip waiting by itself');

  // now go offline
  env.network.up = false;
  const get = async (url, mode = 'cors', method = 'GET') => {
    const e = event({ request: new MockRequest(url, { mode, method }) });
    env.handlers.fetch(e);
    return e._r ? await e._r : null;
  };
  const home = await get('https://example.test/shivanag/', 'navigate');
  check((await home.text()).startsWith('body:'), 'offline: home page served from cache');
  const withQuery = await get('https://example.test/shivanag/index.html?source=pwa', 'navigate');
  check((await withQuery.text()).startsWith('body:'), 'offline: query string ignored (home screen launch)');
  const icon = await get('https://example.test/shivanag/icon-192.png');
  check((await icon.text()).startsWith('body:'), 'offline: icon served from cache');
  check(env.network.calls.length === 0, 'offline: network was never touched for cached files');
  const odd = await get('https://example.test/shivanag/anything-else', 'navigate');
  check((await odd.text()).startsWith('body:'), 'offline: unknown page falls back to the game');
  const miss = await get('https://example.test/shivanag/missing.js');
  check(miss.type === 'error', 'offline: uncached asset fails cleanly');
  check((await get('https://other.test/x.js')) === null, 'cross-origin requests are not intercepted');
  check((await get('https://example.test/shivanag/', 'navigate', 'POST')) === null, 'non-GET requests are not intercepted');

  // update flow
  const sk = event({ data: 'SKIP_WAITING' });
  env.handlers.message(sk);
  check(env.skipWaitingCalled, 'SKIP_WAITING message activates the new worker');
  env.stores.set('voxel-cricket-0.0.0-old', new Map());
  env.stores.set('someone-elses-cache', new Map());
  const act = event({});
  env.handlers.activate(act);
  await act._p;
  check(!env.stores.has('voxel-cricket-0.0.0-old'), 'activate deletes old game caches');
  check(env.stores.has('someone-elses-cache') && env.stores.has(cacheName), 'activate keeps current and unrelated caches');
  check(env.claimed, 'activate claims open pages');

  // install must fail (not half-install) if a file cannot be fetched
  const env2 = makeEnv({ networkUp: false });
  const bad2 = event({});
  env2.handlers.install(bad2);
  let rejected = false;
  await bad2._p.catch(() => (rejected = true));
  check(rejected, 'install fails if files cannot be fetched, so a broken cache is never activated');
} catch (e) {
  fail(`service worker test threw: ${e.message}`);
}

console.log(failures === 0 ? '\nAll offline checks passed.' : `\n${failures} offline check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
