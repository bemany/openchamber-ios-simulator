// Between serve-sim's raw frames and what the surface shows: shrinks the
// picture to the chosen quality, turns it for landscape and, when the device
// frame is on, puts it into the frame.
// Works ahead on up to WORKERS frames at once and always takes the newest raw
// frame, so a slow step skips frames instead of falling behind. Every shown
// frame remembers its view (rotation, frame layout) so input lands on exactly
// the picture it was made on.
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { ChromeLayout, Orientation } from '../shared/state.ts';
import type { ChromeAssets } from './chrome.ts';
import { flatten, shrunkSize } from './compose.ts';
import type { WorkerAnswer, WorkerCompose, WorkerLayer } from './compose-worker.ts';
import { createFrameHub, type Frame, type FrameHub } from './frames.ts';
import { rotatedSize, rotateJpeg, rotationFor } from './rotate.ts';

export type View = { degrees: number; chrome: ChromeLayout | null };

/**
 * Compose workers: 2 to 4 by core count. Measured on an 18-core VM, framed at
 * half size: 2 workers prepare about 24 of 30 frames a second, 3 or more keep up.
 */
const WORKERS = Math.min(4, Math.max(2, Math.floor(availableParallelism() / 3)));
/** JPEG quality: full size keeps more detail; shrunk pictures are for speed. */
const qualityFor = (divisor: number) => (divisor > 1 ? 75 : 82);
/** The surface counts as watched for this long after its last frame request. */
const VIEWER_GRACE_MS = 35_000;
const PULL_WAIT_MS = 1_000;
const VIEWS_MAX = 256;

export const sameView = (a: View, b: View): boolean => a.degrees === b.degrees && (a.chrome?.id ?? null) === (b.chrome?.id ?? null);

type Job = { worker: Worker; resolve: (answer: WorkerAnswer) => void };

/** Worker threads that compose framed pictures; each gets a frame layer once. */
const createPool = () => {
  const entry = join(dirname(fileURLToPath(import.meta.url)), 'compose-worker.js');
  const workers: Array<{ worker: Worker; busy: number; layers: Set<string> }> = [];
  const jobs = new Map<number, Job>();
  let nextId = 1;

  const spawn = () => {
    const worker = new Worker(entry);
    const slot = { worker, busy: 0, layers: new Set<string>() };
    worker.on('message', (answer: WorkerAnswer) => {
      slot.busy -= 1;
      jobs.get(answer.id)?.resolve(answer);
      jobs.delete(answer.id);
    });
    worker.on('error', (cause: unknown) => console.error(`compose worker: ${cause instanceof Error ? cause.message : String(cause)}`));
    worker.on('exit', () => {
      workers.splice(workers.indexOf(slot), 1);
      // What it held fails; the presenter shows those frames without the device frame.
      for (const [id, job] of [...jobs]) {
        if (job.worker !== worker) continue;
        jobs.delete(id);
        job.resolve({ id, ok: false, error: 'worker stopped' });
      }
    });
    worker.unref();
    workers.push(slot);
    return slot;
  };

  return {
    /** One frame through a worker; `key` and `layer` give the device frame, or `null` for the bare picture. */
    compose(key: string | null, layer: (() => Omit<WorkerLayer, 'type' | 'key'>) | null, jpeg: Buffer, divisor: number, degrees: number): Promise<WorkerAnswer> {
      const slot = workers.length < WORKERS ? spawn() : workers.reduce((a, b) => (b.busy < a.busy ? b : a));
      if (key !== null && layer && !slot.layers.has(key)) {
        slot.worker.postMessage({ type: 'layer', key, ...layer() } satisfies WorkerLayer);
        slot.layers.add(key);
      }
      const id = nextId++;
      slot.busy += 1;
      return new Promise((resolve) => {
        jobs.set(id, { worker: slot.worker, resolve });
        const message: WorkerCompose = { type: 'compose', id, key, jpeg: new Uint8Array(jpeg), divisor, degrees, quality: qualityFor(divisor) };
        slot.worker.postMessage(message);
      });
    },
    stop() {
      for (const { worker } of [...workers]) void worker.terminate();
    },
  };
};

export type PresenterDeps = {
  raw: FrameHub;
  /** Waits for a raw frame newer than `after`; also keeps the upstream stream alive. */
  pull: (after: number, waitMs: number) => Promise<Frame | null>;
  orientation: () => Orientation | null;
  framed: () => boolean;
  /** Shrink pictures by this whole factor (1 = full size). */
  divisor: () => number;
  /** The frame for the active device at the current divisor when it is loaded; `null` without one. */
  chrome: () => ChromeAssets | null;
  background: () => [number, number, number];
};

