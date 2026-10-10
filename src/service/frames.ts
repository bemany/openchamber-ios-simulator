// The newest frame with a running number, and waiting for a newer one. The
// number is the service's own (`x-surface-seq`) and starts at 1.

export type Frame = {
  seq: number;
  data: Buffer;
  mime: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  title: string;
};

type Size = { width: number; height: number };

/** From which number on which size applied; only changes are kept. */
type Segment = Size & { from: number };

const SEGMENT_HISTORY = 32;

export const createFrameHub = () => {
  let seq = 0;
  let current: Frame | null = null;
  const waiters = new Set<() => void>();
  const segments: Segment[] = [];

  const publish = (frame: Omit<Frame, 'seq'>): Frame => {
    seq += 1;
    current = { ...frame, seq };
    const last = segments[segments.length - 1];
    if (!last || last.width !== frame.width || last.height !== frame.height) {
      segments.push({ from: seq, width: frame.width, height: frame.height });
      if (segments.length > SEGMENT_HISTORY) segments.shift();
    }
    for (const wake of [...waiters]) wake();
    return current;
  };

  /** A frame newer than `after`, or `null` when none arrived within `waitMs`. */
  const next = (after: number, waitMs: number, signal?: AbortSignal): Promise<Frame | null> => {
    if (current && current.seq > after) return Promise.resolve(current);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        waiters.delete(wake);
        signal?.removeEventListener('abort', abort);
      };
      const wake = () => {
        if (current && current.seq > after) {
          done();
          resolve(current);
        }
      };
      const abort = () => {
        done();
        resolve(null);
      };
      const timer = setTimeout(abort, Math.max(0, waitMs));
      waiters.add(wake);
      signal?.addEventListener('abort', abort, { once: true });
    });
  };

  const sizeAt = (frameSeq: number): Size | null => {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (segments[index]!.from <= frameSeq) return segments[index]!;
    }
    return null;
  };

  /**
   * `true` when input made on frame `frameSeq` no longer fits the current frame
   * (a different size: another device, or the placeholder in between).
   */
  const isStale = (frameSeq: number): boolean => {
    if (!current || frameSeq <= 0) return false;
    if (frameSeq > current.seq) return true;
    const size = sizeAt(frameSeq);
    // Older than anything remembered: only safe if the size never changed.
    if (!size) return segments.length > 1 || segments[0]?.from !== 1;
    return size.width !== current.width || size.height !== current.height;
  };

  return {
    publish,
    next,
    isStale,
    current: () => current,
    pending: () => waiters.size,
  };
};

export type FrameHub = ReturnType<typeof createFrameHub>;
