// Finds or starts the serve-sim helper that belongs to a device, listening on
// 127.0.0.1 ONLY. Every serve-sim server answers `/helper/<udid>/...` for any
// booted device, but each helper exits when its own simulator shuts down
// (`--exit-on-simulator-shutdown`), so a device streamed through another
// device's helper would lose its picture with that other simulator. A device
// therefore only ever uses its own helper. A preview server someone bound to
// another interface is never used and never touched.
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

export type HelperEntry = { port: number; device: string };

/** Helpers recorded in serve-sim's state files: port and the device each belongs to, loopback only. */
export const helpersFromStateFiles = (dir = join(tmpdir(), 'serve-sim')): HelperEntry[] => {
  const helpers: HelperEntry[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((name) => name.startsWith('server-') && name.endsWith('.json'));
  } catch {
    return helpers;
  }
  for (const name of names) {
    try {
      const state = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { url?: string; port?: number; device?: string };
      if (typeof state.url !== 'string' || !isLoopbackUrl(state.url) || typeof state.port !== 'number' || typeof state.device !== 'string') continue;
      helpers.push({ port: state.port, device: state.device });
    } catch {
      // broken or half-written file: skip it
    }
  }
  return helpers;
};

/**
 * Ports worth probing for `udid`, best first: the one remembered for it, the
 * ones the service started for it, the ones serve-sim recorded for it. Never a
 * helper that belongs to another device.
 */
export const candidatePorts = (udid: string, remembered: number | null, started: ReadonlyMap<number, string>, recorded: HelperEntry[]): number[] => {
  const ports = [
    ...(remembered !== null && (started.get(remembered) ?? udid) === udid ? [remembered] : []),
    ...[...started].filter(([, device]) => device === udid).map(([port]) => port),
    ...recorded.filter((entry) => entry.device === udid).map((entry) => entry.port),
  ];
  // A port recorded for this device but since taken over by another device's helper we started is not ours.
  return [...new Set(ports)].filter((port) => (started.get(port) ?? udid) === udid);
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What the helper manager needs from the outside world; swapped out in tests. */
export type HelperDeps = {
  /** Does a serve-sim helper on `port` answer for `udid`? */
  probe: (port: number, udid: string) => Promise<boolean>;
  portFree: (port: number) => Promise<boolean>;
  recorded: () => HelperEntry[];
  /** Starts `serve-sim <udid>` on `port`; `onExit` runs when that process ends. */
  launch: (udid: string, port: number, onExit: () => void) => void;
  sleep: (ms: number) => Promise<void>;
  /** How long a start may take before it counts as failed. */
  startTimeoutMs: number;
};

/** Starts a detached helper; it outlives a service restart and exits by itself with its simulator. */
const launchServeSim: HelperDeps['launch'] = (udid, port, onExit) => {
  const log = openSync(join(tmpdir(), 'openchamber-ios-simulator-serve-sim.log'), 'a');
  const child = spawn(
    serveSimBinary(),
    [udid, '--port', String(port), '--host', LOOPBACK, '--exit-on-simulator-shutdown'],
    { detached: true, stdio: ['ignore', log, log], env: childEnv() },
  );
  closeSync(log);
  child.once('exit', onExit);
  child.once('error', onExit);
  child.unref();
};

export const createHelpers = (deps: HelperDeps) => {
  /** Helpers this service started: port to device. */
  const started = new Map<number, string>();
  /** One pending start per device; devices start in parallel. */
  const starting = new Map<string, Promise<number>>();
  /** Ports picked by a start that has not answered yet, so two starts never pick the same one. */
  const reserved = new Set<number>();

  const startHelper = async (udid: string): Promise<number> => {
    let port: number | null = null;
    for (let candidate = FIRST_PORT; candidate < FIRST_PORT + PORT_SPAN; candidate += 1) {
      if (reserved.has(candidate) || started.has(candidate)) continue;
      // Reserve before the await, so a parallel start for another device skips this port.
      reserved.add(candidate);
      if (await deps.portFree(candidate)) {
        port = candidate;
        break;
      }
      reserved.delete(candidate);
    }
    if (port === null) throw new Error(`No free port ${FIRST_PORT}-${FIRST_PORT + PORT_SPAN - 1} for serve-sim`);
    try {
      let exited = false;
      deps.launch(udid, port, () => {
        exited = true;
        if (started.get(port) === udid) started.delete(port);
      });
      const deadline = Date.now() + deps.startTimeoutMs;
      while (Date.now() < deadline && !exited) {
        await deps.sleep(250);
        if (await deps.probe(port, udid)) {
          started.set(port, udid);
          return port;
        }
      }
      throw new Error('serve-sim did not start (log: $TMPDIR/openchamber-ios-simulator-serve-sim.log)');
    } finally {
      reserved.delete(port);
    }
  };

  return {
    /** Port of the loopback helper that belongs to `udid`. Starts one when none runs. */
    async ensure(udid: string, remembered: number | null): Promise<number> {
      for (const port of candidatePorts(udid, remembered, started, deps.recorded())) {
        if (await deps.probe(port, udid)) return port;
      }
      let pending = starting.get(udid);
      if (!pending) {
        pending = startHelper(udid).finally(() => starting.delete(udid));
        starting.set(udid, pending);
      }
      return pending;
    },
  };
};

const helpers = createHelpers({
  probe,
  portFree,
  recorded: () => helpersFromStateFiles(),
  launch: launchServeSim,
  sleep,
  startTimeoutMs: 45_000,
});

/** Port of the loopback helper that belongs to `udid`. Starts one when none runs. */
export const ensureHelper = (udid: string, remembered: number | null): Promise<number> => helpers.ensure(udid, remembered);
