// src/service/main.ts
import http2 from "node:http";
// node_modules/@openchamber/sdk/dist/scrollbar-style.js
var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
var GUEST_SCROLLBAR_CSS = `
:root {
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 40%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 65%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
function installGuestScrollbarActivity(doc) {
  const root = doc.documentElement;
  if (root.hasAttribute("data-oc-scrollbar-activity"))
    return;
  root.setAttribute("data-oc-scrollbar-activity", "");
  const timers = new WeakMap;
  doc.addEventListener("scroll", (event) => {
    const target = event.target === doc ? root : event.target;
    if (!(target instanceof Element))
      return;
    if (!target.hasAttribute("data-oc-scrolling"))
      target.setAttribute("data-oc-scrolling", "");
    const pending = timers.get(target);
    if (pending !== undefined)
      clearTimeout(pending);
    timers.set(target, setTimeout(() => {
      timers.delete(target);
      target.removeAttribute("data-oc-scrolling");
    }, 1000));
  }, { capture: true, passive: true });
}
var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;
// node_modules/@openchamber/sdk/dist/file-editor.js
var patternExpressions = new Map;
// node_modules/@openchamber/sdk/dist/contract.js
var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
var HOST_REQUEST_ERROR_CODES = [
  "HOST_UNAVAILABLE",
  "HOST_TIMEOUT",
  "HOST_REJECTED",
  "DISCONNECTED",
  "DISABLED",
  "BAD_PATH",
  "NO_INTEGRATION",
  "NO_SERVICE",
  "SERVICE_FAILED",
  "NO_SESSION",
  "SESSION_BUSY",
  "NOT_GRANTED",
  "NO_DIRECTORY",
  "NOT_FOUND",
  "FILE_TOO_LARGE",
  "DENIED",
  "NO_MODEL",
  "MODEL_FAILED",
  "UNSUPPORTED"
];
var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);
var HOST_PUSH_TYPES = new Set([
  "workspace",
  "shells",
  "ready",
  "directory",
  "session",
  "connection",
  "settings",
  "session-lifecycle",
  "item",
  "resolve",
  "action",
  "status-control-event",
  "popover-closed",
  "file-open",
  "file-snapshot",
  "file-saved"
]);
// node_modules/@openchamber/sdk/dist/service-providers.js
var BROWSER_CONTROL_ACTIONS = [
  "browser.open",
  "browser.snapshot",
  "browser.click",
  "browser.type",
  "browser.scroll",
  "browser.back",
  "browser.forward",
  "browser.inspect",
  "browser.capture",
  "browser.resize"
];
var BROWSER_PROVIDER_IDLE_MS = 10 * 60000;
var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);
// node_modules/@openchamber/sdk/dist/service-surface.js
var SURFACE_SEQ_HEADER = "x-surface-seq";
var SURFACE_WIDTH_HEADER = "x-surface-width";
var SURFACE_HEIGHT_HEADER = "x-surface-height";
var SURFACE_TITLE_HEADER = "x-surface-title";
var SURFACE_FRAME_SEQ_HEADER = "x-surface-frame-seq";
var SURFACE_FRAME_WAIT_MS = 25000;
var SURFACE_INPUT_BATCH_MAX = 256;
var SURFACE_TEXT_MAX = 64000;
var SURFACE_CONTROLLERS = ["none", "agent", "user"];
var isFiniteNumber = (value) => Number(value) === value && Number.isFinite(value);
var isBool = (value) => value === true || value === false;
var isText = (value) => String(value) === value;
var readModifiers = (value) => {
  if (Object(value) !== value || value === null)
    return null;
  const wire = value;
  if (!isBool(wire.alt) || !isBool(wire.ctrl) || !isBool(wire.meta) || !isBool(wire.shift))
    return null;
  return { alt: wire.alt, ctrl: wire.ctrl, meta: wire.meta, shift: wire.shift };
};
var readEvent = (value) => {
  if (value.type === "text") {
    if (!isText(value.text) || value.text.length > SURFACE_TEXT_MAX)
      return null;
    return { type: "text", text: value.text };
  }
  const modifiers = readModifiers(value.modifiers);
  if (!modifiers)
    return null;
  if (value.type === "pointer") {
    if (value.action !== "down" && value.action !== "up" && value.action !== "move")
      return null;
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.button) || !isFiniteNumber(value.buttons))
      return null;
    return { type: "pointer", action: value.action, x: value.x, y: value.y, button: value.button, buttons: value.buttons, modifiers };
  }
  if (value.type === "wheel") {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.deltaX) || !isFiniteNumber(value.deltaY))
      return null;
    return { type: "wheel", x: value.x, y: value.y, deltaX: value.deltaX, deltaY: value.deltaY, modifiers };
  }
  if (value.type === "key") {
    if (value.action !== "down" && value.action !== "up")
      return null;
    if (!isText(value.key) || !isText(value.code) || value.key.length > 64 || value.code.length > 64)
      return null;
    return { type: "key", action: value.action, key: value.key, code: value.code, modifiers };
  }
  return null;
};
var readSurfaceInputBatch = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Object(parsed) !== parsed || parsed === null || !Array.isArray(parsed.events))
    return null;
  if (parsed.events.length > SURFACE_INPUT_BATCH_MAX)
    return null;
  const events = [];
  for (const item of parsed.events) {
    if (Object(item) !== item || item === null)
      return null;
    const event = readEvent(item);
    if (!event)
      return null;
    events.push(event);
  }
  return { events };
};
var CONTROLLERS = new Set(SURFACE_CONTROLLERS);
var readSurfaceControlNotice = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Object(parsed) !== parsed || parsed === null)
    return null;
  const { controller, viewer } = parsed;
  if (!isText(controller) || !CONTROLLERS.has(controller))
    return null;
  const notice = { controller };
  if (controller === "user" && isText(viewer) && viewer.length > 0)
    notice.viewer = viewer;
  return notice;
};
// src/service/keymap.ts
var HID = {
  enter: 40,
  escape: 41,
  backspace: 42,
  tab: 43,
  space: 44,
  leftCtrl: 224,
  leftShift: 225,
  leftAlt: 226,
  leftMeta: 227
};
var letter = (char) => 4 + char.charCodeAt(0) - 97;
var addPairs = (map, pairs) => {
  for (const [char, usage, upper] of pairs) {
    map.set(char, { usage });
    map.set(upper, { usage, shift: true });
  }
};
var base = (swapYZ, shiftedDigits) => {
  const map = new Map;
  for (const char of "abcdefghijklmnopqrstuvwxyz") {
    const usage = swapYZ && char === "y" ? letter("z") : swapYZ && char === "z" ? letter("y") : letter(char);
    map.set(char, { usage });
    map.set(char.toUpperCase(), { usage, shift: true });
  }
  const digits = "1234567890";
  for (let i = 0;i < digits.length; i += 1) {
    map.set(digits[i], { usage: 30 + i });
    map.set(shiftedDigits[i], { usage: 30 + i, shift: true });
  }
  map.set(" ", { usage: HID.space });
  map.set(`
