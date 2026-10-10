// Measures how long the picture stops when the stream's helper goes away:
// starts the built service like OpenChamber, pulls frames like the surface,
// then, after a few seconds, runs GAP_ACTION and reports the longest pause
// between two frames afterwards.
//
//   GAP_ACTION="kill-helper" node scripts/gap.mjs   # kill the shown device's serve-sim helper
//   GAP_ACTION="none" node scripts/gap.mjs          # baseline
//   GAP_ACTION="shutdown-other" GAP_OTHER=<udid> node scripts/gap.mjs
//       # show GAP_OTHER first (so it gets its own helper), then the main device,
//       # then shut GAP_OTHER down: the main device's picture must keep going
//   GAP_UDID=<udid> ...                             # show this running device first
//
// Needs a booted simulator. kill-helper only ends a serve-sim process bound to 127.0.0.1;
// shutdown-other shuts down GAP_OTHER and nothing else.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../dist/service/main.js', import.meta.url));
const action = process.env.GAP_ACTION ?? 'kill-helper';
const seconds = Number(process.env.GAP_SECONDS ?? 15);

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
if (action === 'shutdown-other') {
  if (!process.env.GAP_OTHER) throw new Error('GAP_OTHER is required for shutdown-other');
  await call('POST', '/select', { udid: process.env.GAP_OTHER });
  // Pull a few frames so the other device's helper is up and in use.
  for (let s = 0, i = 0; i < 5; i += 1) {
    const response = await call('GET', `/surface/frame?after=${s}&wait=3000`);
    if (response.status === 200) s = Number(response.headers.get('x-surface-seq'));
    await response.arrayBuffer().catch(() => undefined);
  }
}
if (process.env.GAP_UDID) await call('POST', '/select', { udid: process.env.GAP_UDID });

/** The serve-sim helper process listening on `helperPort` on loopback, if any. */
const helperPid = (helperPort) => {
  try {
    const out = execFileSync('/usr/sbin/lsof', ['-nP', `-iTCP@127.0.0.1:${helperPort}`, '-sTCP:LISTEN', '-t']).toString().trim();
    return out ? Number(out.split('\n')[0]) : null;
  } catch {
    return null;
  }
};

const stamps = [];
let seq = 0;
let acted = 0;
const started = Date.now();
const actAt = started + 4_000;
const state = await (await call('GET', '/state')).json();
const udid = state.active?.udid;
console.log(`showing ${state.active?.name ?? 'nothing'}`);
while (Date.now() - started < seconds * 1000) {
  if (!acted && Date.now() >= actAt) {
    acted = Date.now();
    if (action === 'shutdown-other') {
      console.log(`shutting down ${process.env.GAP_OTHER}`);
      // Asynchronous: the frame loop must keep pulling while the simulator shuts down.
      execFile('/usr/bin/xcrun', ['simctl', 'shutdown', process.env.GAP_OTHER], () => console.log(`shut down after ${((Date.now() - acted) / 1000).toFixed(1)} s`));
    }
    if (action === 'kill-helper') {
      // The shown device's helper is the one whose state file names it.
      const files = execFileSync('/bin/sh', ['-c', `cat "${process.env.TMPDIR}/serve-sim/server-${udid}.json" 2>/dev/null || true`]).toString();
      const helperPort = files ? JSON.parse(files).port : null;
      const pid = helperPort ? helperPid(helperPort) : null;
      console.log(`killing helper on 127.0.0.1:${helperPort} (pid ${pid})`);
      if (pid) process.kill(pid, 'SIGTERM');
    }
  }
  const response = await call('GET', `/surface/frame?after=${seq}&wait=1000`);
  if (response.status !== 200) continue;
  seq = Number(response.headers.get('x-surface-seq'));
  await response.arrayBuffer();
  stamps.push(Date.now());
}
const after = stamps.filter((stamp) => stamp >= acted);
let longest = after.length ? after[0] - acted : seconds * 1000;
for (let index = 1; index < after.length; index += 1) longest = Math.max(longest, after[index] - after[index - 1]);
console.log(`${action}: ${after.length} frames after the action, longest pause ${(longest / 1000).toFixed(1)} s`);
child.kill();
