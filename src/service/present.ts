// Between serve-sim's raw frames and what the surface shows: turns the picture
// for landscape and, when the device frame is on, puts it into the frame.
// Works ahead on up to WORKERS frames at once and always takes the newest raw
// frame, so a slow step skips frames instead of falling behind. Every shown
// frame remembers its view (rotation, frame layout) so input lands on exactly
// the picture it was made on.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { ChromeLayout, Orientation } from '../shared/state.ts';
import type { ChromeAssets } from './chrome.ts';
import { flatten } from './compose.ts';
import type { WorkerAnswer, WorkerCompose, WorkerLayer } from './compose-worker.ts';
import { createFrameHub, type Frame, type FrameHub } from './frames.ts';
import { rotatedSize, rotateJpeg, rotationFor } from './rotate.ts';

export type View = { degrees: number; chrome: ChromeLayout | null };

const WORKERS = 2;
const QUALITY = 82;
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
    compose(key: string, layer: () => Omit<WorkerLayer, 'type' | 'key'>, jpeg: Buffer, degrees: number): Promise<WorkerAnswer> {
      const slot = workers.length < WORKERS ? spawn() : workers.reduce((a, b) => (b.busy < a.busy ? b : a));
      if (!slot.layers.has(key)) {
        slot.worker.postMessage({ type: 'layer', key, ...layer() } satisfies WorkerLayer);
        slot.layers.add(key);
      }
      const id = nextId++;
      slot.busy += 1;
      return new Promise((resolve) => {
        jobs.set(id, { worker: slot.worker, resolve });
        const message: WorkerCompose = { type: 'compose', id, key, jpeg: new Uint8Array(jpeg), degrees, quality: QUALITY };
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
  /** The frame for the active device when it is loaded; `null` without one. */
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

  const present = async (raw: Frame): Promise<{ frame: Omit<Frame, 'seq'>; view: View }> => {
    const plain = { data: raw.data, mime: raw.mime, width: raw.width, height: raw.height, title: raw.title };
    if (raw.mime !== 'image/jpeg') return { frame: plain, view: { degrees: 0, chrome: null } };
    const degrees = rotationFor(deps.orientation());
    const chrome = deps.framed() ? deps.chrome() : null;
    if (chrome && chrome.layout.screen.width === raw.width && chrome.layout.screen.height === raw.height) {
      const { key, build } = layerFor(chrome, deps.background());
      const answer = await pool.compose(key, build, raw.data, degrees);
      if (answer.ok) {
        return {
          frame: { data: Buffer.from(answer.jpeg.buffer, answer.jpeg.byteOffset, answer.jpeg.byteLength), mime: 'image/jpeg', width: answer.width, height: answer.height, title: raw.title },
          view: { degrees, chrome: chrome.layout },
        };
      }
      console.error(`device frame: ${answer.error}`);
    }
    if (degrees === 0) return { frame: plain, view: { degrees, chrome: null } };
    return { frame: { ...plain, data: await rotateJpeg(raw.data, degrees), ...rotatedSize(raw, degrees) }, view: { degrees, chrome: null } };
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
    currentView(): View {
      const current = shown.current();
      return (current && views.get(current.seq)) ?? { degrees: 0, chrome: null };
    },
    stop: () => pool.stop(),
  };
};

export type Presenter = ReturnType<typeof createPresenter>;
