// Full-screen page (Extension pages menu): the toolbar on top and the
// simulator below, drawn by the page itself. Raw framebuffer pictures come
// from the service, the device frame is Xcode's (layer and rounded-corner
// mask as images), and the whole device turns with CSS for landscape. Input
// is mapped back to framebuffer pixels here and sent to `/page/input`.
import type { HostClient, SurfaceInputEvent, SurfaceModifiers } from '@openchamber/sdk';

import { startFrame, type FrameContext } from '../frame/host.ts';
import { createToolbar } from '../frame/toolbar.ts';
import { createDirectEditor } from '../frame/direct-editor.ts';
import { installStyle } from '../frame/ui.ts';
import { BLOB_CHUNK, type BlobRef, type ChromeAnswer, type ChromeButton, type ChromeLayout, type PageFrame, type Rect } from '../shared/state.ts';

installStyle(`
html,body{height:100%;overflow:hidden}
body{display:flex;flex-direction:column}
#bar{flex:none;height:44px;border-bottom:1px solid var(--oc-border)}
#stage{flex:1;min-height:0;position:relative;overflow:hidden;outline:none}
#device{position:absolute;left:50%;top:50%;transform-origin:center}
#layer{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;user-select:none;-webkit-user-drag:none}
#screen{position:absolute;touch-action:none;cursor:pointer;-webkit-mask-size:100% 100%;mask-size:100% 100%}
#empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--oc-muted)}
`);

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
};
const bar = byId<HTMLElement>('bar');
const stage = byId<HTMLElement>('stage');
const device = byId<HTMLElement>('device');
const layer = byId<HTMLImageElement>('layer');
const screen = byId<HTMLCanvasElement>('screen');
const empty = byId<HTMLElement>('empty');
const paint = screen.getContext('2d');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Shown = { width: number; height: number; degrees: number };
type LoadedChrome = { key: string; layout: ChromeLayout; layer: string; mask: string | null };

let context: FrameContext | null = null;
let shown: Shown | null = null;
let chrome: LoadedChrome | null = null;
let chromeKey = '';
/** What the device element is laid out for, so it is only redone on change. */
let laidOut = '';

// The serve-sim address for the toolbar's "Open in serve-sim" button, edited in a row under the toolbar.
const toolbar = createToolbar(bar, () => host, { onEditDirect: () => direct.show(true) });
const direct = createDirectEditor({ bar, host: () => host, toolbar: () => toolbar });

/** Fetches a blob's parts in parallel and joins them. */
const readBlob = async (ref: BlobRef): Promise<string> => {
  const offsets: number[] = [];
  for (let offset = 0; offset < ref.length; offset += BLOB_CHUNK) offsets.push(offset);
  const parts = await Promise.all(
    offsets.map(async (offset) => {
      const result = await host.serviceRequest({ method: 'GET', path: '/blob', query: { id: ref.id, offset: String(offset) } });
      if (result.status !== 200) throw new Error('blob gone');
      return result.body;
    }),
  );
  return parts.join('');
};

/** The frame to draw around the picture now, or `null`. */
const activeChrome = (): ChromeLayout | null => {
  const state = context?.view.kind === 'ready' ? context.view.state : null;
  if (!state?.framed || !chrome || !shown) return null;
  const { screen: rect } = chrome.layout;
  return rect.width === shown.width && rect.height === shown.height ? chrome.layout : null;
};

/** Device size and where the screen sits in it, in framebuffer pixels. */
const geometry = (): { width: number; height: number; screen: Rect; chrome: ChromeLayout | null } | null => {
  if (!shown) return null;
  const frame = activeChrome();
  if (frame) return { width: frame.width, height: frame.height, screen: frame.screen, chrome: frame };
  return { width: shown.width, height: shown.height, screen: { x: 0, y: 0, width: shown.width, height: shown.height }, chrome: null };
};

const scaleFor = (width: number, height: number, degrees: number): number => {
  const turned = degrees === 90 || degrees === 270;
  const box = stage.getBoundingClientRect();
  return Math.min(box.width / (turned ? height : width), box.height / (turned ? width : height)) * 0.94;
};

