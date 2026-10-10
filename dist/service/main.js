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
// src/shared/state.ts
var QUALITIES = ["full", "balanced", "fast"];
var QUALITY_DIVISOR = { full: 1, balanced: 2, fast: 3 };
var DEFAULT_QUALITY = "balanced";
var BLOB_CHUNK = 240000;

// src/service/chrome.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile as readFile2, rename } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join2 } from "node:path";

// src/service/compose.ts
var drawOver = (target, source, x, y) => {
  for (let row = 0;row < source.height; row += 1) {
    const ty = y + row;
    if (ty < 0 || ty >= target.height)
      continue;
    for (let column = 0;column < source.width; column += 1) {
      const tx = x + column;
      if (tx < 0 || tx >= target.width)
        continue;
      const from = (row * source.width + column) * 4;
      const alpha = source.data[from + 3];
      if (alpha === 0)
        continue;
      const to = (ty * target.width + tx) * 4;
      if (alpha === 255) {
        target.data.set(source.data.subarray(from, from + 4), to);
        continue;
      }
      const a = alpha / 255;
      const below = target.data[to + 3] / 255;
      const out = a + below * (1 - a);
      for (let channel = 0;channel < 3; channel += 1) {
        const mixed = (source.data[from + channel] * a + target.data[to + channel] * below * (1 - a)) / out;
        target.data[to + channel] = Math.round(mixed);
      }
      target.data[to + 3] = Math.round(out * 255);
    }
  }
};
var fillRect = (target, rect, rgba) => {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(target.width, Math.round(rect.x + rect.width));
  const y1 = Math.min(target.height, Math.round(rect.y + rect.height));
  for (let y = y0;y < y1; y += 1) {
    for (let x = x0;x < x1; x += 1)
      target.data.set(rgba, (y * target.width + x) * 4);
  }
};
var parseColor = (value, fallback) => {
  if (typeof value !== "string")
    return fallback;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
  if (!hex)
    return fallback;
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
};
var flatten = (layer, background) => {
  const data = new Uint8Array(layer.data.length);
  for (let index = 0;index < data.length; index += 4) {
    const a = layer.data[index + 3] / 255;
    for (let channel = 0;channel < 3; channel += 1) {
      data[index + channel] = Math.round(layer.data[index + channel] * a + background[channel] * (1 - a));
    }
    data[index + 3] = 255;
  }
  return { width: layer.width, height: layer.height, data };
};
var shrunkSize = (width, height, divisor) => ({
  width: Math.floor(width / divisor),
  height: Math.floor(height / divisor)
});

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

// src/service/png.ts
import { deflateSync, inflateSync } from "node:zlib";
var SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };
var paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
var decodePng = (png) => {
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE))
    throw new Error("Not a PNG");
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  for (let offset = 8;offset + 8 <= png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      channels = CHANNELS[body[9] ?? -1] ?? 0;
      if (depth !== 8 || !channels || body[12] !== 0)
        throw new Error("Unsupported PNG (8-bit, non-interlaced only)");
    } else if (type === "IDAT")
      idat.push(body);
    else if (type === "IEND")
      break;
    offset += 12 + length;
  }
  if (!width || !height)
    throw new Error("PNG without a header");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const lines = new Uint8Array(height * stride);
  let previous = new Uint8Array(stride);
  for (let y = 0;y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = lines.subarray(y * stride, (y + 1) * stride);
    line.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0;x < stride; x += 1) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const corner = x >= channels ? previous[x - channels] : 0;
      switch (filter) {
        case 1:
          line[x] = line[x] + left & 255;
          break;
        case 2:
          line[x] = line[x] + up & 255;
          break;
        case 3:
          line[x] = line[x] + (left + up >> 1) & 255;
          break;
        case 4:
          line[x] = line[x] + paeth(left, up, corner) & 255;
          break;
      }
    }
    previous = line;
  }
  if (channels === 4)
    return { width, height, data: lines };
  const data = new Uint8Array(width * height * 4);
  for (let index = 0;index < width * height; index += 1) {
    const from = index * channels;
    const to = index * 4;
    const grey = channels <= 2;
    data[to] = lines[from];
    data[to + 1] = grey ? lines[from] : lines[from + 1];
    data[to + 2] = grey ? lines[from] : lines[from + 2];
    data[to + 3] = channels === 2 ? lines[from + 1] : channels === 4 ? lines[from + 3] : 255;
  }
  return { width, height, data };
};
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
  let c = 4294967295;
  for (const byte of bytes)
    c = CRC_TABLE[(c ^ byte) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
};
var chunk = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
};
var encodePng = ({ width, height, data }) => {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0;y < height; y += 1) {
    const out = y * (stride + 1);
    raw[out] = 2;
    for (let x = 0;x < stride; x += 1) {
      const value = data[y * stride + x];
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      raw[out + 1 + x] = value - up & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", new Uint8Array(0))]);
};

// src/service/simctl.ts
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// src/service/simctl.ts
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
      devices.push({
        udid: device.udid,
        name: device.name,
        runtime: runtimeLabel(runtime),
        state: device.state ?? "Shutdown",
        ...device.deviceTypeIdentifier ? { deviceType: device.deviceTypeIdentifier } : {}
      });
    }
  }
  return devices;
};
var shownDevice = (devices, selected) => {
  if (selected && devices.some((device) => device.udid === selected)) {
    return devices.find((device) => device.udid === selected && device.state === "Booted") ?? null;
  }
  return devices.find((device) => device.state === "Booted") ?? null;
};
var defaultDevice = (devices) => devices.find((device) => /^iPhone \d/.test(device.name)) ?? devices.find((device) => device.name.startsWith("iPhone")) ?? devices[0] ?? null;
var listDevices = async () => {
  const result = await run(XCRUN, ["simctl", "list", "devices", "-j"]);
  if (!result.ok)
    throw new Error(`simctl list: ${result.stderr || "xcrun not found"}`);
  return parseDevices(result.stdout);
};
var listDeviceTypes = async () => {
  const result = await run(XCRUN, ["simctl", "list", "devicetypes", "-j"]);
  if (!result.ok)
    throw new Error(`simctl list devicetypes: ${result.stderr || "xcrun not found"}`);
  const parsed = JSON.parse(result.stdout);
  const types = new Map;
  for (const type of parsed.devicetypes ?? [])
    if (type.identifier && type.bundlePath)
      types.set(type.identifier, type.bundlePath);
  return types;
};
var readPlist = async (file) => {
  const result = await run(XCRUN, ["plutil", "-convert", "json", "-o", "-", file], { timeout: 5000 });
  if (!result.ok)
    throw new Error(result.stderr.trim() || `Could not read ${file}`);
  return JSON.parse(result.stdout);
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
  const file = join(tmpdir(), `oc-ios-sim-${process.pid}-${Date.now()}.png`);
  try {
    const result = await run(XCRUN, ["simctl", "io", udid, "screenshot", "--type=png", file], { timeout: 20000 });
    if (!result.ok)
      throw new Error(result.stderr.trim() || "Screenshot failed");
    return await readFile(file);
  } finally {
    await rm(file, { force: true });
  }
};

