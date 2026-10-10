// Xcode's own device frames (what Simulator.app and serve-sim draw), read from
// this Mac's Xcode install, never shipped with the extension:
//
//   DeviceTypes/<type>.simdevicetype/Contents/Resources/capabilities.plist
//     -> screen size, scale, chrome identifier, rounded-corner mask (PDF)
//   /Library/Developer/DeviceKit/Chrome/<id>.devicechrome/Contents/Resources
//     -> chrome.json, the body (one composite PDF or nine slices), buttons
//
// The PDFs are rasterized once per device type with `sips` at framebuffer
// scale and cached in the temp folder.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ChromeButton, ChromeLayout, Rect } from '../shared/state.ts';
import { drawOver, fillRect } from './compose.ts';
import { run } from './exec.ts';
import { decodePng, encodePng, type Rgba } from './png.ts';
import { listDeviceTypes, readPlist } from './simctl.ts';

export const CHROME_ROOT = '/Library/Developer/DeviceKit/Chrome';
const CACHE = join(tmpdir(), 'oc-ios-sim-chrome');
const SIPS = ['/usr/bin/sips', 'sips'];
const CHROME_PREFIX = 'com.apple.dt.devicekit.chrome.';

type Size = { width: number; height: number };
type Point = { x: number; y: number };

export type Display = { width: number; height: number; scale: number; chrome: string; mask: string | null };

type ChromeInput = {
  name: string;
  image: string;
  anchor: 'left' | 'right' | 'top' | 'bottom';
  align: 'leading' | 'trailing' | 'center';
  onTop: boolean;
  normal: Point;
  rollover: Point;
  page: number;
  usage: number;
};

export type ChromeSpec = {
  composite: string | null;
  slices: Record<'topLeft' | 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left', string> | null;
  sizing: { left: number; right: number; top: number; bottom: number };
  padding: { left: number; right: number; top: number; bottom: number };
  inputs: ChromeInput[];
};

/** One image of the frame, in frame pixels, in drawing order. */
export type Piece = { image: string; rect: Rect } | { fill: true; rect: Rect };

export type ChromePlan = { layout: ChromeLayout; pieces: Piece[] };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const point = (value: unknown): Point | null => {
  const object = record(value);
  return typeof object.x === 'number' && typeof object.y === 'number' ? { x: object.x, y: object.y } : null;
};

/** The integrated touch display from `capabilities.plist`. */
export const parseDisplay = (plist: unknown): Display | null => {
  const root = record(plist);
  const capabilities = record(root.capabilities ?? root);
  const displays = Array.isArray(capabilities.displays) ? capabilities.displays : [];
  for (const entry of displays) {
    const display = record(entry);
    if (display.displayType !== 'integrated' || display.hasDigitizer !== true) continue;
    const chrome = str(display.chromeIdentifier);
    const width = num(display.width);
    const height = num(display.height);
    const scale = num(display.scale);
    if (!chrome || width <= 0 || height <= 0 || scale <= 0) continue;
    return { width, height, scale, chrome: chrome.replace(CHROME_PREFIX, ''), mask: str(display.framebufferMaskIdentifier) };
  }
  return null;
};

