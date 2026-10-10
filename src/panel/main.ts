// Toolbar docked above the simulator picture: device picker, boot/shut down,
// Home, rotate, light/dark, lock, status. The picture, clicks and keyboard
// belong to the host's surface.
import type { SimState } from '../shared/state.ts';
import { startFrame, type FrameContext } from '../frame/host.ts';
import { BASE_CSS, element, icon, installStyle, type IconName } from '../frame/ui.ts';

installStyle(`${BASE_CSS}
html,body{height:100%;overflow:hidden}
#bar{display:flex;align-items:center;gap:4px;height:100%;padding:0 8px;white-space:nowrap}
select{font:inherit;color:var(--oc-fg);background:var(--oc-elevated,transparent);border:1px solid var(--oc-border);border-radius:var(--oc-radius,6px);height:26px;padding:0 6px;max-width:190px;min-width:0;flex:0 1 auto}
select:focus-visible,.ib:focus-visible{outline:2px solid var(--oc-focus);outline-offset:1px}
.ib{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border:0;border-radius:var(--oc-radius,6px);background:transparent;color:var(--oc-fg);cursor:pointer;padding:0}
.ib:hover:not(:disabled){background:var(--oc-hover)}
.ib:disabled{opacity:.4;cursor:default}
.ib.on{color:var(--oc-success-text)}
.ib.pending{opacity:.6;cursor:progress}
.sep{width:1px;height:18px;background:var(--oc-border);margin:0 2px;flex:none}
.grow{flex:1;min-width:4px}
.status{display:flex;align-items:center;gap:6px;color:var(--oc-muted);min-width:0;overflow:hidden}
.status .text{overflow:hidden;text-overflow:ellipsis}
@media (max-width:340px){.status .text{display:none}}
`);

/** Instance storage key for the device chosen last, preselected while nothing runs. */
const DEVICE_KEY = 'device';

const bar = document.querySelector<HTMLElement>('#bar');
if (!bar) throw new Error('Missing #bar');

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
const status = element('div', 'status');
const dot = element('span', 'dot');
const statusText = element('span', 'text');
status.append(dot, statusText);
bar.append(select, power, element('span', 'sep'), home, rotate, appearance, lock, element('span', 'grow'), status);

let context: FrameContext | null = null;
let shownOptions = '';
let storedApplied = false;

const current = (): SimState | null => (context?.view.kind === 'ready' ? context.view.state : null);

const remember = (udid: string) => void host.storage.set(DEVICE_KEY, udid).catch(() => undefined);

select.addEventListener('change', () => {
  const state = current();
  if (!context || !state) return;
  remember(select.value);
  // A running simulator switches right away; with none running the choice waits for the power button.
  if (state.active && select.value !== state.active.udid) void context.act('/boot', { udid: select.value });
  else if (!state.active) void context.act('/select', { udid: select.value });
});
power.addEventListener('click', () => {
  const state = current();
  if (!context || !state) return;
  if (state.active) void context.act('/shutdown');
  else if (select.value) {
    remember(select.value);
    void context.act('/boot', { udid: select.value });
  }
});
home.addEventListener('click', () => void context?.act('/button', { name: 'home' }));
lock.addEventListener('click', () => void context?.act('/button', { name: 'lock' }));
rotate.addEventListener('click', () => void context?.act('/rotate'));
appearance.addEventListener('click', () => void context?.act('/appearance'));

const label = (node: HTMLElement, text: string) => {
  node.title = text;
  node.setAttribute('aria-label', text);
};

const setStatus = (kind: '' | 'on' | 'busy' | 'error', text: string, title = text) => {
  dot.className = `dot${kind ? ` ${kind}` : ''}`;
  statusText.textContent = text;
  status.title = title;
};

/** Once per load: preselect the stored device when nothing runs. */
const applyStored = (state: SimState) => {
  if (storedApplied) return;
  storedApplied = true;
  if (state.active) return;
  void host.storage
    .get(DEVICE_KEY)
    .then((udid) => {
      if (typeof udid === 'string' && udid !== state.selected && state.devices.some((device) => device.udid === udid)) {
        void context?.act('/select', { udid });
      }
    })
    .catch(() => undefined);
};

const host = startFrame((next) => {
  context = next;
  const { view, t, pending } = next;
  label(select, t.device);
  label(home, t.home);
  label(rotate, t.rotate);
  label(lock, t.lock);

  if (view.kind !== 'ready') {
    for (const control of [select, power, home, rotate, appearance, lock]) control.disabled = true;
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

  if (state.devices.length === 0) setStatus('error', t.noDevices);
  else if (state.busy === 'booting') setStatus('busy', t.booting);
  else if (state.busy === 'shutting-down') setStatus('busy', t.shuttingDown);
  else if (!live) setStatus(state.error ? 'error' : '', t.noDevice, state.error ?? t.noDevice);
  else if (state.error) setStatus('error', state.error);
  else {
    const control = state.controller === 'user' ? `, ${t.controlUser}` : state.controller === 'agent' ? `, ${t.controlAgent}` : '';
    setStatus(state.streaming ? 'on' : '', `${state.streaming ? t.live : t.noStream}${control}`);
  }
});