`, { usage: HID.enter });
  map.set("\t", { usage: HID.tab });
  return map;
};
var german = () => {
  const map = base(true, '!"§$%&/()=');
  addPairs(map, [
    ["ß", 45, "?"],
    ["ü", 47, "Ü"],
    ["+", 48, "*"],
    ["#", 50, "'"],
    ["ö", 51, "Ö"],
    ["ä", 52, "Ä"],
    [",", 54, ";"],
    [".", 55, ":"],
    ["-", 56, "_"],
    ["<", 53, ">"],
    ["^", 100, "°"]
  ]);
  const option = [
    ["@", { usage: letter("l"), alt: true }],
    ["€", { usage: letter("e"), alt: true }],
    ["[", { usage: 34, alt: true }],
    ["]", { usage: 35, alt: true }],
    ["|", { usage: 36, alt: true }],
    ["{", { usage: 37, alt: true }],
    ["}", { usage: 38, alt: true }],
    ["\\", { usage: 36, alt: true, shift: true }]
  ];
  for (const [char, stroke] of option)
    map.set(char, stroke);
  return map;
};
var us = () => {
  const map = base(false, "!@#$%^&*()");
  addPairs(map, [
    ["-", 45, "_"],
    ["=", 46, "+"],
    ["[", 47, "{"],
    ["]", 48, "}"],
    ["\\", 49, "|"],
    [";", 51, ":"],
    ["'", 52, '"'],
    ["`", 53, "~"],
    [",", 54, "<"],
    [".", 55, ">"],
    ["/", 56, "?"]
  ]);
  return map;
};
var LAYOUTS = { de: german(), us: us() };
var layoutFromKeyboards = (keyboards) => {
  const first = /"?([a-z]{2})(?:[_-][A-Za-z]+)?@/.exec(keyboards);
  return first?.[1] === "de" ? "de" : "us";
};
var strokeForChar = (char, layout = "us") => LAYOUTS[layout].get(char) ?? null;
var NAMED_KEYS = {
  Enter: HID.enter,
  Escape: HID.escape,
  Backspace: HID.backspace,
  Tab: HID.tab,
  Delete: 76,
  Home: 74,
  PageUp: 75,
  End: 77,
  PageDown: 78,
  ArrowRight: 79,
  ArrowLeft: 80,
  ArrowDown: 81,
  ArrowUp: 82
};
var usageForNamedKey = (key) => NAMED_KEYS[key] ?? null;
var pressSequence = (stroke, extra = {}) => {
  const modifiers = [];
  if (extra.meta)
    modifiers.push(HID.leftMeta);
  if (stroke.shift)
    modifiers.push(HID.leftShift);
  if (stroke.alt)
    modifiers.push(HID.leftAlt);
  return [
    ...modifiers.map((usage) => ({ type: "down", usage })),
    { type: "down", usage: stroke.usage },
    { type: "up", usage: stroke.usage },
    ...modifiers.reverse().map((usage) => ({ type: "up", usage }))
  ];
};
var typeText = (text, layout = "us") => {
  const events = [];
  let skipped = 0;
  for (const char of text.replace(/\r\n?/g, `
`)) {
    const stroke = strokeForChar(char, layout);
    if (!stroke) {
      skipped += 1;
      continue;
    }
    events.push(...pressSequence(stroke));
  }
  return { events, skipped };
};

// src/service/rotate.ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/service/exec.ts
import { execFile } from "node:child_process";
import { dirname } from "node:path";
var childEnv = () => {
  const extra = ["/opt/homebrew/bin", "/usr/local/bin", dirname(process.execPath)];
  const path = [...(process.env.PATH ?? "").split(":").filter(Boolean)];
  for (const dir of extra)
    if (!path.includes(dir))
      path.push(dir);
  return { ...process.env, PATH: path.join(":") };
};
var run = async (commands, args, options = {}) => {
  let last = { ok: false, missing: true, stderr: "" };
  for (const command of commands) {
    last = await new Promise((resolve) => {
      const child = execFile(command, args, { timeout: options.timeout ?? 15000, env: childEnv(), maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (!error)
          resolve({ ok: true, stdout });
        else
          resolve({ ok: false, missing: "code" in error && error.code === "ENOENT", stderr: String(stderr || error.message) });
      });
      if (options.input !== undefined)
        child.stdin?.end(options.input);
    });
    if (last.ok || !last.missing)
      return last;
  }
  return last;
};
var XCRUN = ["/usr/bin/xcrun", "xcrun"];
var SERVE_SIM = ["/opt/homebrew/bin/serve-sim", "/usr/local/bin/serve-sim", "serve-sim"];