export const parseChromeJson = (json: unknown): ChromeSpec | null => {
  const root = record(json);
  const images = record(root.images);
  const sizing = record(images.sizing);
  const padding = record(images.devicePadding);
  const slices = {
    topLeft: str(images.topLeft),
    top: str(images.top),
    topRight: str(images.topRight),
    right: str(images.right),
    bottomRight: str(images.bottomRight),
    bottom: str(images.bottom),
    bottomLeft: str(images.bottomLeft),
    left: str(images.left),
  };
  const composite = str(images.composite);
  const complete = Object.values(slices).every((value) => value !== null);
  if (!composite && !complete) return null;
  const inputs: ChromeInput[] = [];
  for (const entry of Array.isArray(root.inputs) ? root.inputs : []) {
    const input = record(entry);
    const name = str(input.name);
    const image = str(input.image);
    if (!name || !image || input.type !== 'button') continue;
    const offsets = record(input.offsets);
    const normal = point(offsets.normal) ?? point(offsets.rollover) ?? { x: 0, y: 0 };
    const rollover = point(offsets.rollover) ?? normal;
    const anchor = input.anchor === 'right' || input.anchor === 'top' || input.anchor === 'bottom' ? input.anchor : 'left';
    inputs.push({
      name,
      image,
      anchor,
      align: input.align === 'trailing' || input.align === 'center' ? input.align : 'leading',
      onTop: input.onTop === true,
      normal,
      rollover,
      page: num(input.usagePage),
      usage: num(input.usage),
    });
  }
  return {
    composite,
    slices: complete ? (slices as ChromeSpec['slices']) : null,
    sizing: { left: num(sizing.leftWidth), right: num(sizing.rightWidth), top: num(sizing.topHeight), bottom: num(sizing.bottomHeight) },
    padding: { left: num(padding.left), right: num(padding.right), top: num(padding.top), bottom: num(padding.bottom) },
    inputs,
  };
};

/** Page size of a PDF in points, from its CropBox or MediaBox. */
export const pdfSize = (pdf: Buffer | string): Size | null => {
  const text = typeof pdf === 'string' ? pdf : pdf.toString('latin1');
  const box = /\/(?:CropBox|MediaBox)\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(text);
  if (!box) return null;
  const width = Math.abs(Number(box[3]) - Number(box[1]));
  const height = Math.abs(Number(box[4]) - Number(box[2]));
  return width > 0 && height > 0 ? { width, height } : null;
};

/**
 * Where everything goes, in framebuffer pixels: the body around the screen,
 * the buttons (placed the way serve-sim places them), and the canvas grown to
 * fit whatever sticks out. `sizeOf` answers an image's size in points.
 */
