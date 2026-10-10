// Keyboard input for the simulator. serve-sim only takes USB HID usages; which
// character a usage produces is decided by the simulator's hardware keyboard
// layout. Characters are typed through a table for that layout, so "@" arrives
// as "@" whatever layout the viewer's own keyboard has. The tables come from
// macOS's own layouts (scripts/build-layouts.ts), which iOS shares; the German
// one was checked key by key against a simulator (scripts/discover-layout.ts).
import type { KeyboardLayout } from '../shared/state.ts';
import { LAYOUT_STROKES } from './layouts.generated.ts';

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

/** "31s" -> usage 31 (0x1f) with Shift; "15a" -> usage 15 with Option. */
const parseStroke = (text: string): KeyStroke => {
  const match = /^(\d+)(s?)(a?)$/.exec(text);
  if (!match) throw new Error(`bad stroke ${text}`);
  return { usage: Number(match[1]), ...(match[2] ? { shift: true } : {}), ...(match[3] ? { alt: true } : {}) };
};

type Table = Map<string, KeyStroke[]>;

const buildTable = (strokes: Record<string, string>): Table => {
  const table: Table = new Map(Object.entries(strokes).map(([char, sequence]) => [char, sequence.split(' ').map(parseStroke)]));
  table.set(' ', [{ usage: HID.space }]);
  table.set('\n', [{ usage: HID.enter }]);
  table.set('\t', [{ usage: HID.tab }]);
  return table;
};

const TABLES = new Map<KeyboardLayout, Table>();
const tableFor = (layout: KeyboardLayout): Table => {
  let table = TABLES.get(layout);
  if (!table) {
    table = buildTable(LAYOUT_STROKES[layout]);
    TABLES.set(layout, table);
  }
  return table;
};

/** Every layout with a table. */
export const KEYBOARD_LAYOUTS = Object.keys(LAYOUT_STROKES).sort() as KeyboardLayout[];

/** `hw=` names in `AppleKeyboards` entries, for layouts set explicitly. */
const HARDWARE_NAMES: Record<string, KeyboardLayout> = {
  German: 'de',
  'U.S.': 'us',
  US: 'us',
  British: 'gb',
  French: 'fr',
  Spanish: 'es',
  'Spanish - ISO': 'es',
  'Swiss German': 'ch',
  Italian: 'it',
  'Italian - Pro': 'it',
};

/** A locale such as `de_CH` or `en-GB` to the layout iOS picks for it, or `null`. */
export const layoutFromLocale = (locale: string): KeyboardLayout | null => {
  const match = /^([a-z]{2,3})(?:[_-]([A-Z]{2}))?/.exec(locale.trim());
  if (!match) return null;
  const [, language, region] = match;
  if (language === 'de') return region === 'CH' ? 'ch' : 'de';
  if (language === 'en') return region === 'GB' ? 'gb' : 'us';
  if (language === 'fr') return region === 'FR' || !region ? 'fr' : null; // Canadian, Belgian and Swiss French differ
  if (language === 'es') return region === 'ES' || !region ? 'es' : null; // Latin American Spanish differs
  if (language === 'it') return 'it';
  return null;
};

/**
 * The layout for a simulator's first `AppleKeyboards` entry (for example
 * `de_DE@sw=QWERTZ-German;hw=Automatic`): an explicit `hw=` name wins, else
 * the entry's locale. Without an entry the device locale decides (a fresh
 * simulator has none). Anything else is typed as `us`.
 */
export const layoutFromKeyboards = (keyboards: string, locale = ''): KeyboardLayout => {
  const first = /"?([a-zA-Z_-]+)@([^"\n]*)/.exec(keyboards);
  if (first) {
    const hardware = /hw=([^;"]+)/.exec(first[2] ?? '')?.[1]?.trim();
    if (hardware && hardware !== 'Automatic' && HARDWARE_NAMES[hardware]) return HARDWARE_NAMES[hardware];
    return layoutFromLocale(first[1]!) ?? 'us';
  }
  return layoutFromLocale(locale) ?? 'us';
};

/** The key strokes for one character, or `null` when the layout has no way to type it. */
export const sequenceForChar = (char: string, layout: KeyboardLayout = 'us'): KeyStroke[] | null => tableFor(layout).get(char) ?? null;

/** The single key stroke for one character (no dead key), or `null`. Used for shortcuts. */
export const strokeForChar = (char: string, layout: KeyboardLayout = 'us'): KeyStroke | null => {
  const sequence = sequenceForChar(char, layout);
  return sequence?.length === 1 ? sequence[0]! : null;
};

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

/** Text as key presses (a dead key and its follower for composed characters). Characters without keys are skipped and counted. */
export const typeText = (text: string, layout: KeyboardLayout = 'us'): { events: HidKeyEvent[]; skipped: number } => {
  const events: HidKeyEvent[] = [];
  let skipped = 0;
  const chars = [...text.replace(/\r\n?/g, '\n')];
  let typed = ''; // the last character actually typed
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    const sequence = sequenceForChar(char, layout);
    if (!sequence) {
      skipped += 1;
      // "Hallo 👋 café" would become "Hallo  café", and iOS turns a double space into ". ": drop one.
      if (typed === ' ' && chars[index + 1] === ' ') index += 1;
      continue;
    }
    for (const stroke of sequence) events.push(...pressSequence(stroke));
    typed = char;
  }
  return { events, skipped };
};
