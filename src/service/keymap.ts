// Keyboard input for the simulator. serve-sim only takes USB HID usages; which
// character a usage produces is decided by the simulator's hardware keyboard
// layout. We translate characters through a table for that layout (Apple
// layouts, Option instead of AltGr), so "@" arrives as "@" whatever layout the
// viewer's own keyboard has.
import type { KeyboardLayout } from '../shared/state.ts';

export const HID = {
  enter: 0x28,
  escape: 0x29,
  backspace: 0x2a,
  tab: 0x2b,
  space: 0x2c,
  leftCtrl: 0xe0,
  leftShift: 0xe1,
  leftAlt: 0xe2,
  leftMeta: 0xe3,
} as const;

export type KeyStroke = { usage: number; shift?: boolean; alt?: boolean };

type Layout = Map<string, KeyStroke>;

const letter = (char: string): number => 0x04 + char.charCodeAt(0) - 'a'.charCodeAt(0);

const addPairs = (map: Layout, pairs: Array<[string, number, string]>) => {
  for (const [char, usage, upper] of pairs) {
    map.set(char, { usage });
    map.set(upper, { usage, shift: true });
  }
};

const base = (swapYZ: boolean, shiftedDigits: string): Layout => {
  const map: Layout = new Map();
  for (const char of 'abcdefghijklmnopqrstuvwxyz') {
    const usage = swapYZ && char === 'y' ? letter('z') : swapYZ && char === 'z' ? letter('y') : letter(char);
    map.set(char, { usage });
    map.set(char.toUpperCase(), { usage, shift: true });
  }
  const digits = '1234567890';
  for (let i = 0; i < digits.length; i += 1) {
    map.set(digits[i]!, { usage: 0x1e + i });
    map.set(shiftedDigits[i]!, { usage: 0x1e + i, shift: true });
  }
  map.set(' ', { usage: HID.space });
  map.set('\n', { usage: HID.enter });
  map.set('\t', { usage: HID.tab });
  return map;
};

/** German (Apple ISO). Checked key by key on an iOS 27 simulator set to `de_DE`. */
const german = (): Layout => {
  const map = base(true, '!"§$%&/()=');
  addPairs(map, [
    ['ß', 0x2d, '?'],
    ['ü', 0x2f, 'Ü'],
    ['+', 0x30, '*'],
    ['#', 0x32, "'"],
    ['ö', 0x33, 'Ö'],
    ['ä', 0x34, 'Ä'],
    [',', 0x36, ';'],
    ['.', 0x37, ':'],
    ['-', 0x38, '_'],
    // Apple ISO keyboards swap these two usages: 0x35 is "<", 0x64 is "^".
    ['<', 0x35, '>'],
    ['^', 0x64, '°'],
  ]);
  const option: Array<[string, KeyStroke]> = [
    ['@', { usage: letter('l'), alt: true }],
    ['€', { usage: letter('e'), alt: true }],
    ['[', { usage: 0x22, alt: true }],
    [']', { usage: 0x23, alt: true }],
    ['|', { usage: 0x24, alt: true }],
    ['{', { usage: 0x25, alt: true }],
    ['}', { usage: 0x26, alt: true }],
    ['\\', { usage: 0x24, alt: true, shift: true }],
  ];
  for (const [char, stroke] of option) map.set(char, stroke);
  return map;
};

/** US (ANSI). */
const us = (): Layout => {
  const map = base(false, '!@#$%^&*()');
  addPairs(map, [
    ['-', 0x2d, '_'],
    ['=', 0x2e, '+'],
    ['[', 0x2f, '{'],
    [']', 0x30, '}'],
    ['\\', 0x31, '|'],
    [';', 0x33, ':'],
    ["'", 0x34, '"'],
    ['`', 0x35, '~'],
    [',', 0x36, '<'],
    ['.', 0x37, '>'],
    ['/', 0x38, '?'],
  ]);
  return map;
};

const LAYOUTS: Record<KeyboardLayout, Layout> = { de: german(), us: us() };

/**
 * The layout for a simulator's first `AppleKeyboards` entry, for example
 * `de_DE@sw=QWERTZ-German;hw=Automatic`. Unknown layouts fall back to `us`.
 */
export const layoutFromKeyboards = (keyboards: string): KeyboardLayout => {
  const first = /"?([a-z]{2})(?:[_-][A-Za-z]+)?@/.exec(keyboards);
  return first?.[1] === 'de' ? 'de' : 'us';
};

/** The key stroke for one character, or `null` when the layout has no key for it. */
export const strokeForChar = (char: string, layout: KeyboardLayout = 'us'): KeyStroke | null =>
  LAYOUTS[layout].get(char) ?? null;

/** Non-printing keys by `KeyboardEvent.key`. */
const NAMED_KEYS: Record<string, number> = {
  Enter: HID.enter,
  Escape: HID.escape,
  Backspace: HID.backspace,
  Tab: HID.tab,
  Delete: 0x4c,
  Home: 0x4a,
  PageUp: 0x4b,
  End: 0x4d,
  PageDown: 0x4e,
  ArrowRight: 0x4f,
  ArrowLeft: 0x50,
  ArrowDown: 0x51,
  ArrowUp: 0x52,
};

export const usageForNamedKey = (key: string): number | null => NAMED_KEYS[key] ?? null;

export type HidKeyEvent = { type: 'down' | 'up'; usage: number };

/** One full key press with modifiers: down in order, up in reverse. */
export const pressSequence = (stroke: KeyStroke, extra: { meta?: boolean } = {}): HidKeyEvent[] => {
  const modifiers: number[] = [];
  if (extra.meta) modifiers.push(HID.leftMeta);
  if (stroke.shift) modifiers.push(HID.leftShift);
  if (stroke.alt) modifiers.push(HID.leftAlt);
  return [
    ...modifiers.map((usage): HidKeyEvent => ({ type: 'down', usage })),
    { type: 'down', usage: stroke.usage },
    { type: 'up', usage: stroke.usage },
    ...modifiers.reverse().map((usage): HidKeyEvent => ({ type: 'up', usage })),
  ];
};

/** Text as key presses. Characters without a key (emoji, accents) are skipped and counted. */
export const typeText = (text: string, layout: KeyboardLayout = 'us'): { events: HidKeyEvent[]; skipped: number } => {
  const events: HidKeyEvent[] = [];
  let skipped = 0;
  for (const char of text.replace(/\r\n?/g, '\n')) {
    const stroke = strokeForChar(char, layout);
    if (!stroke) {
      skipped += 1;
      continue;
    }
    events.push(...pressSequence(stroke));
  }
  return { events, skipped };
};
