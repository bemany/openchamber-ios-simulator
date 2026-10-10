import { describe, expect, test } from 'bun:test';

import { HID, layoutFromKeyboards, pressSequence, strokeForChar, typeText } from '../src/service/keymap.ts';

describe('keymap', () => {
  test('German layout swaps y and z and puts @ on Option+L', () => {
    expect(strokeForChar('z', 'de')).toEqual({ usage: 0x1c });
    expect(strokeForChar('y', 'de')).toEqual({ usage: 0x1d });
    expect(strokeForChar('@', 'de')).toEqual({ usage: 0x0f, alt: true });
    expect(strokeForChar('-', 'de')).toEqual({ usage: 0x38 });
    expect(strokeForChar('ß', 'de')).toEqual({ usage: 0x2d });
    expect(strokeForChar('<', 'de')).toEqual({ usage: 0x35 });
    expect(strokeForChar('"', 'de')).toEqual({ usage: 0x1f, shift: true });
  });

  test('US layout keeps the ANSI positions', () => {
    expect(strokeForChar('z', 'us')).toEqual({ usage: 0x1d });
    expect(strokeForChar('@', 'us')).toEqual({ usage: 0x1f, shift: true });
    expect(strokeForChar('-', 'us')).toEqual({ usage: 0x2d });
    expect(strokeForChar('?', 'us')).toEqual({ usage: 0x38, shift: true });
    expect(strokeForChar('ä', 'us')).toBeNull();
  });

  test('detects the layout from AppleKeyboards', () => {
    expect(layoutFromKeyboards('(\n    "de_DE@sw=QWERTZ-German;hw=Automatic",\n    "en_US@sw=QWERTY"\n)')).toBe('de');
    expect(layoutFromKeyboards('(\n    "en_US@sw=QWERTY;hw=Automatic"\n)')).toBe('us');
    expect(layoutFromKeyboards('(\n    "fr_FR@sw=AZERTY-French"\n)')).toBe('us');
    expect(layoutFromKeyboards('')).toBe('us');
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

  test('typeText skips characters without a key and normalizes line ends', () => {
    const { events, skipped } = typeText('a\u{1F600}\r\n', 'de');
    expect(skipped).toBe(1);
    expect(events.filter((event) => event.type === 'down').map((event) => event.usage)).toEqual([0x04, HID.enter]);
  });
});
