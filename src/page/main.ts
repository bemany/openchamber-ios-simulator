// Full-screen page (Extension pages menu): the toolbar on top and one to four
// tiles below, each a simulator drawn by the page itself. Raw framebuffer
// pictures come from the service per device (`/page/frame?udid=`), the device
// frame is Xcode's (layer and rounded-corner mask as images), and each device
// turns with CSS for landscape. Input is mapped back to framebuffer pixels and
// sent to `/page/input` for the tile it happens on. The toolbar shows and acts
// on the focused tile (the one clicked last).
import type { HostClient, SurfaceInputEvent, SurfaceModifiers } from '@openchamber/sdk';

import { startFrame, type FrameContext } from '../frame/host.ts';
import { createToolbar } from '../frame/toolbar.ts';
import { createDirectEditor } from '../frame/direct-editor.ts';
import { element, installStyle } from '../frame/ui.ts';
import { BLOB_CHUNK, type BlobRef, type ChromeAnswer, type ChromeButton, type ChromeLayout, type PageFrame, type Rect, type SimState } from '../shared/state.ts';

installStyle(`
html,body{height:100%;overflow:hidden}
body{display:flex;flex-direction:column}
#bar{flex:none;height:44px;border-bottom:1px solid var(--oc-border)}
#tiles{flex:1;min-height:0;display:grid;gap:6px;padding:6px;grid-template-columns:1fr;grid-auto-rows:1fr}
#tiles[data-count="2"]{grid-template-columns:1fr 1fr}
#tiles[data-count="3"],#tiles[data-count="4"]{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
#tiles[data-count="1"]{padding:0}
.tile{position:relative;min-width:0;min-height:0;overflow:hidden;outline:none;border-radius:var(--oc-radius,6px);border:1px solid transparent}
#tiles:not([data-count="1"]) .tile.focused{border-color:var(--oc-focus)}
.device{position:absolute;left:50%;top:50%;transform-origin:center}
.layer{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;user-select:none;-webkit-user-drag:none}
.screen{position:absolute;touch-action:none;cursor:pointer;-webkit-mask-size:100% 100%;mask-size:100% 100%}
.empty{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;color:var(--oc-muted)}
.empty button{font:inherit;color:var(--oc-primary-foreground,#fff);background:var(--oc-primary);border:0;border-radius:var(--oc-radius,6px);height:24px;padding:0 10px;cursor:pointer}
.corner{position:absolute;top:6px;right:6px;display:flex;gap:4px;z-index:1}
.corner button{width:24px;height:24px;border:1px solid var(--oc-border);border-radius:var(--oc-radius,6px);background:var(--oc-elevated,var(--oc-bg));color:var(--oc-fg);cursor:pointer;font:inherit;line-height:1;padding:0}
.corner button:hover{background:var(--oc-hover)}
`);

/** Instance storage: the devices of the tiles, in order. */
const TILES_KEY = 'pageTiles';
const MAX_TILES = 4;

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
};
const bar = byId<HTMLElement>('bar');
const grid = byId<HTMLElement>('tiles');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let context: FrameContext | null = null;
/** The newest device list and the toolbar state (of the focused tile's device). */
const stateNow = (): SimState | null => (context?.view.kind === 'ready' ? context.view.state : null);

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

