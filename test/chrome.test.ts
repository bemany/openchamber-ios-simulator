import { describe, expect, test } from 'bun:test';
import type { SurfaceInputEvent, SurfaceModifiers } from '@openchamber/sdk';

import { parseChromeJson, parseDisplay, pdfSize, planChrome, type ChromeSpec, type Display } from '../src/service/chrome.ts';
import { drawOver, flatten, maskRows, parseColor, placeScreen, rotateRgba } from '../src/service/compose.ts';
import { translateInput } from '../src/service/input.ts';
import { decodePng, encodePng, type Rgba } from '../src/service/png.ts';
import { solidPng } from '../src/service/placeholder.ts';
import { parseDevices } from '../src/service/simctl.ts';
import type { ChromeLayout } from '../src/shared/state.ts';

const rgba = (width: number, height: number, pixels: number[][]): Rgba => ({ width, height, data: Uint8Array.from(pixels.flat()) });

describe('png', () => {
  test('encode and decode round-trip RGBA', () => {
    const image = rgba(2, 2, [[255, 0, 0, 255], [0, 255, 0, 128], [0, 0, 255, 0], [10, 20, 30, 40]]);
    const back = decodePng(encodePng(image));
    expect(back.width).toBe(2);
    expect(back.height).toBe(2);
    expect([...back.data]).toEqual([...image.data]);
  });

  test('decodes RGB without alpha as opaque', () => {
    const back = decodePng(solidPng(3, 1, 0x112233));
    expect([...back.data.subarray(0, 4)]).toEqual([0x11, 0x22, 0x33, 255]);
  });

  test('refuses what is not a PNG', () => {
    expect(() => decodePng(Buffer.from('nope'))).toThrow();
  });
});

describe('compose', () => {
  test('maskRows keeps the opaque run as a block and the edges as partial pixels', () => {
    const rows = maskRows(Uint8Array.from([0, 128, 255, 255, 128, 0]), 6, 1);
    expect(rows.start[0]).toBe(2);
    expect(rows.end[0]).toBe(4);
    expect([...rows.partial[0]!]).toEqual([1, 4]);
  });

  test('placeScreen copies the opaque run and blends the corners', () => {
    const mask = Uint8Array.from([0, 128, 255, 255, 128, 0]);
    const canvas = rgba(6, 1, Array.from({ length: 6 }, () => [0, 0, 0, 255]));
    const screen = rgba(6, 1, Array.from({ length: 6 }, () => [200, 200, 200, 255]));
    placeScreen(canvas, screen, { x: 0, y: 0, width: 6, height: 1 }, mask, maskRows(mask, 6, 1));
    expect([0, 1, 2, 3, 4, 5].map((x) => canvas.data[x * 4])).toEqual([0, 100, 200, 200, 100, 0]);
  });

  test('rotateRgba turns clockwise', () => {
    const row = rgba(2, 1, [[1, 1, 1, 1], [2, 2, 2, 2]]);
    const turned = rotateRgba(row, 90);
    expect([turned.width, turned.height]).toEqual([1, 2]);
    expect([turned.data[0], turned.data[4]]).toEqual([1, 2]);
    const back = rotateRgba(turned, 270);
    expect([back.width, back.height, back.data[0], back.data[4]]).toEqual([2, 1, 1, 2]);
    const flipped = rotateRgba(row, 180);
    expect([flipped.data[0], flipped.data[4]]).toEqual([2, 1]);
  });

  test('drawOver mixes half alpha, flatten makes every pixel opaque', () => {
    const target = rgba(1, 1, [[0, 0, 0, 255]]);
    drawOver(target, rgba(1, 1, [[255, 255, 255, 128]]), 0, 0);
    expect(target.data[0]).toBe(128);
    const flat = flatten(rgba(1, 1, [[255, 0, 0, 0]]), [10, 20, 30]);
    expect([...flat.data]).toEqual([10, 20, 30, 255]);
  });

  test('parseColor reads #rgb and #rrggbb, else falls back', () => {
    expect(parseColor('#151313', [0, 0, 0])).toEqual([0x15, 0x13, 0x13]);
    expect(parseColor('#fff', [0, 0, 0])).toEqual([255, 255, 255]);
    expect(parseColor('rgb(1,2,3)', [9, 9, 9])).toEqual([9, 9, 9]);
  });
});

