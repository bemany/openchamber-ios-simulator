// Pixel work for the device frame, free of I/O so the worker and the tests
// share it: lay pieces over each other, put the screen into the frame through
// its rounded-corner mask, turn the result for landscape.
import type { Rect } from '../shared/state.ts';
import type { Rgba } from './png.ts';

/** Draws `source` over `target` at (x, y), "source over" with straight alpha. */
export const drawOver = (target: Rgba, source: Rgba, x: number, y: number): void => {
  for (let row = 0; row < source.height; row += 1) {
    const ty = y + row;
    if (ty < 0 || ty >= target.height) continue;
    for (let column = 0; column < source.width; column += 1) {
      const tx = x + column;
      if (tx < 0 || tx >= target.width) continue;
      const from = (row * source.width + column) * 4;
      const alpha = source.data[from + 3]!;
      if (alpha === 0) continue;
      const to = (ty * target.width + tx) * 4;
      if (alpha === 255) {
        target.data.set(source.data.subarray(from, from + 4), to);
        continue;
      }
      const a = alpha / 255;
      const below = target.data[to + 3]! / 255;
      const out = a + below * (1 - a);
      for (let channel = 0; channel < 3; channel += 1) {
        const mixed = (source.data[from + channel]! * a + target.data[to + channel]! * below * (1 - a)) / out;
        target.data[to + channel] = Math.round(mixed);
      }
      target.data[to + 3] = Math.round(out * 255);
    }
  }
};

export const fillRect = (target: Rgba, rect: Rect, rgba: [number, number, number, number]): void => {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(target.width, Math.round(rect.x + rect.width));
  const y1 = Math.min(target.height, Math.round(rect.y + rect.height));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) target.data.set(rgba, (y * target.width + x) * 4);
  }
};

/** `#rrggbb` (or `#rgb`) to RGB, else the fallback. */
export const parseColor = (value: unknown, fallback: [number, number, number]): [number, number, number] => {
  if (typeof value !== 'string') return fallback;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
  if (!hex) return fallback;
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)) as [number, number, number];
};

/** The frame layer on a solid background, every pixel opaque: a JPEG has no alpha. */
export const flatten = (layer: Rgba, background: [number, number, number]): Rgba => {
  const data = new Uint8Array(layer.data.length);
  for (let index = 0; index < data.length; index += 4) {
    const a = layer.data[index + 3]! / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      data[index + channel] = Math.round(layer.data[index + channel]! * a + background[channel]! * (1 - a));
    }
    data[index + 3] = 255;
  }
  return { width: layer.width, height: layer.height, data };
};

/**
 * Per screen row: the fully opaque run [start, end) copied as a block, and
 * every partly covered pixel blended on its own (the rounded corners).
 */
export type MaskRows = { start: Int32Array; end: Int32Array; partial: Int32Array[] };

export const maskRows = (mask: Uint8Array | null, width: number, height: number): MaskRows => {
  const start = new Int32Array(height);
  const end = new Int32Array(height).fill(width);
  const partial: Int32Array[] = [];
  for (let y = 0; y < height; y += 1) {
    if (!mask) {
      partial.push(new Int32Array(0));
      continue;
    }
    const row = mask.subarray(y * width, (y + 1) * width);
    let first = row.indexOf(255);
    let last = row.lastIndexOf(255);
    if (first < 0) {
      first = 0;
      last = -1;
    }
    start[y] = first;
    end[y] = last + 1;
    const blended: number[] = [];
    for (let x = 0; x < width; x += 1) {
      const alpha = row[x]!;
      if (alpha === 0 || (alpha === 255 && x >= first && x <= last)) continue;
      blended.push(x);
    }
    partial.push(Int32Array.from(blended));
  }
  return { start, end, partial };
};

/** Copies the screen picture into `canvas` (a copy of the flattened frame) at `screen`. */
export const placeScreen = (canvas: Rgba, frame: Rgba, screen: Rect, mask: Uint8Array | null, rows: MaskRows): void => {
  const { width, height } = frame;
  for (let y = 0; y < height; y += 1) {
    const target = ((screen.y + y) * canvas.width + screen.x) * 4;
    const source = y * width * 4;
    const from = rows.start[y]!;
    const to = rows.end[y]!;
    if (to > from) canvas.data.set(frame.data.subarray(source + from * 4, source + to * 4), target + from * 4);
    for (const x of rows.partial[y]!) {
      const a = mask![y * width + x]! / 255;
      const at = target + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        canvas.data[at + channel] = Math.round(frame.data[source + x * 4 + channel]! * a + canvas.data[at + channel]! * (1 - a));
      }
    }
  }
};

/** Size after shrinking by a whole `divisor`, the same rounding everywhere (frames, device frame, input). */
export const shrunkSize = (width: number, height: number, divisor: number) => ({
  width: Math.floor(width / divisor),
  height: Math.floor(height / divisor),
});

/** Shrinks by a whole factor, averaging each `divisor` x `divisor` block (box filter); the result is opaque. */
export const shrink = (image: Rgba, divisor: number): Rgba => {
  if (divisor <= 1) return image;
  const { width, height } = shrunkSize(image.width, image.height, divisor);
  const data = new Uint8Array(width * height * 4);
  const area = divisor * divisor;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < divisor; dy += 1) {
        let at = ((y * divisor + dy) * image.width + x * divisor) * 4;
        for (let dx = 0; dx < divisor; dx += 1, at += 4) {
          r += image.data[at]!;
          g += image.data[at + 1]!;
          b += image.data[at + 2]!;
        }
      }
      const to = (y * width + x) * 4;
      data[to] = Math.round(r / area);
      data[to + 1] = Math.round(g / area);
      data[to + 2] = Math.round(b / area);
      data[to + 3] = 255;
    }
  }
  return { width, height, data };
};

/** Turns RGBA clockwise by 90, 180 or 270 degrees. */
export const rotateRgba = (image: Rgba, degrees: number): Rgba => {
  if (degrees !== 90 && degrees !== 180 && degrees !== 270) return image;
  const { width, height } = image;
  const source = new Uint32Array(image.data.buffer, image.data.byteOffset, width * height);
  const outWidth = degrees === 180 ? width : height;
  const outHeight = degrees === 180 ? height : width;
  const out = new Uint32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = source[y * width + x]!;
      if (degrees === 90) out[x * outWidth + (height - 1 - y)] = pixel;
      else if (degrees === 270) out[(width - 1 - x) * outWidth + y] = pixel;
      else out[(height - 1 - y) * width + (width - 1 - x)] = pixel;
    }
  }
  return { width: outWidth, height: outHeight, data: new Uint8Array(out.buffer) };
};
