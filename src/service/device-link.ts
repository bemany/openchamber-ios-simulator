// One device's connection to its loopback helper: the MJPEG picture stream
// (with its own frame hub and a quick reconnect when it drops) and the HID
// WebSocket (input, and the orientation serve-sim reports). links.ts decides
// how long a link stays open.
import http from 'node:http';

import type { Orientation } from '../shared/state.ts';
import { createFrameHub, type Frame } from './frames.ts';
import { helperBase } from './helper.ts';
import { encodeHid, encodeMessage, type HidMessage } from './input.ts';
import { createMjpegParser, jpegSize } from './mjpeg.ts';

/** After the stream drops while someone watches, reconnect this soon (the device poll is the safety net). */
const RECONNECT_MS = 300;
/** iOS sometimes drops a tap with no duration; the serve-sim CLI holds 40 ms. */
const MIN_TOUCH_MS = 40;
const KEY_GAP_MS = 8;
/** serve-sim's HID socket sends the screen config with this opcode. */
const CONFIG_OPCODE = 130;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export type LinkContext = {
  /** Port of the device's own helper (started when none runs). */
  helperFor: (udid: string) => Promise<number>;
  /** Forget the remembered helper port (it may be gone). */
  forgetHelper: (udid: string) => void;
  /** The device's name, for frame titles. */
  name: (udid: string) => string;
  /** Is someone still watching this device (reconnect after a drop)? */
  wanted: (udid: string) => boolean;
  /** Every frame of this device, after it reached the link's own hub. */
  onFrame: (udid: string, frame: Frame) => void;
  onError: (udid: string, error: string | null) => void;
};

export const createDeviceLink = (udid: string, ctx: LinkContext) => {
  const hub = createFrameHub();
  let request: http.ClientRequest | null = null;
  let connected = false;
  let starting = false;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let socket: WebSocket | null = null;
  let socketOpen: Promise<WebSocket> | null = null;
  let orientation: Orientation | null = null;
  let touchBeganAt = 0;

  const stopStream = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const old = request;
    request = null;
    connected = false;
    old?.destroy();
  };

  const closeHid = () => {
    const old = socket;
    socket = null;
    socketOpen = null;
    orientation = null;
    try {
      old?.close();
    } catch {
      // already closed
    }
  };

  const openHid = async (): Promise<WebSocket> => {
    if (socket && socket.readyState === WebSocket.OPEN) return socket;
    if (socketOpen) return socketOpen;
    socketOpen = (async () => {
      const port = await ctx.helperFor(udid);
      const next = new WebSocket(`${helperBase(port, udid).replace('http:', 'ws:')}/ws`);
      next.binaryType = 'arraybuffer';
      next.onmessage = (event) => {
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
        next.onopen = () => resolve();
        next.onerror = () => reject(new Error('Could not open the HID connection to serve-sim'));
      });
      next.onclose = () => {
        ctx.forgetHelper(udid);
        if (socket === next) closeHid();
      };
      socket = next;
      return next;
    })();
    try {
      return await socketOpen;
    } catch (cause) {
      closeHid();
      throw cause;
    }
  };

  /** Connects the picture stream unless it runs (or is connecting). */
  const start = async () => {
    if (closed || request || starting) return;
    starting = true;
    let port: number;
    try {
      port = await ctx.helperFor(udid);
    } catch (cause) {
      ctx.onError(udid, message(cause));
      return;
    } finally {
      starting = false;
    }
    if (closed || request) return;
    const parser = createMjpegParser((jpeg) => {
      const size = jpegSize(jpeg);
      if (!size || closed) return;
      ctx.onFrame(udid, hub.publish({ data: jpeg, mime: 'image/jpeg', width: size.width, height: size.height, title: ctx.name(udid) }));
    });
    const next = http.get(`${helperBase(port, udid)}/stream.mjpeg`, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        next.destroy();
        return;
      }
      connected = true;
      ctx.onError(udid, null);
      response.on('data', (chunk: Buffer) => parser.push(chunk));
    });
    next.on('close', () => {
      if (request !== next) return;
      request = null;
      connected = false;
      // Its helper may be gone (it exits with its simulator): look it up again, and come back soon.
      ctx.forgetHelper(udid);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!closed && ctx.wanted(udid)) void start();
      }, RECONNECT_MS);
    });
    next.on('error', () => undefined);
    request = next;
    // The HID socket reports the orientation the picture needs as soon as it connects.
    void openHid().catch(() => undefined);
  };

  return {
    udid,
    hub,
    start,
    /** Frames are arriving. */
    connected: () => connected,
    /** A stream request exists (connected or connecting). */
    running: () => request !== null || starting,
    orientation: (): Orientation | null => orientation,
    setOrientation(next: Orientation) {
      orientation = next;
    },
    /** Drops stream and HID (a repair restarts the helper underneath); `start` connects again. */
    reset() {
      stopStream();
      closeHid();
    },
    /** Sends HID messages in order, with a short gap between keys so iOS does not drop them. */
    async sendHid(messages: HidMessage[]) {
      if (messages.length === 0) return;
      const open = await openHid();
      for (const hid of messages) {
        if (hid.op === 'touch' && hid.type === 'end') {
          const held = Date.now() - touchBeganAt;
          if (held < MIN_TOUCH_MS) await sleep(MIN_TOUCH_MS - held);
        }
        open.send(encodeMessage(hid));
        if (hid.op === 'touch' && hid.type === 'begin') touchBeganAt = Date.now();
        if (hid.op === 'key') await sleep(KEY_GAP_MS);
      }
    },
    async sendRaw(opcode: number, payload: object) {
      (await openHid()).send(encodeHid(opcode, payload));
    },
    close() {
      closed = true;
      stopStream();
      closeHid();
    },
  };
};

export type DeviceLink = ReturnType<typeof createDeviceLink>;
