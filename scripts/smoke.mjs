// Starts the built service the way OpenChamber does (port and token in the
// environment, nothing else but the inherited allowlist) and checks real
// answers. Needs a booted simulator. Taps nothing unless SMOKE_TAP=x,y is set.
//
//   node scripts/smoke.mjs
//   SMOKE_TAP=0.5,0.5 node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../dist/service/main.js', import.meta.url));

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const port = await freePort();
const token = randomBytes(16).toString('hex');
// As INHERITED_SERVICE_ENV_NAMES in OpenChamber's server/lib/guests/service.js.
const inherited = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TEMP', 'TMP', 'TZ', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES']);
const env = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => value && inherited.has(name.toUpperCase())));
const child = spawn(process.execPath, [entry], {
  env: { ...env, OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: token },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const fail = (message) => {
  console.error(`SMOKE FAIL: ${message}`);
  child.kill();
  process.exit(1);
};

const call = (method, path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
  method,
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
  signal: AbortSignal.timeout(40_000),
});

const deadline = Date.now() + 15_000;
for (;;) {
  try {
    if ((await call('GET', '/health')).status === 200) break;
  } catch {
    // not listening yet
  }
  if (Date.now() > deadline) fail('/health never answered');
  await new Promise((resolve) => setTimeout(resolve, 200));
}

const unauthorized = await fetch(`http://127.0.0.1:${port}/state`);
if (unauthorized.status !== 401) fail(`expected 401 without token, got ${unauthorized.status}`);

const state = await (await call('GET', '/state')).json();
console.log('state:', JSON.stringify({ active: state.active?.name ?? null, devices: state.devices.map((d) => `${d.name}:${d.state}`), appearance: state.appearance }));
if (!Array.isArray(state.devices) || state.devices.length === 0) fail('no devices listed');

const first = await call('GET', '/surface/frame?after=0&wait=20000');
if (first.status !== 200) fail(`frame status ${first.status}`);
let seq = Number(first.headers.get('x-surface-seq'));
const mime = first.headers.get('content-type');
const width = first.headers.get('x-surface-width');
const height = first.headers.get('x-surface-height');
const bytes = Buffer.from(await first.arrayBuffer());
console.log(`frame: seq=${seq} ${mime} ${width}x${height} ${bytes.length} bytes title=${first.headers.get('x-surface-title')}`);
if (state.active && mime !== 'image/jpeg') {
  // The first frame may still be the placeholder until the stream is up.
  const second = await call('GET', `/surface/frame?after=${seq}&wait=20000`);
  if (second.status !== 200 || second.headers.get('content-type') !== 'image/jpeg') fail('no jpeg frame from a booted simulator');
  seq = Number(second.headers.get('x-surface-seq'));
  writeFileSync('/tmp/oc-ios-sim-smoke.jpg', Buffer.from(await second.arrayBuffer()));
} else {
  writeFileSync(`/tmp/oc-ios-sim-smoke.${mime === 'image/png' ? 'png' : 'jpg'}`, bytes);
}

const bad = await call('POST', '/surface/input', { events: [{ type: 'nope' }] });
if (bad.status !== 400) fail(`bad batch should be 400, got ${bad.status}`);

if (process.env.SMOKE_TAP) {
  const [x, y] = process.env.SMOKE_TAP.split(',').map(Number);
  const w = Number(width);
  const h = Number(height);
  const mods = { alt: false, ctrl: false, meta: false, shift: false };
  const input = await fetch(`http://127.0.0.1:${port}/surface/input`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-surface-frame-seq': String(seq) },
    body: JSON.stringify({ events: [
      { type: 'pointer', action: 'down', x: x * w, y: y * h, button: 0, buttons: 1, modifiers: mods },
      { type: 'pointer', action: 'up', x: x * w, y: y * h, button: 0, buttons: 0, modifiers: mods },
    ] }),
  });
  console.log('tap:', input.status, await input.text());
  if (input.status !== 200) fail('tap failed');
}

const later = await call('GET', '/state');
console.log('streaming:', (await later.json()).streaming);
child.kill();
console.log('SMOKE OK');
