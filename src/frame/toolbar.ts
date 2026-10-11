// The toolbar shared by the docked panel and the full-screen page: device
// picker, boot/shut down, Home, rotate, light/dark, lock, device frame, status.
import type { HostClient } from '@openchamber/sdk';

import { DIRECT_URL_KEY, normalizeDirectUrl } from '../shared/direct.ts';
import { QUALITIES, serveSimsDoubled, type Quality, type SimState } from '../shared/state.ts';
import type { FrameContext } from './host.ts';
import { attachTooltips } from './tooltip.ts';
import { BASE_CSS, element, icon, installStyle, type IconName } from './ui.ts';

export const TOOLBAR_CSS = `${BASE_CSS}
#bar{display:flex;align-items:center;gap:4px;padding:0 8px;white-space:nowrap}
select{font:inherit;color:var(--oc-fg);background:var(--oc-elevated,transparent);border:1px solid var(--oc-border);border-radius:var(--oc-radius,6px);height:26px;padding:0 6px;max-width:190px;min-width:0;flex:0 1 auto}
select:focus-visible,.ib:focus-visible{outline:2px solid var(--oc-focus);outline-offset:1px}
.ib{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border:0;border-radius:var(--oc-radius,6px);background:transparent;color:var(--oc-fg);cursor:pointer;padding:0}
.ib:hover:not(:disabled){background:var(--oc-hover)}
.ib:disabled{opacity:.4;cursor:default}
.ib.on{color:var(--oc-success-text)}
.ib[aria-pressed="true"]{background:var(--oc-active)}
.ib.pending{opacity:.6;cursor:progress}
.ib.down{position:relative}
.ib.down::after{content:'';position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:var(--oc-error-text)}
.ib.armed{color:var(--oc-warning-text);background:var(--oc-hover)}
.ib.q{width:auto;padding:0 6px;font-size:11px;font-variant-numeric:tabular-nums}
.sep{width:1px;height:18px;background:var(--oc-border);margin:0 2px;flex:none}
.grow{flex:1;min-width:4px}
.status{display:flex;align-items:center;gap:6px;color:var(--oc-muted);min-width:0;overflow:hidden}
.status .text{overflow:hidden;text-overflow:ellipsis}
.boot{flex:none;font:inherit;color:var(--oc-primary-foreground,#fff);background:var(--oc-primary);border:0;border-radius:var(--oc-radius,6px);height:24px;padding:0 10px;cursor:pointer}
.boot:hover:not(:disabled){filter:brightness(1.08)}
.boot:disabled{opacity:.6;cursor:progress}
@media (max-width:370px){.status .text{display:none}}
`;

/** Instance storage: the device chosen last (preselected while nothing runs) and the frame switch. */
const DEVICE_KEY = 'device';
const FRAMED_KEY = 'framed';
const QUALITY_KEY = 'quality';
/** How long the repair button waits for its second click. */
const REPAIR_ARMED_MS = 4_000;
/** How often the stored serve-sim address is checked while the toolbar is visible. */
const DIRECT_CHECK_MS = 15_000;
const QUALITY_LABEL: Record<Quality, string> = { full: '1:1', balanced: '1:2', fast: '1:3' };
const nextQuality = (quality: Quality): Quality => QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]!;

export type ToolbarOptions = {
  /** Opens the serve-sim address row; the open button calls it while no address is stored. */
  onEditDirect: () => void;
  /** The page: the device picker sets the focused tile's device instead of the panel's. */
  onPick?: (udid: string) => void;
};

/**
 * Builds the toolbar into `bar`; the answer draws it for a context and can be
 * told a new serve-sim address. `host` is read lazily (it exists after `startFrame`).
 */
