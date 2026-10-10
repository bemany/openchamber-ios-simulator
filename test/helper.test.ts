import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { candidatePorts, createHelpers, helpersFromStateFiles, type HelperDeps } from '../src/service/helper.ts';

const state = (port: number, device: string, host = '127.0.0.1') => ({
  pid: 1,
  port,
  device,
  url: `http://${host}:${port}`,
});

describe('helper ownership', () => {
  test('reads port and device from loopback state files only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-ios-sim-state-'));
    writeFileSync(join(dir, 'server-A.json'), JSON.stringify(state(3100, 'A')));
    writeFileSync(join(dir, 'server-B.json'), JSON.stringify(state(3200, 'B', '192.0.2.10')));
    writeFileSync(join(dir, 'server-C.json'), '{ half written');
    writeFileSync(join(dir, 'server-A.log'), 'not json');
    expect(helpersFromStateFiles(dir)).toEqual([{ port: 3100, device: 'A' }]);
  });

  test('only the device\'s own helpers are candidates', () => {
    const recorded = [{ port: 3100, device: 'NODUS' }, { port: 3101, device: 'PHONE' }];
    expect(candidatePorts('PHONE', null, new Map(), recorded)).toEqual([3101]);
    // The helper of another device is never offered, even when it is the only one.
    expect(candidatePorts('IPAD', null, new Map(), recorded)).toEqual([]);
  });

  test('a remembered port counts only while no other device owns it', () => {
    const started = new Map([[3102, 'IPAD']]);
    expect(candidatePorts('PHONE', 3102, started, [])).toEqual([]);
    expect(candidatePorts('PHONE', 3104, started, [])).toEqual([3104]);
    expect(candidatePorts('IPAD', null, started, [])).toEqual([3102]);
  });
});

describe('helper starts', () => {
  /** A fake world: launching makes the helper answer after `delay` ms. */
  const world = (delay: number) => {
    const answering = new Map<number, string>();
    const launched: Array<{ udid: string; port: number }> = [];
    const deps: HelperDeps = {
      probe: async (port, udid) => answering.get(port) === udid,
      portFree: async (port) => !answering.has(port) && port !== 3100,
      recorded: () => [],
      launch: (udid, port) => {
        launched.push({ udid, port });
        setTimeout(() => answering.set(port, udid), delay);
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5))),
      startTimeoutMs: 1_000,
    };
    return { deps, launched };
  };

  test('two devices start helpers in parallel on different ports', async () => {
    const { deps, launched } = world(20);
    const helpers = createHelpers(deps);
    const [a, b] = await Promise.all([helpers.ensure('PHONE', null), helpers.ensure('IPAD', null)]);
    expect(a).not.toBe(b);
    expect(launched.map((entry) => entry.udid).sort()).toEqual(['IPAD', 'PHONE']);
    expect([a, b].every((port) => port !== 3100)).toBe(true);
  });

  test('parallel requests for one device share one start, and a running helper is reused', async () => {
    const { deps, launched } = world(20);
    const helpers = createHelpers(deps);
    const [a, b] = await Promise.all([helpers.ensure('PHONE', null), helpers.ensure('PHONE', null)]);
    expect(a).toBe(b);
    expect(await helpers.ensure('PHONE', null)).toBe(a);
    expect(launched).toHaveLength(1);
  });

  test('a helper that never answers fails the start', async () => {
    const { deps } = world(10_000);
    const helpers = createHelpers({ ...deps, startTimeoutMs: 50 });
    await expect(helpers.ensure('PHONE', null)).rejects.toThrow('serve-sim did not start');
  });
});
