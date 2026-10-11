// serve-sim preview servers on this machine, for the "Open in serve-sim"
// address: suggestions while the user edits it, and whether the stored one
// still answers. Only reads and probes; nothing is started, stopped or stored.
import { readdirSync, readFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';

import { normalizeDirectUrl } from '../shared/direct.ts';
import type { ServeSimServer } from '../shared/state.ts';

/** serve-sim's preview default is 3200; a few more for servers started next to it. */
export const PREVIEW_PORTS = Array.from({ length: 10 }, (_, index) => 3200 + index);
/** The extension's own helpers (helper.ts): never suggested. */
const OWN_HELPER_PORTS = { first: 3100, last: 3109 };
/** A freshly started serve-sim takes up to a second or two for its first answer. */
const PROBE_TIMEOUT_MS = 3_000;
/** serve-sim renders its preview page in one to four seconds. */
const PAGE_TIMEOUT_MS = 8_000;
const PREVIEW_MARKER = 'window.__SIM_PREVIEW__=';
/** The marker sits about 140 KB into the page; give up well after that. */
const PAGE_READ_MAX = 1024 * 1024;


export type ServerDeps = {
  /** `url` of every serve-sim state file. */
  stateFileUrls: () => string[];
  /** This machine's IPv4 addresses, loopback included. */
  addresses: () => string[];
  /** Booted devices: a serve-sim server answers its health route for any of them. */
  booted: () => Promise<Array<{ udid: string; name: string }>>;
  /** Does serve-sim at `base` answer its helper health route for `udid`? Quick. */
  probe: (base: string, udid: string) => Promise<boolean>;
  /** The device serve-sim's preview page at `base` shows, or `null`. Slow (the page takes seconds). */
  pageDevice: (base: string) => Promise<string | null>;
};

export const isLoopbackHost = (host: string): boolean => host === 'localhost' || host === '[::1]' || host === '::1' || host.startsWith('127.');

const ownHelper = (url: URL): boolean => {
  const port = Number(url.port);
  return isLoopbackHost(url.hostname) && port >= OWN_HELPER_PORTS.first && port <= OWN_HELPER_PORTS.last;
};

/** Addresses worth probing, network ones first, without the extension's helpers and without duplicates. */
export const candidateUrls = (stateFileUrls: string[], addresses: string[]): string[] => {
  const urls = new Set<string>();
  for (const raw of stateFileUrls) {
    const url = normalizeDirectUrl(raw);
    if (url && !ownHelper(new URL(url))) urls.add(url);
  }
  for (const address of addresses) for (const port of PREVIEW_PORTS) urls.add(`http://${address}:${port}`);
  const loopback = (url: string) => isLoopbackHost(new URL(url).hostname);
  return [...urls].sort((a, b) => Number(loopback(a)) - Number(loopback(b)));
};

/** Whether serve-sim answers at `url` for any of the booted devices (all asked at once). */
const answers = async (url: string, booted: Array<{ udid: string }>, probe: ServerDeps['probe']): Promise<boolean> =>
  (await Promise.all(booted.map((device) => probe(url, device.udid)))).some(Boolean);

/** serve-sim preview servers that answer, in the order of `candidateUrls`, named by the device their page shows. */
export const findServers = async (deps: ServerDeps): Promise<ServeSimServer[]> => {
  const booted = await deps.booted();
  if (booted.length === 0) return [];
  const urls = candidateUrls(deps.stateFileUrls(), deps.addresses());
  const alive = (await Promise.all(urls.map(async (url) => ((await answers(url, booted, deps.probe)) ? url : null)))).filter((url): url is string => url !== null);
  return Promise.all(
    alive.map(async (url) => {
      const udid = await deps.pageDevice(url);
      const name = booted.find((device) => device.udid === udid)?.name ?? '';
      return { url, udid: udid ?? '', name, loopback: isLoopbackHost(new URL(url).hostname) };
    }),
  );
};

/** Whether serve-sim answers at `url`; `null` when that cannot be told (not a plain http(s) address, no booted device). */
export const checkServer = async (raw: unknown, deps: Pick<ServerDeps, 'booted' | 'probe'>): Promise<boolean | null> => {
  const url = normalizeDirectUrl(raw);
  if (!url) return null;
  const booted = await deps.booted();
  return booted.length === 0 ? null : answers(url, booted, deps.probe);
};

/** The device in a preview page's `window.__SIM_PREVIEW__ = {..."device":"<udid>"...}`. */
export const previewDevice = (html: string): string | null => {
  const at = html.indexOf(PREVIEW_MARKER);
  if (at < 0) return null;
  return /"device":"([0-9A-Fa-f-]{36})"/.exec(html.slice(at, at + 400))?.[1] ?? null;
};

const stateFileUrls = (dir = join(tmpdir(), 'serve-sim')): string[] => {
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((name) => name.startsWith('server-') && name.endsWith('.json'));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    try {
      const state = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { url?: unknown };
      return typeof state.url === 'string' ? [state.url] : [];
    } catch {
      return []; // half-written file
    }
  });
};

const ipv4Addresses = (): string[] =>
  Object.values(networkInterfaces()).flatMap((entries) => (entries ?? []).filter((entry) => entry.family === 'IPv4').map((entry) => entry.address));

/**
 * Reads the preview page only up to the device it names, then stops. The page
 * also carries serve-sim's shell-route token right after it: never kept, logged or passed on.
 */
const pagePreviewDevice = async (base: string): Promise<string | null> => {
  try {
    const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS), redirect: 'error' });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    try {
      while (html.length < PAGE_READ_MAX) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        const at = html.indexOf(PREVIEW_MARKER);
        if (at >= 0 && html.length > at + 400) break;
      }
    } finally {
      void reader.cancel().catch(() => undefined);
    }
    return previewDevice(html);
  } catch {
    return null;
  }
};

/** Does serve-sim at `base` answer its helper health route for `udid`? */
export const probeHealth = async (base: string, udid: string): Promise<boolean> => {
  try {
    const response = await fetch(`${base}/helper/${encodeURIComponent(udid)}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: 'error' });
    if (!response.ok) return false;
    return ((await response.json()) as { status?: string }).status === 'ok';
  } catch {
    return false;
  }
};

/** The real machine, with `booted` from the simulator's device list. */
export const serverDeps = (booted: ServerDeps['booted']): ServerDeps => ({
  stateFileUrls: () => stateFileUrls(),
  addresses: ipv4Addresses,
  booted,
  probe: probeHealth,
  pageDevice: pagePreviewDevice,
});
