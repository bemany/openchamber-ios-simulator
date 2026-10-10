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

import type { Orientation } from '../shared/state.ts';
import type { Frame } from './frames.ts';
import { translateInput, type InputState } from './input.ts';
import { rotatedSize, rotateJpeg, rotationFor } from './rotate.ts';
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

const sim = createSimulator();
const inputState: InputState = { touching: false };

/** Which rotation each frame went out with, so input lands on exactly the picture it was made on. */
const delivered = new Map<number, number>();
const DELIVERED_MAX = 256;
let rotated: { seq: number; degrees: number; data: Buffer } | null = null;

const remember = (seq: number, degrees: number) => {
  delivered.set(seq, degrees);
  if (delivered.size > DELIVERED_MAX) delivered.delete(delivered.keys().next().value!);
};

/** The frame as the viewer should see it: rotated when the device is. */
const presentable = async (frame: Frame): Promise<{ data: Buffer; width: number; height: number; degrees: number }> => {
  const degrees = frame.mime === 'image/jpeg' ? rotationFor(sim.orientation()) : 0;
  if (degrees === 0) return { data: frame.data, width: frame.width, height: frame.height, degrees };
  if (!rotated || rotated.seq !== frame.seq || rotated.degrees !== degrees) {
    rotated = { seq: frame.seq, degrees, data: await rotateJpeg(frame.data, degrees) };
  }
  return { data: rotated.data, ...rotatedSize(frame, degrees), degrees };
};

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
  const frame = await sim.nextFrame(after, wait, abort.signal);
  if (res.destroyed) return;
  if (!frame) {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  const shown = await presentable(frame);
  if (res.destroyed) return;
  remember(frame.seq, shown.degrees);
  res.writeHead(200, {
    'Content-Type': frame.mime,
    'Content-Length': String(shown.data.length),
    'Cache-Control': 'no-store',
    [SURFACE_SEQ_HEADER]: String(frame.seq),
    [SURFACE_WIDTH_HEADER]: String(shown.width),
    [SURFACE_HEIGHT_HEADER]: String(shown.height),
    // Headers take ASCII only; device names usually are.
    [SURFACE_TITLE_HEADER]: frame.title.replace(/[^\x20-\x7e]/g, '').slice(0, 200),
  });
  res.end(shown.data);
};

const handleInput = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const batch = readSurfaceInputBatch(await readBody(req));
  if (!batch) return send(res, 400, { error: 'bad input batch' });
  const frameSeq = Number(req.headers[SURFACE_FRAME_SEQ_HEADER] ?? '0') || 0;
  const current = sim.hub.current();
  const degrees = rotationFor(sim.orientation());
  if (batch.events.some((event) => event.type === 'pointer' || event.type === 'wheel')) {
    // Rotated or switched device since: the click belongs to a different view.
    const seen = delivered.get(frameSeq);
    if (sim.hub.isStale(frameSeq) || (seen !== undefined && seen !== degrees)) return send(res, 409, { error: 'stale frame' });
  }
  if (!current || current.mime !== 'image/jpeg') return send(res, 409, { error: 'no simulator picture' });
  const layout = await sim.layout();
  const { messages, skippedChars } = translateInput(batch.events, rotatedSize(current, degrees), inputState, { degrees, layout });
  await sim.sendHid(messages);
  send(res, 200, { ok: true, skippedChars });
};

type Route = (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<void>;

const routes: Record<string, Route> = {
  'GET /surface/frame': handleFrame,
  'POST /surface/input': handleInput,
  'POST /surface/control': async (req, res) => {
    const notice = readSurfaceControlNotice(await readBody(req));
    if (!notice) return send(res, 400, { error: 'bad control notice' });
    sim.setController(notice.controller);
    if (notice.controller !== 'user') inputState.touching = false;
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
  'POST /button': async (req, res) => {
    const body = await readJson(req);
    await sim.button(body.name === 'lock' ? 'lock' : 'home');
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
  server.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(port, '127.0.0.1');