// src/service/chrome.ts
var CHROME_ROOT = "/Library/Developer/DeviceKit/Chrome";
var CACHE = join2(tmpdir2(), "oc-ios-sim-chrome");
var SIPS = ["/usr/bin/sips", "sips"];
var CHROME_PREFIX = "com.apple.dt.devicekit.chrome.";
var record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var num = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
var str = (value) => typeof value === "string" && value ? value : null;
var point = (value) => {
  const object = record(value);
  return typeof object.x === "number" && typeof object.y === "number" ? { x: object.x, y: object.y } : null;
};
var parseDisplay = (plist) => {
  const root = record(plist);
  const capabilities = record(root.capabilities ?? root);
  const displays = Array.isArray(capabilities.displays) ? capabilities.displays : [];
  for (const entry of displays) {
    const display = record(entry);
    if (display.displayType !== "integrated" || display.hasDigitizer !== true)
      continue;
    const chrome = str(display.chromeIdentifier);
    const width = num(display.width);
    const height = num(display.height);
    const scale = num(display.scale);
    if (!chrome || width <= 0 || height <= 0 || scale <= 0)
      continue;
    return { width, height, scale, chrome: chrome.replace(CHROME_PREFIX, ""), mask: str(display.framebufferMaskIdentifier) };
  }
  return null;
};
var parseChromeJson = (json) => {
  const root = record(json);
  const images = record(root.images);
  const sizing = record(images.sizing);
  const padding = record(images.devicePadding);
  const slices = {
    topLeft: str(images.topLeft),
    top: str(images.top),
    topRight: str(images.topRight),
    right: str(images.right),
    bottomRight: str(images.bottomRight),
    bottom: str(images.bottom),
    bottomLeft: str(images.bottomLeft),
    left: str(images.left)
  };
  const composite = str(images.composite);
  const complete = Object.values(slices).every((value) => value !== null);
  if (!composite && !complete)
    return null;
  const inputs = [];
  for (const entry of Array.isArray(root.inputs) ? root.inputs : []) {
    const input = record(entry);
    const name = str(input.name);
    const image = str(input.image);
    if (!name || !image || input.type !== "button")
      continue;
    const offsets = record(input.offsets);
    const normal = point(offsets.normal) ?? point(offsets.rollover) ?? { x: 0, y: 0 };
    const rollover = point(offsets.rollover) ?? normal;
    const anchor = input.anchor === "right" || input.anchor === "top" || input.anchor === "bottom" ? input.anchor : "left";
    inputs.push({
      name,
      image,
      anchor,
      align: input.align === "trailing" || input.align === "center" ? input.align : "leading",
      onTop: input.onTop === true,
      normal,
      rollover,
      page: num(input.usagePage),
      usage: num(input.usage)
    });
  }
  return {
    composite,
    slices: complete ? slices : null,
    sizing: { left: num(sizing.leftWidth), right: num(sizing.rightWidth), top: num(sizing.topHeight), bottom: num(sizing.bottomHeight) },
    padding: { left: num(padding.left), right: num(padding.right), top: num(padding.top), bottom: num(padding.bottom) },
    inputs
  };
};
var pdfSize = (pdf) => {
  const text = typeof pdf === "string" ? pdf : pdf.toString("latin1");
  const box = /\/(?:CropBox|MediaBox)\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(text);
  if (!box)
    return null;
  const width = Math.abs(Number(box[3]) - Number(box[1]));
  const height = Math.abs(Number(box[4]) - Number(box[2]));
  return width > 0 && height > 0 ? { width, height } : null;
};
var planChrome = (id, display, spec, sizeOf) => {
  const scale = display.scale;
  const screen = { width: display.width / scale, height: display.height / scale };
  const composite = spec.composite ? sizeOf(spec.composite) : null;
  if (spec.composite && !composite && !spec.slices)
    return null;
  const body = composite ?? { width: screen.width + spec.sizing.left + spec.sizing.right, height: screen.height + spec.sizing.top + spec.sizing.bottom };
  const bodyAt = { x: spec.padding.left, y: spec.padding.top };
  const screenAt = composite ? { x: bodyAt.x + (body.width - screen.width) / 2, y: bodyAt.y + (body.height - screen.height) / 2 } : { x: bodyAt.x + spec.sizing.left, y: bodyAt.y + spec.sizing.top };
  const under = [];
  const over = [];
  const buttons = [];
  for (const input of spec.inputs) {
    const size = sizeOf(input.image);
    if (!size)
      continue;
    const g = { x: 2 * input.normal.x - input.rollover.x, y: 2 * input.normal.y - input.rollover.y };
    const along = input.align === "trailing" ? bodyAt.x + body.width + g.x - size.width : input.align === "center" ? bodyAt.x + (body.width - size.width) / 2 + g.x : bodyAt.x + g.x;
    const at = input.anchor === "left" ? { x: bodyAt.x + input.rollover.x - size.width / 2, y: bodyAt.y + input.rollover.y } : input.anchor === "right" ? { x: bodyAt.x + body.width + g.x, y: bodyAt.y + g.y } : input.anchor === "top" ? { x: along, y: bodyAt.y + g.y - size.height } : { x: along, y: bodyAt.y + body.height + g.y };
    const rect = { ...at, ...size };
    (input.onTop ? over : under).push({ image: input.image, rect });
    if (input.page > 0 && input.usage > 0)
      buttons.push({ name: input.name, page: input.page, usage: input.usage, rect });
  }
  const bodyPieces = [];
  if (composite) {
    bodyPieces.push({ image: spec.composite, rect: { ...bodyAt, ...composite } });
  } else {
    const slices = spec.slices;
    const corner = (image) => sizeOf(image);
    const tl = corner(slices.topLeft);
    const tr = corner(slices.topRight);
    const bl = corner(slices.bottomLeft);
    const br = corner(slices.bottomRight);
    const top = sizeOf(slices.top);
    const bottom = sizeOf(slices.bottom);
    const left = sizeOf(slices.left);
    const right = sizeOf(slices.right);
    if (!tl || !tr || !bl || !br || !top || !bottom || !left || !right)
      return null;
    const { x, y } = bodyAt;
    const { width: w, height: h } = body;
    bodyPieces.push({ fill: true, rect: { x: x + left.width, y: y + top.height, width: w - left.width - right.width, height: h - top.height - bottom.height } }, { image: slices.top, rect: { x: x + tl.width, y, width: w - tl.width - tr.width, height: top.height } }, { image: slices.bottom, rect: { x: x + bl.width, y: y + h - bottom.height, width: w - bl.width - br.width, height: bottom.height } }, { image: slices.left, rect: { x, y: y + tl.height, width: left.width, height: h - tl.height - bl.height } }, { image: slices.right, rect: { x: x + w - right.width, y: y + tr.height, width: right.width, height: h - tr.height - br.height } }, { image: slices.topLeft, rect: { x, y, ...tl } }, { image: slices.topRight, rect: { x: x + w - tr.width, y, ...tr } }, { image: slices.bottomLeft, rect: { x, y: y + h - bl.height, ...bl } }, { image: slices.bottomRight, rect: { x: x + w - br.width, y: y + h - br.height, ...br } });
  }
  const all = [...under, ...bodyPieces, ...over].map((piece) => piece.rect);
  all.push({ x: 0, y: 0, width: body.width + spec.padding.left + spec.padding.right, height: body.height + spec.padding.top + spec.padding.bottom });
  const minX = Math.min(...all.map((rect) => rect.x));
  const minY = Math.min(...all.map((rect) => rect.y));
  const maxX = Math.max(...all.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...all.map((rect) => rect.y + rect.height));
  const px = (rect) => {
    const x0 = Math.round((rect.x - minX) * scale);
    const y0 = Math.round((rect.y - minY) * scale);
    return { x: x0, y: y0, width: Math.max(1, Math.round((rect.x + rect.width - minX) * scale) - x0), height: Math.max(1, Math.round((rect.y + rect.height - minY) * scale) - y0) };
  };
  const screenPx = { x: Math.round((screenAt.x - minX) * scale), y: Math.round((screenAt.y - minY) * scale), width: display.width, height: display.height };
  return {
    layout: {
      id,
      width: Math.ceil((maxX - minX) * scale),
      height: Math.ceil((maxY - minY) * scale),
      screen: screenPx,
      buttons: buttons.map(({ rect, ...button }) => ({ ...button, ...px(rect) }))
    },
    pieces: [...under, ...bodyPieces, ...over].map((piece) => ({ ...piece, rect: px(piece.rect) }))
  };
};
var rasterize = async (pdf, key, width, height) => {
  const stat = statSync(pdf);
  const file = join2(CACHE, `${key.replace(/[^A-Za-z0-9_-]/g, "_")}-${width}x${height}-${Math.round(stat.mtimeMs)}.png`);
  if (existsSync(file))
    return readFile2(file);
  await mkdir(CACHE, { recursive: true });
  const temp = `${file}.${process.pid}.tmp.png`;
  const result = await run(SIPS, ["-s", "format", "png", "-z", String(height), String(width), pdf, "--out", temp], { timeout: 15000 });
  if (!result.ok)
    throw new Error(result.stderr.trim() || `sips could not rasterize ${pdf}`);
  await rename(temp, file);
  return readFile2(file);
};
var deviceTypes = null;
var loading = new Map;
var build = async (deviceType, divisor) => {
  deviceTypes ??= listDeviceTypes().catch((cause) => {
    deviceTypes = null;
    throw cause;
  });
  const bundle = (await deviceTypes).get(deviceType);
  if (!bundle)
    return null;
  const resources = join2(bundle, "Contents", "Resources");
  const full = parseDisplay(await readPlist(join2(resources, "capabilities.plist")));
  if (!full)
    return null;
  const display = { ...full, ...shrunkSize(full.width, full.height, divisor), scale: full.scale / divisor };
  const chromeDir = join2(CHROME_ROOT, `${display.chrome}.devicechrome`, "Contents", "Resources");
  const spec = parseChromeJson(JSON.parse(await readFile2(join2(chromeDir, "chrome.json"), "utf8")));
  if (!spec)
    return null;
  const pdfPath = (image) => join2(chromeDir, `${image}.pdf`);
  const sizes = new Map;
  const sizeOf = (image) => {
    if (!sizes.has(image)) {
      const file = pdfPath(image);
      sizes.set(image, existsSync(file) ? pdfSize(readFileSync(file)) : null);
    }
    return sizes.get(image) ?? null;
  };
  const plan = planChrome(divisor > 1 ? `${display.chrome}@${divisor}` : display.chrome, display, spec, sizeOf);
  if (!plan)
    return null;
  const layer = { width: plan.layout.width, height: plan.layout.height, data: new Uint8Array(plan.layout.width * plan.layout.height * 4) };
  for (const piece of plan.pieces) {
    if ("fill" in piece) {
      fillRect(layer, piece.rect, [0, 0, 0, 255]);
      continue;
    }
    const png = await rasterize(pdfPath(piece.image), `${display.chrome}-${piece.image}`, piece.rect.width, piece.rect.height);
    drawOver(layer, decodePng(png), piece.rect.x, piece.rect.y);
  }
  let mask = null;
  let maskPng = null;
  const maskPdf = display.mask ? join2(resources, `${display.mask}.pdf`) : null;
  if (maskPdf && existsSync(maskPdf)) {
    maskPng = await rasterize(maskPdf, `mask-${display.mask}`, display.width, display.height);
    const decoded = decodePng(maskPng);
    mask = new Uint8Array(decoded.width * decoded.height);
    for (let index = 0;index < mask.length; index += 1)
      mask[index] = decoded.data[index * 4 + 3];
  }
  let png = null;
  return { layout: plan.layout, layer, mask, maskPng, layerPng: () => png ??= encodePng(layer) };
};
var loadChrome = (deviceType, divisor = 1) => {
  const key = `${deviceType}@${divisor}`;
  let pending = loading.get(key);
  if (!pending) {
    pending = build(deviceType, divisor).catch((cause) => {
      console.error(`device frame for ${deviceType}: ${cause instanceof Error ? cause.message : String(cause)}`);
      return null;
    });
    loading.set(key, pending);
  }
  return pending;
};

