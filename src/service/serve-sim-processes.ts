// The serve-sim stream processes running on this machine, from the process
// list: which device each is attached to, on which address and port, and
// whether it is the extension's own helper. Several on one device can disturb
// its input, so the toolbar warns. `serve-sim --list` is no help here: it
// missed processes in a test; only the process list is complete. Read only.
import type { ServeSimProcess } from '../shared/state.ts';
import { run } from './exec.ts';

export type ParsedServeSim = ServeSimProcess & { devices: string[] };

const UUID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
/** Flags that take a value, so the next token is not a device or subcommand. */
const VALUE_FLAGS = new Set(['--port', '-p', '--host', '--codec', '--panes', '--theme', '-d', '--device']);
/** Calls that list or end streams instead of being one. */
const NOT_A_STREAM = new Set(['--list', '-l', '--kill', '-k', '--help', '-h', '--version', '-v']);
/** serve-sim's documented preview default. */
const DEFAULT_PORT = 3200;
const DEFAULT_HOST = '127.0.0.1';
/** The extension's helpers: `serve-sim <udid> --port 31xx --host 127.0.0.1 --exit-on-simulator-shutdown` (helper.ts). */
const OWN_PORTS = { first: 3100, last: 3109 };

/** The arguments after the serve-sim binary, or `null` when the command does not run serve-sim. */
const serveSimArgs = (command: string): string[] | null => {
  const tokens = command.trim().split(/\s+/);
  const isServeSim = (token = '') => token === 'serve-sim' || token.endsWith('/serve-sim');
  // `serve-sim ...`, or `node /opt/homebrew/bin/serve-sim ...` (not `grep serve-sim`).
  if (isServeSim(tokens[0])) return tokens.slice(1);
  if (/(^|\/)node$/.test(tokens[0] ?? '') && isServeSim(tokens[1])) return tokens.slice(2);
  return null;
};

/** `ps -axo pid=,command=` output to serve-sim stream processes. */
export const parseServeSimProcesses = (output: string): ParsedServeSim[] => {
  const found: ParsedServeSim[] = [];
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const args = serveSimArgs(match[2]!);
    if (!args) continue;
    let host = DEFAULT_HOST;
    let port = DEFAULT_PORT;
    let exitsWithSimulator = false;
    let stream = true;
    const devices: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      const token = args[index]!;
      if (NOT_A_STREAM.has(token)) {
        stream = false;
        break;
      }
      if (VALUE_FLAGS.has(token)) {
        const value = args[(index += 1)] ?? '';
        if (token === '--host') host = value;
        if (token === '--port' || token === '-p') port = Number(value) || DEFAULT_PORT;
        continue;
      }
      if (token.startsWith('--host=')) host = token.slice('--host='.length);
      else if (token.startsWith('--port=')) port = Number(token.slice('--port='.length)) || DEFAULT_PORT;
      else if (token === '--exit-on-simulator-shutdown') exitsWithSimulator = true;
      else if (UUID.test(token)) devices.push(token.toUpperCase());
      else if (!token.startsWith('-')) {
        // A subcommand (repair-input, gesture, fold, ...) or a device given by name: not attributable as a stream.
        if (devices.length === 0 && index === 0) {
          stream = false;
          break;
        }
      }
    }
    if (!stream) continue;
    const own = host === '127.0.0.1' && port >= OWN_PORTS.first && port <= OWN_PORTS.last && exitsWithSimulator;
    found.push({ pid: Number(match[1]), host, port, own, devices });
  }
  return found;
};

/**
 * The processes attached to `udid`; one without a device counts for every
 * booted device. `ownPids`: preview servers the extension started on request, which count as its own.
 */
export const processesFor = (all: ParsedServeSim[], udid: string, booted: boolean, ownPids: ReadonlySet<number> = new Set()): ServeSimProcess[] =>
  booted
    ? all
        .filter((entry) => (entry.devices.length === 0 ? true : entry.devices.includes(udid.toUpperCase())))
        .map(({ pid, host, port, own }) => ({ pid, host, port, own: own || ownPids.has(pid) }))
    : [];

const CACHE_MS = 5_000;
const PS = ['/bin/ps', 'ps'];

/** The process list, read at most every 5 seconds; empty when it cannot be read (no warning rather than a false one). */
export const createProcessReader = (read: () => Promise<string | null> = async () => {
  const result = await run(PS, ['-axo', 'pid=,command='], { timeout: 5_000 });
  return result.ok ? result.stdout : null;
}) => {
  let cached: { at: number; list: ParsedServeSim[] } | null = null;
  let pending: Promise<ParsedServeSim[]> | null = null;
  const reader = async (): Promise<ParsedServeSim[]> => {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.list;
    pending ??= (async () => {
      const output = await read().catch(() => null);
      const list = output === null ? [] : parseServeSimProcesses(output);
      cached = { at: Date.now(), list };
      return list;
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
  /** Reads afresh next time (after the extension started or stopped a server). */
  return Object.assign(reader, {
    forget() {
      cached = null;
    },
  });
};