const decodeBase64 = (base64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const modifiers = (event: MouseEvent | KeyboardEvent): SurfaceModifiers => ({
  alt: event.altKey,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
  shift: event.shiftKey,
});

type Shown = { width: number; height: number; degrees: number };
type LoadedChrome = { key: string; layout: ChromeLayout; layer: string; mask: string | null };

/** One simulator on the page: its picture, frame, rotation and input. */
const createTile = (initial: string) => {
  let udid = initial;
  /** Bumped when the tile changes device or closes: the old picture loop stops. */
  let generation = 0;
  let shown: Shown | null = null;
  let chrome: LoadedChrome | null = null;
  let chromeKey = '';
  let laidOut = '';

  const root = element('div', 'tile');
  root.tabIndex = 0;
  const device = element('div', 'device');
  device.hidden = true;
  const layer = element('img', 'layer');
  layer.alt = '';
  layer.hidden = true;
  const screen = element('canvas', 'screen');
  const paint = screen.getContext('2d');
  device.append(layer, screen);
  const empty = element('div', 'empty');
  empty.hidden = true;
  const emptyText = element('span');
  const boot = element('button');
  boot.type = 'button';
  boot.hidden = true;
  empty.append(emptyText, boot);
  const corner = element('div', 'corner');
  const add = element('button', '', '+');
  add.type = 'button';
  const close = element('button', '', '×');
  close.type = 'button';
  corner.append(add, close);
  root.append(device, empty, corner);

  /** The frame to draw around the picture now, or `null`. */
  const activeChrome = (): ChromeLayout | null => {
    if (!stateNow()?.framed || !chrome || !shown) return null;
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
    const box = root.getBoundingClientRect();
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
  new ResizeObserver(() => layout()).observe(root);

  /** Loads the device frame for this tile's device type, once per type. */
  const ensureChrome = async () => {
    const state = stateNow();
    const type = state?.devices.find((candidate) => candidate.udid === udid)?.deviceType ?? '';
    const key = state?.framed && type ? `${type}@${state.quality}` : '';
    if (!key || key === chromeKey) return;
    chromeKey = key;
    try {
      const result = await host.serviceRequest({ method: 'GET', path: '/chrome', query: { udid } });
      const answer = JSON.parse(result.body) as ChromeAnswer;
      if (!answer.available) {
        chrome = null;
      } else {
        const [layerData, maskData] = await Promise.all([readBlob(answer.layer), answer.mask ? readBlob(answer.mask) : Promise.resolve(null)]);
        chrome = { key, layout: answer.layout, layer: `data:image/png;base64,${layerData}`, mask: maskData ? `data:image/png;base64,${maskData}` : null };
      }
    } catch {
      chromeKey = ''; // try again on the next state
    }
    layout();
  };

  /** Pulls this device's pictures one at a time while the page is visible. */
  const pump = async (mine: number) => {
    let seq = 0;
    while (mine === generation) {
      if (document.visibilityState !== 'visible') {
        await sleep(500);
        continue;
      }
      try {
        const result = await host.serviceRequest({ method: 'GET', path: '/page/frame', query: { udid, after: String(seq), wait: '8000' } });
        if (mine !== generation) return;
        if (result.status === 204) continue;
        if (result.status !== 200) {
          await sleep(1_000);
          continue;
        }
        const frame = JSON.parse(result.body) as PageFrame;
        seq = frame.seq;
        const bitmap = await createImageBitmap(new Blob([decodeBase64(await readBlob(frame.data))], { type: frame.mime }));
        if (mine !== generation) {
          bitmap.close();
          return;
        }
        if (screen.width !== bitmap.width || screen.height !== bitmap.height) {
          screen.width = bitmap.width;
          screen.height = bitmap.height;
        }
        paint?.drawImage(bitmap, 0, 0);
        bitmap.close();
        shown = { width: frame.width, height: frame.height, degrees: frame.degrees };
        render();
      } catch {
        await sleep(2_000);
      }
    }
  };

  // Input: from the page to framebuffer pixels, through the device's rotation and scale.

  /** A page point in the device's own pixels (unturned, unscaled). */
  const toDevice = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const shape = geometry();
    if (!shape || !shown) return null;
    const box = root.getBoundingClientRect();
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
  /** The size input was last mapped to, so a pointer-up still reaches the service after the picture went away. */
  let lastSize: { width: number; height: number } | null = null;
  const sendInput = (event: SurfaceInputEvent) => {
    queue.push(event);
    if (!flushing) void flush();
  };
  async function flush() {
    flushing = true;
    try {
      while (queue.length > 0) {
        if (shown) lastSize = { width: shown.width, height: shown.height };
        if (!lastSize) break;
        const events = queue.splice(0, 256);
        await host
          .serviceRequest({ method: 'POST', path: '/page/input', body: JSON.stringify({ events, ...lastSize, udid }) })
          .catch(() => undefined);
      }
      queue = [];
    } finally {
      flushing = false;
    }
  }

  let touching = false;
  root.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('button')) return; // the corner and Boot buttons
    focus(tile);
    if (event.button !== 0) return;
    const point = toDevice(event.clientX, event.clientY);
    if (!point) return;
    const hit = onScreen(point);
    if (!hit.inside) {
      const button = buttonAt(point);
      if (button) void context?.act('/button', { name: button.name, page: button.page, usage: button.usage, udid });
      return;
    }
    event.preventDefault();
    root.setPointerCapture(event.pointerId);
    touching = true;
    sendInput({ type: 'pointer', action: 'down', x: hit.x, y: hit.y, button: 0, buttons: event.buttons, modifiers: modifiers(event) });
  });
  root.addEventListener('pointermove', (event) => {
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
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener(
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
  root.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('button')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return; // the paste event follows
    event.preventDefault();
    sendInput({ type: 'key', action: 'down', key: event.key, code: event.code, modifiers: modifiers(event) });
  });
  root.addEventListener('keyup', (event) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    sendInput({ type: 'key', action: 'up', key: event.key, code: event.code, modifiers: modifiers(event) });
  });
  root.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text) sendInput({ type: 'text', text });
  });

  add.addEventListener('click', () => addTile());
  close.addEventListener('click', () => removeTile(tile));
  boot.addEventListener('click', () => {
    focus(tile);
    void context?.act('/boot', { udid });
  });

  /** Draws what the newest state says about this tile's device. */
  const render = () => {
    const state = stateNow();
    const t = context?.t;
    const listed = state?.devices.find((candidate) => candidate.udid === udid);
    const running = listed?.state === 'Booted';
    if (!running) shown = null;
    empty.hidden = !!shown;
    emptyText.textContent = !t ? '' : !state ? t.loading : !listed ? t.noDevice : running ? t.loading : t.deviceOff(listed.name);
    boot.hidden = !listed || running || !t;
    if (t) {
      boot.textContent = t.start;
      add.setAttribute('aria-label', t.tileAdd);
      add.title = t.tileAdd;
      close.setAttribute('aria-label', t.tileClose);
      close.title = t.tileClose;
    }
    add.hidden = tiles.length >= MAX_TILES || tiles[tiles.length - 1] !== tile;
    close.hidden = tiles.length <= 1;
    void ensureChrome();
    layout();
  };

  const tile = {
    root,
    udid: () => udid,
    render,
    start() {
      generation += 1;
      void pump(generation);
    },
    /** Shows another device in this tile. */
    setUdid(next: string) {
      if (next === udid) return;
      udid = next;
      // Input still queued was meant for the old device and its size.
      queue = [];
      lastSize = null;
      touching = false;
      shown = null;
      chrome = null;
      chromeKey = '';
      laidOut = '';
      tile.start();
      render();
    },
    stop() {
      generation += 1;
    },
  };
  return tile;
};

