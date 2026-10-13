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

// src/service/layouts.generated.ts
var LAYOUT_STROKES = {
  ch: { "!": "48s", '"': "31s", "#": "32a", $: "49", "%": "34s", "&": "35s", "'": "45", "(": "37s", ")": "38s", "*": "32s", "+": "30s", ",": "54", "-": "56", ".": "55", "/": "36s", "0": "39", "1": "30", "2": "31", "3": "32", "4": "33", "5": "34", "6": "35", "7": "36", "8": "37", "9": "38", ":": "55s", ";": "54s", "<": "53", "=": "39s", ">": "53s", "?": "45s", "@": "10a", A: "4s", B: "5s", C: "6s", D: "7s", E: "8s", F: "9s", G: "10s", H: "11s", I: "12s", J: "13s", K: "14s", L: "15s", M: "16s", N: "17s", O: "18s", P: "19s", Q: "20s", R: "21s", S: "22s", T: "23s", U: "24s", V: "25s", W: "26s", X: "27s", Y: "29s", Z: "28s", "[": "34a", "\\": "36sa", "]": "35a", "^": "46sa", _: "56s", "`": "46s 44", a: "4", b: "5", c: "6", d: "7", e: "8", f: "9", g: "10", h: "11", i: "12", j: "13", k: "14", l: "15", m: "16", n: "17", o: "18", p: "19", q: "20", r: "21", s: "22", t: "23", u: "24", v: "25", w: "26", x: "27", y: "29", z: "28", "{": "37a", "|": "36a", "}": "38a", "~": "17a 44", "¡": "12a", "¢": "51a", "£": "49s", "¥": "29a", "§": "100", "¨": "48 44", "©": "6a", "ª": "11a", "«": "54a", "¬": "15a", "®": "21a", "¯": "14sa", "°": "100s", "±": "30a", "´": "46a 44", "µ": "16a", "¶": "49a", "·": "11sa", "º": "13a", "»": "54sa", "¿": "45a", "À": "46s 4s", "Á": "26sa", "Â": "46 4s", "Ã": "17a 4s", "Ä": "48 4s", "Å": "4sa", "Æ": "52sa", "Ç": "33a", "È": "21sa", "É": "46a 8s", "Ê": "46 8s", "Ë": "8sa", "Ì": "46s 12s", "Í": "28sa", "Î": "23sa", "Ï": "48 12s", "Ñ": "17a 17s", "Ò": "37sa", "Ô": "38sa", "Õ": "17a 18s", "Ö": "48 18s", "Ø": "18sa", "Ù": "24sa", "Ú": "39sa", "Û": "46 24s", "Ü": "48 24s", "ß": "22a", "à": "52s", "á": "46a 4", "â": "46 4", "ã": "17a 4", "ä": "52", "å": "4a", "æ": "52a", "ç": "33s", "è": "47s", "é": "51s", "ê": "46 8", "ë": "48 8", "ì": "46s 12", "í": "46a 12", "î": "46 12", "ï": "48 12", "ñ": "17a 17", "ò": "46s 18", "ó": "46a 18", "ô": "46 18", "õ": "17a 18", "ö": "51", "÷": "55sa", "ø": "18a", "ù": "46s 24", "ú": "46a 24", "û": "46 24", "ü": "47", "ÿ": "47sa", "ı": "12sa", "Œ": "20sa", "œ": "20a", "Ÿ": "29sa", "ƒ": "9a", "ˆ": "15sa", "˘": "51sa", "˙": "17sa", "˚": "16sa", "˜": "13sa", "Ω": "28a", "π": "19a", "–": "56a", "—": "56sa", "‚": "10sa", "†": "23a", "‡": "9sa", "•": "49sa", "…": "55a", "‰": "100sa", "‹": "32sa", "⁄": "33sa", "€": "8a", "™": "27sa", "∂": "7a", "∆": "14a", "∏": "19sa", "∑": "26a", "√": "25a", "∞": "30sa", "∫": "5a", "≈": "27a", "≠": "39a", "≤": "53a", "≥": "53sa", "◊": "25sa", "": "45sa", "ﬁ": "100a", "ﬂ": "7sa" },
  de: { "!": "30s", '"': "31s", "#": "49", $: "33s", "%": "34s", "&": "35s", "'": "49s", "(": "37s", ")": "38s", "*": "48s", "+": "48", ",": "54", "-": "56", ".": "55", "/": "36s", "0": "39", "1": "30", "2": "31", "3": "32", "4": "33", "5": "34", "6": "35", "7": "36", "8": "37", "9": "38", ":": "55s", ";": "54s", "<": "53", "=": "39s", ">": "53s", "?": "45s", "@": "15a", A: "4s", B: "5s", C: "6s", D: "7s", E: "8s", F: "9s", G: "10s", H: "11s", I: "12s", J: "13s", K: "14s", L: "15s", M: "16s", N: "17s", O: "18s", P: "19s", Q: "20s", R: "21s", S: "22s", T: "23s", U: "24s", V: "25s", W: "26s", X: "27s", Y: "29s", Z: "28s", "[": "34a", "\\": "36sa", "]": "35a", "^": "100 44", _: "56s", "`": "46s 44", a: "4", b: "5", c: "6", d: "7", e: "8", f: "9", g: "10", h: "11", i: "12", j: "13", k: "14", l: "15", m: "16", n: "17", o: "18", p: "19", q: "20", r: "21", s: "22", t: "23", u: "24", v: "25", w: "26", x: "27", y: "29", z: "28", "{": "37a", "|": "36a", "}": "38a", "~": "17a 44", "¡": "30a", "¢": "33a", "£": "33sa", "¥": "29a", "§": "32s", "¨": "24a 44", "©": "10a", "ª": "11a", "«": "20a", "¬": "30sa", "®": "21a", "¯": "39sa", "°": "100s", "±": "48a", "´": "46 44", "µ": "16a", "¶": "32a", "·": "38sa", "¸": "21sa", "º": "13a", "»": "20sa", "¿": "45a", "À": "46s 4s", "Á": "24sa", "Â": "100 4s", "Ã": "17a 4s", "Ä": "52s", "Å": "4sa", "Æ": "52sa", "Ç": "6sa", "È": "46s 8s", "É": "46 8s", "Ê": "100 8s", "Ë": "24a 8s", "Ì": "10sa", "Í": "22sa", "Î": "100 12s", "Ï": "9sa", "Ñ": "17a 17s", "Ò": "46s 18s", "Ó": "11sa", "Ô": "100 18s", "Õ": "17a 18s", "Ö": "51s", "Ø": "18sa", "Ù": "27sa", "Ú": "46 24s", "Û": "12sa", "Ü": "47s", "ß": "45", "à": "46s 4", "á": "46 4", "â": "100 4", "ã": "17a 4", "ä": "52", "å": "4a", "æ": "52a", "ç": "6a", "è": "46s 8", "é": "46 8", "ê": "100 8", "ë": "24a 8", "ì": "46s 12", "í": "46 12", "î": "100 12", "ï": "24a 12", "ñ": "17a 17", "ò": "46s 18", "ó": "46 18", "ô": "100 18", "õ": "17a 18", "ö": "51", "÷": "55sa", "ø": "18a", "ù": "46s 24", "ú": "46 24", "û": "100 24", "ü": "47", "ÿ": "24a 29", "ı": "13sa", "Œ": "51sa", "œ": "51a", "Ÿ": "24a 29s", "ƒ": "9a", "ˆ": "14sa", "ˇ": "28sa", "˘": "16sa", "˙": "45sa", "˚": "46sa", "˛": "54sa", "˜": "37sa", "˝": "23sa", "Ω": "28a", "π": "19a", "–": "56a", "—": "56sa", "‚": "22a", "„": "100a", "†": "23a", "‡": "29sa", "•": "47a", "…": "55a", "‰": "8sa", "‹": "5sa", "›": "17sa", "⁄": "12a", "€": "8a", "™": "7sa", "∂": "7a", "∆": "14a", "∏": "19sa", "∑": "26a", "√": "25a", "∞": "54a", "∫": "5a", "≈": "27a", "≠": "39a", "≤": "53a", "≥": "53sa", "◊": "25sa", "": "48sa", "ﬁ": "34sa", "ﬂ": "15sa" },
  es: { " ": "12a", "!": "30s", '"': "31s", "#": "32a", $: "33s", "%": "34s", "&": "35s", "'": "45", "(": "37s", ")": "38s", "*": "48s", "+": "48", ",": "54", "-": "56", ".": "55", "/": "36s", "0": "39", "1": "30", "2": "31", "3": "32", "4": "33", "5": "34", "6": "35", "7": "36", "8": "37", "9": "38", ":": "55s", ";": "54s", "<": "53", "=": "39s", ">": "53s", "?": "45s", "@": "31a", A: "4s", B: "5s", C: "6s", D: "7s", E: "8s", F: "9s", G: "10s", H: "11s", I: "12s", J: "13s", K: "14s", L: "15s", M: "16s", N: "17s", O: "18s", P: "19s", Q: "20s", R: "21s", S: "22s", T: "23s", U: "24s", V: "25s", W: "26s", X: "27s", Y: "28s", Z: "29s", "[": "47a", "\\": "100a", "]": "48a", "^": "47s 44", _: "56s", "`": "47 44", a: "4", b: "5", c: "6", d: "7", e: "8", f: "9", g: "10", h: "11", i: "12", j: "13", k: "14", l: "15", m: "16", n: "17", o: "18", p: "19", q: "20", r: "21", s: "22", t: "23", u: "24", v: "25", w: "26", x: "27", y: "28", z: "29", "{": "52a", "|": "30a", "}": "49a", "~": "51a 44", "¡": "46", "¢": "33a", "£": "33sa", "¥": "28a", "§": "14a", "¨": "52s 44", "©": "6a", "ª": "100s", "«": "52sa", "¬": "35a", "®": "21a", "¯": "13sa", "°": "100sa", "±": "48sa", "´": "45a", "µ": "16a", "¶": "13a", "·": "32s", "¸": "45sa", "º": "100", "»": "49sa", "¿": "46s", "À": "47 4s", "Á": "52 4s", "Â": "47s 4s", "Ã": "51a 4s", "Ä": "52s 4s", "Å": "4sa", "Æ": "26sa", "Ç": "49s", "È": "47 8s", "É": "52 8s", "Ê": "47s 8s", "Ë": "52s 8s", "Ì": "47 12s", "Í": "52 12s", "Î": "47s 12s", "Ï": "52s 12s", "Ñ": "51s", "Ò": "47 18s", "Ó": "52 18s", "Ô": "47s 18s", "Õ": "51a 18s", "Ö": "52s 18s", "Ø": "18sa", "Ù": "47 24s", "Ú": "52 24s", "Û": "47s 24s", "Ü": "52s 24s", "ß": "5a", "à": "47 4", "á": "52 4", "â": "47s 4", "ã": "51a 4", "ä": "52s 4", "å": "4a", "æ": "26a", "ç": "49", "è": "47 8", "é": "52 8", "ê": "47s 8", "ë": "52s 8", "ì": "47 12", "í": "52 12", "î": "47s 12", "ï": "52s 12", "ñ": "51", "ò": "47 18", "ó": "52 18", "ô": "47s 18", "õ": "51a 18", "ö": "52s 18", "÷": "36a", "ø": "18a", "ù": "47 24", "ú": "52 24", "û": "47s 24", "ü": "52s 24", "ÿ": "52s 28", "ı": "30sa", "Œ": "20sa", "œ": "20a", "Ÿ": "52s 28s", "ƒ": "9a", "ˆ": "47sa", "ˇ": "14sa", "˘": "15sa", "˙": "17sa", "˚": "16sa", "˛": "46sa", "˜": "51sa", "˝": "31sa", "Ω": "29a", "π": "19a", "–": "56a", "—": "56sa", "‚": "46a", "„": "54a", "†": "23a", "‡": "23sa", "•": "32sa", "…": "55a", "‰": "34sa", "‹": "29sa", "›": "27sa", "⁄": "36sa", "€": "8a", "™": "11a", "∂": "7a", "∆": "7sa", "∏": "19sa", "∑": "27a", "√": "25a", "∞": "34a", "∫": "22a", "≈": "39sa", "≠": "39a", "≤": "53a", "≥": "53sa", "◊": "25sa", "": "10a", "ﬁ": "9sa", "ﬂ": "10sa" },
  fr: { "!": "37", '"': "32", "#": "100s", $: "48", "%": "52s", "&": "30", "'": "33", "(": "34", ")": "45", "*": "48s", "+": "56s", ",": "16", "-": "46", ".": "54s", "/": "55s", "0": "39s", "1": "30s", "2": "31s", "3": "32s", "4": "33s", "5": "34s", "6": "35s", "7": "36s", "8": "37s", "9": "38s", ":": "55", ";": "54", "<": "53", "=": "56", ">": "53s", "?": "16s", "@": "100", A: "20s", B: "5s", C: "6s", D: "7s", E: "8s", F: "9s", G: "10s", H: "11s", I: "12s", J: "13s", K: "14s", L: "15s", M: "51s", N: "17s", O: "18s", P: "19s", Q: "4s", R: "21s", S: "22s", T: "23s", U: "24s", V: "25s", W: "29s", X: "27s", Y: "28s", Z: "26s", "[": "34sa", "\\": "55sa", "]": "45sa", "^": "47 44", _: "46s", "`": "49 44", a: "20", b: "5", c: "6", d: "7", e: "8", f: "9", g: "10", h: "11", i: "12", j: "13", k: "14", l: "15", m: "51", n: "17", o: "18", p: "19", q: "4", r: "21", s: "22", t: "23", u: "24", v: "25", w: "29", x: "27", y: "28", z: "26", "{": "34a", "|": "15sa", "}": "45a", "~": "17a 44", "¡": "37a", "¢": "6sa", "£": "49s", "¥": "48sa", "§": "35", "¨": "47s 44", "©": "6a", "ª": "24sa", "«": "36a", "¬": "15a", "®": "21a", "°": "45s", "±": "56sa", "´": "30sa 44", "µ": "51a", "¶": "35a", "·": "9sa", "º": "24a", "»": "36sa", "¿": "16sa", "À": "49 20s", "Á": "38sa", "Â": "26a", "Ã": "17a 20s", "Ä": "47s 20s", "Å": "26sa", "Æ": "20sa", "Ç": "38a", "È": "14a", "É": "30sa 8s", "Ê": "8sa", "Ë": "14sa", "Ì": "11a", "Í": "13sa", "Î": "11sa", "Ï": "13a", "Ñ": "17a 17s", "Ò": "22a", "Ó": "51sa", "Ô": "47sa", "Õ": "17a 18s", "Ö": "47s 18s", "Ø": "39sa", "Ù": "52a", "Ú": "28a", "Û": "37sa", "Ü": "47s 24s", "ß": "5a", "à": "39", "á": "30sa 20", "â": "47 20", "ã": "17a 20", "ä": "47s 20", "å": "35sa", "æ": "20a", "ç": "38", "è": "36", "é": "31", "ê": "8a", "ë": "31a", "ì": "49 12", "í": "30sa 12", "î": "12a", "ï": "12sa", "ñ": "17a 17", "ò": "49 18", "ó": "30sa 18", "ô": "47a", "õ": "17a 18", "ö": "47s 18", "÷": "55a", "ø": "39a", "ù": "52", "ú": "30sa 24", "û": "47 24", "ü": "47s 24", "ÿ": "47s 28", "ı": "17sa", "Œ": "18sa", "œ": "18a", "Ÿ": "28sa", "ƒ": "9a", "Ω": "4sa", "π": "19a", "–": "46sa", "—": "46a", "‚": "21sa", "„": "31sa", "†": "23a", "‡": "4a", "•": "100a", "…": "54a", "‰": "52sa", "‹": "29a", "›": "29sa", "⁄": "27sa", "€": "48a", "™": "23sa", "∂": "7a", "∆": "7sa", "∏": "19sa", "∑": "22sa", "√": "25sa", "∞": "16a", "∫": "5sa", "≈": "27a", "≠": "56a", "≤": "53a", "≥": "53sa", "◊": "25a", "": "30a", "ﬁ": "10a", "ﬂ": "10sa" },
  gb: { "!": "30s", '"': "52s", "#": "32a", $: "33s", "%": "34s", "&": "36s", "'": "52", "(": "38s", ")": "39s", "*": "37s", "+": "46s", ",": "54", "-": "45", ".": "55", "/": "56", "0": "39", "1": "30", "2": "31", "3": "32", "4": "33", "5": "34", "6": "35", "7": "36", "8": "37", "9": "38", ":": "51s", ";": "51", "<": "54s", "=": "46", ">": "55s", "?": "56s", "@": "31s", A: "4s", B: "5s", C: "6s", D: "7s", E: "8s", F: "9s", G: "10s", H: "11s", I: "12s", J: "13s", K: "14s", L: "15s", M: "16s", N: "17s", O: "18s", P: "19s", Q: "20s", R: "21s", S: "22s", T: "23s", U: "24s", V: "25s", W: "26s", X: "27s", Y: "28s", Z: "29s", "[": "47", "\\": "49", "]": "48", "^": "35s", _: "45s", "`": "53", a: "4", b: "5", c: "6", d: "7", e: "8", f: "9", g: "10", h: "11", i: "12", j: "13", k: "14", l: "15", m: "16", n: "17", o: "18", p: "19", q: "20", r: "21", s: "22", t: "23", u: "24", v: "25", w: "26", x: "27", y: "28", z: "29", "{": "47s", "|": "49s", "}": "48s", "~": "53s", "¡": "30a", "¢": "33a", "£": "32s", "¥": "28a", "§": "100", "¨": "24a 44", "©": "10a", "ª": "38a", "«": "49a", "¬": "15a", "®": "21a", "¯": "54sa", "°": "37sa", "±": "100s", "´": "8a 44", "µ": "16a", "¶": "36a", "·": "38sa", "º": "39a", "»": "49sa", "¿": "56sa", "À": "53a 4s", "Á": "28sa", "Â": "21sa", "Ã": "17a 4s", "Ä": "24a 4s", "Å": "4sa", "Æ": "52sa", "Ç": "6sa", "È": "12sa", "É": "8a 8s", "Ê": "23sa", "Ë": "24sa", "Ì": "10sa", "Í": "22sa", "Î": "7sa", "Ï": "9sa", "Ñ": "17a 17s", "Ò": "15sa", "Ó": "11sa", "Ô": "13sa", "Õ": "17a 18s", "Ö": "24a 18s", "Ø": "18sa", "Ù": "27sa", "Ú": "51sa", "Û": "29sa", "Ü": "24a 24s", "ß": "22a", "à": "53a 4", "á": "8a 4", "â": "12a 4", "ã": "17a 4", "ä": "24a 4", "å": "4a", "æ": "52a", "ç": "6a", "è": "53a 8", "é": "8a 8", "ê": "12a 8", "ë": "24a 8", "ì": "53a 12", "í": "8a 12", "î": "12a 12", "ï": "24a 12", "ñ": "17a 17", "ò": "53a 18", "ó": "8a 18", "ô": "12a 18", "õ": "17a 18", "ö": "24a 18", "÷": "56a", "ø": "18a", "ù": "53a 24", "ú": "8a 24", "û": "12a 24", "ü": "24a 24", "ÿ": "24a 28", "ı": "5sa", "Œ": "20sa", "œ": "20a", "Ÿ": "53sa", "ƒ": "9a", "ˆ": "17sa", "˘": "55sa", "˙": "11a", "˚": "14a", "˜": "16sa", "Ω": "29a", "π": "19a", "–": "45a", "—": "45sa", "‚": "39sa", "„": "26sa", "†": "23a", "‡": "36sa", "•": "37a", "…": "51a", "‰": "8sa", "‹": "32sa", "›": "33sa", "⁄": "30sa", "€": "31a", "™": "31sa", "∂": "7a", "∆": "13a", "∏": "19sa", "∑": "26a", "√": "25a", "∞": "34a", "∫": "5a", "≈": "27a", "≠": "46a", "≤": "54a", "≥": "55a", "◊": "25sa", "": "14sa", "ﬁ": "34sa", "ﬂ": "35sa" },
  it: { " ": "29sa", "!": "30s", '"': "31s", "#": "52a", $: "33s", "%": "34s", "&": "35s", "'": "45", "(": "37s", ")": "38s", "*": "48s", "+": "48", ",": "54", "-": "56", ".": "55", "/": "36s", "0": "39", "1": "30", "2": "31", "3": "32", "4": "33", "5": "34", "6": "35", "7": "36", "8": "37", "9": "38", ":": "55s", ";": "54s", "<": "53", "=": "39s", ">": "53s", "?": "45s", "@": "51a", A: "4s", B: "5s", C: "6s", D: "7s", E: "8s", F: "9s", G: "10s", H: "11s", I: "12s", J: "13s", K: "14s", L: "15s", M: "16s", N: "17s", O: "18s", P: "19s", Q: "20s", R: "21s", S: "22s", T: "23s", U: "24s", V: "25s", W: "26s", X: "27s", Y: "28s", Z: "29s", "[": "47a", "\\": "100", "]": "48a", "^": "46s", _: "56s", "`": "100a", a: "4", b: "5", c: "6", d: "7", e: "8", f: "9", g: "10", h: "11", i: "12", j: "13", k: "14", l: "15", m: "16", n: "17", o: "18", p: "19", q: "20", r: "21", s: "22", t: "23", u: "24", v: "25", w: "26", x: "27", y: "28", z: "29", "{": "47sa", "|": "100s", "}": "48sa", "~": "34a", "¡": "45a", "¢": "33sa", "£": "32s", "¥": "33a", "§": "49s", "¨": "24a 44", "©": "6a", "ª": "13a", "«": "30a", "¬": "15a", "®": "21a", "¯": "22sa", "°": "52s", "±": "46sa", "´": "37a 44", "µ": "16a", "¶": "49a", "·": "55sa", "¸": "11sa", "º": "14a", "»": "30sa", "¿": "45sa", "À": "26sa", "Á": "6sa", "Â": "46a 4s", "Ã": "17a 4s", "Ä": "24a 4s", "Å": "4sa", "Æ": "28sa", "Ç": "51sa", "È": "8sa", "É": "25sa", "Ê": "46a 8s", "Ë": "24a 8s", "Ì": "21sa", "Í": "5sa", "Î": "46a 12s", "Ï": "24a 12s", "Ñ": "17a 17s", "Ò": "23sa", "Ó": "17sa", "Ô": "46a 18s", "Õ": "17a 18s", "Ö": "24a 18s", "Ø": "18sa", "Ù": "24sa", "Ú": "16sa", "Û": "46a 24s", "Ü": "24a 24s", "ß": "22a", "à": "52", "á": "37a 4", "â": "46a 4", "ã": "17a 4", "ä": "24a 4", "å": "4a", "æ": "28a", "ç": "51s", "è": "47", "é": "47s", "ê": "46a 8", "ë": "24a 8", "ì": "46", "í": "37a 12", "î": "46a 12", "ï": "24a 12", "ñ": "17a 17", "ò": "51", "ó": "37a 18", "ô": "46a 18", "õ": "17a 18", "ö": "24a 18", "÷": "36a", "ø": "18a", "ù": "49", "ú": "37a 24", "û": "46a 24", "ü": "24a 24", "ÿ": "24a 28", "ı": "100sa", "Œ": "12sa", "œ": "12a", "Ÿ": "24a 28s", "ƒ": "9a", "ˆ": "46a 44", "ˇ": "15sa", "˘": "7sa", "˙": "9sa", "˚": "10sa", "˛": "14sa", "˜": "17a 44", "˝": "13sa", "Ω": "26a", "π": "19a", "–": "56a", "—": "56sa", "‚": "20sa", "„": "20a", "†": "27a", "‡": "27sa", "•": "55a", "…": "54a", "‰": "34sa", "‹": "35a", "›": "35sa", "⁄": "36sa", "€": "8a", "™": "23a", "∂": "7a", "∆": "11a", "∏": "19sa", "∑": "29a", "√": "25a", "∞": "10a", "∫": "5a", "≈": "39sa", "≠": "39a", "≤": "53a", "≥": "53sa", "◊": "49sa", "": "37sa" },
  us: { "!": "30s", '"': "52s", "#": "32s", $: "33s", "%": "34s", "&": "36s", "'": "52", "(": "38s", ")": "39s", "*": "37s", "+": "46s", ",": "54", "-": "45", ".": "55", "/": "56", "0": "39", "1": "30", "2": "31", "3": "32", "4": "33", "5": "34", "6": "35", "7": "36", "8": "37", "9": "38", ":": "51s", ";": "51", "<": "54s", "=": "46", ">": "55s", "?": "56s", "@": "31s", A: "4s", B: "5s", C: "6s", D: "7s", E: "8s", F: "9s", G: "10s", H: "11s", I: "12s", J: "13s", "J́": "8a 13s", K: "14s", L: "15s", M: "16s", N: "17s", O: "18s", P: "19s", Q: "20s", R: "21s", S: "22s", T: "23s", U: "24s", V: "25s", W: "26s", X: "27s", Y: "28s", Z: "29s", "[": "47", "\\": "49", "]": "48", "^": "35s", _: "45s", "`": "53", a: "4", b: "5", c: "6", d: "7", e: "8", f: "9", g: "10", h: "11", i: "12", j: "13", "j́": "8a 13", k: "14", l: "15", m: "16", n: "17", o: "18", p: "19", q: "20", r: "21", s: "22", t: "23", u: "24", v: "25", w: "26", x: "27", y: "28", z: "29", "{": "47s", "|": "49s", "}": "48s", "~": "53s", "¡": "30a", "¢": "33a", "£": "32a", "¥": "28a", "§": "100", "¨": "24sa", "©": "10a", "ª": "38a", "«": "49a", "¬": "15a", "®": "21a", "¯": "54sa", "°": "37sa", "±": "100s", "´": "8sa", "µ": "16a", "¶": "36a", "·": "38sa", "¸": "29sa", "º": "39a", "»": "49sa", "¿": "56sa", "À": "53a 4s", "Á": "28sa", "Â": "16sa", "Ã": "17a 4s", "Ä": "24a 4s", "Å": "4sa", "Æ": "52sa", "Ç": "6sa", "È": "53a 8s", "É": "8a 8s", "Ê": "12a 8s", "Ë": "24a 8s", "Ì": "53a 12s", "Í": "22sa", "Î": "7sa", "Ï": "9sa", "Ñ": "17a 17s", "Ò": "15sa", "Ó": "11sa", "Ô": "13sa", "Õ": "17a 18s", "Ö": "24a 18s", "Ø": "18sa", "Ù": "53a 24s", "Ú": "51sa", "Û": "12a 24s", "Ü": "24a 24s", "ß": "22a", "à": "53a 4", "á": "8a 4", "â": "12a 4", "ã": "17a 4", "ä": "24a 4", "å": "4a", "æ": "52a", "ç": "6a", "è": "53a 8", "é": "8a 8", "ê": "12a 8", "ë": "24a 8", "ì": "53a 12", "í": "8a 12", "î": "12a 12", "ï": "24a 12", "ñ": "17a 17", "ò": "53a 18", "ó": "8a 18", "ô": "12a 18", "õ": "17a 18", "ö": "24a 18", "÷": "56a", "ø": "18a", "ù": "53a 24", "ú": "8a 24", "û": "12a 24", "ü": "24a 24", "ÿ": "24a 28", "ı": "5sa", "Œ": "20sa", "œ": "20a", "Ÿ": "24a 28s", "ƒ": "9a", "ˆ": "12sa", "ˇ": "23sa", "˘": "55sa", "˙": "11a", "˚": "14a", "˛": "27sa", "˜": "17sa", "˝": "10sa", "Ω": "29a", "π": "19a", "–": "45a", "—": "45sa", "‚": "39sa", "„": "26sa", "†": "23a", "‡": "36sa", "•": "37a", "…": "51a", "‰": "21sa", "‹": "32sa", "›": "33sa", "⁄": "30sa", "€": "31sa", "™": "31a", "∂": "7a", "∆": "13a", "∏": "19sa", "∑": "26a", "√": "25a", "∞": "34a", "∫": "5a", "≈": "27a", "≠": "46a", "≤": "54a", "≥": "55a", "◊": "25sa", "": "14sa", "ﬁ": "34sa", "ﬂ": "35sa" }
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
var parseStroke = (text) => {
  const match = /^(\d+)(s?)(a?)$/.exec(text);
  if (!match)
    throw new Error(`bad stroke ${text}`);
  return { usage: Number(match[1]), ...match[2] ? { shift: true } : {}, ...match[3] ? { alt: true } : {} };
};
var buildTable = (strokes) => {
  const table = new Map(Object.entries(strokes).map(([char, sequence]) => [char, sequence.split(" ").map(parseStroke)]));
  table.set(" ", [{ usage: HID.space }]);
  table.set(`
`, [{ usage: HID.enter }]);
  table.set("\t", [{ usage: HID.tab }]);
  return table;
};
var TABLES = new Map;
var tableFor = (layout) => {
  let table = TABLES.get(layout);
  if (!table) {
    table = buildTable(LAYOUT_STROKES[layout]);
    TABLES.set(layout, table);
  }
  return table;
};
var KEYBOARD_LAYOUTS = Object.keys(LAYOUT_STROKES).sort();
var HARDWARE_NAMES = {
  German: "de",
  "U.S.": "us",
  US: "us",
  British: "gb",
  French: "fr",
  Spanish: "es",
  "Spanish - ISO": "es",
  "Swiss German": "ch",
  Italian: "it",
  "Italian - Pro": "it"
};
var layoutFromLocale = (locale) => {
  const match = /^([a-z]{2,3})(?:[_-]([A-Z]{2}))?/.exec(locale.trim());
  if (!match)
    return null;
  const [, language, region] = match;
  if (language === "de")
    return region === "CH" ? "ch" : "de";
  if (language === "en")
    return region === "GB" ? "gb" : "us";
  if (language === "fr")
    return region === "FR" || !region ? "fr" : null;
  if (language === "es")
    return region === "ES" || !region ? "es" : null;
  if (language === "it")
    return "it";
  return null;
};
var layoutFromKeyboards = (keyboards, locale = "") => {
  const first = /"?([a-zA-Z_-]+)@([^"\n]*)/.exec(keyboards);
  if (first) {
    const hardware = /hw=([^;"]+)/.exec(first[2] ?? "")?.[1]?.trim();
    if (hardware && hardware !== "Automatic" && HARDWARE_NAMES[hardware])
      return HARDWARE_NAMES[hardware];
    return layoutFromLocale(first[1]) ?? "us";
  }
  return layoutFromLocale(locale) ?? "us";
};
var sequenceForChar = (char, layout = "us") => tableFor(layout).get(char) ?? null;
var strokeForChar = (char, layout = "us") => {
  const sequence = sequenceForChar(char, layout);
  return sequence?.length === 1 ? sequence[0] : null;
};
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
  const chars = [...text.replace(/\r\n?/g, `
`)];
  let typed = "";
  for (let index = 0;index < chars.length; index += 1) {
    const char = chars[index];
    const sequence = sequenceForChar(char, layout);
    if (!sequence) {
      skipped += 1;
      if (typed === " " && chars[index + 1] === " ")
        index += 1;
      continue;
    }
    for (const stroke of sequence)
      events.push(...pressSequence(stroke));
    typed = char;
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
      const type = device.deviceTypeIdentifier ?? "";
      if (type ? !/SimDeviceType\.(iPhone|iPad)/.test(type) : !/^(iPhone|iPad)\b/.test(device.name))
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
  const [keyboards, locale] = await Promise.all([
    run(XCRUN, ["simctl", "spawn", udid, "defaults", "read", "-g", "AppleKeyboards"], { timeout: 1e4 }),
    run(XCRUN, ["simctl", "spawn", udid, "defaults", "read", "-g", "AppleLocale"], { timeout: 1e4 })
  ]);
  return layoutFromKeyboards(keyboards.ok ? keyboards.stdout : "", locale.ok ? locale.stdout.trim() : "");
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

// src/service/paste.ts
var createPasteboard = (simctl) => ({
  async read(udid) {
    const result = await simctl(["simctl", "pbpaste", udid], { timeout: 5000 });
    return result.ok && result.stdout.length > 0 ? result.stdout : null;
  },
  async write(udid, text) {
    const written = await simctl(["simctl", "pbcopy", udid], { timeout: 5000, input: text });
    if (!written.ok)
      return false;
    const back = await simctl(["simctl", "pbpaste", udid], { timeout: 5000 });
    return back.ok && back.stdout === text;
  }
});
var pasteChord = (layout) => pressSequence(strokeForChar("v", layout) ?? { usage: 25 }, { meta: true }).map((event) => ({ op: "key", event }));
var sendInput = async (events, deps) => {
  let skippedChars = 0;
  let pasted = 0;
  const buttons = [];
  let chunk = [];
  const flush = async () => {
    if (chunk.length === 0)
      return;
    const result = deps.translate(chunk);
    chunk = [];
    skippedChars += result.skippedChars;
    buttons.push(...result.buttons);
    await deps.send(result.messages);
  };
  for (const event of events) {
    if (event.type === "text" && deps.udid && typeText(event.text, deps.layout).skipped > 0 && await deps.pasteboard.write(deps.udid, event.text)) {
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

// src/service/preview-servers.ts
import { spawn } from "node:child_process";
import { closeSync, existsSync as existsSync2, openSync, readFileSync as readFileSync3, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { networkInterfaces as networkInterfaces2, tmpdir as tmpdir5 } from "node:os";
import { join as join6 } from "node:path";

// src/service/serve-sim-servers.ts
import { readdirSync, readFileSync as readFileSync2 } from "node:fs";
import { networkInterfaces, tmpdir as tmpdir4 } from "node:os";
import { join as join5 } from "node:path";

// src/shared/direct.ts
var normalizeDirectUrl = (input) => {
  if (typeof input !== "string")
    return null;
  const text = input.trim();
  if (!text)
    return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return null;
  if (!url.hostname || url.username || url.password || url.search || url.hash)
    return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
};

// src/service/serve-sim-servers.ts
var PREVIEW_PORTS = Array.from({ length: 10 }, (_, index) => 3200 + index);
var OWN_HELPER_PORTS = { first: 3100, last: 3109 };
var PROBE_TIMEOUT_MS = 3000;
var PAGE_TIMEOUT_MS = 8000;
var PREVIEW_MARKER = "window.__SIM_PREVIEW__=";
var PAGE_READ_MAX = 1024 * 1024;
var isLoopbackHost = (host) => host === "localhost" || host === "[::1]" || host === "::1" || host.startsWith("127.");
var ownHelper = (url) => {
  const port = Number(url.port);
  return isLoopbackHost(url.hostname) && port >= OWN_HELPER_PORTS.first && port <= OWN_HELPER_PORTS.last;
};
var candidateUrls = (stateFileUrls, addresses) => {
  const urls = new Set;
  for (const raw of stateFileUrls) {
    const url = normalizeDirectUrl(raw);
    if (url && !ownHelper(new URL(url)))
      urls.add(url);
  }
  for (const address of addresses)
    for (const port of PREVIEW_PORTS)
      urls.add(`http://${address}:${port}`);
  const loopback = (url) => isLoopbackHost(new URL(url).hostname);
  return [...urls].sort((a, b) => Number(loopback(a)) - Number(loopback(b)));
};
var answers = async (url, booted, probe) => (await Promise.all(booted.map((device) => probe(url, device.udid)))).some(Boolean);
var findServers = async (deps) => {
  const booted = await deps.booted();
  if (booted.length === 0)
    return [];
  const urls = candidateUrls(deps.stateFileUrls(), deps.addresses());
  const alive = (await Promise.all(urls.map(async (url) => await answers(url, booted, deps.probe) ? url : null))).filter((url) => url !== null);
  return Promise.all(alive.map(async (url) => {
    const udid = await deps.pageDevice(url);
    const name = booted.find((device) => device.udid === udid)?.name ?? "";
    return { url, udid: udid ?? "", name, loopback: isLoopbackHost(new URL(url).hostname) };
  }));
};
var checkServer = async (raw, deps) => {
  const url = normalizeDirectUrl(raw);
  if (!url)
    return null;
  const booted = await deps.booted();
  return booted.length === 0 ? null : answers(url, booted, deps.probe);
};
var previewDevice = (html) => {
  const at = html.indexOf(PREVIEW_MARKER);
  if (at < 0)
    return null;
  return /"device":"([0-9A-Fa-f-]{36})"/.exec(html.slice(at, at + 400))?.[1] ?? null;
};
var stateFileUrls = (dir = join5(tmpdir4(), "serve-sim")) => {
  let names = [];
  try {
    names = readdirSync(dir).filter((name) => name.startsWith("server-") && name.endsWith(".json"));
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    try {
      const state = JSON.parse(readFileSync2(join5(dir, name), "utf8"));
      return typeof state.url === "string" ? [state.url] : [];
    } catch {
      return [];
    }
  });
};
var ipv4Addresses = () => Object.values(networkInterfaces()).flatMap((entries) => (entries ?? []).filter((entry) => entry.family === "IPv4").map((entry) => entry.address));
var pagePreviewDevice = async (base) => {
  try {
    const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS), redirect: "error" });
    if (!response.ok || !response.body)
      return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder;
    let html = "";
    try {
      while (html.length < PAGE_READ_MAX) {
        const { done, value } = await reader.read();
        if (done)
          break;
        html += decoder.decode(value, { stream: true });
        const at = html.indexOf(PREVIEW_MARKER);
        if (at >= 0 && html.length > at + 400)
          break;
      }
    } finally {
      reader.cancel().catch(() => {
        return;
      });
    }
    return previewDevice(html);
  } catch {
    return null;
  }
};
var probeHealth = async (base, udid) => {
  try {
    const response = await fetch(`${base}/helper/${encodeURIComponent(udid)}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: "error" });
    if (!response.ok)
      return false;
    return (await response.json()).status === "ok";
  } catch {
    return false;
  }
};
var serverDeps = (booted) => ({
  stateFileUrls: () => stateFileUrls(),
  addresses: ipv4Addresses,
  booted,
  probe: probeHealth,
  pageDevice: pagePreviewDevice
});

// src/service/preview-servers.ts
var PS = ["/bin/ps", "ps"];
var rank = (address) => {
  const [a = 0, b = 0] = address.split(".").map(Number);
  if (a === 100 && b >= 64 && b <= 127)
    return 0;
  if (a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31)
    return 1;
  if (a === 127)
    return 3;
  return 2;
};
var ownAddresses = (interfaces = networkInterfaces2()) => Object.entries(interfaces).flatMap(([name, entries]) => (entries ?? []).filter((entry) => entry.family === "IPv4").map((entry) => ({ address: entry.address, interface: name }))).sort((left, right) => rank(left.address) - rank(right.address));

class PreviewError extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
var STOP_WAIT_MS = 3000;
var isOurServer = (entry, command) => {
  if (!command)
    return false;
  const url = new URL(entry.url);
  const tokens = command.trim().split(/\s+/);
  const value = (flag) => tokens[tokens.indexOf(flag) + 1];
  return tokens.some((token) => token === "serve-sim" || token.endsWith("/serve-sim")) && tokens.includes(entry.udid) && tokens.includes("--host") && value("--host") === url.hostname && tokens.includes("--port") && value("--port") === url.port;
};
var createPreviews = (deps) => {
  let queue = Promise.resolve();
  const started = async () => {
    const list = deps.readRecord();
    const checked = await Promise.all(list.map(async (entry) => deps.alive(entry.pid) && isOurServer(entry, await deps.commandOf(entry.pid)) ? entry : null));
    const living = checked.filter((entry) => entry !== null);
    if (living.length !== list.length)
      deps.writeRecord(living);
    return living;
  };
  const startNow = async (address, udid) => {
    let port = null;
    for (const candidate of PREVIEW_PORTS) {
      if (await deps.portFree(address, candidate) && await deps.portFree("0.0.0.0", candidate)) {
        port = candidate;
        break;
      }
    }
    if (port === null)
      throw new PreviewError(`No free port ${PREVIEW_PORTS[0]}-${PREVIEW_PORTS[PREVIEW_PORTS.length - 1]} on ${address}`, 409);
    const pid = deps.launch(udid, address, port);
    if (pid === undefined)
      throw new PreviewError("serve-sim did not start", 500);
    const entry = { pid, url: `http://${address}:${port}`, udid };
    let confirmed = 0;
    for (const deadline = Date.now() + deps.startTimeoutMs;Date.now() < deadline; ) {
      await deps.sleep(500);
      if (!deps.alive(pid))
        break;
      const ours = await deps.probe(entry.url, udid) && deps.alive(pid) && isOurServer(entry, await deps.commandOf(pid));
      confirmed = ours ? confirmed + 1 : 0;
      if (confirmed >= 2) {
        deps.writeRecord([...(await started()).filter((other) => other.url !== entry.url), entry]);
        return entry;
      }
    }
    deps.kill(pid);
    throw new PreviewError("serve-sim did not answer (log: $TMPDIR/openchamber-ios-simulator-serve-sim.log)", 500);
  };
  return {
    started,
    start(address, udid) {
      if (typeof address !== "string" || !deps.addresses().some((own) => own.address === address)) {
        return Promise.reject(new PreviewError("Not an address of this machine", 400));
      }
      const run = queue.then(() => startNow(address, udid));
      queue = run.catch(() => {
        return;
      });
      return run;
    },
    async stop(url) {
      const list = await started();
      const entry = list.find((candidate) => candidate.url === url);
      if (!entry)
        throw new PreviewError("Not a server this extension started", 404);
      deps.kill(entry.pid);
      for (const deadline = Date.now() + STOP_WAIT_MS;deps.alive(entry.pid) && Date.now() < deadline; )
        await deps.sleep(100);
      if (deps.alive(entry.pid))
        throw new PreviewError("serve-sim is still running; try Stop again", 409);
      deps.writeRecord(deps.readRecord().filter((candidate) => candidate.url !== entry.url));
    }
  };
};
var RECORD = join6(tmpdir5(), "openchamber-ios-simulator-previews.json");
var readRecord = () => {
  try {
    const value = JSON.parse(readFileSync3(RECORD, "utf8"));
    return Array.isArray(value) ? value.filter((entry) => typeof entry?.pid === "number" && typeof entry?.url === "string" && typeof entry?.udid === "string") : [];
  } catch {
    return [];
  }
};
var portFree = (address, port) => new Promise((resolve) => {
  const server = createServer();
  server.once("error", () => resolve(false));
  server.listen(port, address, () => server.close(() => resolve(true)));
});
var launch = (udid, address, port) => {
  const log = openSync(join6(tmpdir5(), "openchamber-ios-simulator-serve-sim.log"), "a");
  const binary = SERVE_SIM.find((candidate) => !candidate.startsWith("/") || existsSync2(candidate)) ?? "serve-sim";
  const child = spawn(binary, [udid, "--host", address, "--port", String(port), "--exit-on-simulator-shutdown"], { detached: true, stdio: ["ignore", log, log], env: childEnv() });
  closeSync(log);
  child.on("error", () => {
    return;
  });
  child.unref();
  return child.pid;
};
var previewDeps = (probe) => ({
  addresses: () => ownAddresses(),
  portFree,
  launch,
  probe,
  alive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  commandOf: async (pid) => {
    const result = await run(PS, ["-p", String(pid), "-o", "command="], { timeout: 5000 });
    return result.ok && result.stdout.trim() ? result.stdout.trim() : null;
  },
  kill: (pid) => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  },
  readRecord,
  writeRecord: (list) => writeFileSync(RECORD, JSON.stringify(list)),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  startTimeoutMs: 30000
});

// src/service/device-link.ts
import http from "node:http";

// src/service/helper.ts
import { spawn as spawn2 } from "node:child_process";
import { existsSync as existsSync3, openSync as openSync2, closeSync as closeSync2, readdirSync as readdirSync2, readFileSync as readFileSync4 } from "node:fs";
import { createServer as createServer2 } from "node:net";
import { tmpdir as tmpdir6 } from "node:os";
import { join as join7 } from "node:path";

// src/service/serve-sim-processes.ts
var UUID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
var VALUE_FLAGS = new Set(["--port", "-p", "--host", "--codec", "--panes", "--theme", "-d", "--device"]);
var NOT_A_STREAM = new Set(["--list", "-l", "--kill", "-k", "--help", "-h", "--version", "-v"]);
var DEFAULT_PORT = 3200;
var DEFAULT_HOST = "127.0.0.1";
var OWN_PORTS = { first: 3100, last: 3109 };
var serveSimArgs = (command) => {
  const tokens = command.trim().split(/\s+/);
  const isServeSim = (token = "") => token === "serve-sim" || token.endsWith("/serve-sim");
  if (isServeSim(tokens[0]))
    return tokens.slice(1);
  if (/(^|\/)node$/.test(tokens[0] ?? "") && isServeSim(tokens[1]))
    return tokens.slice(2);
  return null;
};
var parseServeSimProcesses = (output) => {
  const found = [];
  for (const line of output.split(`
`)) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match)
      continue;
    const args = serveSimArgs(match[2]);
    if (!args)
      continue;
    let host = DEFAULT_HOST;
    let port = DEFAULT_PORT;
    let exitsWithSimulator = false;
    let stream = true;
    const devices = [];
    for (let index = 0;index < args.length; index += 1) {
      const token = args[index];
      if (NOT_A_STREAM.has(token)) {
        stream = false;
        break;
      }
      if (VALUE_FLAGS.has(token)) {
        const value = args[index += 1] ?? "";
        if (token === "--host")
          host = value;
        if (token === "--port" || token === "-p")
          port = Number(value) || DEFAULT_PORT;
        continue;
      }
      if (token.startsWith("--host="))
        host = token.slice("--host=".length);
      else if (token.startsWith("--port="))
        port = Number(token.slice("--port=".length)) || DEFAULT_PORT;
      else if (token === "--exit-on-simulator-shutdown")
        exitsWithSimulator = true;
      else if (UUID.test(token))
        devices.push(token.toUpperCase());
      else if (!token.startsWith("-")) {
        if (devices.length === 0 && index === 0) {
          stream = false;
          break;
        }
      }
    }
    if (!stream)
      continue;
    const own = host === "127.0.0.1" && port >= OWN_PORTS.first && port <= OWN_PORTS.last && exitsWithSimulator;
    found.push({ pid: Number(match[1]), host, port, own, devices });
  }
  return found;
};
var processesFor = (all, udid, booted, ownPids = new Set) => booted ? all.filter((entry) => entry.devices.length === 0 ? true : entry.devices.includes(udid.toUpperCase())).map(({ pid, host, port, own }) => ({ pid, host, port, own: own || ownPids.has(pid) })) : [];
var CACHE_MS = 5000;
var PS2 = ["/bin/ps", "ps"];
var createProcessReader = (read = async () => {
  const result = await run(PS2, ["-axo", "pid=,command="], { timeout: 5000 });
  return result.ok ? result.stdout : null;
}) => {
  let cached = null;
  let pending = null;
  const reader = async () => {
    if (cached && Date.now() - cached.at < CACHE_MS)
      return cached.list;
    pending ??= (async () => {
      const output = await read().catch(() => null);
      const list = output === null ? [] : parseServeSimProcesses(output);
      cached = { at: Date.now(), list };
      return list;
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
  return Object.assign(reader, {
    forget() {
      cached = null;
    }
  });
};

// src/service/helper.ts
var helperProcesses = createProcessReader();
var LOOPBACK = "127.0.0.1";
var FIRST_PORT = 3100;
var PORT_SPAN = 10;
var STOP_TIMEOUT_MS = 3000;
var isLoopbackUrl = (url) => {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return false;
  }
};
var helpersFromStateFiles = (dir = join7(tmpdir6(), "serve-sim")) => {
  const helpers = [];
  let names = [];
  try {
    names = readdirSync2(dir).filter((name) => name.startsWith("server-") && name.endsWith(".json"));
  } catch {
    return helpers;
  }
  for (const name of names) {
    try {
      const state = JSON.parse(readFileSync4(join7(dir, name), "utf8"));
      if (typeof state.url !== "string" || !isLoopbackUrl(state.url) || typeof state.port !== "number" || typeof state.device !== "string")
        continue;
      helpers.push({ port: state.port, device: state.device, ...typeof state.pid === "number" ? { pid: state.pid } : {} });
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
var portFree2 = (port) => new Promise((resolve) => {
  const server = createServer2();
  server.once("error", () => resolve(false));
  server.listen(port, LOOPBACK, () => server.close(() => resolve(true)));
});
var serveSimBinary = () => SERVE_SIM.find((candidate) => !candidate.startsWith("/") || existsSync3(candidate)) ?? "serve-sim";
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var launchServeSim = (udid, port, onExit) => {
  const log = openSync2(join7(tmpdir6(), "openchamber-ios-simulator-serve-sim.log"), "a");
  const child = spawn2(serveSimBinary(), [udid, "--port", String(port), "--host", LOOPBACK, "--exit-on-simulator-shutdown"], { detached: true, stdio: ["ignore", log, log], env: childEnv() });
  closeSync2(log);
  child.once("exit", onExit);
  child.once("error", onExit);
  child.unref();
  return child.pid;
};
var createHelpers = (deps) => {
  const started = new Map;
  const pids = new Map;
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
      const pid = deps.launch(udid, port, () => {
        exited = true;
        if (started.get(port) === udid) {
          started.delete(port);
          pids.delete(port);
        }
      });
      if (pid !== undefined)
        pids.set(port, pid);
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
  const ensure = async (udid, remembered) => {
    for (const port of candidatePorts(udid, remembered, started, await deps.recorded())) {
      if (await deps.probe(port, udid))
        return port;
    }
    let pending = starting.get(udid);
    if (!pending) {
      pending = startHelper(udid).finally(() => starting.delete(udid));
      starting.set(udid, pending);
    }
    return pending;
  };
  const restart = async (udid) => {
    await starting.get(udid)?.catch(() => {
      return;
    });
    const targets = new Map;
    for (const [port, device] of started)
      if (device === udid)
        targets.set(port, pids.get(port));
    for (const entry of await deps.recorded()) {
      if (entry.device !== udid || entry.pid === undefined || (started.get(entry.port) ?? udid) !== udid)
        continue;
      if (targets.get(entry.port) === undefined && await deps.probe(entry.port, udid))
        targets.set(entry.port, entry.pid);
    }
    for (const [port, pid] of targets) {
      if (pid !== undefined)
        deps.kill(pid);
      started.delete(port);
      pids.delete(port);
    }
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    for (const port of targets.keys()) {
      while (await deps.probe(port, udid)) {
        if (Date.now() > deadline)
          throw new Error(`The serve-sim helper on port ${port} did not stop`);
        await deps.sleep(100);
      }
    }
    return ensure(udid, null);
  };
  return { ensure, restart };
};
var helpers = createHelpers({
  probe,
  portFree: portFree2,
  recorded: async () => {
    const fromFiles = helpersFromStateFiles();
    const fromProcesses = (await helperProcesses()).filter((entry) => entry.own && entry.devices.length === 1).map((entry) => ({ port: entry.port, device: entry.devices[0], pid: entry.pid }));
    const seen = new Set(fromFiles.map((entry) => `${entry.device}:${entry.port}`));
    return [...fromFiles, ...fromProcesses.filter((entry) => !seen.has(`${entry.device}:${entry.port}`))];
  },
  launch: launchServeSim,
  kill: (pid) => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  },
  sleep,
  startTimeoutMs: 45000
});
var ensureHelper = (udid, remembered) => helpers.ensure(udid, remembered);
var restartHelper = (udid) => helpers.restart(udid);

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

// src/service/device-link.ts
var RECONNECT_MS = 300;
var MIN_TOUCH_MS = 40;
var KEY_GAP_MS = 8;
var CONFIG_OPCODE = 130;
var HID_OPEN_TIMEOUT_MS = 5000;
var sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var message = (cause) => cause instanceof Error ? cause.message : String(cause);
var createDeviceLink = (udid, ctx, hub = createFrameHub()) => {
  let request = null;
  let connected = false;
  let starting = false;
  let closed = false;
  let reconnectTimer = null;
  let socket = null;
  let socketOpen = null;
  let orientation = null;
  let touchBeganAt = 0;
  const stopStream = () => {
    if (reconnectTimer)
      clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const old = request;
    request = null;
    connected = false;
    old?.destroy();
  };
  let hidGeneration = 0;
  const closeHid = () => {
    const old = socket;
    socket = null;
    socketOpen = null;
    hidGeneration += 1;
    orientation = null;
    try {
      old?.close();
    } catch {}
  };
  const openHid = async () => {
    if (socket && socket.readyState === WebSocket.OPEN)
      return socket;
    if (socketOpen)
      return socketOpen;
    if (closed)
      throw new Error("The device link is closed");
    const mine = hidGeneration;
    const current = () => !closed && mine === hidGeneration;
    socketOpen = (async () => {
      const port = await ctx.helperFor(udid);
      if (!current())
        throw new Error("The HID connection was dropped while opening");
      const next = new WebSocket(`${helperBase(port, udid).replace("http:", "ws:")}/ws`);
      next.binaryType = "arraybuffer";
      next.onmessage = (event) => {
        const bytes = new Uint8Array(event.data);
        if (bytes[0] !== CONFIG_OPCODE)
          return;
        try {
          const config = JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
          if (config.orientation)
            orientation = config.orientation;
        } catch {}
      };
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("The HID connection to serve-sim did not open")), HID_OPEN_TIMEOUT_MS);
          next.onopen = () => {
            clearTimeout(timer);
            resolve();
          };
          next.onerror = () => {
            clearTimeout(timer);
            reject(new Error("Could not open the HID connection to serve-sim"));
          };
          next.onclose = () => {
            clearTimeout(timer);
            reject(new Error("The HID connection closed while opening"));
          };
        });
      } catch (cause) {
        next.close();
        throw cause;
      }
      if (!current()) {
        next.close();
        throw new Error("The HID connection was dropped while opening");
      }
      next.onclose = () => {
        ctx.forgetHelper(udid);
        if (socket === next)
          closeHid();
      };
      socket = next;
      return next;
    })();
    try {
      return await socketOpen;
    } catch (cause) {
      if (current())
        closeHid();
      throw cause;
    }
  };
  const start = async () => {
    if (closed || request || starting)
      return;
    starting = true;
    let port;
    try {
      if (!await ctx.booted(udid))
        return;
      port = await ctx.helperFor(udid);
    } catch (cause) {
      ctx.onError(udid, message(cause));
      return;
    } finally {
      starting = false;
    }
    if (closed || request)
      return;
    const parser = createMjpegParser((jpeg) => {
      const size = jpegSize(jpeg);
      if (!size || closed)
        return;
      ctx.onFrame(udid, hub.publish({ data: jpeg, mime: "image/jpeg", width: size.width, height: size.height, title: ctx.name(udid) }));
    });
    const next = http.get(`${helperBase(port, udid)}/stream.mjpeg`, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        next.destroy();
        return;
      }
      connected = true;
      ctx.onError(udid, null);
      response.on("data", (chunk) => parser.push(chunk));
    });
    next.on("close", () => {
      if (request !== next)
        return;
      request = null;
      connected = false;
      ctx.forgetHelper(udid);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!closed && ctx.wanted(udid))
          start();
      }, RECONNECT_MS);
    });
    next.on("error", () => {
      return;
    });
    request = next;
    openHid().catch(() => {
      return;
    });
  };
  return {
    udid,
    hub,
    start,
    connected: () => connected,
    running: () => request !== null || starting,
    orientation: () => orientation,
    setOrientation(next) {
      orientation = next;
    },
    reset() {
      stopStream();
      closeHid();
    },
    async sendHid(messages) {
      if (messages.length === 0)
        return;
      const open = await openHid();
      for (const hid of messages) {
        if (hid.op === "touch" && hid.type === "end") {
          const held = Date.now() - touchBeganAt;
          if (held < MIN_TOUCH_MS)
            await sleep2(MIN_TOUCH_MS - held);
        }
        open.send(encodeMessage(hid));
        if (hid.op === "touch" && hid.type === "begin")
          touchBeganAt = Date.now();
        if (hid.op === "key")
          await sleep2(KEY_GAP_MS);
      }
    },
    async sendRaw(opcode, payload) {
      (await openHid()).send(encodeHid(opcode, payload));
    },
    close() {
      closed = true;
      stopStream();
      closeHid();
    }
  };
};

