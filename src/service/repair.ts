// Repairs a simulator's touch and key input: `serve-sim repair-input` (which
// restarts SpringBoard and closes the running apps), then a fresh loopback
// helper, because serve-sim asks for a restart of its servers afterwards.
import type { ExecResult } from './exec.ts';

export type RepairDeps = {
  /** Runs serve-sim with `args`. */
  serveSim: (args: string[]) => Promise<ExecResult>;
  /** Stops the device's loopback helpers and starts one fresh; answers its port. */
  restartHelper: (udid: string) => Promise<number>;
};

/** Answers the fresh helper's port; throws with a readable reason when serve-sim fails. */
export const repairInput = async (udid: string, deps: RepairDeps): Promise<number> => {
  const result = await deps.serveSim(['repair-input', '-d', udid]);
  if (!result.ok) {
    if (result.missing) throw new Error('serve-sim not found (npm install -g serve-sim)');
    const reason = result.stderr.trim().split('\n').find((line) => line.trim()) ?? 'unknown error';
    throw new Error(`serve-sim repair-input failed: ${reason}`);
  }
  return deps.restartHelper(udid);
};
