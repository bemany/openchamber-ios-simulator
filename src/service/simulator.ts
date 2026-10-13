// Holds the state together: which device the panel shows, one link (picture
// stream and HID socket, device-link.ts) per device someone watches, and
// boot/shutdown in progress. Frames are only pulled while someone watches
// (frame requests keep coming): the panel's surface for the device it shows,
// page tiles for theirs. Several simulators may run; the one the panel shows is
// the chosen one if it runs, else any running one. Nothing is shut down unless asked for.
import { DEFAULT_QUALITY, type Appearance, type Busy, type Device, type KeyboardLayout, type Orientation, type Quality, type SimState } from '../shared/state.ts';
import { createDeviceLink, type DeviceLink } from './device-link.ts';
import { run, SERVE_SIM } from './exec.ts';
import { createFrameHub, type Frame } from './frames.ts';
import { ensureHelper, helperBase, restartHelper } from './helper.ts';
import { OPCODE, type HidMessage } from './input.ts';
import { createLinks, type Links } from './links.ts';
import { solidPng } from './placeholder.ts';
import { repairInput } from './repair.ts';
import { createProcessReader, processesFor } from './serve-sim-processes.ts';
import {
  bootDevice,
  defaultDevice,
  shownDevice,
  listDevices,
  readAppearance,
  readKeyboardLayout,
  setAppearance,
  shutdownDevice,
} from './simctl.ts';

