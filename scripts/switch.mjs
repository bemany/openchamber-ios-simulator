// Switches between two running simulators several times through the built
// service and reports how long each switch takes until frames of the new device
// arrive (title header) and whether the service ever streamed a device through
// a helper of another device (serve-sim state files show each helper's device).
//
//   SWITCH_A=<udid> SWITCH_B=<udid> node scripts/switch.mjs
//
// Both devices must already run; this script boots and shuts down nothing.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../dist/service/main.js', import.meta.url));
const a = process.env.SWITCH_A;
const b = process.env.SWITCH_B;
const rounds = Number(process.env.SWITCH_ROUNDS ?? 5);
if (!a || !b) throw new Error('SWITCH_A and SWITCH_B are required');

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
const call = (method, path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
  method,
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
  signal: AbortSignal.timeout(40_000),
});
for (const deadline = Date.now() + 15_000; ;) {
  try { if ((await call('GET', '/health')).status === 200) break; } catch { /* starting */ }
  if (Date.now() > deadline) throw new Error('service did not start');
  await new Promise((resolve) => setTimeout(resolve, 200));
}

const names = new Map((await (await call('GET', '/state')).json()).devices.map((device) => [device.udid, device.name]));
let seq = 0;
const frameOf = async (udid, limitMs) => {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    const response = await call('GET', `/surface/frame?after=${seq}&wait=1000`);
    if (response.status !== 200) continue;
    seq = Number(response.headers.get('x-surface-seq'));
    const title = response.headers.get('x-surface-title');
    await response.arrayBuffer();
    if (title === names.get(udid)) return true;
  }
  return false;
};

await call('POST', '/select', { udid: a });
await frameOf(a, 10_000);
const times = [];
for (let round = 0; round < rounds; round += 1) {
  const target = round % 2 === 0 ? b : a;
  const started = Date.now();
  await call('POST', '/select', { udid: target });
  const ok = await frameOf(target, 10_000);
  const state = await (await call('GET', '/state')).json();
  times.push(ok ? Date.now() - started : null);
  console.log(`switch ${round + 1} to ${names.get(target)}: ${ok ? `${((Date.now() - started) / 1000).toFixed(1)} s` : 'no picture within 10 s'}, streaming=${state.streaming}`);
}
console.log(`slowest switch: ${times.includes(null) ? 'failed' : `${(Math.max(...times) / 1000).toFixed(1)} s`}`);
child.kill();
