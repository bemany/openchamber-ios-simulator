// The toolbar shared by the docked panel and the full-screen page: device
// picker, boot/shut down, Home, rotate, light/dark, lock, device frame, status.
import type { HostClient } from '@openchamber/sdk';

import type { SimState } from '../shared/state.ts';
import type { FrameContext } from './host.ts';
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
.sep{width:1px;height:18px;background:var(--oc-border);margin:0 2px;flex:none}
.grow{flex:1;min-width:4px}
.status{display:flex;align-items:center;gap:6px;color:var(--oc-muted);min-width:0;overflow:hidden}
.status .text{overflow:hidden;text-overflow:ellipsis}
@media (max-width:370px){.status .text{display:none}}
`;

/** Instance storage: the device chosen last (preselected while nothing runs) and the frame switch. */
const DEVICE_KEY = 'device';
const FRAMED_KEY = 'framed';

/** Builds the toolbar into `bar`; the answer draws it for a context. `host` is read lazily (it exists after `startFrame`). */
export const createToolbar = (bar: HTMLElement, host: () => HostClient) => {
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
  const frame = iconButton('frame');
  const status = element('div', 'status');
  const dot = element('span', 'dot');
  const statusText = element('span', 'text');
  status.append(dot, statusText);
  bar.append(select, power, element('span', 'sep'), home, rotate, appearance, lock, element('span', 'sep'), frame, element('span', 'grow'), status);

  let context: FrameContext | null = null;
  let shownOptions = '';
  let storedApplied = false;

  const current = (): SimState | null => (context?.view.kind === 'ready' ? context.view.state : null);
  const store = (key: string, value: string | boolean) => void host().storage.set(key, value).catch(() => undefined);

  select.addEventListener('change', () => {
    const state = current();
    if (!context || !state) return;
    store(DEVICE_KEY, select.value);
    // A running device shows at once; another boots next to the running ones; with none running the choice waits for the power button.
    const target = state.devices.find((device) => device.udid === select.value);
    if (target?.state === 'Booted' || !state.active) void context.act('/select', { udid: select.value });
    else void context.act('/boot', { udid: select.value });
  });
  power.addEventListener('click', () => {
    const state = current();
    if (!context || !state) return;
    if (state.active) void context.act('/shutdown');
    else if (select.value) {
      store(DEVICE_KEY, select.value);
      void context.act('/boot', { udid: select.value });
    }
  });
  home.addEventListener('click', () => void context?.act('/button', { name: 'home' }));
  lock.addEventListener('click', () => void context?.act('/button', { name: 'lock' }));
  rotate.addEventListener('click', () => void context?.act('/rotate'));
  appearance.addEventListener('click', () => void context?.act('/appearance'));
  frame.addEventListener('click', () => {
    const state = current();
    if (!context || !state) return;
    store(FRAMED_KEY, !state.framed);
    void context.act('/frame', { on: !state.framed });
  });

  const label = (node: HTMLElement, text: string) => {
    node.title = text;
    node.setAttribute('aria-label', text);
  };

  const setStatus = (kind: '' | 'on' | 'busy' | 'error', text: string, title = text) => {
    dot.className = `dot${kind ? ` ${kind}` : ''}`;
    statusText.textContent = text;
    status.title = title;
  };

  /** Once per load: the stored frame switch, and the stored device when nothing runs. */
  const applyStored = (state: SimState) => {
    if (storedApplied) return;
    storedApplied = true;
    void host()
      .storage.get(FRAMED_KEY)
      .then((framed) => {
        if (typeof framed === 'boolean' && framed !== current()?.framed) void context?.act('/frame', { on: framed });
      })
      .catch(() => undefined);
    if (state.active) return;
    void host()
      .storage.get(DEVICE_KEY)
      .then((udid) => {
        if (typeof udid === 'string' && udid !== state.selected && state.devices.some((device) => device.udid === udid)) {
          void context?.act('/select', { udid });
        }
      })
      .catch(() => undefined);
  };

  return (next: FrameContext) => {
    context = next;
    const { view, t, pending } = next;
    label(select, t.device);
    label(home, t.home);
    label(rotate, t.rotate);
    label(lock, t.lock);

    if (view.kind !== 'ready') {
      for (const control of [select, power, home, rotate, appearance, lock, frame]) control.disabled = true;
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
    select.disabled = busy || state.devices.length === 0;
    power.disabled = busy || state.devices.length === 0;
    power.classList.toggle('on', live);
    power.classList.toggle('pending', pending === '/boot' || pending === '/shutdown');
    label(power, live ? t.stop : t.start);
    for (const control of [home, rotate, appearance, lock]) control.disabled = !live || busy;
    label(appearance, state.appearance === 'dark' ? t.appearanceToLight : t.appearanceToDark);
    frame.disabled = pending === '/frame';
    frame.setAttribute('aria-pressed', String(state.framed));
    label(frame, state.framed ? t.frameHide : t.frameShow);

    if (state.devices.length === 0) setStatus('error', t.noDevices);
    else if (state.busy === 'booting') setStatus('busy', t.booting);
    else if (state.busy === 'shutting-down') setStatus('busy', t.shuttingDown);
    else if (!live) setStatus(state.error ? 'error' : '', t.noDevice, state.error ?? t.noDevice);
    else if (state.error) setStatus('error', state.error);
    else {
      const control = state.controller === 'user' ? `, ${t.controlUser}` : state.controller === 'agent' ? `, ${t.controlAgent}` : '';
      setStatus(state.streaming ? 'on' : '', `${state.streaming ? t.live : t.noStream}${control}`);
    }
  };
};
