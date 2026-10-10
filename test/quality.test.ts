import { describe, expect, test } from 'bun:test';

import { planChrome, type ChromeSpec, type Display } from '../src/service/chrome.ts';
import { shrink, shrunkSize } from '../src/service/compose.ts';
import { shownDevice } from '../src/service/simctl.ts';
import { normalizeDirectUrl } from '../src/shared/direct.ts';
import { QUALITY_DIVISOR } from '../src/shared/state.ts';
import type { Device } from '../src/shared/state.ts';

describe('shrinking', () => {
  test('sizes round down the same way for every divisor', () => {
    expect(shrunkSize(1206, 2622, QUALITY_DIVISOR.full)).toEqual({ width: 1206, height: 2622 });
    expect(shrunkSize(1206, 2622, QUALITY_DIVISOR.balanced)).toEqual({ width: 603, height: 1311 });
    expect(shrunkSize(1206, 2622, QUALITY_DIVISOR.fast)).toEqual({ width: 402, height: 874 });
    expect(shrunkSize(5, 3, 2)).toEqual({ width: 2, height: 1 });
  });

  test('averages each block and makes the result opaque', () => {
    // 4x2 RGBA: left block 0/100, right block 200/255 per channel.
    const px = (v: number) => [v, v, v, 10];
    const data = Uint8Array.from([...px(0), ...px(100), ...px(200), ...px(255), ...px(100), ...px(0), ...px(255), ...px(200)].flat());
    const out = shrink({ width: 4, height: 2, data }, 2);
    expect([out.width, out.height]).toEqual([2, 1]);
    expect([...out.data]).toEqual([50, 50, 50, 255, 228, 228, 228, 255]);
  });

  test('a divisor of 1 leaves the picture alone', () => {
    const image = { width: 1, height: 1, data: Uint8Array.from([1, 2, 3, 4]) };
    expect(shrink(image, 1)).toBe(image);
  });
});

describe('device frame at a smaller size', () => {
  const spec: ChromeSpec = {
    composite: 'composite',
    slices: null,
    sizing: { left: 0, right: 0, top: 0, bottom: 0 },
    padding: { left: 10, right: 10, top: 5, bottom: 5 },
    inputs: [{ name: 'volume-up', image: 'volume', anchor: 'left', align: 'leading', onTop: false, normal: { x: 0, y: 50 }, rollover: { x: -1, y: 50 }, page: 12, usage: 233 }],
  };
  const sizes: Record<string, { width: number; height: number }> = { composite: { width: 120, height: 220 }, volume: { width: 4, height: 30 } };
  const sizeOf = (image: string) => sizes[image] ?? null;

  test('halving the display halves the whole layout, and the screen matches the shrunk picture', () => {
    const full: Display = { width: 300, height: 600, scale: 3, chrome: 'phone', mask: null };
    const half: Display = { ...full, ...shrunkSize(300, 600, 2), scale: 1.5 };
    const a = planChrome('phone', full, spec, sizeOf)!.layout;
    const b = planChrome('phone@2', half, spec, sizeOf)!.layout;
    expect([b.width, b.height]).toEqual([a.width / 2, a.height / 2]);
    expect(b.screen).toEqual({ x: 30, y: 23, width: 150, height: 300 });
    expect([b.screen.width, b.screen.height]).toEqual([shrunkSize(300, 600, 2).width, shrunkSize(300, 600, 2).height]);
    // Buttons scale with it, so a click on the shrunk frame still finds them.
    const [button] = b.buttons;
    expect(button!.name).toBe('volume-up');
    expect(Math.abs(button!.x - a.buttons[0]!.x / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(button!.height - a.buttons[0]!.height / 2)).toBeLessThanOrEqual(1);
  });
});

describe('device choice', () => {
  const device = (udid: string, state: string): Device => ({ udid, name: udid, runtime: 'iOS 27.0', state });
  const devices = [device('A', 'Booted'), device('B', 'Shutdown'), device('C', 'Booted')];

  test('a running choice is shown', () => {
    expect(shownDevice(devices, 'C')?.udid).toBe('C');
  });

  test('a choice that is off shows as off, never as another running device', () => {
    expect(shownDevice(devices, 'B')).toBeNull();
  });

  test('without a known choice, any running device is shown', () => {
    expect(shownDevice(devices, null)?.udid).toBe('A');
    expect(shownDevice(devices, 'gone')?.udid).toBe('A');
    expect(shownDevice([device('B', 'Shutdown')], null)).toBeNull();
  });
});

describe('serve-sim address', () => {
  test('accepts plain http(s) addresses and tidies them', () => {
    expect(normalizeDirectUrl('http://host:3200/')).toBe('http://host:3200');
    expect(normalizeDirectUrl('  127.0.0.1:3100 ')).toBe('http://127.0.0.1:3100');
    expect(normalizeDirectUrl('https://sim.example.ts.net/base//')).toBe('https://sim.example.ts.net/base');
  });

  test('refuses other schemes, credentials, queries and non-strings', () => {
    expect(normalizeDirectUrl('ftp://host')).toBeNull();
    expect(normalizeDirectUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeDirectUrl('http://user:pw@host')).toBeNull();
    expect(normalizeDirectUrl('http://host/?token=x')).toBeNull();
    expect(normalizeDirectUrl('')).toBeNull();
    expect(normalizeDirectUrl(42)).toBeNull();
  });
});