// src/service/rotate.ts
var rotationFor = (orientation) => {
  switch (orientation) {
    case "landscape_left":
      return 90;
    case "landscape_right":
      return 270;
    case "portrait_upside_down":
      return 180;
    default:
      return 0;
  }
};
var rotatedSize = (size, degrees) => degrees === 90 || degrees === 270 ? { width: size.height, height: size.width } : { ...size };
var toPortrait = (u, v, degrees) => {
  switch (degrees) {
    case 90:
      return { x: v, y: 1 - u };
    case 270:
      return { x: 1 - v, y: u };
    case 180:
      return { x: 1 - u, y: 1 - v };
    default:
      return { x: u, y: v };
  }
};
var deltaToPortrait = (du, dv, degrees) => {
  switch (degrees) {
    case 90:
      return { dx: dv, dy: -du };
    case 270:
      return { dx: -dv, dy: du };
    case 180:
      return { dx: -du, dy: -dv };
    default:
      return { dx: du, dy: dv };
  }
};
var SIPS = ["/usr/bin/sips", "sips"];
var rotateJpeg = async (jpeg, degrees) => {
  if (degrees === 0)
    return jpeg;
  const dir = await mkdtemp(join(tmpdir(), "oc-ios-sim-rot-"));
  try {
    const input = join(dir, "in.jpg");
    const output = join(dir, "out.jpg");
    await writeFile(input, jpeg);
    const result = await run(SIPS, ["-r", String(degrees), input, "--out", output], { timeout: 5000 });
    if (!result.ok)
      throw new Error(result.stderr.trim() || "sips failed");
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

// src/service/input.ts
var clamp01 = (value) => value < 0 ? 0 : value > 1 ? 1 : value;
var keyMessages = (events) => events.map((event) => ({ op: "key", event }));
var translateInput = (events, frame, state, options = {}) => {
  const degrees = options.degrees ?? 0;
  const layout = options.layout ?? "us";
  const messages = [];
  let skippedChars = 0;
  const point = (x, y) => {
    const portrait = toPortrait(clamp01(x / Math.max(1, frame.width)), clamp01(y / Math.max(1, frame.height)), degrees);
    return { x: clamp01(portrait.x), y: clamp01(portrait.y) };
  };
  for (const event of events) {
    switch (event.type) {
      case "pointer": {
        if (event.action === "down" && event.button === 0) {
          state.touching = true;
          messages.push({ op: "touch", type: "begin", ...point(event.x, event.y) });
        } else if (event.action === "move" && state.touching && (event.buttons & 1) === 1) {
          messages.push({ op: "touch", type: "move", ...point(event.x, event.y) });
        } else if (event.action === "up" && event.button === 0 || event.action === "move" && state.touching && (event.buttons & 1) === 0) {
          if (state.touching)
            messages.push({ op: "touch", type: "end", ...point(event.x, event.y) });
          state.touching = false;
        }
        break;
      }
      case "wheel": {
        const { dx, dy } = deltaToPortrait(event.deltaX / Math.max(1, frame.width), event.deltaY / Math.max(1, frame.height), degrees);
        if (dx !== 0 || dy !== 0)
          messages.push({ op: "scroll", dx, dy, ...point(event.x, event.y) });
        break;
      }
      case "key": {
        if (event.action !== "down")
          break;
        const { modifiers, key } = event;
        if (modifiers.ctrl)
          break;
        const named = usageForNamedKey(key);
        if (named !== null) {
          messages.push(...keyMessages(pressSequence({ usage: named, shift: modifiers.shift, alt: modifiers.alt }, { meta: modifiers.meta })));
          break;
        }
        if ([...key].length !== 1)
          break;
        if (modifiers.meta) {
          const stroke = strokeForChar(key.toLowerCase(), layout);
          if (stroke)
            messages.push(...keyMessages(pressSequence({ usage: stroke.usage, shift: modifiers.shift }, { meta: true })));
          break;
        }
        const typed = typeText(key, layout);
        skippedChars += typed.skipped;
        messages.push(...keyMessages(typed.events));
        break;
      }
      case "text": {
        const typed = typeText(event.text, layout);
        skippedChars += typed.skipped;
        messages.push(...keyMessages(typed.events));
        break;
      }
    }
  }
  return { messages, skippedChars };
};
var OPCODE = {
  touch: 3,
  button: 4,
  key: 6,
  orientation: 7,
  scroll: 11
};
var encodeHid = (opcode, payload) => {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const message = new Uint8Array(1 + json.length);
  message[0] = opcode;
  message.set(json, 1);
  return message;
};
var encodeMessage = (message) => {
  switch (message.op) {
    case "touch":
      return encodeHid(OPCODE.touch, { type: message.type, x: message.x, y: message.y });
    case "scroll":
      return encodeHid(OPCODE.scroll, { dx: message.dx, dy: message.dy, x: message.x, y: message.y });
    case "key":
      return encodeHid(OPCODE.key, message.event);
  }
};

// src/service/simctl.ts
import { readFile as readFile2, rm as rm2 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join2 } from "node:path";
var runtimeLabel = (key) => {
  const tail = key.split(".").pop() ?? key;
  const match = /^([A-Za-z]+)-(\d+)-(\d+)$/.exec(tail);
  return match ? `${match[1]} ${match[2]}.${match[3]}` : tail;
};
var runtimeVersion = (key) => (/iOS-(\d+)-(\d+)/.exec(key) ?? []).slice(1).map(Number);
var parseDevices = (json) => {
  const parsed = JSON.parse(json);
  const runtimes = Object.keys(parsed.devices ?? {}).filter((key) => /SimRuntime\.iOS-/.test(key)).sort((a, b) => {
    const [aMajor = 0, aMinor = 0] = runtimeVersion(a);
    const [bMajor = 0, bMinor = 0] = runtimeVersion(b);
    return bMajor - aMajor || bMinor - aMinor;
  });
  const devices = [];
  for (const runtime of runtimes) {
    for (const device of parsed.devices?.[runtime] ?? []) {
      if (!device.udid || !device.name || device.isAvailable === false)
        continue;
      if (!/^(iPhone|iPad)\b/.test(device.name))
        continue;
      devices.push({ udid: device.udid, name: device.name, runtime: runtimeLabel(runtime), state: device.state ?? "Shutdown" });
    }
  }
  return devices;
};
var defaultDevice = (devices) => devices.find((device) => /^iPhone \d/.test(device.name)) ?? devices.find((device) => device.name.startsWith("iPhone")) ?? devices[0] ?? null;
var listDevices = async () => {
  const result = await run(XCRUN, ["simctl", "list", "devices", "-j"]);
  if (!result.ok)
    throw new Error(`simctl list: ${result.stderr || "xcrun not found"}`);
  return parseDevices(result.stdout);
};
var bootDevice = async (udid) => {
  const boot = await run(XCRUN, ["simctl", "boot", udid], { timeout: 120000 });
  if (!boot.ok && !/current state: Booted/i.test(boot.stderr))
    throw new Error(boot.stderr.trim() || "Boot failed");
  await run(XCRUN, ["simctl", "bootstatus", udid], { timeout: 180000 });
};
var shutdownDevice = async (udid) => {
  const result = await run(XCRUN, ["simctl", "shutdown", udid], { timeout: 60000 });
  if (!result.ok && !/current state: Shutdown/i.test(result.stderr))
    throw new Error(result.stderr.trim() || "Shutdown failed");
};
var readAppearance = async (udid) => {
  const result = await run(XCRUN, ["simctl", "ui", udid, "appearance"], { timeout: 5000 });
  if (!result.ok)
    return "unknown";
  const value = result.stdout.trim();
  return value === "light" || value === "dark" ? value : "unknown";
};
var setAppearance = async (udid, appearance) => {
  const result = await run(XCRUN, ["simctl", "ui", udid, "appearance", appearance], { timeout: 1e4 });
  if (!result.ok)
    throw new Error(result.stderr.trim() || "Could not set the appearance");
};
var readKeyboardLayout = async (udid) => {
  const result = await run(XCRUN, ["simctl", "spawn", udid, "defaults", "read", "-g", "AppleKeyboards"], { timeout: 1e4 });
  return result.ok ? layoutFromKeyboards(result.stdout) : "us";
};
var screenshot = async (udid) => {
  const file = join2(tmpdir2(), `oc-ios-sim-${process.pid}-${Date.now()}.png`);
  try {
    const result = await run(XCRUN, ["simctl", "io", udid, "screenshot", "--type=png", file], { timeout: 20000 });
    if (!result.ok)
      throw new Error(result.stderr.trim() || "Screenshot failed");
    return await readFile2(file);
  } finally {
    await rm2(file, { force: true });
  }
};

// src/service/simulator.ts
import http from "node:http";

// src/service/frames.ts
var SEGMENT_HISTORY = 32;
var createFrameHub = () => {
  let seq = 0;
  let current = null;
  const waiters = new Set;
  const segments = [];
  const publish = (frame) => {
    seq += 1;
    current = { ...frame, seq };
    const last = segments[segments.length - 1];
    if (!last || last.width !== frame.width || last.height !== frame.height) {
      segments.push({ from: seq, width: frame.width, height: frame.height });
      if (segments.length > SEGMENT_HISTORY)
        segments.shift();
    }
    for (const wake of [...waiters])
      wake();
    return current;
  };
  const next = (after, waitMs, signal) => {
    if (current && current.seq > after)
      return Promise.resolve(current);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        waiters.delete(wake);
        signal?.removeEventListener("abort", abort);
      };
      const wake = () => {
        if (current && current.seq > after) {
          done();
          resolve(current);
        }
      };
      const abort = () => {
        done();
        resolve(null);
      };
      const timer = setTimeout(abort, Math.max(0, waitMs));
      waiters.add(wake);
      signal?.addEventListener("abort", abort, { once: true });
    });
  };
  const sizeAt = (frameSeq) => {
    for (let index = segments.length - 1;index >= 0; index -= 1) {
      if (segments[index].from <= frameSeq)
        return segments[index];
    }
    return null;
  };
  const isStale = (frameSeq) => {
    if (!current || frameSeq <= 0)
      return false;
    if (frameSeq > current.seq)
      return true;
    const size = sizeAt(frameSeq);
    if (!size)
      return segments.length > 1 || segments[0]?.from !== 1;
    return size.width !== current.width || size.height !== current.height;
  };
  return {
    publish,
    next,
    isStale,
    current: () => current,
    pending: () => waiters.size
  };
};

