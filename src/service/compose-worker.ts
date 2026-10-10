// Worker thread that puts one simulator frame into its device frame:
// decode (mozjpeg, WASM), copy into the frame, turn for landscape, encode
// (jpeg-js). Runs off the service's main thread so input never waits on it.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';

import decoderFactory, { type MozJPEGModule } from '@jsquash/jpeg/codec/dec/mozjpeg_dec.js';
import jpeg from 'jpeg-js';

import type { Rect } from '../shared/state.ts';
import { maskRows, placeScreen, rotateRgba, type MaskRows } from './compose.ts';
import type { Rgba } from './png.ts';

export type WorkerLayer = { type: 'layer'; key: string; base: Rgba; screen: Rect; mask: Uint8Array | null };
export type WorkerCompose = { type: 'compose'; id: number; key: string; jpeg: Uint8Array; degrees: number; quality: number };
export type WorkerAnswer = { id: number; ok: true; jpeg: Uint8Array; width: number; height: number } | { id: number; ok: false; error: string };

type Layer = { base: Rgba; screen: Rect; mask: Uint8Array | null; rows: MaskRows };

const layers = new Map<string, Layer>();
const LAYERS_MAX = 4;

let decoder: Promise<MozJPEGModule | null> | null = null;
const loadDecoder = () =>
  (decoder ??= (async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.url)), 'mozjpeg_dec.wasm');
    if (!existsSync(wasm)) return null;
    return decoderFactory({ wasmBinary: readFileSync(wasm) } as never);
  })().catch(() => null));

const decode = async (bytes: Uint8Array): Promise<Rgba> => {
  const module = await loadDecoder();
  const image = module?.decode(bytes, false);
  if (image) return { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength) };
  const fallback = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { width: fallback.width, height: fallback.height, data: fallback.data };
};

const compose = async (message: WorkerCompose): Promise<WorkerAnswer> => {
  const layer = layers.get(message.key);
  if (!layer) return { id: message.id, ok: false, error: 'unknown layer' };
  const frame = await decode(message.jpeg);
  if (frame.width !== layer.screen.width || frame.height !== layer.screen.height) {
    return { id: message.id, ok: false, error: `frame ${frame.width}x${frame.height} does not fit the screen` };
  }
  const canvas: Rgba = { width: layer.base.width, height: layer.base.height, data: layer.base.data.slice() };
  placeScreen(canvas, frame, layer.screen, layer.mask, layer.rows);
  const shown = rotateRgba(canvas, message.degrees);
  const encoded = jpeg.encode({ width: shown.width, height: shown.height, data: shown.data }, message.quality);
  return { id: message.id, ok: true, jpeg: new Uint8Array(encoded.data), width: shown.width, height: shown.height };
};

parentPort?.on('message', (message: WorkerLayer | WorkerCompose) => {
  if (message.type === 'layer') {
    layers.set(message.key, {
      base: message.base,
      screen: message.screen,
      mask: message.mask,
      rows: maskRows(message.mask, message.screen.width, message.screen.height),
    });
    if (layers.size > LAYERS_MAX) layers.delete(layers.keys().next().value!);
    return;
  }
  compose(message).then(
    (answer) => parentPort?.postMessage(answer, answer.ok ? [answer.jpeg.buffer as ArrayBuffer] : []),
    (cause: unknown) => parentPort?.postMessage({ id: message.id, ok: false, error: cause instanceof Error ? cause.message : String(cause) }),
  );
});