// src/service/links.ts
var createLinks = (deps) => {
  const links = new Map;
  let panelUdid = null;
  let panelSeenAt = 0;
  const entry = (udid) => {
    let found = links.get(udid);
    if (!found) {
      found = { link: deps.open(udid), pageSeenAt: 0 };
      links.set(udid, found);
    }
    return found;
  };
  const panelWatching = () => deps.now() - panelSeenAt < deps.graceMs;
  const wanted = (udid) => panelUdid === udid && panelWatching() || deps.now() - (links.get(udid)?.pageSeenAt ?? 0) < deps.graceMs;
  return {
    get: (udid) => entry(udid).link,
    peek: (udid) => links.get(udid)?.link,
    seenByPage(udid) {
      const found = entry(udid);
      found.pageSeenAt = deps.now();
      return found.link;
    },
    seenByPanel() {
      panelSeenAt = deps.now();
    },
    panelWatching,
    setPanel(udid) {
      panelUdid = udid;
    },
    wanted,
    watched: () => [...links.keys()].filter(wanted),
    sweep() {
      const closed = [];
      for (const [udid, found] of links) {
        if (wanted(udid))
          continue;
        found.link.close();
        links.delete(udid);
        closed.push(udid);
      }
      return closed;
    },
    closeAll() {
      for (const found of links.values())
        found.link.close();
      links.clear();
    }
  };
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

// src/service/repair.ts
var repairInput = async (udid, deps) => {
  const result = await deps.serveSim(["repair-input", "-d", udid]);
  if (!result.ok) {
    if (result.missing)
      throw new Error("serve-sim not found (npm install -g serve-sim)");
    const reason = result.stderr.trim().split(`
`).find((line) => line.trim()) ?? "unknown error";
    throw new Error(`serve-sim repair-input failed: ${reason}`);
  }
  return deps.restartHelper(udid);
};

// src/service/simulator.ts
var VIEWER_GRACE_MS2 = 35000;
var DEVICE_POLL_MS = 2000;
var APPEARANCE_TTL_MS = 15000;
var SKIPPED_SHOWN_MS = 8000;
var PLACEHOLDER = { width: 402, height: 874, color: 1907483 };
var sleep3 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var message2 = (cause) => cause instanceof Error ? cause.message : String(cause);
var createSimulator = (ownPreviewPids = async () => new Set) => {
  const hub = createFrameHub();
  let devices = [];
  let devicesAt = 0;
  let selected = null;
  let busy = null;
  let error = null;
  let controller = "none";
  const appearances = new Map;
  const layouts = new Map;
  const helperPorts = new Map;
  const helperFor = async (udid) => {
    const port = await ensureHelper(udid, helperPorts.get(udid) ?? null);
    helperPorts.set(udid, port);
    return port;
  };
  let framed = true;
  let quality = DEFAULT_QUALITY;
  let skipped = { count: 0, at: 0 };
  let panelUdid = null;
  let placeholderShown = false;
  let watching = false;
  const serveSimProcesses = createProcessReader();
  const hubs = new Map;
  const hubOf = (udid) => {
    let found = hubs.get(udid);
    if (!found) {
      found = createFrameHub();
      hubs.set(udid, found);
    }
    return found;
  };
  let bootedCheck = null;
  const bootedNow = async (udid) => {
    bootedCheck ??= refreshDevices(Date.now() - devicesAt > 1000).finally(() => setTimeout(() => bootedCheck = null, 1000));
    return (await bootedCheck).some((device) => device.udid === udid && device.state === "Booted");
  };
  const links = createLinks({
    now: () => Date.now(),
    graceMs: VIEWER_GRACE_MS2,
    open: (udid) => createDeviceLink(udid, {
      helperFor,
      forgetHelper: (device) => helperPorts.delete(device),
      name: (device) => devices.find((candidate) => candidate.udid === device)?.name ?? "Simulator",
      wanted: (device) => links.wanted(device),
      booted: bootedNow,
      onFrame: (device, frame) => {
        if (device !== panelUdid)
          return;
        placeholderShown = false;
        hub.publish({ data: frame.data, mime: frame.mime, width: frame.width, height: frame.height, title: frame.title });
      },
      onError: (device, next) => {
        if (device === panelUdid || next === null)
          error = next;
      }
    }, hubOf(udid))
  });
  const activeDevice = () => shownDevice(devices, selected);
  const booted = (udid) => devices.some((device) => device.udid === udid && device.state === "Booted");
  const refreshDevices = async (force = false) => {
    if (!force && Date.now() - devicesAt < DEVICE_POLL_MS - 100)
      return devices;
    try {
      devices = await listDevices();
      devicesAt = Date.now();
    } catch (cause) {
      error = message2(cause);
    }
    return devices;
  };
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
  const syncPanel = () => {
    const device = activeDevice();
    const next = device?.udid ?? null;
    links.setPanel(next);
    if (next === panelUdid)
      return;
    panelUdid = next;
    if (!device)
      return;
    const link = links.get(device.udid);
    const newest = link.hub.current();
    if (newest)
      hub.publish({ data: newest.data, mime: newest.mime, width: newest.width, height: newest.height, title: newest.title });
  };
  const tick = async () => {
    syncPanel();
    if (links.panelWatching()) {
      if (!panelUdid)
        showPlaceholder();
      else
        links.get(panelUdid).start();
    }
    for (const udid of links.watched())
      if (booted(udid))
        links.peek(udid)?.start();
    for (const udid of links.sweep())
      helperPorts.delete(udid);
  };
  const watch = async () => {
    if (watching)
      return;
    watching = true;
    try {
      while (links.panelWatching() || links.watched().length > 0) {
        await refreshDevices();
        await tick();
        await sleep3(DEVICE_POLL_MS);
      }
      links.sweep();
    } finally {
      watching = false;
    }
  };
  const nextFrame = (after, waitMs, signal) => {
    links.seenByPanel();
    watch();
    return hub.next(after, waitMs, signal);
  };
  const nextFrameOf = (udid, after, waitMs, signal) => {
    const link = links.seenByPage(udid);
    watch();
    if (booted(udid))
      link.start();
    return link.hub.next(after, waitMs, signal);
  };
  const requireDevice = async (udid) => {
    await refreshDevices(true);
    const device = udid ? devices.find((candidate) => candidate.udid === udid && candidate.state === "Booted") : activeDevice();
    if (!device)
      throw new Error(udid ? "That simulator is not booted" : "No simulator is booted");
    return device;
  };
  const linkOf = async (udid) => links.get((await requireDevice(udid)).udid);
  const switchStream = async () => {
    await refreshDevices(true);
    await tick();
  };
  const runBusy = async (kind, work) => {
    if (busy)
      throw new Error("Another boot, shutdown or repair is in progress");
    busy = kind;
    error = null;
    try {
      await work();
    } catch (cause) {
      error = message2(cause);
      throw cause;
    } finally {
      busy = null;
      await refreshDevices(true);
    }
  };
  const layoutOf = async (udid) => {
    let layout = layouts.get(udid);
    if (!layout) {
      layout = await readKeyboardLayout(udid);
      layouts.set(udid, layout);
    }
    return layout;
  };
  return {
    hub,
    nextFrame,
    nextFrameOf,
    async sendHid(messages, udid) {
      if (messages.length === 0)
        return;
      await (await linkOf(udid)).sendHid(messages);
    },
    async state(target) {
      await refreshDevices();
      if (!target) {
        const shown = activeDevice();
        if (shown)
          selected = shown.udid;
        if (!selected || !devices.some((device) => device.udid === selected)) {
          selected = devices.find((device) => device.state === "Booted")?.udid ?? defaultDevice(devices)?.udid ?? null;
        }
      }
      const active = target ? devices.find((device) => device.udid === target && device.state === "Booted") ?? null : activeDevice();
      if (active) {
        const known = appearances.get(active.udid);
        if (!known || Date.now() - known.at > APPEARANCE_TTL_MS)
          appearances.set(active.udid, { value: await readAppearance(active.udid), at: Date.now() });
        if (!layouts.has(active.udid))
          layoutOf(active.udid).catch(() => {
            return;
          });
      }
      const link = active ? links.peek(active.udid) : undefined;
      const streaming = target ? !!link?.connected() && links.wanted(target) : !!link?.connected() && links.panelWatching() && panelUdid === active?.udid;
      return {
        devices,
        active,
        selected: target ?? selected,
        busy,
        streaming,
        controller,
        orientation: link?.orientation() ?? null,
        appearance: active ? appearances.get(active.udid)?.value ?? "unknown" : "unknown",
        keyboard: active ? layouts.get(active.udid) ?? null : null,
        framed,
        quality,
        skipped: Date.now() - skipped.at < SKIPPED_SHOWN_MS ? skipped.count : 0,
        serveSims: active ? processesFor(await serveSimProcesses(), active.udid, true, await ownPreviewPids()) : [],
        error
      };
    },
    async boot(udid, { select = true } = {}) {
      await refreshDevices(true);
      const device = devices.find((candidate) => candidate.udid === udid);
      if (!device)
        throw new Error("Unknown device");
      if (select)
        selected = udid;
      if (device.state !== "Booted") {
        await runBusy("booting", () => bootDevice(udid));
        helperPorts.delete(udid);
      }
      await switchStream();
    },
    async shutdown(udid) {
      await refreshDevices(true);
      const device = udid ? devices.find((candidate) => candidate.udid === udid && candidate.state === "Booted") : activeDevice();
      if (!device)
        return;
      await runBusy("shutting-down", async () => {
        links.peek(device.udid)?.reset();
        await shutdownDevice(device.udid);
        helperPorts.delete(device.udid);
      });
      await switchStream();
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
    noteSkipped(count) {
      if (count > 0)
        skipped = { count, at: Date.now() };
    },
    setQuality(next) {
      quality = next;
    },
    setFramed(on) {
      framed = on;
    },
    active: () => activeDevice(),
    async knows(udid) {
      if (!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(udid))
        return false;
      return (await refreshDevices(Date.now() - devicesAt > 1000)).some((device) => device.udid === udid);
    },
    device: (udid) => devices.find((device) => device.udid === udid) ?? null,
    async booted() {
      return (await refreshDevices()).filter((device) => device.state === "Booted");
    },
    currentOf: (udid) => links.peek(udid)?.hub.current() ?? null,
    async button(name, udid) {
      await (await linkOf(udid)).sendRaw(OPCODE.button, name === "home" ? { button: "home" } : { button: "power", page: 12, usage: 48 });
    },
    async rotate(target, udid) {
      const link = await linkOf(udid);
      const now = link.orientation();
      const next = target ?? (now === "portrait" || now === null ? "landscape_left" : "portrait");
      await link.sendRaw(OPCODE.orientation, { orientation: next });
      link.setOrientation(next);
      if (link.udid === panelUdid) {
        const shown = hub.current();
        if (shown)
          hub.publish({ data: shown.data, mime: shown.mime, width: shown.width, height: shown.height, title: shown.title });
      }
      const own = link.hub.current();
      if (own)
        link.hub.publish({ data: own.data, mime: own.mime, width: own.width, height: own.height, title: own.title });
    },
    async pressButton(name, page, usage, udid) {
      const link = await linkOf(udid);
      if (name === "home")
        await link.sendRaw(OPCODE.button, { button: "home" });
      else
        await link.sendRaw(OPCODE.button, { button: name, page, usage });
    },
    async setAppearance(mode, udid) {
      const device = await requireDevice(udid);
      const current = await readAppearance(device.udid);
      const next = mode ?? (current === "dark" ? "light" : "dark");
      await setAppearance(device.udid, next);
      appearances.set(device.udid, { value: next, at: Date.now() });
    },
    async repairInput(udid) {
      const device = await requireDevice(udid);
      await runBusy("repairing", async () => {
        const port = await repairInput(device.udid, {
          serveSim: (args) => run(SERVE_SIM, args, { timeout: 120000 }),
          restartHelper: async (target) => {
            links.peek(target)?.reset();
            helperPorts.delete(target);
            return restartHelper(target);
          }
        });
        helperPorts.set(device.udid, port);
      });
      await switchStream();
    },
    async activeUdid() {
      return (await requireDevice()).udid;
    },
    async axTree() {
      const device = await requireDevice();
      const port = await helperFor(device.udid);
      const response = await fetch(`${helperBase(port, device.udid)}/ax`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok)
        throw new Error(`Accessibility tree unavailable (${response.status})`);
      return response.text();
    },
    orientation: (udid) => {
      const target = udid ?? panelUdid;
      return target ? links.peek(target)?.orientation() ?? null : null;
    },
    async layout(udid) {
      const target = udid ?? activeDevice()?.udid;
      return target ? layoutOf(target) : "us";
    },
    forgetProcesses() {
      serveSimProcesses.forget();
    },
    setController(next) {
      controller = next;
    },
    stop() {
      links.closeAll();
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
var COPY_SETTLE_MS = 150;
var ORIENTATIONS = ["portrait", "portrait_upside_down", "landscape_left", "landscape_right"];
var PAGE_WAIT_MS = 1e4;
var DEFAULT_BACKGROUND = [29, 27, 27];
var previews = createPreviews(previewDeps(probeHealth));
var sim = createSimulator(async () => new Set((await previews.started()).map((entry) => entry.pid)));
var servers = serverDeps(() => sim.booted());
var pasteboard = createPasteboard((args, options) => run(XCRUN, args, options));
var surfaceInput = { touching: false };
var pageInputs = new Map;
var pageInputOf = (udid) => {
  const key = udid ?? "panel";
  let state = pageInputs.get(key);
  if (!state) {
    state = { touching: false };
    pageInputs.set(key, state);
  }
  return state;
};
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
var udidOf = async (value) => {
  if (value === undefined || value === null || value === "")
    return;
  if (typeof value !== "string")
    return null;
  return sim.device(value) || await sim.knows(value) ? value : null;
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
  const { skippedChars, buttons } = await sendInput(batch.events, {
    layout,
    udid: sim.active()?.udid ?? null,
    pasteboard,
    translate: (events) => translateInput(events, shown, surfaceInput, { degrees: view.degrees, layout, chrome: view.chrome }),
    send: (messages) => sim.sendHid(messages)
  });
  for (const button of buttons)
    await sim.pressButton(button.name, button.page, button.usage);
  sim.noteSkipped(skippedChars);
  send(res, 200, { ok: true, skippedChars });
};
var handlePageFrame = async (_req, res, url) => {
  const udid = await udidOf(url.searchParams.get("udid"));
  if (udid === null)
    return send(res, 404, { error: "unknown device" });
  const after = Number(url.searchParams.get("after") ?? "0") || 0;
  const wait = Math.min(Number(url.searchParams.get("wait") ?? "0") || 0, PAGE_WAIT_MS);
  const abort = new AbortController;
  res.on("close", () => abort.abort());
  const frame = udid ? await sim.nextFrameOf(udid, after, wait, abort.signal) : await sim.nextFrame(after, wait, abort.signal);
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
    degrees: frame.mime === "image/jpeg" ? rotationFor(sim.orientation(udid)) : 0,
    data: putBlob(`frame-${udid ?? "panel"}-${frame.seq}`, picture.data.toString("base64"))
  };
  send(res, 200, answer);
};
var handlePageInput = async (req, res) => {
  const body = await readBody(req);
  const batch = readSurfaceInputBatch(body);
  const { width, height, udid: rawUdid } = JSON.parse(body);
  if (!batch || typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return send(res, 400, { error: "bad input batch" });
  }
  const udid = await udidOf(rawUdid);
  if (udid === null)
    return send(res, 404, { error: "unknown device" });
  const current = udid ? sim.currentOf(udid) : sim.hub.current();
  if (!current || current.mime !== "image/jpeg")
    return send(res, 409, { error: "no simulator picture" });
  const expected = shrunkSize(current.width, current.height, divisor());
  if (expected.width !== width || expected.height !== height)
    return send(res, 409, { error: "stale frame" });
  const layout = await sim.layout(udid);
  const { skippedChars } = await sendInput(batch.events, {
    layout,
    udid: udid ?? sim.active()?.udid ?? null,
    pasteboard,
    translate: (events) => translateInput(events, { width, height }, pageInputOf(udid), { layout }),
    send: (messages) => sim.sendHid(messages, udid)
  });
  sim.noteSkipped(skippedChars);
  send(res, 200, { ok: true, skippedChars });
};
var handleChrome = async (_req, res, url) => {
  const udid = await udidOf(url.searchParams.get("udid"));
  if (udid === null)
    return send(res, 404, { error: "unknown device" });
  const type = (udid ? sim.device(udid) : sim.active())?.deviceType;
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

class UnknownDevice extends Error {
}
var target = async (req) => {
  const body = await readJson(req);
  const udid = await udidOf(body.udid);
  if (udid === null)
    throw new UnknownDevice("unknown device");
  return { body, udid };
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
  "GET /surface/clipboard": async (_req, res) => {
    const udid = sim.active()?.udid;
    if (!udid)
      return send(res, 404, { error: "no simulator" });
    await new Promise((resolve) => setTimeout(resolve, COPY_SETTLE_MS));
    const text = await pasteboard.read(udid);
    if (text === null)
      return send(res, 404, { error: "pasteboard empty or unreadable" });
    send(res, 200, { text });
  },
  "GET /state": async (_req, res, url) => {
    const udid = await udidOf(url.searchParams.get("udid"));
    if (udid === null)
      return send(res, 404, { error: "unknown device" });
    send(res, 200, await sim.state(udid));
  },
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
    const tile = body.select === false;
    await sim.boot(body.udid, { select: !tile });
    send(res, 200, await sim.state(tile ? body.udid : undefined));
  },
  "POST /shutdown": async (req, res) => {
    const { udid } = await target(req);
    await sim.shutdown(udid);
    send(res, 200, await sim.state(udid));
  },
  "GET /page/frame": handlePageFrame,
  "POST /page/input": handlePageInput,
  "GET /chrome": handleChrome,
  "GET /blob": handleBlob,
  "POST /button": async (req, res) => {
    const body = await readJson(req);
    const page = Number(body.page);
    const usage = Number(body.usage);
    const udid = await udidOf(body.udid);
    if (udid === null)
      return send(res, 404, { error: "unknown device" });
    if (typeof body.name === "string" && page > 0 && usage > 0)
      await sim.pressButton(body.name, page, usage, udid);
    else
      await sim.button(body.name === "lock" ? "lock" : "home", udid);
    send(res, 200, { ok: true });
  },
  "POST /frame": async (req, res) => {
    const { body, udid } = await target(req);
    sim.setFramed(typeof body.on === "boolean" ? body.on : !sim.framed());
    sim.repaint();
    send(res, 200, await sim.state(udid));
  },
  "POST /quality": async (req, res) => {
    const { body, udid } = await target(req);
    const next = QUALITIES.find((value) => value === body.value);
    if (!next)
      return send(res, 400, { error: `quality must be one of ${QUALITIES.join(", ")}` });
    if (next !== sim.quality()) {
      sim.setQuality(next);
      sim.repaint();
    }
    send(res, 200, await sim.state(udid));
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
    const { body, udid } = await target(req);
    await sim.rotate(ORIENTATIONS.find((value) => value === body.orientation), udid);
    send(res, 200, await sim.state(udid));
  },
  "GET /serve-sim/servers": async (_req, res) => {
    const started = new Set((await previews.started()).map((entry) => entry.url));
    send(res, 200, { servers: (await findServers(servers)).map((server) => ({ ...server, started: started.has(server.url) })) });
  },
  "GET /serve-sim/addresses": async (_req, res) => send(res, 200, { addresses: ownAddresses() }),
  "POST /serve-sim/start": async (req, res) => {
    const { body, udid } = await target(req);
    const device = udid ? sim.device(udid) : sim.active();
    if (!device || device.state !== "Booted")
      return send(res, 409, { error: "The simulator is not booted" });
    const entry = await previews.start(body.address, device.udid);
    sim.forgetProcesses();
    send(res, 200, { url: entry.url });
  },
  "POST /serve-sim/stop": async (req, res) => {
    const body = await readJson(req);
    await previews.stop(body.url);
    sim.forgetProcesses();
    send(res, 200, { ok: true });
  },
  "GET /serve-sim/check": async (_req, res, url) => send(res, 200, { running: await checkServer(url.searchParams.get("url"), servers) }),
  "POST /repair-input": async (req, res) => {
    const { udid } = await target(req);
    await sim.repairInput(udid);
    send(res, 200, await sim.state(udid));
  },
  "POST /appearance": async (req, res) => {
    const { body, udid } = await target(req);
    await sim.setAppearance(body.mode === "light" || body.mode === "dark" ? body.mode : undefined, udid);
    send(res, 200, await sim.state(udid));
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
    send(res, cause instanceof SyntaxError ? 400 : cause instanceof UnknownDevice ? 404 : cause instanceof PreviewError ? cause.status : 500, { error: cause instanceof Error ? cause.message : String(cause) });
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