export const createPresenter = (deps: PresenterDeps) => {
  const shown = createFrameHub();
  const views = new Map<number, View>();
  const pool = createPool();
  const flattened = new Map<string, Omit<WorkerLayer, 'type' | 'key'>>();
  let lastAsk = 0;
  let running = false;
  let submitted = 0;
  let published = 0;
  let inFlight = 0;
  let freed: (() => void) | null = null;

  const layerFor = (chrome: ChromeAssets, background: [number, number, number]) => {
    const key = `${chrome.layout.id}:${background.join(',')}`;
    return {
      key,
      build: () => {
        let layer = flattened.get(key);
        if (!layer) {
          layer = { base: flatten(chrome.layer, background), screen: chrome.layout.screen, mask: chrome.mask };
          flattened.set(key, layer);
          if (flattened.size > 4) flattened.delete(flattened.keys().next().value!);
        }
        return layer;
      },
    };
  };

  const fromAnswer = (answer: Extract<WorkerAnswer, { ok: true }>, title: string): Omit<Frame, 'seq'> => ({
    data: Buffer.from(answer.jpeg.buffer, answer.jpeg.byteOffset, answer.jpeg.byteLength),
    mime: 'image/jpeg',
    width: answer.width,
    height: answer.height,
    title,
  });

  const present = async (raw: Frame): Promise<{ frame: Omit<Frame, 'seq'>; view: View }> => {
    const plain = { data: raw.data, mime: raw.mime, width: raw.width, height: raw.height, title: raw.title };
    if (raw.mime !== 'image/jpeg') return { frame: plain, view: { degrees: 0, chrome: null } };
    const degrees = rotationFor(deps.orientation());
    const divisor = deps.divisor();
    const size = shrunkSize(raw.width, raw.height, divisor);
    const chrome = deps.framed() ? deps.chrome() : null;
    if (chrome && chrome.layout.screen.width === size.width && chrome.layout.screen.height === size.height) {
      const { key, build } = layerFor(chrome, deps.background());
      const answer = await pool.compose(key, build, raw.data, divisor, degrees);
      if (answer.ok) return { frame: fromAnswer(answer, raw.title), view: { degrees, chrome: chrome.layout } };
      console.error(`device frame: ${answer.error}`);
    }
    if (divisor > 1) {
      const answer = await pool.compose(null, null, raw.data, divisor, degrees);
      if (answer.ok) return { frame: fromAnswer(answer, raw.title), view: { degrees, chrome: null } };
      console.error(`shrink: ${answer.error}`);
    }
    // Full size: unchanged, or turned by sips (cheaper than decoding and encoding the whole picture).
    if (degrees === 0) return { frame: plain, view: { degrees, chrome: null } };
    return { frame: { ...plain, data: await rotateJpeg(raw.data, degrees), ...rotatedSize(raw, degrees) }, view: { degrees, chrome: null } };
  };

  /** The newest raw picture for the full-screen page: shrunk, never turned or framed (the page does that). Cached per frame. */
  let pageCache: { seq: number; divisor: number; frame: Omit<Frame, 'seq'> } | null = null;
  const forPage = async (raw: Frame): Promise<Omit<Frame, 'seq'>> => {
    const divisor = deps.divisor();
    const plain = { data: raw.data, mime: raw.mime, width: raw.width, height: raw.height, title: raw.title };
    if (raw.mime !== 'image/jpeg' || divisor <= 1) return plain;
    if (pageCache?.seq === raw.seq && pageCache.divisor === divisor) return pageCache.frame;
    const answer = await pool.compose(null, null, raw.data, divisor, 0);
    if (!answer.ok) return plain;
    pageCache = { seq: raw.seq, divisor, frame: fromAnswer(answer, raw.title) };
    return pageCache.frame;
  };

  const submit = (raw: Frame) => {
    submitted = raw.seq;
    inFlight += 1;
    present(raw)
      .then(({ frame, view }) => {
        // A newer frame may have finished first; never show an older one after it.
        if (raw.seq <= published) return;
        published = raw.seq;
        const out = shown.publish(frame);
        views.set(out.seq, view);
        if (views.size > VIEWS_MAX) views.delete(views.keys().next().value!);
      })
      .catch((cause: unknown) => console.error(`present: ${cause instanceof Error ? cause.message : String(cause)}`))
      .finally(() => {
        inFlight -= 1;
        freed?.();
      });
  };

  const loop = async () => {
    if (running) return;
    running = true;
    try {
      while (Date.now() - lastAsk < VIEWER_GRACE_MS) {
        const raw = await deps.pull(submitted, PULL_WAIT_MS);
        if (!raw) continue;
        while (inFlight >= WORKERS) await new Promise<void>((resolve) => (freed = resolve));
        // The newest raw frame, not the one that woke us: skip what is already old.
        const newest = deps.raw.current();
        if (newest && newest.seq > submitted) submit(newest);
      }
    } finally {
      running = false;
    }
  };

  return {
    shown,
    /** For the surface's `GET /surface/frame`. */
    next(after: number, waitMs: number, signal?: AbortSignal): Promise<Frame | null> {
      lastAsk = Date.now();
      void loop();
      return shown.next(after, waitMs, signal);
    },
    viewOf: (seq: number): View | undefined => views.get(seq),
    forPage,
    currentView(): View {
      const current = shown.current();
      return (current && views.get(current.seq)) ?? { degrees: 0, chrome: null };
    },
    stop: () => pool.stop(),
  };
};

export type Presenter = ReturnType<typeof createPresenter>;