/** A viewer counts as present for this long after its last frame request. */
const VIEWER_GRACE_MS = 35_000;
const DEVICE_POLL_MS = 2_000;
const APPEARANCE_TTL_MS = 15_000;
/** How long the toolbar notes skipped characters after a paste. */
const SKIPPED_SHOWN_MS = 8_000;
const PLACEHOLDER = { width: 402, height: 874, color: 0x1d1b1b };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** `ownPreviewPids`: preview servers the extension started on request (they count as its own). */
export const createSimulator = (ownPreviewPids: () => Promise<ReadonlySet<number>> = async () => new Set()) => {
  /** The panel's pictures: the frames of the device it shows, numbered on across switches, or a placeholder. */
  const hub = createFrameHub();
  let devices: Device[] = [];
  let devicesAt = 0;
  let selected: string | null = null;
  let busy: Busy = null;
  let error: string | null = null;
  let controller: SimState['controller'] = 'none';
  /** Light or dark per device, read at most every APPEARANCE_TTL_MS. */
  const appearances = new Map<string, { value: Appearance; at: number }>();
  const layouts = new Map<string, KeyboardLayout>();
  /** The loopback helper each device is reached through; only its own (see helper.ts). */
  const helperPorts = new Map<string, number>();
  const helperFor = async (udid: string): Promise<number> => {
    const port = await ensureHelper(udid, helperPorts.get(udid) ?? null);
    helperPorts.set(udid, port);
    return port;
  };
  let framed = true;
  let quality: Quality = DEFAULT_QUALITY;
  let skipped: { count: number; at: number } = { count: 0, at: 0 };
  /** The device whose frames go to the panel's hub. */
  let panelUdid: string | null = null;
  let placeholderShown = false;
  let watching = false;
  const serveSimProcesses = createProcessReader();

  /** Frame hubs per device, kept when a link closes, so a tile coming back keeps counting from its last frame. */
  const hubs = new Map<string, ReturnType<typeof createFrameHub>>();
  const hubOf = (udid: string) => {
    let found = hubs.get(udid);
    if (!found) {
      found = createFrameHub();
      hubs.set(udid, found);
    }
    return found;
  };
  /** At most one forced device list per second for links asking whether their device runs. */
  let bootedCheck: Promise<Device[]> | null = null;
  const bootedNow = async (udid: string): Promise<boolean> => {
    bootedCheck ??= refreshDevices(Date.now() - devicesAt > 1_000).finally(() => setTimeout(() => (bootedCheck = null), 1_000));
    return (await bootedCheck).some((device) => device.udid === udid && device.state === 'Booted');
  };
  const links: Links<DeviceLink> = createLinks<DeviceLink>({
    now: () => Date.now(),
    graceMs: VIEWER_GRACE_MS,
    open: (udid): DeviceLink =>
      createDeviceLink(udid, {
        helperFor,
        forgetHelper: (device) => helperPorts.delete(device),
        name: (device) => devices.find((candidate) => candidate.udid === device)?.name ?? 'Simulator',
        wanted: (device): boolean => links.wanted(device),
        booted: bootedNow,
        onFrame: (device, frame) => {
          if (device !== panelUdid) return;
          placeholderShown = false;
          hub.publish({ data: frame.data, mime: frame.mime, width: frame.width, height: frame.height, title: frame.title });
        },
        onError: (device, next) => {
          if (device === panelUdid || next === null) error = next;
        },
      }, hubOf(udid)),
  });

  const activeDevice = (): Device | null => shownDevice(devices, selected);
  const booted = (udid: string) => devices.some((device) => device.udid === udid && device.state === 'Booted');

  const refreshDevices = async (force = false): Promise<Device[]> => {
    if (!force && Date.now() - devicesAt < DEVICE_POLL_MS - 100) return devices;
    try {
      devices = await listDevices();
      devicesAt = Date.now();
    } catch (cause) {
      error = message(cause);
    }
    return devices;
  };

  const showPlaceholder = () => {
    if (placeholderShown) return;
    placeholderShown = true;
    hub.publish({
      data: solidPng(PLACEHOLDER.width, PLACEHOLDER.height, PLACEHOLDER.color),
      mime: 'image/png',
      width: PLACEHOLDER.width,
      height: PLACEHOLDER.height,
      title: 'No simulator',
    });
  };

  /** Points the panel at the device it shows now; the newest picture of that device shows at once. */
  const syncPanel = () => {
    const device = activeDevice();
    const next = device?.udid ?? null;
    links.setPanel(next);
    if (next === panelUdid) return;
    panelUdid = next;
    if (!device) return;
    const link = links.get(device.udid);
    const newest = link.hub.current();
    if (newest) hub.publish({ data: newest.data, mime: newest.mime, width: newest.width, height: newest.height, title: newest.title });
  };

  /** Connects every watched, running device; closes links nobody watches. */
  const tick = async () => {
    syncPanel();
    if (links.panelWatching()) {
      if (!panelUdid) showPlaceholder();
      else void links.get(panelUdid).start();
    }
    for (const udid of links.watched()) if (booted(udid)) void links.peek(udid)?.start();
    for (const udid of links.sweep()) helperPorts.delete(udid);
  };

  /** Runs while anyone watches: notices device changes and (re)connects streams. */
  const watch = async () => {
    if (watching) return;
    watching = true;
    try {
      while (links.panelWatching() || links.watched().length > 0) {
        await refreshDevices();
        await tick();
        await sleep(DEVICE_POLL_MS);
      }
      links.sweep();
    } finally {
      watching = false;
    }
  };

  /** The panel's next picture. */
  const nextFrame = (after: number, waitMs: number, signal?: AbortSignal): Promise<Frame | null> => {
    links.seenByPanel();
    void watch();
    return hub.next(after, waitMs, signal);
  };

  /** A page tile's next picture of `udid`. */
  const nextFrameOf = (udid: string, after: number, waitMs: number, signal?: AbortSignal): Promise<Frame | null> => {
    const link = links.seenByPage(udid);
    void watch();
    if (booted(udid)) void link.start();
    return link.hub.next(after, waitMs, signal);
  };

  /** The running device `udid`, or the panel's device without one. */
  const requireDevice = async (udid?: string): Promise<Device> => {
    await refreshDevices(true);
    const device = udid ? devices.find((candidate) => candidate.udid === udid && candidate.state === 'Booted') : activeDevice();
    if (!device) throw new Error(udid ? 'That simulator is not booted' : 'No simulator is booted');
    return device;
  };

  /** The link to send input through (opened when nobody watches it yet). */
  const linkOf = async (udid?: string): Promise<DeviceLink> => links.get((await requireDevice(udid)).udid);

  /** Moves the panel to the device now shown, right away instead of at the next device poll. */
  const switchStream = async () => {
    await refreshDevices(true);
    await tick();
  };

  const runBusy = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    if (busy) throw new Error('Another boot, shutdown or repair is in progress');
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

  const layoutOf = async (udid: string): Promise<KeyboardLayout> => {
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

    /** Sends HID messages to `udid`, or to the panel's device. */
    async sendHid(messages: HidMessage[], udid?: string) {
      if (messages.length === 0) return;
      await (await linkOf(udid)).sendHid(messages);
    },

    /**
     * The state the toolbar draws. Without `target` for the panel's device;
     * with it for a page tile's device (`active` is that device while it runs).
     */
    async state(target?: string): Promise<SimState> {
      await refreshDevices();
      if (!target) {
        const shown = activeDevice();
        if (shown) selected = shown.udid;
        if (!selected || !devices.some((device) => device.udid === selected)) {
          selected = devices.find((device) => device.state === 'Booted')?.udid ?? defaultDevice(devices)?.udid ?? null;
        }
      }
      const active = target ? (devices.find((device) => device.udid === target && device.state === 'Booted') ?? null) : activeDevice();
      if (active) {
        const known = appearances.get(active.udid);
        if (!known || Date.now() - known.at > APPEARANCE_TTL_MS) appearances.set(active.udid, { value: await readAppearance(active.udid), at: Date.now() });
        if (!layouts.has(active.udid)) void layoutOf(active.udid).catch(() => undefined);
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
        appearance: active ? (appearances.get(active.udid)?.value ?? 'unknown') : 'unknown',
        keyboard: active ? (layouts.get(active.udid) ?? null) : null,
        framed,
        quality,
        skipped: Date.now() - skipped.at < SKIPPED_SHOWN_MS ? skipped.count : 0,
        serveSims: active ? processesFor(await serveSimProcesses(), active.udid, true, await ownPreviewPids()) : [],
        error,
      };
    },

    /** Boots `udid` if it is off. `select` also shows it in the panel (the panel's own picker). */
    async boot(udid: string, { select = true }: { select?: boolean } = {}) {
      await refreshDevices(true);
      const device = devices.find((candidate) => candidate.udid === udid);
      if (!device) throw new Error('Unknown device');
      if (select) selected = udid;
      if (device.state !== 'Booted') {
        await runBusy('booting', () => bootDevice(udid));
        helperPorts.delete(udid); // a helper left from an earlier boot of this device is gone
      }
      await switchStream();
    },

    /** Shuts down `udid`, or the panel's device; nothing else. */
    async shutdown(udid?: string) {
      await refreshDevices(true);
      const device = udid ? devices.find((candidate) => candidate.udid === udid && candidate.state === 'Booted') : activeDevice();
      if (!device) return;
      await runBusy('shutting-down', async () => {
        links.peek(device.udid)?.reset();
        await shutdownDevice(device.udid);
        helperPorts.delete(device.udid); // its helper exits with it
      });
      await switchStream();
    },

    /** The toolbar's choice: shown at once when it runs; when it is off, shown as off until someone boots it. */
    async select(udid: string) {
      await refreshDevices();
      if (!devices.some((device) => device.udid === udid)) return;
      selected = udid;
      await switchStream();
    },

    /** Sends the newest picture again, so a changed view (frame, rotation) shows without waiting for the screen to change. */
    repaint() {
      const shown = hub.current();
      if (shown) hub.publish({ data: shown.data, mime: shown.mime, width: shown.width, height: shown.height, title: shown.title });
    },

    framed: (): boolean => framed,

    quality: (): Quality => quality,

    /** Remembers how many characters an input batch could not type, for the toolbar's note. */
    noteSkipped(count: number) {
      if (count > 0) skipped = { count, at: Date.now() };
    },

    setQuality(next: Quality) {
      quality = next;
    },

    setFramed(on: boolean) {
      framed = on;
    },

    /** The device the panel shows, from the last device list (no refresh). */
    active: (): Device | null => activeDevice(),

    /** Is `udid` a listed device (fresh list)? */
    async knows(udid: string): Promise<boolean> {
      if (!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(udid)) return false;
      // A tile of a deleted device asks on every frame: a fresh list at most once a second.
      return (await refreshDevices(Date.now() - devicesAt > 1_000)).some((device) => device.udid === udid);
    },

    /** A listed device by udid, from the last device list. */
    device: (udid: string): Device | null => devices.find((device) => device.udid === udid) ?? null,

    /** Booted devices, from a device list at most one poll old. */
    async booted(): Promise<Device[]> {
      return (await refreshDevices()).filter((device) => device.state === 'Booted');
    },

    /** The newest picture of `udid` (page input checks its size against it). */
    currentOf: (udid: string): Frame | null => links.peek(udid)?.hub.current() ?? null,

    async button(name: 'home' | 'lock', udid?: string) {
      await (await linkOf(udid)).sendRaw(OPCODE.button, name === 'home' ? { button: 'home' } : { button: 'power', page: 12, usage: 48 });
    },

    async rotate(target?: Orientation, udid?: string) {
      const link = await linkOf(udid);
      const now = link.orientation();
      const next: Orientation = target ?? (now === 'portrait' || now === null ? 'landscape_left' : 'portrait');
      await link.sendRaw(OPCODE.orientation, { orientation: next });
      link.setOrientation(next);
      // A still screen may send no new frame; republish the current one so it shows rotated.
      if (link.udid === panelUdid) {
        const shown = hub.current();
        if (shown) hub.publish({ data: shown.data, mime: shown.mime, width: shown.width, height: shown.height, title: shown.title });
      }
      const own = link.hub.current();
      if (own) link.hub.publish({ data: own.data, mime: own.mime, width: own.width, height: own.height, title: own.title });
    },

    /** A hardware button from the device frame, by its HID usage (as in Xcode's chrome.json). */
    async pressButton(name: string, page: number, usage: number, udid?: string) {
      const link = await linkOf(udid);
      if (name === 'home') await link.sendRaw(OPCODE.button, { button: 'home' });
      else await link.sendRaw(OPCODE.button, { button: name, page, usage });
    },

    async setAppearance(mode?: 'light' | 'dark', udid?: string) {
      const device = await requireDevice(udid);
      const current = await readAppearance(device.udid);
      const next = mode ?? (current === 'dark' ? 'light' : 'dark');
      await setAppearance(device.udid, next);
      appearances.set(device.udid, { value: next, at: Date.now() });
    },

    /** Repairs the input of `udid`, or the panel's device (closes its running apps), and reconnects through a fresh helper. */
    async repairInput(udid?: string) {
      const device = await requireDevice(udid);
      await runBusy('repairing', async () => {
        const port = await repairInput(device.udid, {
          serveSim: (args) => run(SERVE_SIM, args, { timeout: 120_000 }),
          restartHelper: async (target) => {
            links.peek(target)?.reset();
            helperPorts.delete(target);
            return restartHelper(target);
          },
        });
        helperPorts.set(device.udid, port);
      });
      await switchStream();
    },

    async activeUdid(): Promise<string> {
      return (await requireDevice()).udid;
    },

    async axTree(): Promise<string> {
      const device = await requireDevice();
      const port = await helperFor(device.udid);
      const response = await fetch(`${helperBase(port, device.udid)}/ax`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Accessibility tree unavailable (${response.status})`);
      return response.text();
    },

    /** Orientation of `udid`, or of the panel's device. */
    orientation: (udid?: string): Orientation | null => {
      const target = udid ?? panelUdid;
      return target ? (links.peek(target)?.orientation() ?? null) : null;
    },

    /** Keyboard layout of `udid`, or of the panel's device; read once per device. */
    async layout(udid?: string): Promise<KeyboardLayout> {
      const target = udid ?? activeDevice()?.udid;
      return target ? layoutOf(target) : 'us';
    },

    /** The process list changed (a preview server started or stopped): read it afresh. */
    forgetProcesses() {
      serveSimProcesses.forget();
    },

    setController(next: SimState['controller']) {
      controller = next;
    },

    stop() {
      links.closeAll();
    },
  };
};

export type Simulator = ReturnType<typeof createSimulator>;