// src/service/helper.ts
import { spawn } from "node:child_process";
import { existsSync, openSync, closeSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir as tmpdir3 } from "node:os";
import { join as join3 } from "node:path";
var LOOPBACK = "127.0.0.1";
var FIRST_PORT = 3100;
var PORT_SPAN = 10;
var isLoopbackUrl = (url) => {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return false;
  }
};
var portsFromStateFiles = (dir = join3(tmpdir3(), "serve-sim")) => {
  const ports = [];
  let names = [];
  try {
    names = readdirSync(dir).filter((name) => name.startsWith("server-") && name.endsWith(".json"));
  } catch {
    return ports;
  }
  for (const name of names) {
    try {
      const state = JSON.parse(readFileSync(join3(dir, name), "utf8"));
      if (typeof state.url === "string" && isLoopbackUrl(state.url) && typeof state.port === "number")
        ports.push(state.port);
    } catch {}
  }
  return ports;
};
var helperBase = (port, udid) => `http://${LOOPBACK}:${port}/helper/${encodeURIComponent(udid)}`;
var probe = async (port, udid) => {
  try {
    const response = await fetch(`${helperBase(port, udid)}/health`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok)
      return false;
    const body = await response.json();
    return body.status === "ok";
  } catch {
    return false;
  }
};
var portFree = (port) => new Promise((resolve) => {
  const server = createServer();
  server.once("error", () => resolve(false));
  server.listen(port, LOOPBACK, () => server.close(() => resolve(true)));
});
var serveSimBinary = () => SERVE_SIM.find((candidate) => !candidate.startsWith("/") || existsSync(candidate)) ?? "serve-sim";
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var starting = null;
var ensureHelper = async (udid, preferred) => {
  const candidates = [
    ...preferred ? [preferred] : [],
    ...portsFromStateFiles(),
    ...Array.from({ length: PORT_SPAN }, (_, index) => FIRST_PORT + index)
  ];
  const seen = new Set;
  for (const port of candidates) {
    if (seen.has(port))
      continue;
    seen.add(port);
    if (await probe(port, udid))
      return port;
  }
  starting ??= startHelper(udid).finally(() => {
    starting = null;
  });
  return starting;
};
var startHelper = async (udid) => {
  let port = null;
  for (let candidate = FIRST_PORT;candidate < FIRST_PORT + PORT_SPAN; candidate += 1) {
    if (await portFree(candidate)) {
      port = candidate;
      break;
    }
  }
  if (port === null)
    throw new Error(`No free port ${FIRST_PORT}-${FIRST_PORT + PORT_SPAN - 1} for serve-sim`);
  const log = openSync(join3(tmpdir3(), `openchamber-ios-simulator-serve-sim.log`), "a");
  const child = spawn(serveSimBinary(), [udid, "--port", String(port), "--host", LOOPBACK, "--exit-on-simulator-shutdown"], { detached: true, stdio: ["ignore", log, log], env: childEnv() });
  closeSync(log);
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  child.once("error", () => {
    exited = true;
  });
  child.unref();
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && !exited) {
    await sleep(500);
    if (await probe(port, udid))
      return port;
  }
  throw new Error("serve-sim did not start (log: $TMPDIR/openchamber-ios-simulator-serve-sim.log)");
};