const layout = () => {
  const shape = geometry();
  if (!shape || !shown) {
    device.hidden = true;
    return;
  }
  device.hidden = false;
  const key = `${shape.width}x${shape.height}|${shape.chrome?.id ?? ''}|${chrome?.key ?? ''}`;
  if (key !== laidOut) {
    laidOut = key;
    device.style.width = `${shape.width}px`;
    device.style.height = `${shape.height}px`;
    Object.assign(screen.style, {
      left: `${shape.screen.x}px`,
      top: `${shape.screen.y}px`,
      width: `${shape.screen.width}px`,
      height: `${shape.screen.height}px`,
    });
    const mask = shape.chrome && chrome?.mask ? `url(${chrome.mask})` : 'none';
    screen.style.setProperty('mask-image', mask);
    screen.style.setProperty('-webkit-mask-image', mask);
    layer.hidden = !shape.chrome;
    if (shape.chrome && chrome && layer.src !== chrome.layer) layer.src = chrome.layer;
  }
  const scale = scaleFor(shape.width, shape.height, shown.degrees);
  device.style.transform = `translate(-50%, -50%) rotate(${shown.degrees}deg) scale(${scale})`;
};

new ResizeObserver(() => layout()).observe(stage);

/** Loads the device frame for the device shown, once per device. */
const ensureChrome = async () => {
  const state = context?.view.kind === 'ready' ? context.view.state : null;
  const key = state?.framed && state.active ? state.active.udid : '';
  if (!key || key === chromeKey) return;
  chromeKey = key;
  try {
    const result = await host.serviceRequest({ method: 'GET', path: '/chrome' });
    const answer = JSON.parse(result.body) as ChromeAnswer;
    if (!answer.available) {
      chrome = null;
    } else {
      const [layerData, maskData] = await Promise.all([readBlob(answer.layer), answer.mask ? readBlob(answer.mask) : Promise.resolve(null)]);
      chrome = {
        key,
        layout: answer.layout,
        layer: `data:image/png;base64,${layerData}`,
        mask: maskData ? `data:image/png;base64,${maskData}` : null,
      };
    }
  } catch {
    chromeKey = ''; // try again on the next state
  }
  layout();
};

