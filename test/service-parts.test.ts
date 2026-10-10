import { describe, expect, test } from 'bun:test';

import { createFrameHub } from '../src/service/frames.ts';
import { solidPng } from '../src/service/placeholder.ts';
import { deltaToPortrait, rotatedSize, rotationFor, toPortrait } from '../src/service/rotate.ts';
import { defaultDevice, parseDevices, runtimeLabel } from '../src/service/simctl.ts';

const frame = (width: number, height: number) => ({ data: Buffer.from([1]), mime: 'image/jpeg' as const, width, height, title: 't' });

describe('frame hub', () => {
  test('numbers frames from 1 and answers newer ones at once', async () => {
    const hub = createFrameHub();
    hub.publish(frame(10, 20));
    expect((await hub.next(0, 0))?.seq).toBe(1);
    expect(await hub.next(1, 10)).toBeNull();
  });

  test('wakes a waiter on publish and on abort', async () => {
    const hub = createFrameHub();
    const waiting = hub.next(0, 5_000);
    hub.publish(frame(10, 20));
    expect((await waiting)?.seq).toBe(1);
    const abort = new AbortController();
    const aborted = hub.next(1, 5_000, abort.signal);
    abort.abort();
    expect(await aborted).toBeNull();
    expect(hub.pending()).toBe(0);
  });

  test('input on a frame of another size is stale, many frames of the same size are not', () => {
    const hub = createFrameHub();
    hub.publish(frame(10, 20));
    for (let i = 0; i < 500; i += 1) hub.publish(frame(10, 20));
    expect(hub.isStale(1)).toBe(false);
    hub.publish(frame(30, 40));
    expect(hub.isStale(1)).toBe(true);
    expect(hub.isStale(502)).toBe(false);
    expect(hub.isStale(0)).toBe(false);
    expect(hub.isStale(999)).toBe(true);
  });
});

describe('rotation', () => {
  test('orientation to clockwise degrees', () => {
    expect(rotationFor('portrait')).toBe(0);
    expect(rotationFor(null)).toBe(0);
    expect(rotationFor('landscape_left')).toBe(90);
    expect(rotationFor('landscape_right')).toBe(270);
    expect(rotationFor('portrait_upside_down')).toBe(180);
  });

  test('points and movements round-trip through each rotation', () => {
    for (const degrees of [0, 90, 180, 270]) {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => toPortrait(u!, v!, degrees));
      // Every rotation maps the four corners onto the four corners.
      expect(new Set(corners.map(({ x, y }) => `${x},${y}`)).size).toBe(4);
    }
    expect(toPortrait(0.25, 0.5, 270)).toEqual({ x: 0.5, y: 0.25 });
    expect(deltaToPortrait(0.1, 0, 90)).toEqual({ dx: 0, dy: -0.1 });
    expect(rotatedSize({ width: 1, height: 2 }, 90)).toEqual({ width: 2, height: 1 });
    expect(rotatedSize({ width: 1, height: 2 }, 180)).toEqual({ width: 1, height: 2 });
  });
});

describe('simctl parsing', () => {
  const json = JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
        { udid: 'A', name: 'iPhone 18 Pro', state: 'Booted', isAvailable: true },
        { udid: 'B', name: 'iPad mini (A17 Pro)', state: 'Shutdown', isAvailable: true },
        { udid: 'C', name: 'iPhone 17', state: 'Shutdown', isAvailable: false },
      ],
      'com.apple.CoreSimulator.SimRuntime.iOS-27-1': [{ udid: 'D', name: 'iPhone Duo', state: 'Shutdown' }],
      'com.apple.CoreSimulator.SimRuntime.watchOS-12-0': [{ udid: 'E', name: 'Apple Watch', state: 'Shutdown' }],
    },
  });

  test('lists available iPhones and iPads, newest runtime first', () => {
    expect(parseDevices(json).map((device) => `${device.udid}:${device.runtime}`)).toEqual(['D:iOS 27.1', 'A:iOS 27.0', 'B:iOS 27.0']);
    expect(runtimeLabel('com.apple.CoreSimulator.SimRuntime.iOS-27-1')).toBe('iOS 27.1');
  });

  test('defaults to a numbered iPhone', () => {
    expect(defaultDevice(parseDevices(json))?.udid).toBe('A');
    expect(defaultDevice([])).toBeNull();
  });
});

describe('placeholder', () => {
  test('is a PNG of the requested size', () => {
    const png = solidPng(3, 2, 0x112233);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(3);
    expect(png.readUInt32BE(20)).toBe(2);
  });
});