export const planChrome = (id: string, display: Display, spec: ChromeSpec, sizeOf: (image: string) => Size | null): ChromePlan | null => {
  const scale = display.scale;
  const screen = { width: display.width / scale, height: display.height / scale };
  const composite = spec.composite ? sizeOf(spec.composite) : null;
  if (spec.composite && !composite && !spec.slices) return null;
  const body = composite ?? { width: screen.width + spec.sizing.left + spec.sizing.right, height: screen.height + spec.sizing.top + spec.sizing.bottom };
  const bodyAt = { x: spec.padding.left, y: spec.padding.top };
  const screenAt = composite
    ? { x: bodyAt.x + (body.width - screen.width) / 2, y: bodyAt.y + (body.height - screen.height) / 2 }
    : { x: bodyAt.x + spec.sizing.left, y: bodyAt.y + spec.sizing.top };

  // Points first; pixels at the end.
  const under: Piece[] = [];
  const over: Piece[] = [];
  const buttons: Array<Omit<ChromeButton, 'x' | 'y' | 'width' | 'height'> & { rect: Rect }> = [];
  for (const input of spec.inputs) {
    const size = sizeOf(input.image);
    if (!size) continue;
    const g = { x: 2 * input.normal.x - input.rollover.x, y: 2 * input.normal.y - input.rollover.y };
    const along =
      input.align === 'trailing'
        ? bodyAt.x + body.width + g.x - size.width
        : input.align === 'center'
          ? bodyAt.x + (body.width - size.width) / 2 + g.x
          : bodyAt.x + g.x;
    const at =
      input.anchor === 'left'
        ? { x: bodyAt.x + input.rollover.x - size.width / 2, y: bodyAt.y + input.rollover.y }
        : input.anchor === 'right'
          ? { x: bodyAt.x + body.width + g.x, y: bodyAt.y + g.y }
          : input.anchor === 'top'
            ? { x: along, y: bodyAt.y + g.y - size.height }
            : { x: along, y: bodyAt.y + body.height + g.y };
    const rect = { ...at, ...size };
    (input.onTop ? over : under).push({ image: input.image, rect });
    if (input.page > 0 && input.usage > 0) buttons.push({ name: input.name, page: input.page, usage: input.usage, rect });
  }

  const bodyPieces: Piece[] = [];
  if (composite) {
    bodyPieces.push({ image: spec.composite!, rect: { ...bodyAt, ...composite } });
  } else {
    const slices = spec.slices!;
    const corner = (image: string) => sizeOf(image);
    const tl = corner(slices.topLeft);
    const tr = corner(slices.topRight);
    const bl = corner(slices.bottomLeft);
    const br = corner(slices.bottomRight);
    const top = sizeOf(slices.top);
    const bottom = sizeOf(slices.bottom);
    const left = sizeOf(slices.left);
    const right = sizeOf(slices.right);
    if (!tl || !tr || !bl || !br || !top || !bottom || !left || !right) return null;
    const { x, y } = bodyAt;
    const { width: w, height: h } = body;
    bodyPieces.push(
      { fill: true, rect: { x: x + left.width, y: y + top.height, width: w - left.width - right.width, height: h - top.height - bottom.height } },
      { image: slices.top, rect: { x: x + tl.width, y, width: w - tl.width - tr.width, height: top.height } },
      { image: slices.bottom, rect: { x: x + bl.width, y: y + h - bottom.height, width: w - bl.width - br.width, height: bottom.height } },
      { image: slices.left, rect: { x, y: y + tl.height, width: left.width, height: h - tl.height - bl.height } },
      { image: slices.right, rect: { x: x + w - right.width, y: y + tr.height, width: right.width, height: h - tr.height - br.height } },
      { image: slices.topLeft, rect: { x, y, ...tl } },
      { image: slices.topRight, rect: { x: x + w - tr.width, y, ...tr } },
      { image: slices.bottomLeft, rect: { x, y: y + h - bl.height, ...bl } },
      { image: slices.bottomRight, rect: { x: x + w - br.width, y: y + h - br.height, ...br } },
    );
  }

  // Grow the canvas to everything, then move it all to start at 0,0.
  const all = [...under, ...bodyPieces, ...over].map((piece) => piece.rect);
  all.push({ x: 0, y: 0, width: body.width + spec.padding.left + spec.padding.right, height: body.height + spec.padding.top + spec.padding.bottom });
  const minX = Math.min(...all.map((rect) => rect.x));
  const minY = Math.min(...all.map((rect) => rect.y));
  const maxX = Math.max(...all.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...all.map((rect) => rect.y + rect.height));
  const px = (rect: Rect): Rect => {
    const x0 = Math.round((rect.x - minX) * scale);
    const y0 = Math.round((rect.y - minY) * scale);
    return { x: x0, y: y0, width: Math.max(1, Math.round((rect.x + rect.width - minX) * scale) - x0), height: Math.max(1, Math.round((rect.y + rect.height - minY) * scale) - y0) };
  };
  const screenPx = { x: Math.round((screenAt.x - minX) * scale), y: Math.round((screenAt.y - minY) * scale), width: display.width, height: display.height };
  return {
    layout: {
      id,
      width: Math.ceil((maxX - minX) * scale),
      height: Math.ceil((maxY - minY) * scale),
      screen: screenPx,
      buttons: buttons.map(({ rect, ...button }) => ({ ...button, ...px(rect) })),
    },
    pieces: [...under, ...bodyPieces, ...over].map((piece) => ({ ...piece, rect: px(piece.rect) })),
  };
};

export type ChromeAssets = {
  layout: ChromeLayout;
  /** Body and buttons, transparent around and inside the screen. */
  layer: Rgba;
  /** Alpha of the screen's rounded corners, one byte per framebuffer pixel; `null` for a square screen. */
  mask: Uint8Array | null;
  /** The same as PNG for the page (made on first use). */
  layerPng: () => Buffer;
  maskPng: Buffer | null;
};

