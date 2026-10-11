import { describe, expect, test } from 'bun:test';

import { createPreviews, ownAddresses, type PreviewDeps, type StartedPreview } from '../src/service/preview-servers.ts';
import { parseServeSimProcesses, processesFor } from '../src/service/serve-sim-processes.ts';
import { serveSimsDoubled } from '../src/shared/state.ts';

const PHONE = '11111111-2222-3333-4444-555555555555';

/** A fake machine: `busy` ports are taken; launched servers answer after `answerAfter` probes. */
const world = (options: { busy?: string[]; answerAfter?: number; dies?: boolean } = {}) => {
  let record: StartedPreview[] = [];
  const living = new Set<number>();
  const answering = new Set<string>();
  const killed: number[] = [];
  const launched: string[] = [];
  let probes = 0;
  let nextPid = 500;
  const deps: PreviewDeps = {
    addresses: () => [
      { address: '100.64.1.2', interface: 'utun4' },
      { address: '127.0.0.1', interface: 'lo0' },
    ],
    portFree: async (address, port) => !(options.busy ?? []).includes(`${address}:${port}`),
    launch: (udid, address, port) => {
      nextPid += 1;
      launched.push(`${udid} ${address}:${port}`);
      if (!options.dies) living.add(nextPid);
      return nextPid;
    },
    probe: async (url) => {
      probes += 1;
      if (probes > (options.answerAfter ?? 0)) for (const entry of launched) answering.add(`http://${entry.split(' ')[1]}`);
      return answering.has(url) && [...living].length > 0;
    },
    alive: (pid) => living.has(pid),
    kill: (pid) => {
      killed.push(pid);
      living.delete(pid);
    },
    readRecord: () => record,
    writeRecord: (list) => {
      record = list;
    },
    sleep: async () => undefined,
    startTimeoutMs: 50,
  };
  return { deps, killed, launched, record: () => record, living };
};

describe('starting preview servers', () => {
  test('own addresses: tailnet first, then LAN, loopback last', () => {
    const list = ownAddresses({
      lo0: [{ address: '127.0.0.1', family: 'IPv4' } as never],
      en0: [{ address: '10.1.2.3', family: 'IPv4' } as never, { address: 'fe80::1', family: 'IPv6' } as never],
      utun4: [{ address: '100.101.1.2', family: 'IPv4' } as never],
    });
    expect(list).toEqual([
      { address: '100.101.1.2', interface: 'utun4' },
      { address: '10.1.2.3', interface: 'en0' },
      { address: '127.0.0.1', interface: 'lo0' },
    ]);
  });

  test('starts on the first free port of an own address and records it', async () => {
    const { deps, launched, record } = world({ busy: ['100.64.1.2:3200'], answerAfter: 1 });
    const entry = await createPreviews(deps).start('100.64.1.2', PHONE);
    expect(launched).toEqual([`${PHONE} 100.64.1.2:3201`]);
    expect(entry.url).toBe('http://100.64.1.2:3201');
    expect(record()).toEqual([entry]);
  });

  test('an address that is not the machine\'s own is refused, nothing starts', async () => {
    const { deps, launched } = world();
    await expect(createPreviews(deps).start('203.0.113.9', PHONE)).rejects.toMatchObject({ status: 400 });
    expect(launched).toEqual([]);
  });

  test('a server that never answers is ended', async () => {
    const { deps, killed } = world({ answerAfter: Number.POSITIVE_INFINITY });
    await expect(createPreviews(deps).start('127.0.0.1', PHONE)).rejects.toThrow('did not answer');
    expect(killed).toEqual([501]);
  });

  test('stop ends only a recorded server; others are 404; dead entries drop out of the record', async () => {
    const { deps, killed, record, living } = world();
    const previews = createPreviews(deps);
    const entry = await previews.start('127.0.0.1', PHONE);
    await expect(previews.stop('http://127.0.0.1:3299', [PHONE])).rejects.toMatchObject({ status: 404 });
    await previews.stop(entry.url, [PHONE]);
    expect(killed).toEqual([entry.pid]);
    expect(record()).toEqual([]);
    deps.writeRecord([{ pid: 9999, url: 'http://127.0.0.1:3205', udid: PHONE }]);
    expect(living.has(9999)).toBe(false);
    expect(previews.started()).toEqual([]);
  });

  test('a preview the extension started counts as its own: no warning next to its helper', () => {
    const all = parseServeSimProcesses(
      [
        `10 node /opt/homebrew/bin/serve-sim ${PHONE} --port 3101 --host 127.0.0.1 --exit-on-simulator-shutdown`,
        `11 node /opt/homebrew/bin/serve-sim ${PHONE} --host 100.64.1.2 --port 3200 --exit-on-simulator-shutdown`,
      ].join('\n'),
    );
    expect(serveSimsDoubled(processesFor(all, PHONE, true, new Set([11])))).toBe(false);
    expect(serveSimsDoubled(processesFor(all, PHONE, true))).toBe(true);
  });
});