describe('device frame plan', () => {
  // 300x600 pixels at scale 3: a 100x200 point screen.
  const display: Display = { width: 300, height: 600, scale: 3, chrome: 'phone', mask: null };
  const sizes: Record<string, { width: number; height: number }> = {
    composite: { width: 120, height: 220 },
    volume: { width: 4, height: 30 },
    top: { width: 20, height: 4 },
    corner: { width: 10, height: 10 },
    edgeH: { width: 1, height: 10 },
    edgeV: { width: 10, height: 1 },
  };
  const sizeOf = (image: string) => sizes[image] ?? null;
  const input = (name: string, image: string, extra: Partial<ChromeSpec['inputs'][number]>) => ({
    name,
    image,
    anchor: 'left' as const,
    align: 'leading' as const,
    onTop: false,
    normal: { x: 0, y: 0 },
    rollover: { x: 0, y: 0 },
    page: 12,
    usage: 1,
    ...extra,
  });

  test('composite body: screen centered, left button and center-aligned top button placed like serve-sim', () => {
    const spec: ChromeSpec = {
      composite: 'composite',
      slices: null,
      sizing: { left: 0, right: 0, top: 0, bottom: 0 },
      padding: { left: 10, right: 10, top: 5, bottom: 5 },
      inputs: [
        input('volume-up', 'volume', { normal: { x: 0, y: 50 }, rollover: { x: -1, y: 50 }, usage: 233 }),
        input('camera', 'top', { anchor: 'top', align: 'center', normal: { x: 0, y: 1 }, rollover: { x: 0, y: 2 }, page: 0, usage: 0 }),
      ],
    };
    const plan = planChrome('phone', display, spec, sizeOf)!;
    expect(plan.layout.width).toBe(420);
    expect(plan.layout.height).toBe(690);
    expect(plan.layout.screen).toEqual({ x: 60, y: 45, width: 300, height: 600 });
    // Only inputs with a HID usage become pressable buttons.
    expect(plan.layout.buttons).toEqual([{ name: 'volume-up', page: 12, usage: 233, x: 21, y: 165, width: 12, height: 90 }]);
    const top = plan.pieces.find((piece) => 'image' in piece && piece.image === 'top');
    expect(top?.rect).toEqual({ x: 180, y: 3, width: 60, height: 12 });
  });

  test('nine-slice body: fill in the middle, edges and corners around the screen', () => {
    const spec: ChromeSpec = {
      composite: null,
      slices: {
        topLeft: 'corner', top: 'edgeH', topRight: 'corner', right: 'edgeV',
        bottomRight: 'corner', bottom: 'edgeH', bottomLeft: 'corner', left: 'edgeV',
      },
      sizing: { left: 10, right: 10, top: 10, bottom: 10 },
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      inputs: [],
    };
    const plan = planChrome('pad', display, spec, sizeOf)!;
    expect([plan.layout.width, plan.layout.height]).toEqual([360, 660]);
    expect(plan.layout.screen).toEqual({ x: 30, y: 30, width: 300, height: 600 });
    expect(plan.pieces).toHaveLength(9);
    expect(plan.pieces[0]).toEqual({ fill: true, rect: { x: 30, y: 30, width: 300, height: 600 } });
  });

  test('no plan when an image size is missing', () => {
    const spec: ChromeSpec = { composite: 'missing', slices: null, sizing: { left: 0, right: 0, top: 0, bottom: 0 }, padding: { left: 0, right: 0, top: 0, bottom: 0 }, inputs: [] };
    expect(planChrome('x', display, spec, sizeOf)).toBeNull();
  });

  test('parses capabilities, chrome.json and PDF sizes', () => {
    const plist = {
      capabilities: {
        displays: [
          { displayType: 'external', hasDigitizer: false },
          { displayType: 'integrated', hasDigitizer: true, chromeIdentifier: 'com.apple.dt.devicekit.chrome.phone11', width: 1206, height: 2622, scale: 3, framebufferMaskIdentifier: 'mask' },
        ],
      },
    };
    expect(parseDisplay(plist)).toEqual({ width: 1206, height: 2622, scale: 3, chrome: 'phone11', mask: 'mask' });
    expect(parseDisplay({})).toBeNull();
    const spec = parseChromeJson({
      images: { composite: 'PhoneComposite', sizing: {}, devicePadding: { left: 2 } },
      inputs: [
        { type: 'button', name: 'power', image: 'Power', anchor: 'right', align: 'center', usagePage: 12, usage: 48, offsets: { normal: { x: 1, y: 2 } } },
        { type: 'switch', name: 'mute', image: 'Mute' },
      ],
    })!;
    expect(spec.composite).toBe('PhoneComposite');
    expect(spec.padding.left).toBe(2);
    expect(spec.inputs.map((entry) => [entry.name, entry.anchor, entry.align, entry.rollover])).toEqual([['power', 'right', 'center', { x: 1, y: 2 }]]);
    expect(parseChromeJson({ images: {} })).toBeNull();
    expect(pdfSize('%PDF /MediaBox [0 0 612 792]')).toEqual({ width: 612, height: 792 });
    expect(pdfSize('no box')).toBeNull();
  });
});

