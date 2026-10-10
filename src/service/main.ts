// Started by OpenChamber with its own runtime. Listens on 127.0.0.1 only; the
// host proxies the panel's requests and the surface here and adds the token.
// The simulator itself is reached through serve-sim on loopback.
import http from 'node:http';

import {
  readSurfaceControlNotice,
  readSurfaceInputBatch,
  SURFACE_FRAME_SEQ_HEADER,
  SURFACE_FRAME_WAIT_MS,
  SURFACE_HEIGHT_HEADER,
  SURFACE_SEQ_HEADER,
  SURFACE_TITLE_HEADER,
  SURFACE_WIDTH_HEADER,
} from '@openchamber/sdk';

import { BLOB_CHUNK, type BlobRef, type ChromeAnswer, type Orientation, type PageFrame } from '../shared/state.ts';
import { loadChrome, type ChromeAssets } from './chrome.ts';
import { parseColor } from './compose.ts';
import { translateInput, type InputState } from './input.ts';
import { createPresenter, sameView } from './present.ts';
import { rotationFor } from './rotate.ts';
import { screenshot } from './simctl.ts';
import { createSimulator } from './simulator.ts';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
if (!port || !token) {
  console.error('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

const BODY_MAX = 1024 * 1024;
const ORIENTATIONS: Orientation[] = ['portrait', 'portrait_upside_down', 'landscape_left', 'landscape_right'];

/** The page waits at most this long for a newer picture; the host proxy should not time out first. */
const PAGE_WAIT_MS = 10_000;
/** Behind the frame where the surface has no picture; the toolbar sends the panel's own colour. */
const DEFAULT_BACKGROUND: [number, number, number] = [0x1d, 0x1b, 0x1b];

const sim = createSimulator();
const surfaceInput: InputState = { touching: false };
const pageInput: InputState = { touching: false };
let background = DEFAULT_BACKGROUND;

/** The last few big answers for the page, served in parts by `GET /blob`. */
const blobs = new Map<string, string>();
const BLOBS_MAX = 8;
const putBlob = (id: string, base64: string): BlobRef => {
  blobs.delete(id);
  blobs.set(id, base64);
  if (blobs.size > BLOBS_MAX) blobs.delete(blobs.keys().next().value!);
  return { id, length: base64.length };
};

/** Loaded frames by device type; `null` where Xcode has none. */
const chromes = new Map<string, ChromeAssets | null>();
const chromeForActive = (): ChromeAssets | null => {
  const type = sim.active()?.deviceType;
  if (!type) return null;
  if (chromes.has(type)) return chromes.get(type) ?? null;
  void loadChrome(type).then((chrome) => {
    chromes.set(type, chrome);
    if (chrome && sim.framed()) sim.repaint();
  });
  return null;
};

const presenter = createPresenter({
  raw: sim.hub,
  pull: (after, waitMs) => sim.nextFrame(after, waitMs),
  orientation: () => sim.orientation(),
  framed: () => sim.framed(),
  chrome: chromeForActive,
  background: () => background,
});

const send = (res: http.ServerResponse, status: number, body: object): void => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_MAX) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const readJson = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
  const text = await readBody(req);
  if (!text.trim()) return {};
  const value = JSON.parse(text) as unknown;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

const handleFrame = async (_req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
  const after = Number(url.searchParams.get('after') ?? '0') || 0;
  const wait = Math.min(Number(url.searchParams.get('wait') ?? '0') || 0, SURFACE_FRAME_WAIT_MS);
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const frame = await presenter.next(after, wait, abort.signal);
  if (res.destroyed) return;
  if (!frame) {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': frame.mime,
    'Content-Length': String(frame.data.length),
    'Cache-Control': 'no-store',
    [SURFACE_SEQ_HEADER]: String(frame.seq),
    [SURFACE_WIDTH_HEADER]: String(frame.width),
    [SURFACE_HEIGHT_HEADER]: String(frame.height),
    // Headers take ASCII only; device names usually are.
    [SURFACE_TITLE_HEADER]: frame.title.replace(/[^\x20-\x7e]/g, '').slice(0, 200),
  });
  res.end(frame.data);
};

