// Finds or starts a serve-sim server that listens on 127.0.0.1 ONLY. Every
// serve-sim server answers `/helper/<udid>/...` for any booted device, so any
// one on loopback will do. A preview server someone bound to another
// interface is never used and never touched.
import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { childEnv, SERVE_SIM } from './exec.ts';

export const LOOPBACK = '127.0.0.1';
const FIRST_PORT = 3100;
const PORT_SPAN = 10;

const isLoopbackUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
  } catch {
    return false;
  }
};

/** Ports from serve-sim's state files, loopback only. */
export const portsFromStateFiles = (dir = join(tmpdir(), 'serve-sim')): number[] => {
  const ports: number[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((name) => name.startsWith('server-') && name.endsWith('.json'));
  } catch {
    return ports;
  }
  for (const name of names) {
    try {
      const state = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { url?: string; port?: number };
      if (typeof state.url === 'string' && isLoopbackUrl(state.url) && typeof state.port === 'number') ports.push(state.port);
    } catch {
      // broken or half-written file: skip it
    }
  }
  return ports;
};

export const helperBase = (port: number, udid: string): string => `http://${LOOPBACK}:${port}/helper/${encodeURIComponent(udid)}`;

const probe = async (port: number, udid: string): Promise<boolean> => {
  try {
    const response = await fetch(`${helperBase(port, udid)}/health`, { signal: AbortSignal.timeout(2_500) });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === 'ok';
  } catch {
    return false;
  }
};

const portFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, LOOPBACK, () => server.close(() => resolve(true)));
  });

const serveSimBinary = (): string => SERVE_SIM.find((candidate) => !candidate.startsWith('/') || existsSync(candidate)) ?? 'serve-sim';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let starting: Promise<number> | null = null;

/** Port of a loopback helper that serves `udid`. Starts one when none runs. */
export const ensureHelper = async (udid: string, preferred: number | null): Promise<number> => {
  const candidates = [
    ...(preferred ? [preferred] : []),
    ...portsFromStateFiles(),
    ...Array.from({ length: PORT_SPAN }, (_, index) => FIRST_PORT + index),
  ];
  const seen = new Set<number>();
  for (const port of candidates) {
    if (seen.has(port)) continue;
    seen.add(port);
    if (await probe(port, udid)) return port;
  }
  starting ??= startHelper(udid).finally(() => {
    starting = null;
  });
  return starting;
};

const startHelper = async (udid: string): Promise<number> => {
  let port: number | null = null;
  for (let candidate = FIRST_PORT; candidate < FIRST_PORT + PORT_SPAN; candidate += 1) {
    if (await portFree(candidate)) {
      port = candidate;
      break;
    }
  }
  if (port === null) throw new Error(`No free port ${FIRST_PORT}-${FIRST_PORT + PORT_SPAN - 1} for serve-sim`);
  const log = openSync(join(tmpdir(), `openchamber-ios-simulator-serve-sim.log`), 'a');
  // Detached so the helper outlives a service restart. It exits by itself when
  // its simulator shuts down (--exit-on-simulator-shutdown).
  const child = spawn(
    serveSimBinary(),
    [udid, '--port', String(port), '--host', LOOPBACK, '--exit-on-simulator-shutdown'],
    { detached: true, stdio: ['ignore', log, log], env: childEnv() },
  );
  closeSync(log);
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  child.once('error', () => {
    exited = true;
  });
  child.unref();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !exited) {
    await sleep(500);
    if (await probe(port, udid)) return port;
  }
  throw new Error('serve-sim did not start (log: $TMPDIR/openchamber-ios-simulator-serve-sim.log)');
};
