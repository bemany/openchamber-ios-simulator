// Holds the state together: which device is shown, the MJPEG connection to the
// loopback helper, the HID WebSocket, and boot/shutdown in progress. Frames
// are only pulled while someone watches (frame requests keep coming). Several
// simulators may run; the one shown is the chosen one if it runs, else any
// running one. Nothing is shut down unless asked for.
import http from 'node:http';

import { DEFAULT_QUALITY, type Appearance, type Busy, type Device, type KeyboardLayout, type Orientation, type Quality, type SimState } from '../shared/state.ts';
import { createFrameHub, type Frame } from './frames.ts';
import { ensureHelper, helperBase } from './helper.ts';
import { encodeHid, encodeMessage, OPCODE, type HidMessage } from './input.ts';
import { createMjpegParser, jpegSize } from './mjpeg.ts';
import { solidPng } from './placeholder.ts';
import {
  bootDevice,
  defaultDevice,
  shownDevice,
  listDevices,
  readAppearance,
  readKeyboardLayout,
  setAppearance,
  shutdownDevice,
} from './simctl.ts';

/** A viewer counts as present for this long after its last frame request. */
const VIEWER_GRACE_MS = 35_000;
const DEVICE_POLL_MS = 2_000;
/** After the stream drops while someone watches, reconnect this soon (the device poll is the safety net). */
const RECONNECT_MS = 300;
const APPEARANCE_TTL_MS = 15_000;
/** iOS sometimes drops a tap with no duration; the serve-sim CLI holds 40 ms. */
const MIN_TOUCH_MS = 40;
const KEY_GAP_MS = 8;
const PLACEHOLDER = { width: 402, height: 874, color: 0x1d1b1b };
/** serve-sim's HID socket sends the screen config with this opcode. */
const CONFIG_OPCODE = 130;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export const createSimulator = () => {
  const hub = createFrameHub();
  let devices: Device[] = [];
  let devicesAt = 0;
  let selected: string | null = null;
  let busy: Busy = null;
  let error: string | null = null;
  let controller: SimState['controller'] = 'none';
  let appearance: { udid: string; value: Appearance; at: number } | null = null;
  const layouts = new Map<string, KeyboardLayout>();
  let orientation: Orientation | null = null;
  /** The loopback helper each device is reached through; only its own (see helper.ts). */
  const helperPorts = new Map<string, number>();
  const helperFor = async (udid: string): Promise<number> => {
    const port = await ensureHelper(udid, helperPorts.get(udid) ?? null);
    helperPorts.set(udid, port);
    return port;
  };
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastViewerAt = 0;
  let framed = true;
  let quality: Quality = DEFAULT_QUALITY;

  // Upstream MJPEG for exactly one device.
  let streamUdid: string | null = null;
  let streamRequest: http.ClientRequest | null = null;
  let streamConnected = false;
  let placeholderShown = false;
  let watching = false;

  // HID socket for exactly one device.
  let hidSocket: WebSocket | null = null;
  let hidUdid: string | null = null;
  let hidOpen: Promise<WebSocket> | null = null;
  let touchBeganAt = 0;

  const activeDevice = (): Device | null => shownDevice(devices, selected);

  const refreshDevices = async (force = false): Promise<Device[]> => {
    if (!force && Date.now() - devicesAt < DEVICE_POLL_MS - 100) return devices;
    try {
      devices = await listDevices();
      devicesAt = Date.now();
    } catch (cause) {
      error = message(cause);
    }
    return devices;
  };

  const viewerPresent = () => Date.now() - lastViewerAt < VIEWER_GRACE_MS;

  const showPlaceholder = () => {
    if (placeholderShown) return;
    placeholderShown = true;
    hub.publish({
      data: solidPng(PLACEHOLDER.width, PLACEHOLDER.height, PLACEHOLDER.color),
      mime: 'image/png',
      width: PLACEHOLDER.width,
      height: PLACEHOLDER.height,
      title: 'No simulator',
    });
  };

  const stopStream = () => {
    streamRequest?.destroy();
    streamRequest = null;
    streamConnected = false;
    streamUdid = null;
  };

  const closeHid = () => {
    try {
      hidSocket?.close();
    } catch {
      // already closed
    }
    hidSocket = null;
    hidUdid = null;
    hidOpen = null;
    orientation = null;
  };

  const openHid = async (udid: string): Promise<WebSocket> => {
    if (hidSocket && hidUdid === udid && hidSocket.readyState === WebSocket.OPEN) return hidSocket;
    if (hidOpen && hidUdid === udid) return hidOpen;
    closeHid();
    hidUdid = udid;
    hidOpen = (async () => {
      const port = await helperFor(udid);
      const socket = new WebSocket(`${helperBase(port, udid).replace('http:', 'ws:')}/ws`);
      socket.binaryType = 'arraybuffer';
      socket.onmessage = (event) => {
        const bytes = new Uint8Array(event.data as ArrayBuffer);
        if (bytes[0] !== CONFIG_OPCODE) return;
        try {
          const config = JSON.parse(new TextDecoder().decode(bytes.subarray(1))) as { orientation?: Orientation };
          if (config.orientation) orientation = config.orientation;
        } catch {
          // not ours to fix
        }
      };
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('Could not open the HID connection to serve-sim'));
      });
      socket.onclose = () => {
        helperPorts.delete(udid);
        if (hidSocket === socket) closeHid();
      };
      hidSocket = socket;
      return socket;
    })();
    try {
      return await hidOpen;
    } catch (cause) {
      closeHid();
      throw cause;
    }
  };

  const startStream = async (device: Device) => {
    stopStream();
    streamUdid = device.udid;
    placeholderShown = false;
    const udid = device.udid;
    let port: number;
    try {
      port = await helperFor(udid);
    } catch (cause) {
      error = message(cause);
      if (streamUdid === udid) streamUdid = null;
      return;
    }
    if (streamUdid !== udid) return;
    if (!layouts.has(udid)) void readKeyboardLayout(udid).then((layout) => layouts.set(udid, layout));
    const parser = createMjpegParser((jpeg) => {
      const size = jpegSize(jpeg);
      if (!size || streamUdid !== udid) return;
      hub.publish({ data: jpeg, mime: 'image/jpeg', width: size.width, height: size.height, title: device.name });
    });
    const request = http.get(`${helperBase(port, udid)}/stream.mjpeg`, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        request.destroy();
        return;
      }
      streamConnected = true;
      error = null;
      response.on('data', (chunk: Buffer) => parser.push(chunk));
    });
    request.on('close', () => {
      if (streamRequest !== request) return;
      streamRequest = null;
      streamConnected = false;
      streamUdid = null;
      // Its helper may be gone (it exits with its simulator): look it up again, and come back soon.
      helperPorts.delete(udid);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (viewerPresent() && !streamRequest) void switchStream().catch(() => undefined);
      }, RECONNECT_MS);
    });
    request.on('error', () => undefined);
    streamRequest = request;
    // The HID socket reports the orientation the picture needs as soon as it connects.
    void openHid(udid).catch(() => undefined);
  };

  /** Runs while someone watches: notices device changes and (re)connects the stream. */
  const watch = async () => {
    if (watching) return;
    watching = true;
    try {
      while (viewerPresent()) {
        await refreshDevices();
        const device = activeDevice();
        if (!device) {
          stopStream();
          closeHid();
          showPlaceholder();
        } else if (streamUdid !== device.udid) {
          await startStream(device);
          if (!streamRequest) await sleep(RECONNECT_MS);
        }
        await sleep(DEVICE_POLL_MS);
      }
      stopStream();
    } finally {
      watching = false;
    }
  };

  const nextFrame = (after: number, waitMs: number, signal?: AbortSignal): Promise<Frame | null> => {
    lastViewerAt = Date.now();
    void watch();
    return hub.next(after, waitMs, signal);
  };

  const requireActive = async (): Promise<Device> => {
    await refreshDevices(true);
    const device = activeDevice();
    if (!device) throw new Error('No simulator is booted');
    return device;
  };

  /** Sends HID messages in order, with a short gap between keys so iOS does not drop them. */
  const sendHid = async (messages: HidMessage[]) => {
    if (messages.length === 0) return;
    const device = activeDevice() ?? (await requireActive());
    const socket = await openHid(device.udid);
    for (const hid of messages) {
      if (hid.op === 'touch' && hid.type === 'end') {
        const held = Date.now() - touchBeganAt;
        if (held < MIN_TOUCH_MS) await sleep(MIN_TOUCH_MS - held);
      }
      socket.send(encodeMessage(hid));
      if (hid.op === 'touch' && hid.type === 'begin') touchBeganAt = Date.now();
      if (hid.op === 'key') await sleep(KEY_GAP_MS);
    }
  };

  const sendRaw = async (opcode: number, payload: object) => {
    const device = await requireActive();
    const socket = await openHid(device.udid);
    socket.send(encodeHid(opcode, payload));
  };

  /** Moves the stream to the device now shown, right away instead of at the next device poll. */
  const switchStream = async () => {
    await refreshDevices(true);
    const device = activeDevice();
    if (!device) {
      // The chosen device is off: stop showing the previous one.
      stopStream();
      closeHid();
      showPlaceholder();
      return;
    }
    if (device.udid === streamUdid || !viewerPresent()) return;
    await startStream(device);
  };

  const runBusy = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    if (busy) throw new Error('Another boot or shutdown is in progress');
    busy = kind;
    error = null;
    try {
      await work();
    } catch (cause) {
      error = message(cause);
      throw cause;
    } finally {
      busy = null;
      await refreshDevices(true);
    }
  };

  return {
    hub,
    nextFrame,
    sendHid,

    async state(): Promise<SimState> {
      await refreshDevices();
      const active = activeDevice();
      if (active) {
        selected = active.udid;
        if (!appearance || appearance.udid !== active.udid || Date.now() - appearance.at > APPEARANCE_TTL_MS) {
          appearance = { udid: active.udid, value: await readAppearance(active.udid), at: Date.now() };
        }
      }
      if (!selected || !devices.some((device) => device.udid === selected)) {
        selected = devices.find((device) => device.state === 'Booted')?.udid ?? defaultDevice(devices)?.udid ?? null;
      }
      return {
        devices,
        active,
        selected,
        busy,
        streaming: streamConnected && viewerPresent() && streamUdid === active?.udid,
        controller,
        orientation: active ? orientation : null,
        appearance: active && appearance?.udid === active.udid ? appearance.value : 'unknown',
        keyboard: active ? (layouts.get(active.udid) ?? null) : null,
        framed,
        quality,
        error,
      };
    },

    /** Shows `udid`, booting it first when it is not running. Other running devices keep running. */
    async boot(udid: string) {
      await refreshDevices(true);
      const device = devices.find((candidate) => candidate.udid === udid);
      if (!device) throw new Error('Unknown device');
      selected = udid;
      if (device.state !== 'Booted') {
        await runBusy('booting', () => bootDevice(udid));
        helperPorts.delete(udid); // a helper left from an earlier boot of this device is gone
      }
      await switchStream();
    },

    /** Shuts down the device shown, nothing else. */
    async shutdown() {
      await refreshDevices(true);
      const device = activeDevice();
      if (!device) return;
      await runBusy('shutting-down', async () => {
        stopStream();
        closeHid();
        await shutdownDevice(device.udid);
        helperPorts.delete(device.udid); // its helper exits with it
      });
    },

    /** The toolbar's choice: shown at once when it runs; when it is off, shown as off until someone boots it. */
    async select(udid: string) {
      await refreshDevices();
      if (!devices.some((device) => device.udid === udid)) return;
      selected = udid;
      await switchStream();
    },

    /** Sends the newest picture again, so a changed view (frame, rotation) shows without waiting for the screen to change. */
    repaint() {
      const shown = hub.current();
      if (shown) hub.publish({ data: shown.data, mime: shown.mime, width: shown.width, height: shown.height, title: shown.title });
    },

    framed: (): boolean => framed,

    quality: (): Quality => quality,

    setQuality(next: Quality) {
      quality = next;
    },

    setFramed(on: boolean) {
      framed = on;
    },

    /** The device shown, from the last device list (no refresh). */
    active: (): Device | null => activeDevice(),

    async button(name: 'home' | 'lock') {
      await sendRaw(OPCODE.button, name === 'home' ? { button: 'home' } : { button: 'power', page: 12, usage: 48 });
    },

    async rotate(target?: Orientation) {
      const next: Orientation = target ?? (orientation === 'portrait' || orientation === null ? 'landscape_left' : 'portrait');
      await sendRaw(OPCODE.orientation, { orientation: next });
      orientation = next;
      // A still screen may send no new frame; republish the current one so it shows rotated.
      const shown = hub.current();
      if (shown) hub.publish({ data: shown.data, mime: shown.mime, width: shown.width, height: shown.height, title: shown.title });
    },

    /** A hardware button from the device frame, by its HID usage (as in Xcode's chrome.json). */
    async pressButton(name: string, page: number, usage: number) {
      if (name === 'home') await sendRaw(OPCODE.button, { button: 'home' });
      else await sendRaw(OPCODE.button, { button: name, page, usage });
    },

    async setAppearance(mode?: 'light' | 'dark') {
      const device = await requireActive();
      const current = await readAppearance(device.udid);
      const next = mode ?? (current === 'dark' ? 'light' : 'dark');
      await setAppearance(device.udid, next);
      appearance = { udid: device.udid, value: next, at: Date.now() };
    },

    async activeUdid(): Promise<string> {
      return (await requireActive()).udid;
    },

    async axTree(): Promise<string> {
      const device = await requireActive();
      const port = await helperFor(device.udid);
      const response = await fetch(`${helperBase(port, device.udid)}/ax`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Accessibility tree unavailable (${response.status})`);
      return response.text();
    },

    orientation: (): Orientation | null => orientation,

    /** Keyboard layout of the active device, read once per device. */
    async layout(): Promise<KeyboardLayout> {
      const active = activeDevice();
      if (!active) return 'us';
      let layout = layouts.get(active.udid);
      if (!layout) {
        layout = await readKeyboardLayout(active.udid);
        layouts.set(active.udid, layout);
      }
      return layout;
    },

    setController(next: SimState['controller']) {
      controller = next;
    },

    stop() {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopStream();
      closeHid();
    },
  };
};

export type Simulator = ReturnType<typeof createSimulator>;
