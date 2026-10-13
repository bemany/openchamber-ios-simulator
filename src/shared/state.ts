// What the service reports to the toolbar and the status section over `/state`.

export type DeviceState = 'Booted' | 'Shutdown' | 'Booting' | 'ShuttingDown' | string;

export type Device = {
  udid: string;
  name: string;
  /** For example `iOS 27.0`. */
  runtime: string;
  state: DeviceState;
  /** `com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro`, for the device frame. */
  deviceType?: string;
};

export type Orientation = 'portrait' | 'portrait_upside_down' | 'landscape_left' | 'landscape_right';

export type Appearance = 'light' | 'dark' | 'unknown';

/** A serve-sim stream process attached to a device (from the process list). `own`: the extension's helper. */
export type ServeSimProcess = { pid: number; host: string; port: number; own: boolean };

/** Warn only when a serve-sim the extension did not start shares the device with another. */
export const serveSimsDoubled = (list: ServeSimProcess[]): boolean => list.length > 1 && list.some((entry) => !entry.own);

/** A serve-sim preview server the service found on its machine (`GET /serve-sim/servers`). */
export type ServeSimServer = { url: string; udid: string; name: string; loopback: boolean; started?: boolean };

/** One of the OpenChamber machine's IPv4 addresses, for starting a preview server on it. */
export type OwnAddress = { address: string; interface: string };

/** Hardware keyboard layouts the service can type in; anything else is typed as `us`. */
export type KeyboardLayout = 'ch' | 'de' | 'es' | 'fr' | 'gb' | 'it' | 'us';

export type Busy = 'booting' | 'shutting-down' | 'repairing' | null;

/** Picture size: full framebuffer, half or a third per side. Smaller is smoother over the network. */
export type Quality = 'full' | 'balanced' | 'fast';

export const QUALITIES: readonly Quality[] = ['full', 'balanced', 'fast'];

/** Whole factor each side is divided by. */
export const QUALITY_DIVISOR: Record<Quality, number> = { full: 1, balanced: 2, fast: 3 };

export const DEFAULT_QUALITY: Quality = 'balanced';

export type SimState = {
  devices: Device[];
  /** The booted device, or `null`. */
  active: Device | null;
  /** The device the toolbar preselects: the active one, else the last chosen, else the first iPhone. */
  selected: string | null;
  busy: Busy;
  /** A viewer is fetching frames and the helper is delivering them. */
  streaming: boolean;
  /** Who drives the surface, as reported by the host. */
  controller: 'none' | 'agent' | 'user';
  orientation: Orientation | null;
  appearance: Appearance;
  keyboard: KeyboardLayout | null;
  /** The device frame is drawn around the picture (when Xcode has one for the device). */
  framed: boolean;
  quality: Quality;
  /** Characters the last paste could not type (no key, pasteboard not writable); 0 after a few seconds. */
  skipped: number;
  /** serve-sim processes attached to the state's device; more than one can disturb its input. */
  serveSims: ServeSimProcess[];
  /** Last error for display, or `null`. */
  error: string | null;
};

export type Rect = { x: number; y: number; width: number; height: number };

/** A hardware button on the device frame, in frame pixels (portrait). */
export type ChromeButton = Rect & { name: string; page: number; usage: number };

/**
 * Xcode's device frame for one device, laid out in framebuffer pixels:
 * `width`/`height` is the whole picture, `screen` where the framebuffer sits.
 */
export type ChromeLayout = {
  id: string;
  width: number;
  height: number;
  screen: Rect;
  buttons: ChromeButton[];
};

/**
 * Something too big for one `serviceRequest` answer (the host cuts those at
 * 256 000 characters): base64 fetched in parts from `GET /blob?id=&offset=`.
 */
export type BlobRef = { id: string; length: number };

/** Characters per `GET /blob` answer, below the host's limit. */
export const BLOB_CHUNK = 240_000;

/** `GET /chrome`: the frame for the page, which draws it itself. Images are base64 PNG. */
export type ChromeAnswer =
  | { available: false }
  | { available: true; layout: ChromeLayout; layer: BlobRef; mask: BlobRef | null };

/** `GET /page/frame`: one raw framebuffer picture for the page. */
export type PageFrame = { seq: number; mime: string; width: number; height: number; degrees: number; data: BlobRef };
