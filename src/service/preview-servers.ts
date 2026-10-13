// serve-sim preview servers the user asked the extension to start, on one of
// this machine's own addresses (the address row's Start, after a confirmation).
// The page they serve carries a token for serve-sim's shell route, so they are
// never started by themselves and never used as the extension's helpers.
// Started servers are recorded in a small file, so Stop works after a service
// restart, and only ever ends what is recorded there.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OwnAddress } from '../shared/state.ts';
import { childEnv, run, SERVE_SIM } from './exec.ts';

const PS = ['/bin/ps', 'ps'];
import { PREVIEW_PORTS } from './serve-sim-servers.ts';

export type StartedPreview = { pid: number; url: string; udid: string };

/** Tailnet (100.64.0.0/10) first, then private LAN ranges, other addresses, loopback last. */
const rank = (address: string): number => {
  const [a = 0, b = 0] = address.split('.').map(Number);
  if (a === 100 && b >= 64 && b <= 127) return 0;
  if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return 1;
  if (a === 127) return 3;
  return 2;
};

/** This machine's IPv4 addresses with their interface names, in the order the picker shows them. */
export const ownAddresses = (interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): OwnAddress[] =>
  Object.entries(interfaces)
    .flatMap(([name, entries]) => (entries ?? []).filter((entry) => entry.family === 'IPv4').map((entry) => ({ address: entry.address, interface: name })))
    .sort((left, right) => rank(left.address) - rank(right.address));

export type PreviewDeps = {
  addresses: () => OwnAddress[];
  /** Can something listen on `address:port` right now? */
  portFree: (address: string, port: number) => Promise<boolean>;
  /** Starts the server detached; answers its pid. */
  launch: (udid: string, address: string, port: number) => number | undefined;
  /** Does serve-sim at `url` answer its health route for `udid`? */
  probe: (url: string, udid: string) => Promise<boolean>;
  alive: (pid: number) => boolean;
  /** The command line of `pid`, or `null` when it does not run. */
  commandOf: (pid: number) => Promise<string | null>;
  kill: (pid: number) => void;
  readRecord: () => StartedPreview[];
  writeRecord: (list: StartedPreview[]) => void;
  sleep: (ms: number) => Promise<void>;
  startTimeoutMs: number;
};

export class PreviewError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** How long a stopped server may take to end. */
const STOP_WAIT_MS = 3_000;

/**
 * Is `command` the serve-sim we started for `entry`? A pid alone is not
 * enough: pids get reused, so the command line must name the device, address and port.
 */
export const isOurServer = (entry: StartedPreview, command: string | null): boolean => {
  if (!command) return false;
  const url = new URL(entry.url);
  const tokens = command.trim().split(/\s+/);
  const value = (flag: string) => tokens[tokens.indexOf(flag) + 1];
  return (
    tokens.some((token) => token === 'serve-sim' || token.endsWith('/serve-sim')) &&
    tokens.includes(entry.udid) &&
    tokens.includes('--host') &&
    value('--host') === url.hostname &&
    tokens.includes('--port') &&
    value('--port') === url.port
  );
};