describe('input on a framed picture', () => {
  const none: SurfaceModifiers = { alt: false, ctrl: false, meta: false, shift: false };
  const down = (x: number, y: number): SurfaceInputEvent => ({ type: 'pointer', action: 'down', x, y, button: 0, buttons: 1, modifiers: none });
  const chrome: ChromeLayout = {
    id: 'phone',
    width: 1000,
    height: 2000,
    screen: { x: 100, y: 100, width: 800, height: 1800 },
    buttons: [{ name: 'volume-up', page: 12, usage: 233, x: 0, y: 400, width: 50, height: 200 }],
  };

  test('maps onto the screen inside the frame', () => {
    const { messages } = translateInput([down(500, 1000)], { width: 1000, height: 2000 }, { touching: false }, { chrome });
    expect(messages).toEqual([{ op: 'touch', type: 'begin', x: 0.5, y: 0.5 }]);
  });

  test('a press on a frame button presses it, a press on the bezel does nothing', () => {
    const state = { touching: false };
    const button = translateInput([down(25, 500)], { width: 1000, height: 2000 }, state, { chrome });
    expect(button.messages).toEqual([]);
    expect(button.buttons.map((entry) => entry.name)).toEqual(['volume-up']);
    const bezel = translateInput([down(50, 50)], { width: 1000, height: 2000 }, state, { chrome });
    expect([bezel.messages, bezel.buttons, state.touching]).toEqual([[], [], false]);
  });

  test('finds the button on a picture turned to landscape', () => {
    // Portrait (25, 500) of 1000x2000 is (0.025, 0.25); turned 90 degrees that is (0.75, 0.025) of 2000x1000.
    const { buttons } = translateInput([down(1500, 25)], { width: 2000, height: 1000 }, { touching: false }, { chrome, degrees: 90 });
    expect(buttons.map((entry) => entry.name)).toEqual(['volume-up']);
  });
});

describe('device types', () => {
  test('parseDevices keeps the device type for the frame lookup', () => {
    const json = JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
          { udid: 'A', name: 'iPhone 18 Pro', state: 'Booted', deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro' },
          { udid: 'B', name: 'iPad mini (A17 Pro)', state: 'Shutdown' },
        ],
      },
    });
    const devices = parseDevices(json);
    expect(devices[0]?.deviceType).toBe('com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro');
    expect(devices[1]?.deviceType).toBeUndefined();
  });
});