export const createToolbar = (bar: HTMLElement, host: () => HostClient, options: ToolbarOptions) => {
  installStyle(TOOLBAR_CSS);

  const select = element('select');
  const iconButton = (name: IconName) => {
    const button = element('button', 'ib');
    button.type = 'button';
    button.append(icon(name));
    return button;
  };
  const power = iconButton('power');
  const home = iconButton('home');
  const rotate = iconButton('rotate');
  const appearance = iconButton('contrast');
  const lock = iconButton('lock');
  /** Repairs touch input; closes the device's apps, so it needs a second click. */
  const repair = iconButton('wrench');
  let repairArmed: ReturnType<typeof setTimeout> | null = null;
  const frame = iconButton('frame');
  /** serve-sim's own interface in a tab of its own, at the address the user stored. */
  const open = iconButton('external');
  let directUrl: string | null = null;
  /** Whether serve-sim answers at the stored address; `null` while unknown. */
  let directRunning: boolean | null = null;
  let directChecked = '';
  /** Picture size; cycles full, half, third. */
  const quality = element('button', 'ib q');
  quality.type = 'button';
  const status = element('div', 'status');
  const dot = element('span', 'dot');
  const statusText = element('span', 'text');
  status.append(dot, statusText);
  /** Shown when the chosen device is off: booting is always a deliberate click. */
  const boot = element('button', 'boot');
  boot.type = 'button';
  boot.hidden = true;
  bar.append(select, power, repair, element('span', 'sep'), home, rotate, appearance, lock, element('span', 'sep'), frame, quality, open, element('span', 'grow'), status, boot);

  let context: FrameContext | null = null;
  let shownOptions = '';
  let storedApplied = false;

  const current = (): SimState | null => (context?.view.kind === 'ready' ? context.view.state : null);
  const store = (key: string, value: string | boolean) => void host().storage.set(key, value).catch(() => undefined);

  select.addEventListener('change', () => {
    const state = current();
    if (!context || !state) return;
    if (options.onPick) {
      options.onPick(select.value);
      return;
    }
    store(DEVICE_KEY, select.value);
    // A running device shows at once; one that is off shows as off and boots only from the Boot button.
    void context.act('/select', { udid: select.value });
  });
  boot.addEventListener('click', () => {
    const state = current();
    if (!context || !state?.selected) return;
    void context.act('/boot', { udid: state.selected });
  });
  power.addEventListener('click', () => {
    const state = current();
    if (!context || !state) return;
    if (state.active) void context.act('/shutdown');
    else if (select.value) {
      if (!options.onPick) store(DEVICE_KEY, select.value);
      void context.act('/boot', { udid: select.value });
    }
  });
  home.addEventListener('click', () => void context?.act('/button', { name: 'home' }));
  lock.addEventListener('click', () => void context?.act('/button', { name: 'lock' }));
  rotate.addEventListener('click', () => void context?.act('/rotate'));
  appearance.addEventListener('click', () => void context?.act('/appearance'));
  repair.addEventListener('click', () => {
    if (!context) return;
    if (repairArmed) {
      clearTimeout(repairArmed);
      repairArmed = null;
      void context.act('/repair-input');
      return;
    }
    // First click only arms; no confirm() in a sandboxed frame.
    repairArmed = setTimeout(() => {
      repairArmed = null;
      if (context) render(context);
    }, REPAIR_ARMED_MS);
    render(context);
  });
  open.addEventListener('click', () => {
    if (directUrl) {
      void host().openUrl(directUrl).catch(() => undefined);
      return;
    }
    options.onEditDirect();
  });
  quality.addEventListener('click', () => {
    const state = current();
    if (!context || !state) return;
    const next = nextQuality(state.quality);
    store(QUALITY_KEY, next);
    void context.act('/quality', { value: next });
  });
  frame.addEventListener('click', () => {
    const state = current();
    if (!context || !state) return;
    store(FRAMED_KEY, !state.framed);
    void context.act('/frame', { on: !state.framed });
  });

  /**
   * Icon buttons get only an accessible name: their tooltip is the host popover
   * (see tooltip.ts), and a native `title` would show a second one whenever
   * Chromium decides to display it. Other controls keep the native title.
   */
  const label = (node: HTMLElement, text: string) => {
    if (!node.classList.contains('ib')) node.title = text;
    node.setAttribute('aria-label', text);
  };

  /** While a button is hovered on a host without popovers, the status shows its name instead. */
  let hint: string | null = null;
  let statusShown = '';
  const setStatus = (kind: '' | 'on' | 'busy' | 'error', text: string, title = text) => {
    dot.className = `dot${kind ? ` ${kind}` : ''}`;
    statusShown = text;
    statusText.textContent = hint ?? text;
    status.title = title;
  };
  // After the frame's module has run: `host()` only exists once `startFrame` returned,
  // and the page adds its own buttons (the address row's link button) after the toolbar.
  setTimeout(() =>
    attachTooltips({
      host,
      buttons: () => [...bar.querySelectorAll<HTMLElement>('button.ib')],
      // The status's tooltip names the device and the keyboard layout typed with.
      extras: () => [status],
      showInStatus: (text) => {
        hint = text;
        statusText.textContent = hint ?? statusShown;
      },
    }),
  );

  /**
   * Once per load: the stored frame switch, quality, and the stored device when
   * nothing runs. One after the other, because `act` ignores a call while
   * another is pending.
   */
  const applyStored = (state: SimState) => {
    if (storedApplied) return;
    storedApplied = true;
    const read = (key: string) => host().storage.get(key).catch(() => undefined);
    void (async () => {
      const [framed, stored, udid, url] = await Promise.all([read(FRAMED_KEY), read(QUALITY_KEY), read(DEVICE_KEY), read(DIRECT_URL_KEY)]);
      directUrl = normalizeDirectUrl(url);
      void checkDirect();
      if (typeof framed === 'boolean' && framed !== current()?.framed) await context?.act('/frame', { on: framed });
      const value = QUALITIES.find((candidate) => candidate === stored);
      if (value && value !== current()?.quality) await context?.act('/quality', { value });
      // The panel's stored device; the page keeps its own tiles.
      if (!options.onPick && !state.active && typeof udid === 'string' && udid !== state.selected && state.devices.some((device) => device.udid === udid)) {
        await context?.act('/select', { udid });
      }
    })();
  };

  const drawBoot = (state: SimState | null, busy: boolean, t: FrameContext['t']) => {
    const offer = !!state && state.active === null && state.busy !== 'shutting-down' && state.devices.some((device) => device.udid === state.selected);
    boot.hidden = !offer;
    // The button takes the status's place: the picker already names the device.
    status.hidden = offer;
    boot.disabled = busy;
    boot.textContent = state?.busy === 'booting' ? t.booting : t.start;
    const chosen = state?.devices.find((device) => device.udid === state.selected);
    boot.title = chosen ? `${t.deviceOff(chosen.name)}. ${t.start}` : t.start;
  };

  const render = (next: FrameContext) => {
    context = next;
    const { view, t, pending } = next;
    label(select, t.device);
    label(home, t.home);
    label(rotate, t.rotate);
    label(lock, t.lock);

    if (view.kind !== 'ready') {
      boot.hidden = true;
      status.hidden = false;
      for (const control of [select, power, repair, home, rotate, appearance, lock, frame, quality]) control.disabled = true;
      if (view.kind === 'loading') setStatus('', t.loading);
      else {
        const text = view.reason === 'not-granted' ? t.notGranted : view.reason === 'disabled' ? t.disabled : t.failed;
        setStatus('error', text, view.detail ? `${text} ${view.detail}` : text);
      }
      return;
    }

    const { state } = view;
    applyStored(state);
    // Names repeat across runtimes; only then does the option carry the runtime.
    const counts = new Map<string, number>();
    for (const device of state.devices) counts.set(device.name, (counts.get(device.name) ?? 0) + 1);
    const options = state.devices.map((device) => `${device.udid}|${device.name}|${device.runtime}|${device.state}`).join(',');
    if (options !== shownOptions) {
      shownOptions = options;
      select.replaceChildren(
        ...state.devices.map((device) => {
          const text = (counts.get(device.name) ?? 0) > 1 ? `${device.name} (${device.runtime})` : device.name;
          const option = element('option', '', device.state === 'Booted' ? `${text} •` : text);
          option.value = device.udid;
          option.title = `${device.name}, ${device.runtime}${device.state === 'Booted' ? `, ${t.running}` : ''}`;
          return option;
        }),
      );
    }
    select.value = state.active?.udid ?? state.selected ?? '';

    const busy = state.busy !== null || pending !== null;
    const live = state.active !== null;
    drawBoot(state, busy, t);
    select.disabled = busy || state.devices.length === 0;
    power.disabled = busy || state.devices.length === 0;
    power.classList.toggle('on', live);
    power.classList.toggle('pending', pending === '/boot' || pending === '/shutdown');
    label(power, live ? t.stop : t.start);
    for (const control of [home, rotate, appearance, lock]) control.disabled = !live || busy;
    repair.disabled = !live || busy;
    if (repair.disabled && repairArmed) {
      clearTimeout(repairArmed);
      repairArmed = null;
    }
    repair.classList.toggle('armed', repairArmed !== null);
    repair.classList.toggle('pending', state.busy === 'repairing');
    label(repair, repairArmed ? t.repairConfirm : t.repair);
    label(appearance, state.appearance === 'dark' ? t.appearanceToLight : t.appearanceToDark);
    frame.disabled = pending === '/frame';
    frame.setAttribute('aria-pressed', String(state.framed));
    label(frame, state.framed ? t.frameHide : t.frameShow);
    const down = directUrl !== null && directRunning === false;
    open.classList.toggle('down', down);
    label(open, directUrl ? (down ? t.directDown(directUrl) : `${t.openDirect}: ${directUrl}`) : t.openDirect);
    quality.textContent = QUALITY_LABEL[state.quality];
    quality.disabled = pending === '/quality';
    label(quality, t.qualityNext(t.quality[state.quality], t.quality[nextQuality(state.quality)]));

    if (state.devices.length === 0) setStatus('error', t.noDevices);
    else if (state.busy === 'booting') setStatus('busy', t.booting);
    else if (state.busy === 'shutting-down') setStatus('busy', t.shuttingDown);
    else if (state.busy === 'repairing') setStatus('busy', t.repairing);
    else if (repairArmed && live) setStatus('busy', t.repairConfirm);
    else if (!live) {
      const chosen = state.devices.find((device) => device.udid === state.selected);
      const text = chosen ? t.deviceOff(chosen.name) : t.noDevice;
      setStatus(state.error ? 'error' : '', text, state.error ?? text);
    }
    else if (state.error) setStatus('error', state.error);
    else if (serveSimsDoubled(state.serveSims)) {
      const list = state.serveSims.map((entry) => `${entry.host}:${entry.port}${entry.own ? ` (${t.serveSimOwn})` : ''}`).join(', ');
      setStatus('busy', t.serveSims(state.serveSims.length), `${t.serveSims(state.serveSims.length)}: ${list}. ${t.serveSimsHint}`);
    }
    else if (state.skipped > 0) setStatus('busy', t.skipped(state.skipped));
    else {
      const control = state.controller === 'user' ? `, ${t.controlUser}` : state.controller === 'agent' ? `, ${t.controlAgent}` : '';
      const text = `${state.streaming ? t.live : t.noStream}${control}`;
      // The tooltip names the keyboard layout typed with, so a wrong guess is visible.
      const keyboard = state.keyboard ? `. ${t.keyboard}: ${t.layouts[state.keyboard]}` : '';
      setStatus(state.streaming ? 'on' : '', text, `${state.active?.name ?? text}${keyboard}`);
    }
  };

  /** Asks the service whether the stored address answers; runs on change and every 15 s while the frame is visible. */
  const checkDirect = async () => {
    const url = directUrl;
    if (!url || document.visibilityState !== 'visible') return;
    let running: boolean | null = null;
    try {
      const result = await host().serviceRequest({ method: 'GET', path: '/serve-sim/check', query: { url } });
      if (result.status === 200) running = (JSON.parse(result.body) as { running: boolean | null }).running;
    } catch {
      // the service is restarting: keep the last answer
      return;
    }
    if (url !== directUrl) return;
    directChecked = url;
    if (running !== directRunning) {
      directRunning = running;
      if (context) render(context);
    }
  };
  setInterval(() => void checkDirect(), DIRECT_CHECK_MS);
  document.addEventListener('visibilitychange', () => void checkDirect());

  return Object.assign(render, {
    /** The address saved on the page, or `null` after removing it. */
    setDirectUrl(url: string | null) {
      if (url !== directUrl) directRunning = null;
      directUrl = url;
      if (context) render(context);
      if (url && url !== directChecked) void checkDirect();
    },
    directUrl: () => directUrl,
  });
};
