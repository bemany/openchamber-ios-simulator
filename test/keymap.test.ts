import { describe, expect, test } from 'bun:test';

import {
  HID,
  KEYBOARD_LAYOUTS,
  layoutFromKeyboards,
  layoutFromLocale,
  pressSequence,
  sequenceForChar,
  strokeForChar,
  typeText,
} from '../src/service/keymap.ts';

const downs = (text: string, layout: Parameters<typeof typeText>[1]) =>
  typeText(text, layout).events.filter((event) => event.type === 'down').map((event) => event.usage);

describe('keymap', () => {
  test('German layout (checked key by key on a simulator) swaps y and z and puts @ on Option+L', () => {
    expect(strokeForChar('z', 'de')).toEqual({ usage: 0x1c });
    expect(strokeForChar('y', 'de')).toEqual({ usage: 0x1d });
    expect(strokeForChar('@', 'de')).toEqual({ usage: 0x0f, alt: true });
    expect(strokeForChar('-', 'de')).toEqual({ usage: 0x38 });
    expect(strokeForChar('ß', 'de')).toEqual({ usage: 0x2d });
    expect(strokeForChar('<', 'de')).toEqual({ usage: 0x35 });
    expect(strokeForChar('"', 'de')).toEqual({ usage: 0x1f, shift: true });
  });

  test('dead keys: an accent alone is the dead key plus space, a composed letter is the dead key plus the letter', () => {
    expect(sequenceForChar('^', 'de')).toEqual([{ usage: 0x64 }, { usage: HID.space }]);
    expect(sequenceForChar('é', 'de')).toEqual([{ usage: 0x2e }, { usage: 0x08 }]);
    // A dead key is never offered as a single stroke for shortcuts.
    expect(strokeForChar('^', 'de')).toBeNull();
  });

  test('US layout keeps the ANSI positions', () => {
    expect(strokeForChar('z', 'us')).toEqual({ usage: 0x1d });
    expect(strokeForChar('@', 'us')).toEqual({ usage: 0x1f, shift: true });
    expect(strokeForChar('-', 'us')).toEqual({ usage: 0x2d });
    expect(strokeForChar('?', 'us')).toEqual({ usage: 0x38, shift: true });
  });

  test('French AZERTY swaps a/q and z/w and types digits with Shift', () => {
    expect(strokeForChar('a', 'fr')).toEqual({ usage: 0x14 });
    expect(strokeForChar('q', 'fr')).toEqual({ usage: 0x04 });
    expect(strokeForChar('z', 'fr')).toEqual({ usage: 0x1a });
    expect(strokeForChar('1', 'fr')).toEqual({ usage: 0x1e, shift: true });
    expect(strokeForChar('é', 'fr')).toEqual({ usage: 0x1f });
    expect(downs('azerty@é', 'fr')).toEqual([0x14, 0x1a, 0x08, 0x15, 0x17, 0x1c, 0x64, 0x1f]);
  });

  test('other layouts have their own keys', () => {
    expect(strokeForChar('ñ', 'es')).toEqual({ usage: 0x33 });
    expect(strokeForChar('£', 'gb')).toEqual({ usage: 0x20, shift: true });
    expect(strokeForChar('z', 'ch')).toEqual({ usage: 0x1c });
    expect(strokeForChar('ò', 'it')).toEqual({ usage: 0x33 });
    expect(KEYBOARD_LAYOUTS).toEqual(['ch', 'de', 'es', 'fr', 'gb', 'it', 'us']);
  });

  test('every layout types the printable ASCII range', () => {
    const ascii = Array.from({ length: 0x7e - 0x20 + 1 }, (_, index) => String.fromCharCode(0x20 + index)).join('');
    for (const layout of KEYBOARD_LAYOUTS) expect(typeText(ascii, layout).skipped).toBe(0);
  });

  test('detects the layout from AppleKeyboards, an explicit hw= name, or the locale', () => {
    expect(layoutFromKeyboards('(\n    "de_DE@sw=QWERTZ-German;hw=Automatic",\n    "en_US@sw=QWERTY"\n)')).toBe('de');
    expect(layoutFromKeyboards('(\n    "en_US@sw=QWERTY;hw=Automatic"\n)')).toBe('us');
    expect(layoutFromKeyboards('(\n    "fr_FR@sw=AZERTY-French;hw=Automatic"\n)')).toBe('fr');
    expect(layoutFromKeyboards('(\n    "de_CH@sw=QWERTZ-German;hw=Automatic"\n)')).toBe('ch');
    expect(layoutFromKeyboards('(\n    "en_US@sw=QWERTY;hw=British"\n)')).toBe('gb');
    expect(layoutFromKeyboards('(\n    "nl_NL@sw=QWERTY-Dutch;hw=Automatic"\n)')).toBe('us');
    // A fresh simulator has no AppleKeyboards entry: its locale decides.
    expect(layoutFromKeyboards('', 'de_DE')).toBe('de');
    expect(layoutFromKeyboards('', '')).toBe('us');
    expect(layoutFromLocale('fr_CA')).toBeNull();
    expect(layoutFromLocale('it_IT')).toBe('it');
  });

  test('a press releases modifiers in reverse order', () => {
    expect(pressSequence({ usage: 0x24, alt: true, shift: true }, { meta: true })).toEqual([
      { type: 'down', usage: HID.leftMeta },
      { type: 'down', usage: HID.leftShift },
      { type: 'down', usage: HID.leftAlt },
      { type: 'down', usage: 0x24 },
      { type: 'up', usage: 0x24 },
      { type: 'up', usage: HID.leftAlt },
      { type: 'up', usage: HID.leftShift },
      { type: 'up', usage: HID.leftMeta },
    ]);
  });

  test('a skipped character between two spaces leaves one space (iOS turns two into ". ")', () => {
    const spaces = (text: string) => downs(text, 'de').filter((usage) => usage === HID.space).length;
    expect(spaces('Hallo \u{1F44B} café')).toBe(1);
    expect(spaces('a \u{1F44B}')).toBe(1);
  });

  test('typeText skips characters without a key and normalizes line ends', () => {
    const { events, skipped } = typeText('a\u{1F600}\r\n', 'de');
    expect(skipped).toBe(1);
    expect(events.filter((event) => event.type === 'down').map((event) => event.usage)).toEqual([0x04, HID.enter]);
  });
});