// src/service/mjpeg.ts
var SOI = Buffer.from([255, 216, 255]);
var EOI = Buffer.from([255, 217]);
var MAX_BUFFER = 16 * 1024 * 1024;
var createMjpegParser = (onFrame) => {
  let buffer = Buffer.alloc(0);
  const contentLength = (head) => {
    const match = /content-length:\s*(\d+)/i.exec(head.toString("latin1"));
    return match ? Number(match[1]) : null;
  };
  const drain = () => {
    for (;; ) {
      const start = buffer.indexOf(SOI);
      if (start < 0) {
        if (buffer.length > 4096)
          buffer = buffer.subarray(buffer.length - 2);
        return;
      }
      const length = contentLength(buffer.subarray(0, start));
      let end;
      if (length !== null && length > 0) {
        if (buffer.length < start + length)
          return;
        end = start + length;
      } else {
        const eoi = buffer.indexOf(EOI, start + 2);
        if (eoi < 0) {
          if (buffer.length > MAX_BUFFER)
            buffer = Buffer.alloc(0);
          return;
        }
        end = eoi + 2;
      }
      onFrame(Buffer.from(buffer.subarray(start, end)));
      buffer = buffer.subarray(end);
    }
  };
  return {
    push(chunk) {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
      drain();
    },
    reset() {
      buffer = Buffer.alloc(0);
    }
  };
};
var jpegSize = (jpeg) => {
  if (jpeg.length < 4 || jpeg[0] !== 255 || jpeg[1] !== 216)
    return null;
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 255) {
      offset += 1;
      continue;
    }
    const marker = jpeg[offset + 1];
    if (marker === 255) {
      offset += 1;
      continue;
    }
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) {
      offset += 2;
      continue;
    }
    const length = jpeg.readUInt16BE(offset + 2);
    const isSof = marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204;
    if (isSof) {
      if (offset + 9 > jpeg.length)
        return null;
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
};