const decodeBase64 = (base64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/** Pulls raw pictures one at a time while the page is visible. */
const pump = async () => {
  let seq = 0;
  for (;;) {
    if (document.visibilityState !== 'visible') {
      await sleep(500);
      continue;
    }
    try {
      const result = await host.serviceRequest({ method: 'GET', path: '/page/frame', query: { after: String(seq), wait: '8000' } });
      if (result.status === 204) continue;
      if (result.status !== 200) {
        await sleep(1_000);
        continue;
      }
      const frame = JSON.parse(result.body) as PageFrame;
      seq = frame.seq;
      if (frame.mime !== 'image/jpeg') {
        // The service's placeholder: nothing booted.
        shown = null;
        empty.hidden = false;
        layout();
        continue;
      }
      const bitmap = await createImageBitmap(new Blob([decodeBase64(await readBlob(frame.data))], { type: frame.mime }));
      if (screen.width !== bitmap.width || screen.height !== bitmap.height) {
        screen.width = bitmap.width;
        screen.height = bitmap.height;
      }
      paint?.drawImage(bitmap, 0, 0);
      bitmap.close();
      shown = { width: frame.width, height: frame.height, degrees: frame.degrees };
      empty.hidden = true;
      layout();
    } catch {
      await sleep(2_000);
    }
  }
};

// Input: from the page to framebuffer pixels, through the device's rotation and scale.

const modifiers = (event: MouseEvent | KeyboardEvent): SurfaceModifiers => ({
  alt: event.altKey,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
  shift: event.shiftKey,
});

/** A page point in the device's own pixels (unturned, unscaled). */
const toDevice = (clientX: number, clientY: number): { x: number; y: number } | null => {
  const shape = geometry();
  if (!shape || !shown) return null;
  const box = stage.getBoundingClientRect();
  const scale = scaleFor(shape.width, shape.height, shown.degrees);
  const qx = clientX - box.left - box.width / 2;
  const qy = clientY - box.top - box.height / 2;
  const angle = (shown.degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: (qx * cos + qy * sin) / scale + shape.width / 2, y: (-qx * sin + qy * cos) / scale + shape.height / 2 };
};

/** A movement on the page in framebuffer pixels. */
const deltaToDevice = (dx: number, dy: number): { x: number; y: number } => {
  const shape = geometry();
  if (!shape || !shown) return { x: dx, y: dy };
  const scale = scaleFor(shape.width, shape.height, shown.degrees);
  const angle = (shown.degrees * Math.PI) / 180;
  return { x: (dx * Math.cos(angle) + dy * Math.sin(angle)) / scale, y: (-dx * Math.sin(angle) + dy * Math.cos(angle)) / scale };
};

const onScreen = (point: { x: number; y: number }) => {
  const rect = geometry()!.screen;
  return { x: point.x - rect.x, y: point.y - rect.y, inside: point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height };
};

const buttonAt = (point: { x: number; y: number }): ChromeButton | null =>
  geometry()?.chrome?.buttons.find((button) => point.x >= button.x && point.x <= button.x + button.width && point.y >= button.y && point.y <= button.y + button.height) ?? null;

let queue: SurfaceInputEvent[] = [];
let flushing = false;
const sendInput = (event: SurfaceInputEvent) => {
  queue.push(event);
  if (!flushing) void flush();
};
async function flush() {
  flushing = true;
  try {
    while (queue.length > 0 && shown) {
      const events = queue.splice(0, 256);
      await host
        .serviceRequest({ method: 'POST', path: '/page/input', body: JSON.stringify({ events, width: shown.width, height: shown.height }) })
        .catch(() => undefined);
    }
    queue = [];
  } finally {
    flushing = false;
  }
}

let touching = false;
stage.addEventListener('pointerdown', (event) => {
  stage.focus();
  if (event.button !== 0) return;
  const point = toDevice(event.clientX, event.clientY);
  if (!point) return;
  const hit = onScreen(point);
  if (!hit.inside) {
    const button = buttonAt(point);
    if (button) void context?.act('/button', { name: button.name, page: button.page, usage: button.usage });
    return;
  }
  event.preventDefault();
  stage.setPointerCapture(event.pointerId);
  touching = true;
  sendInput({ type: 'pointer', action: 'down', x: hit.x, y: hit.y, button: 0, buttons: event.buttons, modifiers: modifiers(event) });
});
stage.addEventListener('pointermove', (event) => {
  if (!touching) return;
  const point = toDevice(event.clientX, event.clientY);
  if (!point) return;
  const hit = onScreen(point);
  sendInput({ type: 'pointer', action: 'move', x: hit.x, y: hit.y, button: -1, buttons: event.buttons, modifiers: modifiers(event) });
});
const release = (event: PointerEvent) => {
  if (!touching) return;
  touching = false;
  const point = toDevice(event.clientX, event.clientY);
  const hit = point ? onScreen(point) : { x: 0, y: 0 };
  sendInput({ type: 'pointer', action: 'up', x: hit.x, y: hit.y, button: 0, buttons: 0, modifiers: modifiers(event) });
};
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
stage.addEventListener(
  'wheel',
  (event) => {
    const point = toDevice(event.clientX, event.clientY);
    if (!point) return;
    const hit = onScreen(point);
    if (!hit.inside) return;
    event.preventDefault();
    const delta = deltaToDevice(event.deltaX, event.deltaY);
    sendInput({ type: 'wheel', x: hit.x, y: hit.y, deltaX: delta.x, deltaY: delta.y, modifiers: modifiers(event) });
  },
  { passive: false },
);
stage.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return; // the paste event follows
  event.preventDefault();
  sendInput({ type: 'key', action: 'down', key: event.key, code: event.code, modifiers: modifiers(event) });
});
stage.addEventListener('keyup', (event) => {
  event.preventDefault();
  sendInput({ type: 'key', action: 'up', key: event.key, code: event.code, modifiers: modifiers(event) });
});
stage.addEventListener('paste', (event) => {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (text) sendInput({ type: 'text', text });
});

const host: HostClient = startFrame((next) => {
  context = next;
  toolbar(next);
  direct.label(next.t);
  const { view, t } = next;
  const chosen = view.kind === 'ready' ? view.state.devices.find((device) => device.udid === view.state.selected) : undefined;
  empty.textContent = view.kind === 'ready' ? (view.state.active ? '' : chosen ? t.deviceOff(chosen.name) : t.noDevice) : t.loading;
  if (view.kind === 'ready' && !view.state.active) {
    shown = null;
    empty.hidden = false;
  }
  void ensureChrome();
  layout();
});

// Not in a tooltip popover frame (same entry, opened by the host): only a real page pulls pictures.
let pumping = false;
host.onReady((context) => {
  if (pumping || context.surface === 'popover') return;
  pumping = true;
  void pump();
});