export const createPreviews = (deps: PreviewDeps) => {
  /** Starts one after the other, so two never pick the same port or overwrite each other's record. */
  let queue: Promise<unknown> = Promise.resolve();

  /** The record without servers that no longer run as recorded (gone, or the pid now belongs to something else). */
  const started = async (): Promise<StartedPreview[]> => {
    const list = deps.readRecord();
    const checked = await Promise.all(list.map(async (entry) => (deps.alive(entry.pid) && isOurServer(entry, await deps.commandOf(entry.pid)) ? entry : null)));
    const living = checked.filter((entry): entry is StartedPreview => entry !== null);
    if (living.length !== list.length) deps.writeRecord(living);
    return living;
  };

  const startNow = async (address: string, udid: string): Promise<StartedPreview> => {
    let port: number | null = null;
    for (const candidate of PREVIEW_PORTS) {
      // Also the wildcard address: a server on 0.0.0.0 holds the port for every address.
      if ((await deps.portFree(address, candidate)) && (await deps.portFree('0.0.0.0', candidate))) {
        port = candidate;
        break;
      }
    }
    if (port === null) throw new PreviewError(`No free port ${PREVIEW_PORTS[0]}-${PREVIEW_PORTS[PREVIEW_PORTS.length - 1]} on ${address}`, 409);
    const pid = deps.launch(udid, address, port);
    if (pid === undefined) throw new PreviewError('serve-sim did not start', 500);
    const entry = { pid, url: `http://${address}:${port}`, udid };
    // Accepted only when it answers and the answering process is still ours, twice in a row.
    let confirmed = 0;
    for (const deadline = Date.now() + deps.startTimeoutMs; Date.now() < deadline; ) {
      await deps.sleep(500);
      if (!deps.alive(pid)) break;
      const ours = (await deps.probe(entry.url, udid)) && deps.alive(pid) && isOurServer(entry, await deps.commandOf(pid));
      confirmed = ours ? confirmed + 1 : 0;
      if (confirmed >= 2) {
        deps.writeRecord([...(await started()).filter((other) => other.url !== entry.url), entry]);
        return entry;
      }
    }
    deps.kill(pid);
    throw new PreviewError('serve-sim did not answer (log: $TMPDIR/openchamber-ios-simulator-serve-sim.log)', 500);
  };

  return {
    started,

    /** Starts `serve-sim <udid> --host <address>` on the first free preview port; answers its address once it answers. */
    start(address: unknown, udid: string): Promise<StartedPreview> {
      if (typeof address !== 'string' || !deps.addresses().some((own) => own.address === address)) {
        return Promise.reject(new PreviewError('Not an address of this machine', 400));
      }
      const run = queue.then(() => startNow(address, udid));
      queue = run.catch(() => undefined);
      return run;
    },

    /** Ends a server the extension started; anything else is 404. The record is kept until the process has ended. */
    async stop(url: unknown): Promise<void> {
      const list = await started();
      const entry = list.find((candidate) => candidate.url === url);
      if (!entry) throw new PreviewError('Not a server this extension started', 404);
      deps.kill(entry.pid);
      for (const deadline = Date.now() + STOP_WAIT_MS; deps.alive(entry.pid) && Date.now() < deadline; ) await deps.sleep(100);
      if (deps.alive(entry.pid)) throw new PreviewError('serve-sim is still running; try Stop again', 409);
      deps.writeRecord(deps.readRecord().filter((candidate) => candidate.url !== entry.url));
    },
  };
};

const RECORD = join(tmpdir(), 'openchamber-ios-simulator-previews.json');

const readRecord = (): StartedPreview[] => {
  try {
    const value = JSON.parse(readFileSync(RECORD, 'utf8')) as unknown;
    return Array.isArray(value)
      ? value.filter((entry): entry is StartedPreview => typeof entry?.pid === 'number' && typeof entry?.url === 'string' && typeof entry?.udid === 'string')
      : [];
  } catch {
    return [];
  }
};

const portFree = (address: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, address, () => server.close(() => resolve(true)));
  });

const launch: PreviewDeps['launch'] = (udid, address, port) => {
  const log = openSync(join(tmpdir(), 'openchamber-ios-simulator-serve-sim.log'), 'a');
  const binary = SERVE_SIM.find((candidate) => !candidate.startsWith('/') || existsSync(candidate)) ?? 'serve-sim';
  const child = spawn(binary, [udid, '--host', address, '--port', String(port), '--exit-on-simulator-shutdown'], { detached: true, stdio: ['ignore', log, log], env: childEnv() });
  closeSync(log);
  child.on('error', () => undefined);
  child.unref();
  return child.pid;
};

/** The real machine; `probe` from serve-sim-servers.ts. */
export const previewDeps = (probe: PreviewDeps['probe']): PreviewDeps => ({
  addresses: () => ownAddresses(),
  portFree,
  launch,
  probe,
  alive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  commandOf: async (pid) => {
    const result = await run(PS, ['-p', String(pid), '-o', 'command='], { timeout: 5_000 });
    return result.ok && result.stdout.trim() ? result.stdout.trim() : null;
  },
  kill: (pid) => {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  },
  readRecord,
  writeRecord: (list) => writeFileSync(RECORD, JSON.stringify(list)),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  startTimeoutMs: 30_000,
});
