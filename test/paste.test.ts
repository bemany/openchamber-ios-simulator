import { describe, expect, test } from 'bun:test';
import type { SurfaceInputEvent } from '@openchamber/sdk';

import type { ExecResult } from '../src/service/exec.ts';
import { translateInput, type HidMessage } from '../src/service/input.ts';
import { HID } from '../src/service/keymap.ts';
import { createPasteboard, pasteChord, sendInput } from '../src/service/paste.ts';

/** A fake simctl pasteboard: `works` decides whether pbcopy really stores the text. */
const fakeSimctl = (works: boolean) => {
  let stored = '';
  const calls: string[] = [];
  const runner = async (args: string[], options: { input?: string } = {}): Promise<ExecResult> => {
    calls.push(args[1]!);
    if (args[1] === 'pbcopy') {
      if (works) stored = options.input ?? '';
      return { ok: true, stdout: '' };
    }
    if (args[1] === 'pbpaste') return { ok: true, stdout: stored };
    return { ok: false, missing: false, stderr: 'unknown' };
  };
  return { runner, calls };
};

describe('pasteboard', () => {
  test('a write counts only when reading it back gives the same text', async () => {
    expect(await createPasteboard(fakeSimctl(true).runner).write('D', 'café 👋')).toBe(true);
    expect(await createPasteboard(fakeSimctl(false).runner).write('D', 'café 👋')).toBe(false);
  });

  test('an empty pasteboard reads as null, never as empty text', async () => {
    expect(await createPasteboard(fakeSimctl(false).runner).read('D')).toBeNull();
    const { runner } = fakeSimctl(true);
    const pasteboard = createPasteboard(runner);
    await pasteboard.write('D', 'hello');
    expect(await pasteboard.read('D')).toBe('hello');
  });

  test('Cmd+V uses the layout\'s V key', () => {
    const downs = (messages: HidMessage[]) => messages.flatMap((m) => (m.op === 'key' && m.event.type === 'down' ? [m.event.usage] : []));
    expect(downs(pasteChord('de'))).toEqual([HID.leftMeta, 0x19]);
    expect(downs(pasteChord('fr'))).toEqual([HID.leftMeta, 0x19]);
  });
});

describe('sending pasted text', () => {
  const run = async (text: string, works: boolean) => {
    const sent: HidMessage[][] = [];
    const { runner, calls } = fakeSimctl(works);
    const events: SurfaceInputEvent[] = [{ type: 'text', text }];
    const result = await sendInput(events, {
      layout: 'de',
      udid: 'D',
      pasteboard: createPasteboard(runner),
      translate: (batch) => translateInput(batch, { width: 1, height: 1 }, { touching: false }, { layout: 'de' }),
      send: async (messages) => {
        sent.push(messages);
      },
    });
    return { result, sent: sent.flat(), calls };
  };

  test('text the layout can type is typed, the pasteboard is not touched', async () => {
    const { result, calls } = await run('Grüße', true);
    expect(result).toMatchObject({ skippedChars: 0, pasted: 0 });
    expect(calls).toEqual([]);
  });

  test('text with an emoji goes through a confirmed pasteboard write and Cmd+V', async () => {
    const { result, sent } = await run('Hallo 👋 café', true);
    expect(result).toMatchObject({ skippedChars: 0, pasted: 1 });
    expect(sent).toEqual(pasteChord('de'));
  });

  test('when the write is not confirmed, the text is typed and the emoji counted as skipped', async () => {
    const { result, sent } = await run('Hallo 👋 café', false);
    expect(result).toMatchObject({ skippedChars: 1, pasted: 0 });
    expect(sent.length).toBeGreaterThan(20);
  });
});
