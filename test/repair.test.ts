import { describe, expect, test } from 'bun:test';

import type { ExecResult } from '../src/service/exec.ts';
import { repairInput } from '../src/service/repair.ts';

const deps = (result: ExecResult) => {
  const calls: string[][] = [];
  const restarted: string[] = [];
  return {
    calls,
    restarted,
    deps: {
      serveSim: async (args: string[]) => {
        calls.push(args);
        return result;
      },
      restartHelper: async (udid: string) => {
        restarted.push(udid);
        return 3104;
      },
    },
  };
};

describe('repair input', () => {
  test('runs repair-input for the device, then restarts its helper', async () => {
    const world = deps({ ok: true, stdout: 'Input repaired.' });
    expect(await repairInput('PHONE', world.deps)).toBe(3104);
    expect(world.calls).toEqual([['repair-input', '-d', 'PHONE']]);
    expect(world.restarted).toEqual(['PHONE']);
  });

  test('a failing serve-sim leaves the helper alone and says why', async () => {
    const world = deps({ ok: false, missing: false, stderr: '\nDevice Hub unavailable\nmore' });
    await expect(repairInput('PHONE', world.deps)).rejects.toThrow('serve-sim repair-input failed: Device Hub unavailable');
    expect(world.restarted).toEqual([]);
  });

  test('a missing serve-sim is named', async () => {
    const world = deps({ ok: false, missing: true, stderr: '' });
    await expect(repairInput('PHONE', world.deps)).rejects.toThrow('serve-sim not found');
  });
});
