import { describe, expect, test } from 'bun:test';
import type { SurfaceInputEvent, SurfaceModifiers } from '@openchamber/sdk';

import { encodeMessage, translateInput } from '../src/service/input.ts';
import { HID } from '../src/service/keymap.ts';

const none: SurfaceModifiers = { alt: false, ctrl: false, meta: false, shift: false };
const pointer = (action: 'down' | 'up' | 'move', x: number, y: number, buttons: number): SurfaceInputEvent => ({
  type: 'pointer',
  action,
  x,
  y,
  button: action === 'move' ? -1 : 0,
  buttons,
  modifiers: none,
});

describe('translateInput', () => {
  test('a click becomes a normalized touch begin and end', () => {
    const state = { touching: false };
    const { messages } = translateInput([pointer('down', 603, 1311, 1), pointer('up', 603, 1311, 0)], { width: 1206, height: 2622 }, state);
    expect(messages).toEqual([
      { op: 'touch', type: 'begin', x: 0.5, y: 0.5 },
      { op: 'touch', type: 'end', x: 0.5, y: 0.5 },
    ]);
    expect(state.touching).toBe(false);
  });

  test('moves only count while the button is held, and a buttonless move ends a lost touch', () => {
    const state = { touching: false };
    const frame = { width: 100, height: 100 };
    expect(translateInput([pointer('move', 10, 10, 0)], frame, state).messages).toEqual([]);
    const drag = translateInput([pointer('down', 10, 10, 1), pointer('move', 10, 50, 1), pointer('move', 10, 90, 0)], frame, state);
    expect(drag.messages.map((message) => (message.op === 'touch' ? message.type : message.op))).toEqual(['begin', 'move', 'end']);
  });

  test('clamps points outside the picture', () => {
    const { messages } = translateInput([pointer('down', -5, 500, 1)], { width: 100, height: 100 }, { touching: false });
    expect(messages[0]).toEqual({ op: 'touch', type: 'begin', x: 0, y: 1 });
  });

  test('maps clicks on a picture rotated 90 degrees back to portrait', () => {
    // Landscape picture 200x100: its top-left corner is the portrait bottom-left.
    const { messages } = translateInput([pointer('down', 0, 0, 1)], { width: 200, height: 100 }, { touching: false }, { degrees: 90 });
    expect(messages[0]).toEqual({ op: 'touch', type: 'begin', x: 0, y: 1 });
  });

  test('wheel becomes a scroll by share of the screen', () => {
    const wheel: SurfaceInputEvent = { type: 'wheel', x: 50, y: 50, deltaX: 0, deltaY: 25, modifiers: none };
    expect(translateInput([wheel], { width: 100, height: 100 }, { touching: false }).messages).toEqual([
      { op: 'scroll', dx: 0, dy: 0.25, x: 0.5, y: 0.5 },
    ]);
  });

  test('typed characters go through the simulator layout, key ups are ignored', () => {
    const key = (k: string, modifiers: SurfaceModifiers = none, action: 'down' | 'up' = 'down'): SurfaceInputEvent => ({
      type: 'key',
      action,
      key: k,
      code: '',
      modifiers,
    });
    const downs = (events: SurfaceInputEvent[]) =>
      translateInput(events, { width: 1, height: 1 }, { touching: false }, { layout: 'de' })
        .messages.flatMap((message) => (message.op === 'key' && message.event.type === 'down' ? [message.event.usage] : []));
    expect(downs([key('z'), key('z', none, 'up')])).toEqual([0x1c]);
    expect(downs([key('Enter')])).toEqual([HID.enter]);
    expect(downs([key('a', { ...none, meta: true })])).toEqual([HID.leftMeta, 0x04]);
    expect(downs([key('c', { ...none, ctrl: true })])).toEqual([]);
    expect(downs([key('Shift')])).toEqual([]);
  });

  test('pasted text counts characters it cannot type', () => {
    const { skippedChars, messages } = translateInput([{ type: 'text', text: 'hi \u{1F44B}' }], { width: 1, height: 1 }, { touching: false });
    expect(skippedChars).toBe(1);
    // h, i and space: one down and one up each
    expect(messages).toHaveLength(6);
  });

  test('encodes serve-sim binary messages', () => {
    const bytes = encodeMessage({ op: 'touch', type: 'begin', x: 0.25, y: 0.75 });
    expect(bytes[0]).toBe(3);
    expect(JSON.parse(new TextDecoder().decode(bytes.subarray(1)))).toEqual({ type: 'begin', x: 0.25, y: 0.75 });
  });
});
