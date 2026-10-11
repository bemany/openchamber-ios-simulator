import { describe, expect, test } from 'bun:test';

import { candidateUrls, checkServer, findServers, previewDevice, PREVIEW_PORTS, type ServerDeps } from '../src/service/serve-sim-servers.ts';

const PHONE = '11111111-2222-3333-4444-555555555555';
const PAD = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

/** A fake machine: `answering` maps a base address to the device its preview page shows; every server answers health for any booted device. */
const machine = (answering: Record<string, string>, booted = [{ udid: PHONE, name: 'Test Phone' }, { udid: PAD, name: 'Test Pad' }]): ServerDeps => ({
  stateFileUrls: () => [],
  addresses: () => ['127.0.0.1', '192.0.2.7'],
  booted: async () => booted,
  probe: async (base) => base in answering,
  pageDevice: async (base) => answering[base] ?? null,
});

describe('serve-sim servers', () => {
  test('candidates: state files and preview ports, network first, own helpers left out, no duplicates', () => {
    const urls = candidateUrls(['http://127.0.0.1:3101', 'http://192.0.2.7:3200', 'http://127.0.0.1:3250/'], ['127.0.0.1', '192.0.2.7']);
    expect(urls).not.toContain('http://127.0.0.1:3101');
    expect(urls).toContain('http://127.0.0.1:3250');
    expect(urls.filter((url) => url === 'http://192.0.2.7:3200')).toHaveLength(1);
    expect(urls.length).toBe(1 + 2 * PREVIEW_PORTS.length);
    expect(urls.findIndex((url) => url.startsWith('http://127.'))).toBe(PREVIEW_PORTS.length);
  });

  test('only servers that answer are found, named by the device their page shows', async () => {
    const servers = await findServers(machine({ 'http://192.0.2.7:3200': PAD, 'http://127.0.0.1:3201': PHONE }));
    expect(servers).toEqual([
      { url: 'http://192.0.2.7:3200', udid: PAD, name: 'Test Pad', loopback: false },
      { url: 'http://127.0.0.1:3201', udid: PHONE, name: 'Test Phone', loopback: true },
    ]);
  });

  test('checking the stored address: running, stopped, or unknown for a bad address', async () => {
    const deps = machine({ 'http://192.0.2.7:3200': PHONE });
    expect(await checkServer('192.0.2.7:3200', deps)).toBe(true);
    expect(await checkServer('http://192.0.2.7:3201', deps)).toBe(false);
    expect(await checkServer('javascript:alert(1)', deps)).toBeNull();
    // Without a booted device no serve-sim can be asked.
    expect(await checkServer('http://192.0.2.7:3200', machine({ 'http://192.0.2.7:3200': PHONE }, []))).toBeNull();
    expect(await findServers(machine({ 'http://192.0.2.7:3200': PHONE }, []))).toEqual([]);
  });

  test('the device comes from the preview page, nothing else is read from it', () => {
    const page = `<html>${'x'.repeat(1000)}<script>window.__SIM_PREVIEW__={"pid":1,"port":3200,"device":"${PHONE}","url":"http://localhost:3200"}</script>`;
    expect(previewDevice(page)).toBe(PHONE);
    expect(previewDevice('<html>no preview</html>')).toBeNull();
  });
});
