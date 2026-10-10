// Reads a hardware keyboard layout out of a simulator: presses every key with
// no modifier, Shift, Option and Shift+Option into the Settings search field
// and reads the result back through the accessibility tree. Dead keys (accents
// that wait for the next key) are then combined with space and common letters.
// Writes `char -> key strokes` as JSON for scripts/build-layouts.ts.
//
//   bun scripts/discover-layout.ts <udid> <AppleKeyboards entry> <out.json> [--restart]
//   bun scripts/discover-layout.ts <udid> "fr_FR@sw=AZERTY-French;hw=Automatic" /tmp/fr.json --restart
//
// Use a throwaway simulator: this rewrites its keyboard setting, opens Settings
// and types into the search field. --restart shuts it down and boots it again
// so the new layout applies, and repairs its key input (serve-sim repair-input).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { ensureHelper, helperBase } from '../src/service/helper.ts';
import { encodeHid, OPCODE } from '../src/service/input.ts';

const [udid, keyboards, out] = process.argv.slice(2);
if (!udid || !keyboards || !out) throw new Error('usage: bun scripts/discover-layout.ts <udid> <AppleKeyboards entry> <out.json> [--restart]');
const restart = process.argv.includes('--restart');

const xcrun = (...args: string[]) => execFileSync('/usr/bin/xcrun', args, { encoding: 'utf8' });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

xcrun('simctl', 'spawn', udid, 'defaults', 'write', '-g', 'AppleKeyboards', '-array', keyboards);
if (restart) {
  xcrun('simctl', 'shutdown', udid);
  xcrun('simctl', 'boot', udid);
  try {
    xcrun('simctl', 'bootstatus', udid);
  } catch {
    // bootstatus can fail although the device came up; the helper check below decides
  }
  // After a boot, hardware key events only arrive once serve-sim repaired the
  // input route (it restarts SpringBoard); the helper starts afterwards.
  execFileSync('/opt/homebrew/bin/serve-sim', ['repair-input', '-d', udid], { stdio: 'ignore' });
  await sleep(6000);
}

const port = await ensureHelper(udid, null);
const socket = new WebSocket(`${helperBase(port, udid).replace('http:', 'ws:')}/ws`);
socket.binaryType = 'arraybuffer';
await new Promise<void>((resolve, reject) => {
  socket.onopen = () => resolve();
  socket.onerror = () => reject(new Error('HID socket failed'));
});
const key = async (usage: number, type: 'down' | 'up') => {
  socket.send(encodeHid(OPCODE.key, { type, usage }));
  await sleep(12);
};
const press = async (usage: number, modifiers: number[]) => {
  for (const modifier of modifiers) await key(modifier, 'down');
  await key(usage, 'down');
  await key(usage, 'up');
  for (const modifier of [...modifiers].reverse()) await key(modifier, 'up');
};

type Node = { type?: string; AXValue?: string | null; frame?: { x: number; y: number; width: number; height: number }; children?: Node[] };
const tree = async (): Promise<Node[]> => (await (await fetch(`${helperBase(port, udid)}/ax`)).json()) as Node[];
const find = (nodes: Node[], test: (node: Node) => boolean): Node | null => {
  for (const node of nodes) {
    if (test(node)) return node;
    const inner = node.children ? find(node.children, test) : null;
    if (inner) return inner;
  }
  return null;
};

// Settings, search field focused.
try {
  xcrun('simctl', 'terminate', udid, 'com.apple.Preferences');
} catch {
  // not running
}
xcrun('simctl', 'launch', udid, 'com.apple.Preferences');
await sleep(2500);
const nodes = await tree();
const screen = nodes[0]?.frame;
const field = find(nodes, (node) => node.type === 'TextField');
if (!screen || !field?.frame) throw new Error('No search field found in Settings');
const x = (field.frame.x + field.frame.width / 2) / screen.width;
const y = (field.frame.y + field.frame.height / 2) / screen.height;
socket.send(encodeHid(OPCODE.touch, { type: 'begin', x, y }));
await sleep(60);
socket.send(encodeHid(OPCODE.touch, { type: 'end', x, y }));
await sleep(1200);
const placeholder = field.AXValue ?? '';

