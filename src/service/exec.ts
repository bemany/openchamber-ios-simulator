import { execFile } from 'node:child_process';
import { dirname } from 'node:path';

export type ExecResult = { ok: true; stdout: string } | { ok: false; missing: boolean; stderr: string };

/**
 * OpenChamber passes the service only PATH, HOME, temp and locale. serve-sim
 * starts with `#!/usr/bin/env node`, so Homebrew and the host's own Node go
 * onto PATH to be safe.
 */
export const childEnv = (): NodeJS.ProcessEnv => {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', dirname(process.execPath)];
  const path = [...(process.env.PATH ?? '').split(':').filter(Boolean)];
  for (const dir of extra) if (!path.includes(dir)) path.push(dir);
  return { ...process.env, PATH: path.join(':') };
};

/** Runs the first of `commands` that exists, without a shell. */
export const run = async (
  commands: string[],
  args: string[],
  options: { timeout?: number; input?: string } = {},
): Promise<ExecResult> => {
  let last: ExecResult = { ok: false, missing: true, stderr: '' };
  for (const command of commands) {
    last = await new Promise<ExecResult>((resolve) => {
      const child = execFile(
        command,
        args,
        { timeout: options.timeout ?? 15_000, env: childEnv(), maxBuffer: 32 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (!error) resolve({ ok: true, stdout });
          else resolve({ ok: false, missing: 'code' in error && error.code === 'ENOENT', stderr: String(stderr || error.message) });
        },
      );
      if (options.input !== undefined) child.stdin?.end(options.input);
    });
    if (last.ok || !last.missing) return last;
  }
  return last;
};

export const XCRUN = ['/usr/bin/xcrun', 'xcrun'];
export const SERVE_SIM = ['/opt/homebrew/bin/serve-sim', '/usr/local/bin/serve-sim', 'serve-sim'];
