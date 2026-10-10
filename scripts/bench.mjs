// Measures what reaches a viewer: starts the built service like OpenChamber,
// pulls surface frames one at a time the way the host does, and keeps the
// screen moving by turning the device back and forth (ends upright).
// Also counts the raw frames serve-sim delivered in the same time.
//
//   node scripts/bench.mjs                      # framed/plain at full, half and third size, 8 s each
//   BENCH_SECONDS=15 BENCH_MODES=plain:full,framed:balanced node scripts/bench.mjs
//   BENCH_SCROLL=0 node scripts/bench.mjs       # no rotation, idle screen
//   BENCH_UDID=<udid> node scripts/bench.mjs    # a running device other than the one shown
//
// Needs a booted simulator whose app can rotate. Turns it unless BENCH_SCROLL=0.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../dist/service/main.js', import.meta.url));
const seconds = Number(process.env.BENCH_SECONDS ?? 8);
const modes = (process.env.BENCH_MODES ?? 'framed:full,plain:full,framed:balanced,plain:balanced,framed:fast').split(',');
const scroll = process.env.BENCH_SCROLL !== '0';

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
const child = spawn(process.execPath, [entry], {
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: token },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const call = (method, path, body, headers = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
  method,
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
  signal: AbortSignal.timeout(40_000),
});
for (const deadline = Date.now() + 15_000; ;) {
  try { if ((await call('GET', '/health')).status === 200) break; } catch { /* starting */ }
  if (Date.now() > deadline) throw new Error('service did not start');
  await new Promise((resolve) => setTimeout(resolve, 200));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (process.env.BENCH_UDID) await call('POST', '/select', { udid: process.env.BENCH_UDID });

const run = async (mode) => {
  const [frame, quality = 'full'] = mode.split(':');
  await call('POST', '/frame', { on: frame === 'framed' });
  await call('POST', '/quality', { value: quality });
  // Warm up until the picture size has been the same for 3 s (the device frame
  // for a new size renders in the background and shows up a moment later).
  let seq = 0;
  let width = 0;
  let height = 0;
  for (let stableSince = Date.now(), until = Date.now() + 30_000; Date.now() < until && Date.now() - stableSince < 3_000;) {
    await call('POST', '/rotate', { orientation: 'portrait' }).catch(() => undefined);
    const response = await call('GET', `/surface/frame?after=${seq}&wait=1000`);
    if (response.status !== 200) continue;
    seq = Number(response.headers.get('x-surface-seq'));
    const w = Number(response.headers.get('x-surface-width'));
    const h = Number(response.headers.get('x-surface-height'));
    if (w !== width || h !== height) stableSince = Date.now();
    width = w;
    height = h;
    await response.arrayBuffer();
  }
  const stats = async () => (await call('GET', '/stats')).json().catch(() => ({}));
  const before = await stats();
  let frames = 0;
  let bytes = 0;
  let stop = false;
  // Turning the device back and forth animates the whole screen (a drag on a
  // still list does not); it ends upright.
  const mover = (async () => {
    let landscape = false;
    while (scroll && !stop) {
      landscape = !landscape;
      await call('POST', '/rotate', { orientation: landscape ? 'landscape_left' : 'portrait' }).catch(() => undefined);
      await sleep(1_200);
    }
    if (landscape) await call('POST', '/rotate', { orientation: 'portrait' }).catch(() => undefined);
  })();
  const started = Date.now();
  while (Date.now() - started < seconds * 1000) {
    const response = await call('GET', `/surface/frame?after=${seq}&wait=2000`);
    if (response.status !== 200) continue;
    seq = Number(response.headers.get('x-surface-seq'));
    bytes += (await response.arrayBuffer()).byteLength;
    frames += 1;
  }
  stop = true;
  await mover;
  const elapsed = (Date.now() - started) / 1000;
  const after = await stats();
  const rate = (key) => (typeof before[key] === 'number' && typeof after[key] === 'number' ? ((after[key] - before[key]) / elapsed).toFixed(1) : 'n/a');
  console.log(`${mode.padEnd(16)} ${`${width}x${height}`.padEnd(10)} ${rate('raw')} fps from serve-sim, ${rate('shown')} prepared, ${(frames / elapsed).toFixed(1)} delivered, ${Math.round(bytes / Math.max(1, frames) / 1024)} KB/frame, ${(bytes / elapsed / 1024 / 1024).toFixed(1)} MB/s`);
};

try {
  for (const mode of modes) await run(mode);
} finally {
  await call('POST', '/frame', { on: true }).catch(() => undefined);
  await call('POST', '/quality', { value: 'balanced' }).catch(() => undefined);
  child.kill();
}
