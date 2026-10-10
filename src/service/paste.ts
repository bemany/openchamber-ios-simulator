// Moving text between the simulator's pasteboard and the viewer. `simctl
// pbcopy` often has no effect without Simulator.app (see the OpenSpec change
// simulator-clipboard), so every write is read back before it is trusted, and
// pasting falls back to typing. Clipboard text is never logged or stored.
import type { SurfaceInputEvent } from '@openchamber/sdk';

import type { KeyboardLayout } from '../shared/state.ts';
import type { ExecResult } from './exec.ts';
import type { HidMessage } from './input.ts';
import { pressSequence, strokeForChar, typeText } from './keymap.ts';

type Runner = (args: string[], options?: { timeout?: number; input?: string }) => Promise<ExecResult>;

export const createPasteboard = (simctl: Runner) => ({
  /** The pasteboard's text, or `null` when it is empty or cannot be read. */
  async read(udid: string): Promise<string | null> {
    const result = await simctl(['simctl', 'pbpaste', udid], { timeout: 5_000 });
    return result.ok && result.stdout.length > 0 ? result.stdout : null;
  },
  /** Writes `text` and reports whether reading it back gives exactly that text. */
  async write(udid: string, text: string): Promise<boolean> {
    const written = await simctl(['simctl', 'pbcopy', udid], { timeout: 5_000, input: text });
    if (!written.ok) return false;
    const back = await simctl(['simctl', 'pbpaste', udid], { timeout: 5_000 });
    return back.ok && back.stdout === text;
  },
});

export type Pasteboard = ReturnType<typeof createPasteboard>;

/** Cmd+V for the layout (V is not on the same key everywhere). */
export const pasteChord = (layout: KeyboardLayout): HidMessage[] =>
  pressSequence(strokeForChar('v', layout) ?? { usage: 0x19 }, { meta: true }).map((event) => ({ op: 'key', event }));

export type PasteDeps = {
  layout: KeyboardLayout;
  /** Device to paste into; `null` disables the pasteboard path. */
  udid: string | null;
  pasteboard: Pick<Pasteboard, 'write'>;
  /** Turns ordinary events into HID messages (input.ts `translateInput` with the frame and view bound). */
  translate: (events: SurfaceInputEvent[]) => { messages: HidMessage[]; skippedChars: number; buttons: unknown[] };
  send: (messages: HidMessage[]) => Promise<void>;
};

/**
 * Sends an input batch in order. Pasted text that the layout cannot type in
 * full goes through the simulator's pasteboard and Cmd+V when the write is
 * confirmed; otherwise it is typed and the missing characters are counted.
 */
export const sendInput = async (events: SurfaceInputEvent[], deps: PasteDeps): Promise<{ skippedChars: number; buttons: unknown[]; pasted: number }> => {
  let skippedChars = 0;
  let pasted = 0;
  const buttons: unknown[] = [];
  let chunk: SurfaceInputEvent[] = [];
  const flush = async () => {
    if (chunk.length === 0) return;
    const result = deps.translate(chunk);
    chunk = [];
    skippedChars += result.skippedChars;
    buttons.push(...result.buttons);
    await deps.send(result.messages);
  };
  for (const event of events) {
    if (event.type === 'text' && deps.udid && typeText(event.text, deps.layout).skipped > 0 && (await deps.pasteboard.write(deps.udid, event.text))) {
      await flush();
      await deps.send(pasteChord(deps.layout));
      pasted += 1;
      continue;
    }
    chunk.push(event);
  }
  await flush();
  return { skippedChars, buttons, pasted };
};