const value = async (): Promise<string> => {
  const node = find(await tree(), (candidate) => candidate.type === 'TextField' || candidate.type === 'SearchField');
  const text = node?.AXValue ?? '';
  return text === placeholder ? '' : text;
};
const clear = async () => {
  for (let i = 0; i < 4; i += 1) await press(0x2a, []);
};

/**
 * Pressed first every time and dropped from the result: iOS capitalizes the
 * first letter in an empty field. Usage 0x1e is "1" (or "&" on AZERTY) and
 * never a dead key on the layouts in question.
 */
const PREFIX = 0x1e;
const SHIFT = 0xe1;
const ALT = 0xe2;
const SPACE = 0x2c;
const usages = [
  ...Array.from({ length: 0x27 - 0x04 + 1 }, (_, index) => 0x04 + index), // letters and digits
  0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x64,
];
const combos: Array<{ shift?: true; alt?: true; mods: number[] }> = [
  { mods: [] },
  { shift: true, mods: [SHIFT] },
  { alt: true, mods: [ALT] },
  { shift: true, alt: true, mods: [SHIFT, ALT] },
];
/** iOS turns straight quotes into curly ones in text fields; the key still types the straight one. */
const SMART: Record<string, string> = { '’': "'", '‘': "'", '“': '"', '”': '"' };

type Stroke = { usage: number; shift?: true; alt?: true };
/** Each character with the key presses that type it, fewest first. */
const table: Record<string, Stroke[]> = {};
const dead: Array<Stroke & { shows: string }> = [];
await clear();
for (const combo of combos) {
  for (const usage of usages) {
    await press(PREFIX, []);
    await press(usage, combo.mods);
    await press(SPACE, []);
    await sleep(60);
    const typed = [...(await value())].slice(1).join('');
    await clear();
    const stroke: Stroke = { usage, ...(combo.shift ? { shift: true } : {}), ...(combo.alt ? { alt: true } : {}) };
    if (typed.length === 2 && typed.endsWith(' ')) {
      const char = SMART[typed[0]!] ?? typed[0]!;
      // Keep the stroke with the fewest modifiers for a character reachable twice.
      if (!table[char]) table[char] = [stroke];
    } else if ([...typed].length === 1) {
      dead.push({ ...stroke, shows: typed }); // a dead key: it waits for the next key
    }
  }
}
// Dead keys: alone (with space) and combined with common letters.
const strokeOf = (char: string): Stroke | null => (table[char]?.length === 1 ? table[char]![0]! : null);
const modsOf = (stroke: Stroke) => [...(stroke.shift ? [SHIFT] : []), ...(stroke.alt ? [ALT] : [])];
const bases = [...'aeiouAEIOUnNcCyY'];
for (const deadKey of dead) {
  const deadStroke: Stroke = { usage: deadKey.usage, ...(deadKey.shift ? { shift: true } : {}), ...(deadKey.alt ? { alt: true } : {}) };
  if (!table[deadKey.shows]) table[deadKey.shows] = [deadStroke, { usage: SPACE }];
  for (const base of bases) {
    const baseStroke = strokeOf(base);
    if (!baseStroke) continue;
    await press(PREFIX, []);
    await press(deadKey.usage, modsOf(deadStroke));
    await press(baseStroke.usage, modsOf(baseStroke));
    await press(SPACE, []);
    await sleep(60);
    const typed = [...(await value())].slice(1).join('');
    await clear();
    // One composed character followed by the space: a new character reachable as dead key + letter.
    if ([...typed].length === 2 && typed.endsWith(' ') && typed[0] !== base && !table[typed[0]!]) table[typed[0]!] = [deadStroke, baseStroke];
  }
}

writeFileSync(out, `${JSON.stringify({ keyboards, table, dead }, null, 1)}\n`);
console.log(`${Object.keys(table).length} characters, ${dead.length} dead keys -> ${out}`);
socket.close();
process.exit(0);
