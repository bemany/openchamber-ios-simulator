// Worker thread for one simulator frame: decode (mozjpeg, WASM), shrink by
// the quality divisor, put it into the device frame when there is one, turn
// for landscape, encode (mozjpeg baseline for shrunk pictures, jpeg-js for
// full size or when the WASM file is missing). Runs off the service's main thread so input never waits on it.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';

import decoderFactory, { type MozJPEGModule } from '@jsquash/jpeg/codec/dec/mozjpeg_dec.js';
import encoderFactory, { type EncodeOptions, type MozJPEGModule as MozJPEGEncoder } from '@jsquash/jpeg/codec/enc/mozjpeg_enc.js';
import jpeg from 'jpeg-js';

import type { Rect } from '../shared/state.ts';
import { maskRows, placeScreen, rotateRgba, shrink, type MaskRows } from './compose.ts';
import type { Rgba } from './png.ts';

export type WorkerLayer = { type: 'layer'; key: string; base: Rgba; screen: Rect; mask: Uint8Array | null };
/** `key` names a device frame layer sent before, or is `null` for the bare picture. */
export type WorkerCompose = { type: 'compose'; id: number; key: string | null; jpeg: Uint8Array; divisor: number; degrees: number; quality: number };
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

let encoder: Promise<MozJPEGEncoder | null> | null = null;
const loadEncoder = () =>
  (encoder ??= (async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.url)), 'mozjpeg_enc.wasm');
    if (!existsSync(wasm)) return null;
    return encoderFactory({ wasmBinary: readFileSync(wasm) } as never);
  })().catch(() => null));

/**
 * Baseline JPEG without trellis or progressive passes: about 2x the time of
 * jpeg-js but 40 % smaller (jpeg-js keeps full-resolution colour), which is
 * what counts on the way to a remote viewer.
 */
const encodeOptions = (quality: number): EncodeOptions => ({
  quality,
  baseline: true,
  arithmetic: false,
  progressive: false,
  optimize_coding: false,
  smoothing: 0,
  color_space: 3, // YCbCr
  quant_table: 3,
  trellis_multipass: false,
  trellis_opt_zero: false,
  trellis_opt_table: false,
  trellis_loops: 1,
  auto_subsample: true,
  chroma_subsample: 2,
  separate_chroma_quality: false,
  chroma_quality: quality,
});

/**
 * Shrunk pictures go through mozjpeg (small files for the network); full-size
 * ones through jpeg-js, because mozjpeg needs about 90 ms for a whole iPhone
 * frame and would halve the frame rate.
 */
const encode = async (image: Rgba, quality: number, small: boolean): Promise<Uint8Array> => {
  const module = small ? await loadEncoder() : null;
  // A copy: the answer's buffer is transferred to the main thread, which must never detach WASM memory.
  if (module) return new Uint8Array(module.encode(image.data, image.width, image.height, encodeOptions(quality)));
  return new Uint8Array(jpeg.encode({ width: image.width, height: image.height, data: image.data }, quality).data);
};

const decode = async (bytes: Uint8Array): Promise<Rgba> => {
  const module = await loadDecoder();
  const image = module?.decode(bytes, false);
  if (image) return { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength) };
  const fallback = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { width: fallback.width, height: fallback.height, data: fallback.data };
};

const compose = async (message: WorkerCompose): Promise<WorkerAnswer> => {
  const layer = message.key === null ? null : layers.get(message.key);
  if (message.key !== null && !layer) return { id: message.id, ok: false, error: 'unknown layer' };
  const frame = shrink(await decode(message.jpeg), message.divisor);
  let canvas = frame;
  if (layer) {
    if (frame.width !== layer.screen.width || frame.height !== layer.screen.height) {
      return { id: message.id, ok: false, error: `frame ${frame.width}x${frame.height} does not fit the screen` };
    }
    canvas = { width: layer.base.width, height: layer.base.height, data: layer.base.data.slice() };
    placeScreen(canvas, frame, layer.screen, layer.mask, layer.rows);
  }
  const shown = rotateRgba(canvas, message.degrees);
  const encoded = await encode(shown, message.quality, message.divisor > 1);
  return { id: message.id, ok: true, jpeg: encoded, width: shown.width, height: shown.height };
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