/** Rasterizes a PDF at exactly `width` x `height` pixels, cached by file and size. */
const rasterize = async (pdf: string, key: string, width: number, height: number): Promise<Buffer> => {
  const stat = statSync(pdf);
  const file = join(CACHE, `${key.replace(/[^A-Za-z0-9_-]/g, '_')}-${width}x${height}-${Math.round(stat.mtimeMs)}.png`);
  if (existsSync(file)) return readFile(file);
  await mkdir(CACHE, { recursive: true });
  const temp = `${file}.${process.pid}.tmp.png`;
  const result = await run(SIPS, ['-s', 'format', 'png', '-z', String(height), String(width), pdf, '--out', temp], { timeout: 15_000 });
  if (!result.ok) throw new Error(result.stderr.trim() || `sips could not rasterize ${pdf}`);
  await rename(temp, file);
  return readFile(file);
};

let deviceTypes: Promise<Map<string, string>> | null = null;
const loading = new Map<string, Promise<ChromeAssets | null>>();

const build = async (deviceType: string): Promise<ChromeAssets | null> => {
  deviceTypes ??= listDeviceTypes().catch((cause: unknown) => {
    deviceTypes = null;
    throw cause;
  });
  const bundle = (await deviceTypes).get(deviceType);
  if (!bundle) return null;
  const resources = join(bundle, 'Contents', 'Resources');
  const display = parseDisplay(await readPlist(join(resources, 'capabilities.plist')));
  if (!display) return null;
  const chromeDir = join(CHROME_ROOT, `${display.chrome}.devicechrome`, 'Contents', 'Resources');
  const spec = parseChromeJson(JSON.parse(await readFile(join(chromeDir, 'chrome.json'), 'utf8')) as unknown);
  if (!spec) return null;

  const pdfPath = (image: string) => join(chromeDir, `${image}.pdf`);
  const sizes = new Map<string, Size | null>();
  const sizeOf = (image: string): Size | null => {
    if (!sizes.has(image)) {
      const file = pdfPath(image);
      sizes.set(image, existsSync(file) ? pdfSize(readFileSync(file)) : null);
    }
    return sizes.get(image) ?? null;
  };
  const plan = planChrome(display.chrome, display, spec, sizeOf);
  if (!plan) return null;

  const layer: Rgba = { width: plan.layout.width, height: plan.layout.height, data: new Uint8Array(plan.layout.width * plan.layout.height * 4) };
  for (const piece of plan.pieces) {
    if ('fill' in piece) {
      fillRect(layer, piece.rect, [0, 0, 0, 255]);
      continue;
    }
    const png = await rasterize(pdfPath(piece.image), `${display.chrome}-${piece.image}`, piece.rect.width, piece.rect.height);
    drawOver(layer, decodePng(png), piece.rect.x, piece.rect.y);
  }

  let mask: Uint8Array | null = null;
  let maskPng: Buffer | null = null;
  const maskPdf = display.mask ? join(resources, `${display.mask}.pdf`) : null;
  if (maskPdf && existsSync(maskPdf)) {
    maskPng = await rasterize(maskPdf, `mask-${display.mask}`, display.width, display.height);
    const decoded = decodePng(maskPng);
    mask = new Uint8Array(decoded.width * decoded.height);
    for (let index = 0; index < mask.length; index += 1) mask[index] = decoded.data[index * 4 + 3]!;
  }

  let png: Buffer | null = null;
  return { layout: plan.layout, layer, mask, maskPng, layerPng: () => (png ??= encodePng(layer)) };
};

/** Xcode's frame for a device type, or `null` when Xcode has none (or it cannot be read). */
export const loadChrome = (deviceType: string): Promise<ChromeAssets | null> => {
  let pending = loading.get(deviceType);
  if (!pending) {
    pending = build(deviceType).catch((cause: unknown) => {
      console.error(`device frame for ${deviceType}: ${cause instanceof Error ? cause.message : String(cause)}`);
      return null;
    });
    loading.set(deviceType, pending);
  }
  return pending;
};
