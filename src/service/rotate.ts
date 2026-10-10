// The simulator's framebuffer is always portrait. When the device is rotated,
// the frame that goes out is rotated too (as Simulator.app turns its window),
// and input on the rotated picture is mapped back to portrait coordinates.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Orientation } from '../shared/state.ts';
import { run } from './exec.ts';

/** Clockwise rotation that shows the framebuffer upright. */
export const rotationFor = (orientation: Orientation | null): 0 | 90 | 180 | 270 => {
  switch (orientation) {
    case 'landscape_left':
      return 90;
    case 'landscape_right':
      return 270;
    case 'portrait_upside_down':
      return 180;
    default:
      return 0;
  }
};

/** Size of the rotated picture. */
export const rotatedSize = (size: { width: number; height: number }, degrees: number) =>
  degrees === 90 || degrees === 270 ? { width: size.height, height: size.width } : { ...size };

/** A point (normalized) on the rotated picture, back in the portrait framebuffer. */
export const toPortrait = (u: number, v: number, degrees: number): { x: number; y: number } => {
  switch (degrees) {
    case 90:
      return { x: v, y: 1 - u };
    case 270:
      return { x: 1 - v, y: u };
    case 180:
      return { x: 1 - u, y: 1 - v };
    default:
      return { x: u, y: v };
  }
};

/** A movement (normalized) on the rotated picture, back in the framebuffer. */
export const deltaToPortrait = (du: number, dv: number, degrees: number): { dx: number; dy: number } => {
  switch (degrees) {
    case 90:
      return { dx: dv, dy: -du };
    case 270:
      return { dx: -dv, dy: du };
    case 180:
      return { dx: -du, dy: -dv };
    default:
      return { dx: du, dy: dv };
  }
};

const SIPS = ['/usr/bin/sips', 'sips'];

/** Rotates a JPEG with macOS `sips` (ImageIO, about 30 ms for an iPhone frame). */
export const rotateJpeg = async (jpeg: Buffer, degrees: number): Promise<Buffer> => {
  if (degrees === 0) return jpeg;
  const dir = await mkdtemp(join(tmpdir(), 'oc-ios-sim-rot-'));
  try {
    const input = join(dir, 'in.jpg');
    const output = join(dir, 'out.jpg');
    await writeFile(input, jpeg);
    const result = await run(SIPS, ['-r', String(degrees), input, '--out', output], { timeout: 5_000 });
    if (!result.ok) throw new Error(result.stderr.trim() || 'sips failed');
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
