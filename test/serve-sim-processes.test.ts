import { describe, expect, test } from 'bun:test';

import { parseServeSimProcesses, processesFor } from '../src/service/serve-sim-processes.ts';

const PHONE = '11111111-2222-3333-4444-555555555555';
const PAD = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

// Command lines as `ps -axo pid=,command=` prints them.
const PS = [
  `20403 node /opt/homebrew/bin/serve-sim ${PHONE} --port 3101 --host 127.0.0.1 --exit-on-simulator-shutdown`,
  `18949 node /opt/homebrew/bin/serve-sim --host 192.0.2.7 --fit ${PHONE}`,
  `  311 node /usr/local/bin/serve-sim ${PAD} -p 3205`,
  `  400 serve-sim --host=0.0.0.0 --port=3300`,
  `  500 node /opt/homebrew/bin/serve-sim repair-input -d ${PHONE}`,
  `  501 node /opt/homebrew/bin/serve-sim --list`,
  `  502 node /opt/homebrew/bin/serve-sim gesture {"type":"tap"}`,
  `  600 node /Users/someone/project/node_modules/.bin/vite --port 3200`,
  `  700 grep serve-sim`,
].join('\n');

describe('serve-sim processes', () => {
  test('stream processes with device, address and port; subcommands and lists are left out', () => {
    expect(parseServeSimProcesses(PS)).toEqual([
      { pid: 20403, host: '127.0.0.1', port: 3101, own: true, devices: [PHONE] },
      { pid: 18949, host: '192.0.2.7', port: 3200, own: false, devices: [PHONE] },
      { pid: 311, host: '127.0.0.1', port: 3205, own: false, devices: [PAD] },
      { pid: 400, host: '0.0.0.0', port: 3300, own: false, devices: [] },
    ]);
  });

  test('a device gets its own processes and those without a device; an off device gets none', () => {
    const all = parseServeSimProcesses(PS);
    expect(processesFor(all, PHONE, true).map((entry) => entry.pid)).toEqual([20403, 18949, 400]);
    expect(processesFor(all, PAD.toLowerCase(), true).map((entry) => entry.pid)).toEqual([311, 400]);
    expect(processesFor(all, PHONE, false)).toEqual([]);
  });

  test('a helper on a loopback port the extension does not use is not its own', () => {
    const [entry] = parseServeSimProcesses(`9 node /opt/homebrew/bin/serve-sim ${PHONE} --port 3150 --host 127.0.0.1 --exit-on-simulator-shutdown`);
    expect(entry?.own).toBe(false);
  });
});