const handleInput = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const batch = readSurfaceInputBatch(await readBody(req));
  if (!batch) return send(res, 400, { error: 'bad input batch' });
  const frameSeq = Number(req.headers[SURFACE_FRAME_SEQ_HEADER] ?? '0') || 0;
  const shown = presenter.shown.current();
  const view = presenter.currentView();
  if (batch.events.some((event) => event.type === 'pointer' || event.type === 'wheel')) {
    // Rotated, framed differently or switched device since: the click belongs to a different view.
    const seen = presenter.viewOf(frameSeq);
    if (presenter.shown.isStale(frameSeq) || (seen !== undefined && !sameView(seen, view))) return send(res, 409, { error: 'stale frame' });
  }
  if (!shown || sim.hub.current()?.mime !== 'image/jpeg') return send(res, 409, { error: 'no simulator picture' });
  const layout = await sim.layout();
  const { messages, skippedChars, buttons } = translateInput(batch.events, shown, surfaceInput, { degrees: view.degrees, layout, chrome: view.chrome });
  await sim.sendHid(messages);
  for (const button of buttons) await sim.pressButton(button.name, button.page, button.usage);
  send(res, 200, { ok: true, skippedChars });
};

/** The raw picture for the page, which turns and frames it itself. */
const handlePageFrame = async (_req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
  const after = Number(url.searchParams.get('after') ?? '0') || 0;
  const wait = Math.min(Number(url.searchParams.get('wait') ?? '0') || 0, PAGE_WAIT_MS);
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const frame = await sim.nextFrame(after, wait, abort.signal);
  if (res.destroyed) return;
  if (!frame) {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  const answer: PageFrame = {
    seq: frame.seq,
    mime: frame.mime,
    width: frame.width,
    height: frame.height,
    degrees: frame.mime === 'image/jpeg' ? rotationFor(sim.orientation()) : 0,
    data: putBlob(`frame-${frame.seq}`, frame.data.toString('base64')),
  };
  send(res, 200, answer);
};

/** Pointer, wheel and keys from the page, in framebuffer pixels of `width` x `height`. */
const handlePageInput = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const body = await readBody(req);
  const batch = readSurfaceInputBatch(body);
  const { width, height } = JSON.parse(body) as { width?: unknown; height?: unknown };
  if (!batch || typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
    return send(res, 400, { error: 'bad input batch' });
  }
  const current = sim.hub.current();
  if (!current || current.mime !== 'image/jpeg') return send(res, 409, { error: 'no simulator picture' });
  if (current.width !== width || current.height !== height) return send(res, 409, { error: 'stale frame' });
  const layout = await sim.layout();
  const { messages, skippedChars } = translateInput(batch.events, { width, height }, pageInput, { layout });
  await sim.sendHid(messages);
  send(res, 200, { ok: true, skippedChars });
};

const handleChrome = async (_req: http.IncomingMessage, res: http.ServerResponse) => {
  const type = sim.active()?.deviceType;
  const chrome = type ? await loadChrome(type) : null;
  if (type) chromes.set(type, chrome);
  const answer: ChromeAnswer = chrome
    ? {
        available: true,
        layout: chrome.layout,
        layer: putBlob(`chrome-${chrome.layout.id}-layer`, chrome.layerPng().toString('base64')),
        mask: chrome.maskPng ? putBlob(`chrome-${chrome.layout.id}-mask`, chrome.maskPng.toString('base64')) : null,
      }
    : { available: false };
  send(res, 200, answer);
};

/** One part of a blob as plain text (base64 needs no escaping). */
const handleBlob = async (_req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
  const blob = blobs.get(url.searchParams.get('id') ?? '');
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
  if (blob === undefined) return send(res, 404, { error: 'gone' });
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
  res.end(blob.slice(offset, offset + BLOB_CHUNK));
};