// src/service/rotate.ts
import { mkdtemp, readFile as readFile3, rm as rm2, writeFile } from "node:fs/promises";
import { tmpdir as tmpdir3 } from "node:os";
import { join as join3 } from "node:path";
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
var SIPS2 = ["/usr/bin/sips", "sips"];
var rotateJpeg = async (jpeg, degrees) => {
  if (degrees === 0)
    return jpeg;
  const dir = await mkdtemp(join3(tmpdir3(), "oc-ios-sim-rot-"));
  try {
    const input = join3(dir, "in.jpg");
    const output = join3(dir, "out.jpg");
    await writeFile(input, jpeg);
    const result = await run(SIPS2, ["-r", String(degrees), input, "--out", output], { timeout: 5000 });
    if (!result.ok)
      throw new Error(result.stderr.trim() || "sips failed");
    return await readFile3(output);
  } finally {
    await rm2(dir, { recursive: true, force: true });
  }
};

// src/service/input.ts
var clamp01 = (value) => value < 0 ? 0 : value > 1 ? 1 : value;
var keyMessages = (events) => events.map((event) => ({ op: "key", event }));
var translateInput = (events, frame, state, options = {}) => {
  const degrees = options.degrees ?? 0;
  const layout = options.layout ?? "us";
  const chrome = options.chrome ?? null;
  const messages = [];
  const buttons = [];
  let skippedChars = 0;
  const portraitOf = (x, y) => toPortrait(clamp01(x / Math.max(1, frame.width)), clamp01(y / Math.max(1, frame.height)), degrees);
  const onScreen = (portrait) => chrome ? {
    x: (portrait.x * chrome.width - chrome.screen.x) / chrome.screen.width,
    y: (portrait.y * chrome.height - chrome.screen.y) / chrome.screen.height
  } : portrait;
  const point = (x, y) => {
    const screen = onScreen(portraitOf(x, y));
    return { x: clamp01(screen.x), y: clamp01(screen.y) };
  };
  const onFrame = (x, y) => {
    if (!chrome)
      return null;
    const portrait = portraitOf(x, y);
    const screen = onScreen(portrait);
    if (screen.x >= 0 && screen.x <= 1 && screen.y >= 0 && screen.y <= 1)
      return null;
    const px = portrait.x * chrome.width;
    const py = portrait.y * chrome.height;
    return chrome.buttons.find((button) => px >= button.x && px <= button.x + button.width && py >= button.y && py <= button.y + button.height) ?? "bezel";
  };
  for (const event of events) {
    switch (event.type) {
      case "pointer": {
        if (event.action === "down" && event.button === 0) {
          const hit = onFrame(event.x, event.y);
          if (hit) {
            if (hit !== "bezel")
              buttons.push(hit);
            break;
          }
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
        const delta = deltaToPortrait(event.deltaX / Math.max(1, frame.width), event.deltaY / Math.max(1, frame.height), degrees);
        const dx = chrome ? delta.dx * chrome.width / chrome.screen.width : delta.dx;
        const dy = chrome ? delta.dy * chrome.height / chrome.screen.height : delta.dy;
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
  return { messages, skippedChars, buttons };
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

// src/service/present.ts
import { availableParallelism } from "node:os";
import { dirname as dirname2, join as join4 } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

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

// src/service/present.ts
var WORKERS = Math.min(4, Math.max(2, Math.floor(availableParallelism() / 3)));
var qualityFor = (divisor) => divisor > 1 ? 75 : 82;
var VIEWER_GRACE_MS = 35000;
var PULL_WAIT_MS = 1000;
var VIEWS_MAX = 256;
var sameView = (a, b) => a.degrees === b.degrees && (a.chrome?.id ?? null) === (b.chrome?.id ?? null);
var createPool = () => {
  const entry = join4(dirname2(fileURLToPath(import.meta.url)), "compose-worker.js");
  const workers = [];
  const jobs = new Map;
  let nextId = 1;
  const spawn = () => {
    const worker = new Worker(entry);
    const slot = { worker, busy: 0, layers: new Set };
    worker.on("message", (answer) => {
      slot.busy -= 1;
      jobs.get(answer.id)?.resolve(answer);
      jobs.delete(answer.id);
    });
    worker.on("error", (cause) => console.error(`compose worker: ${cause instanceof Error ? cause.message : String(cause)}`));
    worker.on("exit", () => {
      workers.splice(workers.indexOf(slot), 1);
      for (const [id, job] of [...jobs]) {
        if (job.worker !== worker)
          continue;
        jobs.delete(id);
        job.resolve({ id, ok: false, error: "worker stopped" });
      }
    });
    worker.unref();
    workers.push(slot);
    return slot;
  };
  return {
    compose(key, layer, jpeg, divisor, degrees) {
      const slot = workers.length < WORKERS ? spawn() : workers.reduce((a, b) => b.busy < a.busy ? b : a);
      if (key !== null && layer && !slot.layers.has(key)) {
        slot.worker.postMessage({ type: "layer", key, ...layer() });
        slot.layers.add(key);
      }
      const id = nextId++;
      slot.busy += 1;
      return new Promise((resolve) => {
        jobs.set(id, { worker: slot.worker, resolve });
        const message = { type: "compose", id, key, jpeg: new Uint8Array(jpeg), divisor, degrees, quality: qualityFor(divisor) };
        slot.worker.postMessage(message);
      });
    },
    stop() {
      for (const { worker } of [...workers])
        worker.terminate();
    }
  };
};
var createPresenter = (deps) => {
  const shown = createFrameHub();
  const views = new Map;
  const pool = createPool();
  const flattened = new Map;
  let lastAsk = 0;
  let running = false;
  let submitted = 0;
  let published = 0;
  let inFlight = 0;
  let freed = null;
  const layerFor = (chrome, background) => {
    const key = `${chrome.layout.id}:${background.join(",")}`;
    return {
      key,
      build: () => {
        let layer = flattened.get(key);
        if (!layer) {
          layer = { base: flatten(chrome.layer, background), screen: chrome.layout.screen, mask: chrome.mask };
          flattened.set(key, layer);
          if (flattened.size > 4)
            flattened.delete(flattened.keys().next().value);
        }
        return layer;
      }
    };
  };
  const fromAnswer = (answer, title) => ({
    data: Buffer.from(answer.jpeg.buffer, answer.jpeg.byteOffset, answer.jpeg.byteLength),
    mime: "image/jpeg",
    width: answer.width,
    height: answer.height,
    title
  });
  const present = async (raw) => {
    const plain = { data: raw.data, mime: raw.mime, width: raw.width, height: raw.height, title: raw.title };
    if (raw.mime !== "image/jpeg")
      return { frame: plain, view: { degrees: 0, chrome: null } };
    const degrees = rotationFor(deps.orientation());
    const divisor = deps.divisor();
    const size = shrunkSize(raw.width, raw.height, divisor);
    const chrome = deps.framed() ? deps.chrome() : null;
    if (chrome && chrome.layout.screen.width === size.width && chrome.layout.screen.height === size.height) {
      const { key, build } = layerFor(chrome, deps.background());
      const answer = await pool.compose(key, build, raw.data, divisor, degrees);
      if (answer.ok)
        return { frame: fromAnswer(answer, raw.title), view: { degrees, chrome: chrome.layout } };
      console.error(`device frame: ${answer.error}`);
    }
    if (divisor > 1) {
      const answer = await pool.compose(null, null, raw.data, divisor, degrees);
      if (answer.ok)
        return { frame: fromAnswer(answer, raw.title), view: { degrees, chrome: null } };
      console.error(`shrink: ${answer.error}`);
    }
    if (degrees === 0)
      return { frame: plain, view: { degrees, chrome: null } };
    return { frame: { ...plain, data: await rotateJpeg(raw.data, degrees), ...rotatedSize(raw, degrees) }, view: { degrees, chrome: null } };
  };
  let pageCache = null;
  const forPage = async (raw) => {
    const divisor = deps.divisor();
    const plain = { data: raw.data, mime: raw.mime, width: raw.width, height: raw.height, title: raw.title };
    if (raw.mime !== "image/jpeg" || divisor <= 1)
      return plain;
    if (pageCache?.seq === raw.seq && pageCache.divisor === divisor)
      return pageCache.frame;
    const answer = await pool.compose(null, null, raw.data, divisor, 0);
    if (!answer.ok)
      return plain;
    pageCache = { seq: raw.seq, divisor, frame: fromAnswer(answer, raw.title) };
    return pageCache.frame;
  };
  const submit = (raw) => {
    submitted = raw.seq;
    inFlight += 1;
    present(raw).then(({ frame, view }) => {
      if (raw.seq <= published)
        return;
      published = raw.seq;
      const out = shown.publish(frame);
      views.set(out.seq, view);
      if (views.size > VIEWS_MAX)
        views.delete(views.keys().next().value);
    }).catch((cause) => console.error(`present: ${cause instanceof Error ? cause.message : String(cause)}`)).finally(() => {
      inFlight -= 1;
      freed?.();
    });
  };
  const loop = async () => {
    if (running)
      return;
    running = true;
    try {
      while (Date.now() - lastAsk < VIEWER_GRACE_MS) {
        const raw = await deps.pull(submitted, PULL_WAIT_MS);
        if (!raw)
          continue;
        while (inFlight >= WORKERS)
          await new Promise((resolve) => freed = resolve);
        const newest = deps.raw.current();
        if (newest && newest.seq > submitted)
          submit(newest);
      }
    } finally {
      running = false;
    }
  };
  return {
    shown,
    next(after, waitMs, signal) {
      lastAsk = Date.now();
      loop();
      return shown.next(after, waitMs, signal);
    },
    viewOf: (seq) => views.get(seq),
    forPage,
    currentView() {
      const current = shown.current();
      return (current && views.get(current.seq)) ?? { degrees: 0, chrome: null };
    },
    stop: () => pool.stop()
  };
};

// src/service/simulator.ts
import http from "node:http";

// src/service/helper.ts
import { spawn } from "node:child_process";
import { existsSync as existsSync2, openSync, closeSync, readdirSync, readFileSync as readFileSync2 } from "node:fs";
import { createServer } from "node:net";
import { tmpdir as tmpdir4 } from "node:os";
import { join as join5 } from "node:path";
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
var helpersFromStateFiles = (dir = join5(tmpdir4(), "serve-sim")) => {
  const helpers = [];
  let names = [];
  try {
    names = readdirSync(dir).filter((name) => name.startsWith("server-") && name.endsWith(".json"));
  } catch {
    return helpers;
  }
  for (const name of names) {
    try {
      const state = JSON.parse(readFileSync2(join5(dir, name), "utf8"));
      if (typeof state.url !== "string" || !isLoopbackUrl(state.url) || typeof state.port !== "number" || typeof state.device !== "string")
        continue;
      helpers.push({ port: state.port, device: state.device });
    } catch {}
  }
  return helpers;
};
var candidatePorts = (udid, remembered, started, recorded) => {
  const ports = [
    ...remembered !== null && (started.get(remembered) ?? udid) === udid ? [remembered] : [],
    ...[...started].filter(([, device]) => device === udid).map(([port]) => port),
    ...recorded.filter((entry) => entry.device === udid).map((entry) => entry.port)
  ];
  return [...new Set(ports)].filter((port) => (started.get(port) ?? udid) === udid);
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
var serveSimBinary = () => SERVE_SIM.find((candidate) => !candidate.startsWith("/") || existsSync2(candidate)) ?? "serve-sim";
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var launchServeSim = (udid, port, onExit) => {
  const log = openSync(join5(tmpdir4(), "openchamber-ios-simulator-serve-sim.log"), "a");
  const child = spawn(serveSimBinary(), [udid, "--port", String(port), "--host", LOOPBACK, "--exit-on-simulator-shutdown"], { detached: true, stdio: ["ignore", log, log], env: childEnv() });
  closeSync(log);
  child.once("exit", onExit);
  child.once("error", onExit);
  child.unref();
};
var createHelpers = (deps) => {
  const started = new Map;
  const starting = new Map;
  const reserved = new Set;
  const startHelper = async (udid) => {
    let port = null;
    for (let candidate = FIRST_PORT;candidate < FIRST_PORT + PORT_SPAN; candidate += 1) {
      if (reserved.has(candidate) || started.has(candidate))
        continue;
      reserved.add(candidate);
      if (await deps.portFree(candidate)) {
        port = candidate;
        break;
      }
      reserved.delete(candidate);
    }
    if (port === null)
      throw new Error(`No free port ${FIRST_PORT}-${FIRST_PORT + PORT_SPAN - 1} for serve-sim`);
    try {
      let exited = false;
      deps.launch(udid, port, () => {
        exited = true;
        if (started.get(port) === udid)
          started.delete(port);
      });
      const deadline = Date.now() + deps.startTimeoutMs;
      while (Date.now() < deadline && !exited) {
        await deps.sleep(250);
        if (await deps.probe(port, udid)) {
          started.set(port, udid);
          return port;
        }
      }
      throw new Error("serve-sim did not start (log: $TMPDIR/openchamber-ios-simulator-serve-sim.log)");
    } finally {
      reserved.delete(port);
    }
  };
  return {
    async ensure(udid, remembered) {
      for (const port of candidatePorts(udid, remembered, started, deps.recorded())) {
        if (await deps.probe(port, udid))
          return port;
      }
      let pending = starting.get(udid);
      if (!pending) {
        pending = startHelper(udid).finally(() => starting.delete(udid));
        starting.set(udid, pending);
      }
      return pending;
    }
  };
};
var helpers = createHelpers({
  probe,
  portFree,
  recorded: () => helpersFromStateFiles(),
  launch: launchServeSim,
  sleep,
  startTimeoutMs: 45000
});
var ensureHelper = (udid, remembered) => helpers.ensure(udid, remembered);

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
import { deflateSync as deflateSync2 } from "node:zlib";
var CRC_TABLE2 = (() => {
  const table = new Uint32Array(256);
  for (let n = 0;n < 256; n += 1) {
    let c = n;
    for (let k = 0;k < 8; k += 1)
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
var crc322 = (bytes) => {
  let crc = 4294967295;
  for (const byte of bytes)
    crc = CRC_TABLE2[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
};
var chunk2 = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc322(body));
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
    chunk2("IHDR", header),
    chunk2("IDAT", deflateSync2(raw)),
    chunk2("IEND", Buffer.alloc(0))
  ]);
};

// src/service/simulator.ts
var VIEWER_GRACE_MS2 = 35000;
var DEVICE_POLL_MS = 2000;
var RECONNECT_MS = 300;
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
  const helperPorts = new Map;
  const helperFor = async (udid) => {
    const port = await ensureHelper(udid, helperPorts.get(udid) ?? null);
    helperPorts.set(udid, port);
    return port;
  };
  let reconnectTimer = null;
  let lastViewerAt = 0;
  let framed = true;
  let quality = DEFAULT_QUALITY;
  let streamUdid = null;
  let streamRequest = null;
  let streamConnected = false;
  let placeholderShown = false;
  let watching = false;
  let hidSocket = null;
  let hidUdid = null;
  let hidOpen = null;
  let touchBeganAt = 0;
  const activeDevice = () => shownDevice(devices, selected);
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
  const viewerPresent = () => Date.now() - lastViewerAt < VIEWER_GRACE_MS2;
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
      const port = await helperFor(udid);
      const socket = new WebSocket(`${helperBase(port, udid).replace("http:", "ws:")}/ws`);
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
        helperPorts.delete(udid);
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
    let port;
    try {
      port = await helperFor(udid);
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
    const request = http.get(`${helperBase(port, udid)}/stream.mjpeg`, (response) => {
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
      helperPorts.delete(udid);
      if (reconnectTimer)
        clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (viewerPresent() && !streamRequest)
          switchStream().catch(() => {
            return;
          });
      }, RECONNECT_MS);
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
  const switchStream = async () => {
    await refreshDevices(true);
    const device = activeDevice();
    if (!device) {
      stopStream();
      closeHid();
      showPlaceholder();
      return;
    }
    if (device.udid === streamUdid || !viewerPresent())
      return;
    await startStream(device);
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
      if (!selected || !devices.some((device) => device.udid === selected)) {
        selected = devices.find((device) => device.state === "Booted")?.udid ?? defaultDevice(devices)?.udid ?? null;
      }
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
        framed,
        quality,
        error
      };
    },
    async boot(udid) {
      await refreshDevices(true);
      const device = devices.find((candidate) => candidate.udid === udid);
      if (!device)
        throw new Error("Unknown device");
      selected = udid;
      if (device.state !== "Booted") {
        await runBusy("booting", () => bootDevice(udid));
        helperPorts.delete(udid);
      }
      await switchStream();
    },
    async shutdown() {
      await refreshDevices(true);
      const device = activeDevice();
      if (!device)
        return;
      await runBusy("shutting-down", async () => {
        stopStream();
        closeHid();
        await shutdownDevice(device.udid);
        helperPorts.delete(device.udid);
      });
    },
    async select(udid) {
      await refreshDevices();
      if (!devices.some((device) => device.udid === udid))
        return;
      selected = udid;
      await switchStream();
    },
    repaint() {
      const shown = hub.current();
      if (shown)
        hub.publish({ data: shown.data, mime: shown.mime, width: shown.width, height: shown.height, title: shown.title });
    },
    framed: () => framed,
    quality: () => quality,
    setQuality(next) {
      quality = next;
    },
    setFramed(on) {
      framed = on;
    },
    active: () => activeDevice(),
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
    async pressButton(name, page, usage) {
      if (name === "home")
        await sendRaw(OPCODE.button, { button: "home" });
      else
        await sendRaw(OPCODE.button, { button: name, page, usage });
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
      const port = await helperFor(device.udid);
      const response = await fetch(`${helperBase(port, device.udid)}/ax`, { signal: AbortSignal.timeout(15000) });
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
      if (reconnectTimer)
        clearTimeout(reconnectTimer);
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
var PAGE_WAIT_MS = 1e4;
var DEFAULT_BACKGROUND = [29, 27, 27];
var sim = createSimulator();
var surfaceInput = { touching: false };
var pageInput = { touching: false };
var background = DEFAULT_BACKGROUND;
var blobs = new Map;
var BLOBS_MAX = 8;
var putBlob = (id, base64) => {
  blobs.delete(id);
  blobs.set(id, base64);
  if (blobs.size > BLOBS_MAX)
    blobs.delete(blobs.keys().next().value);
  return { id, length: base64.length };
};
var divisor = () => QUALITY_DIVISOR[sim.quality()];
var chromes = new Map;
var chromeForActive = () => {
  const type = sim.active()?.deviceType;
  if (!type)
    return null;
  const at = divisor();
  const key = `${type}@${at}`;
  if (chromes.has(key))
    return chromes.get(key) ?? null;
  loadChrome(type, at).then((chrome) => {
    chromes.set(key, chrome);
    if (chrome && sim.framed())
      sim.repaint();
  });
  return null;
};
var presenter = createPresenter({
  raw: sim.hub,
  pull: (after, waitMs) => sim.nextFrame(after, waitMs),
  orientation: () => sim.orientation(),
  framed: () => sim.framed(),
  divisor,
  chrome: chromeForActive,
  background: () => background
});
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
  const frame = await presenter.next(after, wait, abort.signal);
  if (res.destroyed)
    return;
  if (!frame) {
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": frame.mime,
    "Content-Length": String(frame.data.length),
    "Cache-Control": "no-store",
    [SURFACE_SEQ_HEADER]: String(frame.seq),
    [SURFACE_WIDTH_HEADER]: String(frame.width),
    [SURFACE_HEIGHT_HEADER]: String(frame.height),
    [SURFACE_TITLE_HEADER]: frame.title.replace(/[^\x20-\x7e]/g, "").slice(0, 200)
  });
  res.end(frame.data);
};
var handleInput = async (req, res) => {
  const batch = readSurfaceInputBatch(await readBody(req));
  if (!batch)
    return send(res, 400, { error: "bad input batch" });
  const frameSeq = Number(req.headers[SURFACE_FRAME_SEQ_HEADER] ?? "0") || 0;
  const shown = presenter.shown.current();
  const view = presenter.currentView();
  if (batch.events.some((event) => event.type === "pointer" || event.type === "wheel")) {
    const seen = presenter.viewOf(frameSeq);
    if (presenter.shown.isStale(frameSeq) || seen !== undefined && !sameView(seen, view))
      return send(res, 409, { error: "stale frame" });
  }
  if (!shown || sim.hub.current()?.mime !== "image/jpeg")
    return send(res, 409, { error: "no simulator picture" });
  const layout = await sim.layout();
  const { messages, skippedChars, buttons } = translateInput(batch.events, shown, surfaceInput, { degrees: view.degrees, layout, chrome: view.chrome });
  await sim.sendHid(messages);
  for (const button of buttons)
    await sim.pressButton(button.name, button.page, button.usage);
  send(res, 200, { ok: true, skippedChars });
};
var handlePageFrame = async (_req, res, url) => {
  const after = Number(url.searchParams.get("after") ?? "0") || 0;
  const wait = Math.min(Number(url.searchParams.get("wait") ?? "0") || 0, PAGE_WAIT_MS);
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
  const picture = await presenter.forPage(frame);
  if (res.destroyed)
    return;
  const answer = {
    seq: frame.seq,
    mime: picture.mime,
    width: picture.width,
    height: picture.height,
    degrees: frame.mime === "image/jpeg" ? rotationFor(sim.orientation()) : 0,
    data: putBlob(`frame-${frame.seq}`, picture.data.toString("base64"))
  };
  send(res, 200, answer);
};
var handlePageInput = async (req, res) => {
  const body = await readBody(req);
  const batch = readSurfaceInputBatch(body);
  const { width, height } = JSON.parse(body);
  if (!batch || typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return send(res, 400, { error: "bad input batch" });
  }
  const current = sim.hub.current();
  if (!current || current.mime !== "image/jpeg")
    return send(res, 409, { error: "no simulator picture" });
  const expected = shrunkSize(current.width, current.height, divisor());
  if (expected.width !== width || expected.height !== height)
    return send(res, 409, { error: "stale frame" });
  const layout = await sim.layout();
  const { messages, skippedChars } = translateInput(batch.events, { width, height }, pageInput, { layout });
  await sim.sendHid(messages);
  send(res, 200, { ok: true, skippedChars });
};
var handleChrome = async (_req, res) => {
  const type = sim.active()?.deviceType;
  const at = divisor();
  const chrome = type ? await loadChrome(type, at) : null;
  if (type)
    chromes.set(`${type}@${at}`, chrome);
  const answer = chrome ? {
    available: true,
    layout: chrome.layout,
    layer: putBlob(`chrome-${chrome.layout.id}-layer`, chrome.layerPng().toString("base64")),
    mask: chrome.maskPng ? putBlob(`chrome-${chrome.layout.id}-mask`, chrome.maskPng.toString("base64")) : null
  } : { available: false };
  send(res, 200, answer);
};
var handleBlob = async (_req, res, url) => {
  const blob = blobs.get(url.searchParams.get("id") ?? "");
  const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
  if (blob === undefined)
    return send(res, 404, { error: "gone" });
  res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
  res.end(blob.slice(offset, offset + BLOB_CHUNK));
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
      surfaceInput.touching = false;
    send(res, 200, { ok: true });
  },
  "POST /surface/resize": async (_req, res) => send(res, 400, { error: "fixed size" }),
  "GET /surface/clipboard": async (_req, res) => send(res, 404, { error: "not supported" }),
  "GET /state": async (_req, res) => send(res, 200, await sim.state()),
  "GET /stats": async (_req, res) => send(res, 200, { raw: sim.hub.current()?.seq ?? 0, shown: presenter.shown.current()?.seq ?? 0 }),
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
  "GET /page/frame": handlePageFrame,
  "POST /page/input": handlePageInput,
  "GET /chrome": handleChrome,
  "GET /blob": handleBlob,
  "POST /button": async (req, res) => {
    const body = await readJson(req);
    const page = Number(body.page);
    const usage = Number(body.usage);
    if (typeof body.name === "string" && page > 0 && usage > 0)
      await sim.pressButton(body.name, page, usage);
    else
      await sim.button(body.name === "lock" ? "lock" : "home");
    send(res, 200, { ok: true });
  },
  "POST /frame": async (req, res) => {
    const body = await readJson(req);
    sim.setFramed(typeof body.on === "boolean" ? body.on : !sim.framed());
    sim.repaint();
    send(res, 200, await sim.state());
  },
  "POST /quality": async (req, res) => {
    const body = await readJson(req);
    const next = QUALITIES.find((value) => value === body.value);
    if (!next)
      return send(res, 400, { error: `quality must be one of ${QUALITIES.join(", ")}` });
    if (next !== sim.quality()) {
      sim.setQuality(next);
      sim.repaint();
    }
    send(res, 200, await sim.state());
  },
  "POST /frame-style": async (req, res) => {
    const body = await readJson(req);
    const next = parseColor(body.background, DEFAULT_BACKGROUND);
    if (next.join() !== background.join()) {
      background = next;
      if (sim.framed())
        sim.repaint();
    }
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
  presenter.stop();
  server.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.listen(port, "127.0.0.1");