// src/service/placeholder.ts
import { deflateSync } from "node:zlib";
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0;n < 256; n += 1) {
    let c = n;
    for (let k = 0;k < 8; k += 1)
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
var crc32 = (bytes) => {
  let crc = 4294967295;
  for (const byte of bytes)
    crc = CRC_TABLE[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
};
var chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
var solidPng = (width, height, rgb) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0;x < width; x += 1) {
    row[1 + x * 3] = rgb >> 16 & 255;
    row[2 + x * 3] = rgb >> 8 & 255;
    row[3 + x * 3] = rgb & 255;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

// src/service/simulator.ts
var VIEWER_GRACE_MS = 35000;
var DEVICE_POLL_MS = 2000;
var RECONNECT_MS = 1500;
var APPEARANCE_TTL_MS = 15000;
var MIN_TOUCH_MS = 40;
var KEY_GAP_MS = 8;
var PLACEHOLDER = { width: 402, height: 874, color: 1907483 };
var CONFIG_OPCODE = 130;
var sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var message = (cause) => cause instanceof Error ? cause.message : String(cause);
var createSimulator = () => {
  const hub = createFrameHub();
  let devices = [];
  let devicesAt = 0;
  let selected = null;
  let busy = null;
  let error = null;
  let controller = "none";
  let appearance = null;
  const layouts = new Map;
  let orientation = null;
  let helperPort = null;
  let lastViewerAt = 0;
  let streamUdid = null;
  let streamRequest = null;
  let streamConnected = false;
  let placeholderShown = false;
  let watching = false;
  let hidSocket = null;
  let hidUdid = null;
  let hidOpen = null;
  let touchBeganAt = 0;
  const activeDevice = () => devices.find((device) => device.state === "Booted" && device.udid === selected) ?? devices.find((device) => device.state === "Booted") ?? null;
  const refreshDevices = async (force = false) => {
    if (!force && Date.now() - devicesAt < DEVICE_POLL_MS - 100)
      return devices;
    try {
      devices = await listDevices();
      devicesAt = Date.now();
    } catch (cause) {
      error = message(cause);
    }
    return devices;
  };
  const viewerPresent = () => Date.now() - lastViewerAt < VIEWER_GRACE_MS;
  const showPlaceholder = () => {
    if (placeholderShown)
      return;
    placeholderShown = true;
    hub.publish({
      data: solidPng(PLACEHOLDER.width, PLACEHOLDER.height, PLACEHOLDER.color),
      mime: "image/png",
      width: PLACEHOLDER.width,
      height: PLACEHOLDER.height,
      title: "No simulator"
    });
  };
  const stopStream = () => {
    streamRequest?.destroy();
    streamRequest = null;
    streamConnected = false;
    streamUdid = null;
  };
  const closeHid = () => {
    try {
      hidSocket?.close();
    } catch {}
    hidSocket = null;
    hidUdid = null;
    hidOpen = null;
    orientation = null;
  };
  const openHid = async (udid) => {
    if (hidSocket && hidUdid === udid && hidSocket.readyState === WebSocket.OPEN)
      return hidSocket;
    if (hidOpen && hidUdid === udid)
      return hidOpen;
    closeHid();
    hidUdid = udid;
    hidOpen = (async () => {
      helperPort = await ensureHelper(udid, helperPort);
      const socket = new WebSocket(`${helperBase(helperPort, udid).replace("http:", "ws:")}/ws`);
      socket.binaryType = "arraybuffer";
      socket.onmessage = (event) => {
        const bytes = new Uint8Array(event.data);
        if (bytes[0] !== CONFIG_OPCODE)
          return;
        try {
          const config = JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
          if (config.orientation)
            orientation = config.orientation;
        } catch {}
      };
      await new Promise((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("Could not open the HID connection to serve-sim"));
      });
      socket.onclose = () => {
        if (hidSocket === socket)
          closeHid();
      };
      hidSocket = socket;
      return socket;
    })();
    try {
      return await hidOpen;
    } catch (cause) {
      closeHid();
      throw cause;
    }
  };
  const startStream = async (device) => {
    stopStream();
    streamUdid = device.udid;
    placeholderShown = false;
    const udid = device.udid;
    try {
      helperPort = await ensureHelper(udid, helperPort);
    } catch (cause) {
      error = message(cause);
      if (streamUdid === udid)
        streamUdid = null;
      return;
    }
    if (streamUdid !== udid)
      return;
    if (!layouts.has(udid))
      readKeyboardLayout(udid).then((layout) => layouts.set(udid, layout));
    const parser = createMjpegParser((jpeg) => {
      const size = jpegSize(jpeg);
      if (!size || streamUdid !== udid)
        return;
      hub.publish({ data: jpeg, mime: "image/jpeg", width: size.width, height: size.height, title: device.name });
    });
    const request = http.get(`${helperBase(helperPort, udid)}/stream.mjpeg`, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        request.destroy();
        return;
      }
      streamConnected = true;
      error = null;
      response.on("data", (chunk) => parser.push(chunk));
    });
    request.on("close", () => {
      if (streamRequest !== request)
        return;
      streamRequest = null;
      streamConnected = false;
      streamUdid = null;
    });
    request.on("error", () => {
      return;
    });
    streamRequest = request;
    openHid(udid).catch(() => {
      return;
    });
  };
  const watch = async () => {
    if (watching)
      return;
    watching = true;
    try {
      while (viewerPresent()) {
        await refreshDevices();
        const device = activeDevice();
        if (!device) {
          stopStream();
          closeHid();
          showPlaceholder();
        } else if (streamUdid !== device.udid) {
          await startStream(device);
          if (!streamRequest)
            await sleep2(RECONNECT_MS);
        }
        await sleep2(DEVICE_POLL_MS);
      }
      stopStream();
    } finally {
      watching = false;
    }
  };
  const nextFrame = (after, waitMs, signal) => {
    lastViewerAt = Date.now();
    watch();
    return hub.next(after, waitMs, signal);
  };
  const requireActive = async () => {
    await refreshDevices(true);
    const device = activeDevice();
    if (!device)
      throw new Error("No simulator is booted");
    return device;
  };
  const sendHid = async (messages) => {
    if (messages.length === 0)
      return;
    const device = activeDevice() ?? await requireActive();
    const socket = await openHid(device.udid);
    for (const hid of messages) {
      if (hid.op === "touch" && hid.type === "end") {
        const held = Date.now() - touchBeganAt;
        if (held < MIN_TOUCH_MS)
          await sleep2(MIN_TOUCH_MS - held);
      }
      socket.send(encodeMessage(hid));
      if (hid.op === "touch" && hid.type === "begin")
        touchBeganAt = Date.now();
      if (hid.op === "key")
        await sleep2(KEY_GAP_MS);
    }
  };
  const sendRaw = async (opcode, payload) => {
    const device = await requireActive();
    const socket = await openHid(device.udid);
    socket.send(encodeHid(opcode, payload));
  };
  const runBusy = async (kind, work) => {
    if (busy)
      throw new Error("Another boot or shutdown is in progress");
    busy = kind;
    error = null;
    try {
      await work();
    } catch (cause) {
      error = message(cause);
      throw cause;
    } finally {
      busy = null;
      await refreshDevices(true);
    }
  };
  return {
    hub,
    nextFrame,
    sendHid,
    async state() {
      await refreshDevices();
      const active = activeDevice();
      if (active) {
        selected = active.udid;
        if (!appearance || appearance.udid !== active.udid || Date.now() - appearance.at > APPEARANCE_TTL_MS) {
          appearance = { udid: active.udid, value: await readAppearance(active.udid), at: Date.now() };
        }
      }
      if (!selected || !devices.some((device) => device.udid === selected))
        selected = defaultDevice(devices)?.udid ?? null;
      return {
        devices,
        active,
        selected,
        busy,
        streaming: streamConnected && viewerPresent() && streamUdid === active?.udid,
        controller,
        orientation: active ? orientation : null,
        appearance: active && appearance?.udid === active.udid ? appearance.value : "unknown",
        keyboard: active ? layouts.get(active.udid) ?? null : null,
        error
      };
    },
    async boot(udid) {
      await refreshDevices(true);
      if (!devices.some((device) => device.udid === udid))
        throw new Error("Unknown device");
      selected = udid;
      await runBusy("booting", async () => {
        for (const device of devices) {
          if (device.udid !== udid && device.state !== "Shutdown")
            await shutdownDevice(device.udid);
        }
        stopStream();
        closeHid();
        await bootDevice(udid);
      });
    },
    async shutdown() {
      await refreshDevices(true);
      await runBusy("shutting-down", async () => {
        stopStream();
        closeHid();
        for (const device of devices) {
          if (device.state !== "Shutdown")
            await shutdownDevice(device.udid);
        }
      });
    },
    async select(udid) {
      await refreshDevices();
      if (devices.some((device) => device.udid === udid) && !activeDevice())
        selected = udid;
    },
    async button(name) {
      await sendRaw(OPCODE.button, name === "home" ? { button: "home" } : { button: "power", page: 12, usage: 48 });
    },
    async rotate(target) {
      const next = target ?? (orientation === "portrait" || orientation === null ? "landscape_left" : "portrait");
      await sendRaw(OPCODE.orientation, { orientation: next });
      orientation = next;
      const shown = hub.current();
      if (shown)
        hub.publish({ data: shown.data, mime: shown.mime, width: shown.width, height: shown.height, title: shown.title });
    },
    async setAppearance(mode) {
      const device = await requireActive();
      const current = await readAppearance(device.udid);
      const next = mode ?? (current === "dark" ? "light" : "dark");
      await setAppearance(device.udid, next);
      appearance = { udid: device.udid, value: next, at: Date.now() };
    },
    async activeUdid() {
      return (await requireActive()).udid;
    },
    async axTree() {
      const device = await requireActive();
      helperPort = await ensureHelper(device.udid, helperPort);
      const response = await fetch(`${helperBase(helperPort, device.udid)}/ax`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok)
        throw new Error(`Accessibility tree unavailable (${response.status})`);
      return response.text();
    },
    orientation: () => orientation,
    async layout() {
      const active = activeDevice();
      if (!active)
        return "us";
      let layout = layouts.get(active.udid);
      if (!layout) {
        layout = await readKeyboardLayout(active.udid);
        layouts.set(active.udid, layout);
      }
      return layout;
    },
    setController(next) {
      controller = next;
    },
    stop() {
      stopStream();
      closeHid();
    }
  };
};

