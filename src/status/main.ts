// Work Status section: which device runs and whether the stream is on.
import type { SimState } from '../shared/state.ts';
import { startFrame } from '../frame/host.ts';
import type { Messages } from '../frame/messages.ts';
import { BASE_CSS, element, installStyle } from '../frame/ui.ts';

installStyle(`${BASE_CSS}
html,body{overflow:hidden}
#root{display:grid;grid-template-columns:auto 1fr;column-gap:8px;row-gap:3px;align-items:center;padding:2px 0 4px}
.row{display:contents}
.row .name{color:var(--oc-muted);white-space:nowrap}
.row .value{display:flex;align-items:center;gap:6px;min-width:0}
.row .value span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`);

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing root');

const row = (name: string, value: string, dot: '' | 'on' | 'busy' | 'error' | null = null) => {
  const node = element('div', 'row');
  const cell = element('div', 'value');
  if (dot !== null) cell.append(element('span', `dot${dot ? ` ${dot}` : ''}`));
  const text = element('span', '', value);
  text.title = value;
  cell.append(text);
  node.append(element('span', 'name', name), cell);
  return node;
};

/** "iPhone 17 is off" for a chosen device that does not run, else "no simulator booted". */
const offText = (state: SimState, t: Messages): string => {
  const chosen = state.devices.find((device) => device.udid === state.selected);
  return chosen ? t.deviceOff(chosen.name) : t.noDevice;
};

const host = startFrame(({ view, t }) => {
  if (view.kind === 'loading') {
    root.replaceChildren(row(t.device, t.loading));
    return;
  }
  if (view.kind === 'blocked') {
    const text = view.reason === 'not-granted' ? t.notGranted : view.reason === 'disabled' ? t.disabled : t.failed;
    root.replaceChildren(row(t.device, text, 'error'));
    return;
  }
  const { state } = view;
  if (state.devices.length === 0) {
    root.replaceChildren(row(t.device, t.noDevices, 'error'));
    return;
  }
  const device = state.busy === 'booting'
    ? row(t.device, t.booting, 'busy')
    : state.busy === 'shutting-down'
      ? row(t.device, t.shuttingDown, 'busy')
      : state.busy === 'repairing'
        ? row(t.device, t.repairing, 'busy')
      : state.active
        ? row(t.device, `${state.active.name} (${state.active.runtime})`, 'on')
        : row(t.device, offText(state, t), '');
  const stream = row(t.stream, state.streaming ? t.streamOn : t.streamOff, state.streaming ? 'on' : '');
  root.replaceChildren(device, stream);
});

// The Work Status panel sizes this frame to its content.
let reported = -1;
new ResizeObserver(() => {
  const height = Math.ceil(root.getBoundingClientRect().height);
  if (height === reported) return;
  reported = height;
  void host.setHeight(height).catch(() => undefined);
}).observe(root);