type Route = (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<void>;

const routes: Record<string, Route> = {
  'GET /surface/frame': handleFrame,
  'POST /surface/input': handleInput,
  'POST /surface/control': async (req, res) => {
    const notice = readSurfaceControlNotice(await readBody(req));
    if (!notice) return send(res, 400, { error: 'bad control notice' });
    sim.setController(notice.controller);
    if (notice.controller !== 'user') surfaceInput.touching = false;
    send(res, 200, { ok: true });
  },
  // The simulator has a fixed screen size; the host scales the picture.
  'POST /surface/resize': async (_req, res) => send(res, 400, { error: 'fixed size' }),
  // Not offered: `simctl pbpaste` is unreliable, and an empty answer would clear the user's clipboard.
  'GET /surface/clipboard': async (_req, res) => send(res, 404, { error: 'not supported' }),

  'GET /state': async (_req, res) => send(res, 200, await sim.state()),
  'POST /select': async (req, res) => {
    const body = await readJson(req);
    if (typeof body.udid === 'string') await sim.select(body.udid);
    send(res, 200, await sim.state());
  },
  'POST /boot': async (req, res) => {
    const body = await readJson(req);
    if (typeof body.udid !== 'string') return send(res, 400, { error: 'udid missing' });
    await sim.boot(body.udid);
    send(res, 200, await sim.state());
  },
  'POST /shutdown': async (_req, res) => {
    await sim.shutdown();
    send(res, 200, await sim.state());
  },
  'GET /page/frame': handlePageFrame,
  'POST /page/input': handlePageInput,
  'GET /chrome': handleChrome,
  'GET /blob': handleBlob,

  'POST /button': async (req, res) => {
    const body = await readJson(req);
    const page = Number(body.page);
    const usage = Number(body.usage);
    if (typeof body.name === 'string' && page > 0 && usage > 0) await sim.pressButton(body.name, page, usage);
    else await sim.button(body.name === 'lock' ? 'lock' : 'home');
    send(res, 200, { ok: true });
  },
  'POST /frame': async (req, res) => {
    const body = await readJson(req);
    sim.setFramed(typeof body.on === 'boolean' ? body.on : !sim.framed());
    sim.repaint();
    send(res, 200, await sim.state());
  },
  /** The panel's background colour, behind the device frame. */
  'POST /frame-style': async (req, res) => {
    const body = await readJson(req);
    const next = parseColor(body.background, DEFAULT_BACKGROUND);
    if (next.join() !== background.join()) {
      background = next;
      if (sim.framed()) sim.repaint();
    }
    send(res, 200, { ok: true });
  },
  'POST /rotate': async (req, res) => {
    const body = await readJson(req);
    await sim.rotate(ORIENTATIONS.find((value) => value === body.orientation));
    send(res, 200, await sim.state());
  },
  'POST /appearance': async (req, res) => {
    const body = await readJson(req);
    await sim.setAppearance(body.mode === 'light' || body.mode === 'dark' ? body.mode : undefined);
    send(res, 200, await sim.state());
  },
  'POST /tap': async (req, res) => {
    const body = await readJson(req);
    const x = Number(body.x);
    const y = Number(body.y);
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return send(res, 400, { error: 'x and y must be within 0..1' });
    await sim.sendHid([
      { op: 'touch', type: 'begin', x, y },
      { op: 'touch', type: 'end', x, y },
    ]);
    send(res, 200, { ok: true });
  },
  'GET /screenshot': async (_req, res) => {
    const png = await screenshot(await sim.activeUdid());
    send(res, 200, { mime: 'image/png', base64: png.toString('base64') });
  },
  'GET /ax': async (_req, res) => {
    const tree = await sim.axTree();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(tree);
  },
};

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') {
    send(res, 200, { ok: true });
    return;
  }
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) {
    send(res, 404, { error: 'not-found' });
    return;
  }
  route(req, res, url).catch((cause: unknown) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    send(res, cause instanceof SyntaxError ? 400 : 500, { error: cause instanceof Error ? cause.message : String(cause) });
  });
});

const shutdown = () => {
  sim.stop();
  presenter.stop();
  server.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(port, '127.0.0.1');