type Tile = ReturnType<typeof createTile>;

const tiles: Tile[] = [];
let focused: Tile | null = null;
let refresh: () => void = () => undefined;
let started = false;

const storeTiles = () => void host.storage.set(TILES_KEY, tiles.map((tile) => tile.udid())).catch(() => undefined);

const drawTiles = () => {
  grid.dataset.count = String(tiles.length);
  for (const tile of tiles) {
    tile.root.classList.toggle('focused', tile === focused);
    tile.render();
  }
};

function focus(tile: Tile) {
  if (tile !== focused) {
    focused = tile;
    drawTiles();
    refresh();
  }
  if (document.activeElement !== tile.root) tile.root.focus({ preventScroll: true });
}

/** A device for a new tile: a running one no tile shows, else any not shown, else the first. */
const nextDevice = (): string | null => {
  const devices = stateNow()?.devices ?? [];
  const shownNow = new Set(tiles.map((tile) => tile.udid()));
  return (
    devices.find((device) => device.state === 'Booted' && !shownNow.has(device.udid))?.udid ??
    devices.find((device) => !shownNow.has(device.udid))?.udid ??
    devices[0]?.udid ??
    null
  );
};

const placeTile = (udid: string): Tile => {
  const tile = createTile(udid);
  tiles.push(tile);
  grid.append(tile.root);
  tile.start();
  return tile;
};

function addTile() {
  const udid = nextDevice();
  if (!udid || tiles.length >= MAX_TILES) return;
  const tile = placeTile(udid);
  storeTiles();
  focus(tile);
  drawTiles();
}

/** Closes a tile (never the last); its device keeps running. */
function removeTile(tile: Tile) {
  if (tiles.length <= 1) return;
  const index = tiles.indexOf(tile);
  tiles.splice(index, 1);
  tile.stop();
  tile.root.remove();
  storeTiles();
  if (focused === tile) focus(tiles[Math.max(0, index - 1)]!);
  drawTiles();
}

/** Once the first state is in: the stored tiles (listed devices only), else the panel's device. */
const startTiles = async (state: SimState) => {
  started = true;
  const stored = await host.storage.get(TILES_KEY).catch(() => undefined);
  const listed = new Set(state.devices.map((device) => device.udid));
  let udids = Array.isArray(stored) ? stored.filter((udid): udid is string => typeof udid === 'string' && listed.has(udid)).slice(0, MAX_TILES) : [];
  if (udids.length === 0) {
    const first = state.active?.udid ?? state.selected;
    udids = first ? [first] : [];
  }
  for (const udid of udids) placeTile(udid);
  if (tiles[0]) focus(tiles[0]);
  drawTiles();
};

// The serve-sim address for the toolbar's "Open in serve-sim" button, edited in a row under the toolbar.
const toolbar = createToolbar(bar, () => host, {
  onEditDirect: () => direct.show(true),
  // The picker in the page sets the focused tile's device; the panel stays where it is.
  onPick: (udid) => {
    if (!focused) return;
    focused.setUdid(udid);
    storeTiles();
    refresh();
  },
});
const direct = createDirectEditor({ bar, host: () => host, toolbar: () => toolbar });

let popover = false;
const host: HostClient = startFrame(
  (next) => {
    context = next;
    toolbar(next);
    direct.label(next.t, stateNow());
    const state = stateNow();
    if (!started && state && !popover) void startTiles(state);
    drawTiles();
  },
  {
    target: () => focused?.udid() ?? null,
    bindRefresh: (poll) => {
      refresh = poll;
    },
  },
);

// Not in a tooltip popover frame (same entry, opened by the host): only a real page shows tiles.
host.onReady((ready) => {
  if (ready.surface === 'popover') popover = true;
});