// src/service/main.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
if (!port || !token) {
  console.error("OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required");
  process.exit(1);
}
var BODY_MAX = 1024 * 1024;
var ORIENTATIONS = ["portrait", "portrait_upside_down", "landscape_left", "landscape_right"];
var sim = createSimulator();
var inputState = { touching: false };
var delivered = new Map;
var DELIVERED_MAX = 256;
var rotated = null;
var remember = (seq, degrees) => {
  delivered.set(seq, degrees);
  if (delivered.size > DELIVERED_MAX)
    delivered.delete(delivered.keys().next().value);
};
var presentable = async (frame) => {
  const degrees = frame.mime === "image/jpeg" ? rotationFor(sim.orientation()) : 0;
  if (degrees === 0)
    return { data: frame.data, width: frame.width, height: frame.height, degrees };
  if (!rotated || rotated.seq !== frame.seq || rotated.degrees !== degrees) {
    rotated = { seq: frame.seq, degrees, data: await rotateJpeg(frame.data, degrees) };
  }
  return { data: rotated.data, ...rotatedSize(frame, degrees), degrees };
};
var send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};
var readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > BODY_MAX) {
      reject(new Error("body too large"));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
var readJson = async (req) => {
  const text = await readBody(req);
  if (!text.trim())
    return {};
  const value = JSON.parse(text);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};
var handleFrame = async (_req, res, url) => {
  const after = Number(url.searchParams.get("after") ?? "0") || 0;
  const wait = Math.min(Number(url.searchParams.get("wait") ?? "0") || 0, SURFACE_FRAME_WAIT_MS);
  const abort = new AbortController;
  res.on("close", () => abort.abort());
  const frame = await sim.nextFrame(after, wait, abort.signal);
  if (res.destroyed)
    return;
  if (!frame) {
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }
  const shown = await presentable(frame);
  if (res.destroyed)
    return;
  remember(frame.seq, shown.degrees);
  res.writeHead(200, {
    "Content-Type": frame.mime,
    "Content-Length": String(shown.data.length),
    "Cache-Control": "no-store",
    [SURFACE_SEQ_HEADER]: String(frame.seq),
    [SURFACE_WIDTH_HEADER]: String(shown.width),
    [SURFACE_HEIGHT_HEADER]: String(shown.height),
    [SURFACE_TITLE_HEADER]: frame.title.replace(/[^\x20-\x7e]/g, "").slice(0, 200)
  });
  res.end(shown.data);
};
var handleInput = async (req, res) => {
  const batch = readSurfaceInputBatch(await readBody(req));
  if (!batch)
    return send(res, 400, { error: "bad input batch" });
  const frameSeq = Number(req.headers[SURFACE_FRAME_SEQ_HEADER] ?? "0") || 0;
  const current = sim.hub.current();
  const degrees = rotationFor(sim.orientation());
  if (batch.events.some((event) => event.type === "pointer" || event.type === "wheel")) {
    const seen = delivered.get(frameSeq);
    if (sim.hub.isStale(frameSeq) || seen !== undefined && seen !== degrees)
      return send(res, 409, { error: "stale frame" });
  }
  if (!current || current.mime !== "image/jpeg")
    return send(res, 409, { error: "no simulator picture" });
  const layout = await sim.layout();
  const { messages, skippedChars } = translateInput(batch.events, rotatedSize(current, degrees), inputState, { degrees, layout });
  await sim.sendHid(messages);
  send(res, 200, { ok: true, skippedChars });
};
var routes = {
  "GET /surface/frame": handleFrame,
  "POST /surface/input": handleInput,
  "POST /surface/control": async (req, res) => {
    const notice = readSurfaceControlNotice(await readBody(req));
    if (!notice)
      return send(res, 400, { error: "bad control notice" });
    sim.setController(notice.controller);
    if (notice.controller !== "user")
      inputState.touching = false;
    send(res, 200, { ok: true });
  },
  "POST /surface/resize": async (_req, res) => send(res, 400, { error: "fixed size" }),
  "GET /surface/clipboard": async (_req, res) => send(res, 404, { error: "not supported" }),
  "GET /state": async (_req, res) => send(res, 200, await sim.state()),
  "POST /select": async (req, res) => {
    const body = await readJson(req);
    if (typeof body.udid === "string")
      await sim.select(body.udid);
    send(res, 200, await sim.state());
  },
  "POST /boot": async (req, res) => {
    const body = await readJson(req);
    if (typeof body.udid !== "string")
      return send(res, 400, { error: "udid missing" });
    await sim.boot(body.udid);
    send(res, 200, await sim.state());
  },
  "POST /shutdown": async (_req, res) => {
    await sim.shutdown();
    send(res, 200, await sim.state());
  },
  "POST /button": async (req, res) => {
    const body = await readJson(req);
    await sim.button(body.name === "lock" ? "lock" : "home");
    send(res, 200, { ok: true });
  },
  "POST /rotate": async (req, res) => {
    const body = await readJson(req);
    await sim.rotate(ORIENTATIONS.find((value) => value === body.orientation));
    send(res, 200, await sim.state());
  },
  "POST /appearance": async (req, res) => {
    const body = await readJson(req);
    await sim.setAppearance(body.mode === "light" || body.mode === "dark" ? body.mode : undefined);
    send(res, 200, await sim.state());
  },
  "POST /tap": async (req, res) => {
    const body = await readJson(req);
    const x = Number(body.x);
    const y = Number(body.y);
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1))
      return send(res, 400, { error: "x and y must be within 0..1" });
    await sim.sendHid([
      { op: "touch", type: "begin", x, y },
      { op: "touch", type: "end", x, y }
    ]);
    send(res, 200, { ok: true });
  },
  "GET /screenshot": async (_req, res) => {
    const png = await screenshot(await sim.activeUdid());
    send(res, 200, { mime: "image/png", base64: png.toString("base64") });
  },
  "GET /ax": async (_req, res) => {
    const tree = await sim.axTree();
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(tree);
  }
};
var server = http2.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    send(res, 401, { error: "unauthorized" });
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health") {
    send(res, 200, { ok: true });
    return;
  }
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) {
    send(res, 404, { error: "not-found" });
    return;
  }
  route(req, res, url).catch((cause) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    send(res, cause instanceof SyntaxError ? 400 : 500, { error: cause instanceof Error ? cause.message : String(cause) });
  });
});
var shutdown = () => {
  sim.stop();
  server.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.listen(port, "127.0.0.1");
