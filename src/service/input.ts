// Translates what OpenChamber sends from a viewer (`SurfaceInputEvent`,
// coordinates in frame pixels) into serve-sim HID messages (coordinates
// normalized 0..1 in the portrait framebuffer). Pure apart from "a finger is
// down", so it can be tested.
import type { SurfaceInputEvent } from '@openchamber/sdk';

import type { KeyboardLayout } from '../shared/state.ts';
import { pressSequence, strokeForChar, typeText, usageForNamedKey, type HidKeyEvent } from './keymap.ts';
import { deltaToPortrait, toPortrait } from './rotate.ts';

export type HidMessage =
  | { op: 'touch'; type: 'begin' | 'move' | 'end'; x: number; y: number }
  | { op: 'scroll'; dx: number; dy: number; x: number; y: number }
  | { op: 'key'; event: HidKeyEvent };

export type InputState = { touching: boolean };

export type FrameBox = { width: number; height: number };

export type InputOptions = {
  /** Clockwise rotation the shown frame got from the portrait framebuffer (see rotate.ts). */
  degrees?: number;
  layout?: KeyboardLayout;
};

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

const keyMessages = (events: HidKeyEvent[]): HidMessage[] => events.map((event) => ({ op: 'key', event }));

/** `frame` is the picture as the viewer sees it. */
export const translateInput = (
  events: SurfaceInputEvent[],
  frame: FrameBox,
  state: InputState,
  options: InputOptions = {},
): { messages: HidMessage[]; skippedChars: number } => {
  const degrees = options.degrees ?? 0;
  const layout = options.layout ?? 'us';
  const messages: HidMessage[] = [];
  let skippedChars = 0;
  const point = (x: number, y: number) => {
    const portrait = toPortrait(clamp01(x / Math.max(1, frame.width)), clamp01(y / Math.max(1, frame.height)), degrees);
    return { x: clamp01(portrait.x), y: clamp01(portrait.y) };
  };

  for (const event of events) {
    switch (event.type) {
      case 'pointer': {
        if (event.action === 'down' && event.button === 0) {
          state.touching = true;
          messages.push({ op: 'touch', type: 'begin', ...point(event.x, event.y) });
        } else if (event.action === 'move' && state.touching && (event.buttons & 1) === 1) {
          messages.push({ op: 'touch', type: 'move', ...point(event.x, event.y) });
        } else if ((event.action === 'up' && event.button === 0) || (event.action === 'move' && state.touching && (event.buttons & 1) === 0)) {
          // A move with no button held ends a touch whose `up` got lost outside the picture.
          if (state.touching) messages.push({ op: 'touch', type: 'end', ...point(event.x, event.y) });
          state.touching = false;
        }
        break;
      }
      case 'wheel': {
        // serve-sim takes the scroll distance as a share of the screen size.
        const { dx, dy } = deltaToPortrait(event.deltaX / Math.max(1, frame.width), event.deltaY / Math.max(1, frame.height), degrees);
        if (dx !== 0 || dy !== 0) messages.push({ op: 'scroll', dx, dy, ...point(event.x, event.y) });
        break;
      }
      case 'key': {
        // Everything goes out on key down as a whole press; auto-repeat arrives as more downs.
        if (event.action !== 'down') break;
        const { modifiers, key } = event;
        if (modifiers.ctrl) break;
        const named = usageForNamedKey(key);
        if (named !== null) {
          messages.push(...keyMessages(pressSequence({ usage: named, shift: modifiers.shift, alt: modifiers.alt }, { meta: modifiers.meta })));
          break;
        }
        if ([...key].length !== 1) break; // Shift, Meta, Dead and friends on their own
        if (modifiers.meta) {
          // Shortcuts (Cmd+A, Cmd+Z ...) by the base letter, without Shift/Option characters.
          const stroke = strokeForChar(key.toLowerCase(), layout);
          if (stroke) messages.push(...keyMessages(pressSequence({ usage: stroke.usage, shift: modifiers.shift }, { meta: true })));
          break;
        }
        const typed = typeText(key, layout);
        skippedChars += typed.skipped;
        messages.push(...keyMessages(typed.events));
        break;
      }
      case 'text': {
        const typed = typeText(event.text, layout);
        skippedChars += typed.skipped;
        messages.push(...keyMessages(typed.events));
        break;
      }
    }
  }
  return { messages, skippedChars };
};

/** serve-sim's binary format: one opcode byte, then JSON. */
export const OPCODE = {
  touch: 3,
  button: 4,
  key: 6,
  orientation: 7,
  scroll: 11,
} as const;

export const encodeHid = (opcode: number, payload: object): Uint8Array<ArrayBuffer> => {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const message = new Uint8Array(1 + json.length);
  message[0] = opcode;
  message.set(json, 1);
  return message;
};

export const encodeMessage = (message: HidMessage): Uint8Array<ArrayBuffer> => {
  switch (message.op) {
    case 'touch':
      return encodeHid(OPCODE.touch, { type: message.type, x: message.x, y: message.y });
    case 'scroll':
      return encodeHid(OPCODE.scroll, { dx: message.dx, dy: message.dy, x: message.x, y: message.y });
    case 'key':
      return encodeHid(OPCODE.key, message.event);
  }
};
