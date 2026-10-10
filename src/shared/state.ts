// What the service reports to the toolbar and the status section over `/state`.

export type DeviceState = 'Booted' | 'Shutdown' | 'Booting' | 'ShuttingDown' | string;

export type Device = {
  udid: string;
  name: string;
  /** For example `iOS 27.0`. */
  runtime: string;
  state: DeviceState;
};

export type Orientation = 'portrait' | 'portrait_upside_down' | 'landscape_left' | 'landscape_right';

export type Appearance = 'light' | 'dark' | 'unknown';

/** Hardware keyboard layouts the service can type in; anything else is typed as `us`. */
export type KeyboardLayout = 'de' | 'us';

export type Busy = 'booting' | 'shutting-down' | null;

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
  /** Last error for display, or `null`. */
  error: string | null;
};
