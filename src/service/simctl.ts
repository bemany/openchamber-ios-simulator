// Listing, booting and shutting down devices, appearance, keyboard layout and
// screenshots through `xcrun simctl`.
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Appearance, Device, KeyboardLayout } from '../shared/state.ts';
import { run, XCRUN } from './exec.ts';
import { layoutFromKeyboards } from './keymap.ts';

type ListJson = { devices?: Record<string, Array<{ udid?: string; name?: string; state?: string; isAvailable?: boolean; deviceTypeIdentifier?: string }>> };

/** `com.apple.CoreSimulator.SimRuntime.iOS-27-1` becomes `iOS 27.1`. */
export const runtimeLabel = (key: string): string => {
  const tail = key.split('.').pop() ?? key;
  const match = /^([A-Za-z]+)-(\d+)-(\d+)$/.exec(tail);
  return match ? `${match[1]} ${match[2]}.${match[3]}` : tail;
};

const runtimeVersion = (key: string): number[] => (/iOS-(\d+)-(\d+)/.exec(key) ?? []).slice(1).map(Number);

/**
 * Every available iPhone and iPad, newest runtime first, in Apple's order
 * within a runtime (iPhones before iPads).
 */
export const parseDevices = (json: string): Device[] => {
  const parsed = JSON.parse(json) as ListJson;
  const runtimes = Object.keys(parsed.devices ?? {})
    .filter((key) => /SimRuntime\.iOS-/.test(key))
    .sort((a, b) => {
      const [aMajor = 0, aMinor = 0] = runtimeVersion(a);
      const [bMajor = 0, bMinor = 0] = runtimeVersion(b);
      return bMajor - aMajor || bMinor - aMinor;
    });
  const devices: Device[] = [];
  for (const runtime of runtimes) {
    for (const device of parsed.devices?.[runtime] ?? []) {
      if (!device.udid || !device.name || device.isAvailable === false) continue;
      if (!/^(iPhone|iPad)\b/.test(device.name)) continue;
      devices.push({
        udid: device.udid,
        name: device.name,
        runtime: runtimeLabel(runtime),
        state: device.state ?? 'Shutdown',
        ...(device.deviceTypeIdentifier ? { deviceType: device.deviceTypeIdentifier } : {}),
      });
    }
  }
  return devices;
};

/** Default pick with nothing booted and nothing chosen: a numbered iPhone, else any iPhone, else the first device. */
export const defaultDevice = (devices: Device[]): Device | null =>
  devices.find((device) => /^iPhone \d/.test(device.name)) ??
  devices.find((device) => device.name.startsWith('iPhone')) ??
  devices[0] ??
  null;

export const listDevices = async (): Promise<Device[]> => {
  const result = await run(XCRUN, ['simctl', 'list', 'devices', '-j']);
  if (!result.ok) throw new Error(`simctl list: ${result.stderr || 'xcrun not found'}`);
  return parseDevices(result.stdout);
};

/** Bundle folder of every device type, by identifier. */
export const listDeviceTypes = async (): Promise<Map<string, string>> => {
  const result = await run(XCRUN, ['simctl', 'list', 'devicetypes', '-j']);
  if (!result.ok) throw new Error(`simctl list devicetypes: ${result.stderr || 'xcrun not found'}`);
  const parsed = JSON.parse(result.stdout) as { devicetypes?: Array<{ identifier?: string; bundlePath?: string }> };
  const types = new Map<string, string>();
  for (const type of parsed.devicetypes ?? []) if (type.identifier && type.bundlePath) types.set(type.identifier, type.bundlePath);
  return types;
};

/** A binary plist as JSON, through `plutil` (found by `xcrun`, so no extra program to approve). */
export const readPlist = async (file: string): Promise<unknown> => {
  const result = await run(XCRUN, ['plutil', '-convert', 'json', '-o', '-', file], { timeout: 5_000 });
  if (!result.ok) throw new Error(result.stderr.trim() || `Could not read ${file}`);
  return JSON.parse(result.stdout) as unknown;
};

export const bootDevice = async (udid: string): Promise<void> => {
  const boot = await run(XCRUN, ['simctl', 'boot', udid], { timeout: 120_000 });
  if (!boot.ok && !/current state: Booted/i.test(boot.stderr)) throw new Error(boot.stderr.trim() || 'Boot failed');
  // No `-b`: on Xcode 27 `bootstatus -b` can hang after the boot (same workaround as serve-sim).
  await run(XCRUN, ['simctl', 'bootstatus', udid], { timeout: 180_000 });
};

export const shutdownDevice = async (udid: string): Promise<void> => {
  const result = await run(XCRUN, ['simctl', 'shutdown', udid], { timeout: 60_000 });
  if (!result.ok && !/current state: Shutdown/i.test(result.stderr)) throw new Error(result.stderr.trim() || 'Shutdown failed');
};

export const readAppearance = async (udid: string): Promise<Appearance> => {
  const result = await run(XCRUN, ['simctl', 'ui', udid, 'appearance'], { timeout: 5_000 });
  if (!result.ok) return 'unknown';
  const value = result.stdout.trim();
  return value === 'light' || value === 'dark' ? value : 'unknown';
};

export const setAppearance = async (udid: string, appearance: 'light' | 'dark'): Promise<void> => {
  const result = await run(XCRUN, ['simctl', 'ui', udid, 'appearance', appearance], { timeout: 10_000 });
  if (!result.ok) throw new Error(result.stderr.trim() || 'Could not set the appearance');
};

/** The simulator's hardware keyboard layout, from its first `AppleKeyboards` entry. */
export const readKeyboardLayout = async (udid: string): Promise<KeyboardLayout> => {
  const result = await run(XCRUN, ['simctl', 'spawn', udid, 'defaults', 'read', '-g', 'AppleKeyboards'], { timeout: 10_000 });
  return result.ok ? layoutFromKeyboards(result.stdout) : 'us';
};

/** Full-resolution PNG screenshot. */
export const screenshot = async (udid: string): Promise<Buffer> => {
  const file = join(tmpdir(), `oc-ios-sim-${process.pid}-${Date.now()}.png`);
  try {
    const result = await run(XCRUN, ['simctl', 'io', udid, 'screenshot', '--type=png', file], { timeout: 20_000 });
    if (!result.ok) throw new Error(result.stderr.trim() || 'Screenshot failed');
    return await readFile(file);
  } finally {
    await rm(file, { force: true });
  }
};
