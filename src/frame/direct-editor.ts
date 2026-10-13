// The serve-sim address row for "Open in serve-sim", shared by the docked
// panel and the full-screen page: a link button in the toolbar opens it, the
// toolbar's open button opens it too while no address is stored. A plain
// group, not a <form>: the sandbox (no allow-forms) blocks form submission.
import type { HostClient } from '@openchamber/sdk';

import { DIRECT_URL_KEY, normalizeDirectUrl } from '../shared/direct.ts';
import type { OwnAddress, ServeSimServer, SimState } from '../shared/state.ts';
import type { FrameContext } from './host.ts';
import { element, icon, installStyle } from './ui.ts';

const EDITOR_CSS = `
.direct{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;border-bottom:1px solid var(--oc-border)}
.direct input{font:inherit;color:var(--oc-fg);background:var(--oc-elevated,transparent);border:1px solid var(--oc-border);border-radius:var(--oc-radius,6px);height:26px;padding:0 8px;flex:1 1 200px;min-width:0}
.direct button{font:inherit;color:var(--oc-fg);background:transparent;border:1px solid var(--oc-border);border-radius:var(--oc-radius,6px);height:26px;padding:0 10px;cursor:pointer}
.direct button.save{background:var(--oc-primary);color:var(--oc-primary-foreground,#fff);border-color:transparent}
.direct .error{color:var(--oc-error-text)}
.direct .found{flex-basis:100%;display:flex;flex-wrap:wrap;align-items:center;gap:6px;color:var(--oc-muted)}
.direct .found button{height:22px;padding:0 8px;font-size:11px}
.direct .start{flex-basis:100%;display:flex;flex-wrap:wrap;align-items:center;gap:6px;color:var(--oc-muted)}
.direct .start select{font:inherit;color:var(--oc-fg);background:var(--oc-elevated,transparent);border:1px solid var(--oc-border);border-radius:var(--oc-radius,6px);height:24px;max-width:240px}
.direct .start button.armed{background:var(--oc-warning-text);color:var(--oc-bg,#000);border-color:transparent}
.direct p.warn{color:var(--oc-error-text);font-weight:600}
.direct p{flex-basis:100%;margin:2px 0 0;color:var(--oc-warning-text);font-size:11px;line-height:1.45}
`;

type Toolbar = { directUrl: () => string | null; setDirectUrl: (url: string | null) => void };

export type DirectEditorOptions = {
  bar: HTMLElement;
  host: () => HostClient;
  toolbar: () => Toolbar;
  /** Called after the row opened or closed (the docked panel resizes itself). */
  onToggle?: (visible: boolean) => void;
};

/** How long Start waits for its second click. */
const START_ARMED_MS = 4_000;

export const createDirectEditor = ({ bar, host, toolbar, onToggle }: DirectEditorOptions) => {
  installStyle(EDITOR_CSS);
  const row = element('div', 'direct');
  row.setAttribute('role', 'group');
  row.hidden = true;
  const label = element('label');
  const input = element('input');
  input.type = 'text';
  input.inputMode = 'url';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.id = 'direct-url';
  label.htmlFor = input.id;
  const button = (className: string) => {
    const node = element('button', className);
    node.type = 'button';
    return node;
  };
  const save = button('save');
  const clear = button('clear');
  const close = button('close');
  const error = element('span', 'error');
  error.hidden = true;
  const hint = element('p');
  /** serve-sim servers the service found on its machine; a click fills the field. */
  const found = element('div', 'found');
  /** Starting a preview server for the device shown, on an address of this machine (two clicks). */
  const start = element('div', 'start');
  const startLabel = element('span');
  const addressPick = element('select');
  const startDevice = element('span');
  const startButton = button('');
  start.append(startLabel, addressPick, startDevice, startButton);
  row.append(label, input, save, clear, close, error, found, start, hint);
  let t: FrameContext['t'] | null = null;
  let state: SimState | null = null;
  let search = 0;
  let armed: ReturnType<typeof setTimeout> | null = null;
  /** The address and device the warning was shown for: the second click starts exactly that. */
  let armedFor = '';
  let starting = false;

  const disarm = () => {
    if (armed) clearTimeout(armed);
    armed = null;
    armedFor = '';
  };

  /** The start part and the hint, for the device shown now. */
  const drawStart = () => {
    if (!t) return;
    const device = state?.active ?? null;
    startLabel.textContent = t.directStartOn;
    startDevice.textContent = device ? t.directStartFor(device.name) : t.directStartNoDevice;
    startButton.textContent = starting ? t.directStarting : armed ? t.directStartConfirm : t.directStart;
    startButton.classList.toggle('armed', armed !== null);
    startButton.disabled = !device || starting || addressPick.options.length === 0;
    hint.textContent = armed ? t.directStartWarning : t.directHint;
    hint.classList.toggle('warn', armed !== null);
  };

  const listAddresses = async () => {
    let addresses: OwnAddress[] = [];
    try {
      const result = await host().serviceRequest({ method: 'GET', path: '/serve-sim/addresses' });
      if (result.status === 200) addresses = (JSON.parse(result.body) as { addresses: OwnAddress[] }).addresses;
    } catch {
      // the service is restarting
    }
    const keep = addressPick.value;
    addressPick.replaceChildren(
      ...addresses.map((entry) => {
        const option = element('option', '', `${entry.address} (${entry.interface})`);
        option.value = entry.address;
        return option;
      }),
    );
    if (addresses.some((entry) => entry.address === keep)) addressPick.value = keep;
    drawStart();
  };

  const stopServer = async (url: string) => {
    try {
      await host().serviceRequest({ method: 'POST', path: '/serve-sim/stop', body: JSON.stringify({ url }) });
    } catch {
      // the service is restarting
    }
    void listServers();
  };

  const listServers = async () => {
    const mine = ++search;
    found.replaceChildren(element('span', '', t?.directSearching ?? ''));
    let servers: ServeSimServer[] = [];
    try {
      const result = await host().serviceRequest({ method: 'GET', path: '/serve-sim/servers' });
      if (result.status === 200) servers = (JSON.parse(result.body) as { servers: ServeSimServer[] }).servers;
    } catch {
      // the service is restarting: nothing to suggest
    }
    if (mine !== search || !t) return;
    if (servers.length === 0) {
      found.replaceChildren(element('span', '', t.directNoneFound));
    } else {
      const words = t;
      found.replaceChildren(
        element('span', '', words.directFound),
        ...servers.flatMap((server) => {
          const pick = button('');
          const device = server.name ? `, ${server.name}` : '';
          pick.textContent = `${server.url}${device}${server.loopback ? ` (${words.directLocalOnly})` : ''}`;
          pick.addEventListener('click', () => {
            input.value = server.url;
            input.focus();
          });
          if (!server.started) return [pick];
          // Only servers this extension started can be stopped from here.
          const stop = button('');
          stop.textContent = words.directStop;
          stop.addEventListener('click', () => void stopServer(server.url));
          return [pick, stop];
        }),
      );
    }
    onToggle?.(true);
  };
  bar.after(row);

  const edit = button('ib');
  edit.append(icon('link'));
  bar.insertBefore(edit, bar.querySelector('.grow'));

  const show = (visible: boolean) => {
    row.hidden = !visible;
    error.hidden = true;
    if (visible) {
      input.value = toolbar().directUrl() ?? '';
      input.focus();
      void listServers();
      void listAddresses();
    } else {
      search += 1;
      disarm();
    }
    onToggle?.(visible);
  };
  const store = () => {
    const url = normalizeDirectUrl(input.value);
    if (!url) {
      error.hidden = false;
      onToggle?.(true);
      return;
    }
    void host().storage.set(DIRECT_URL_KEY, url).catch(() => undefined);
    toolbar().setDirectUrl(url);
    show(false);
  };

  edit.addEventListener('click', () => show(row.hidden !== false));
  save.addEventListener('click', store);
  clear.addEventListener('click', () => {
    void host().storage.delete(DIRECT_URL_KEY).catch(() => undefined);
    toolbar().setDirectUrl(null);
    show(false);
  });
  close.addEventListener('click', () => show(false));
  addressPick.addEventListener('change', () => {
    disarm();
    drawStart();
  });
  startButton.addEventListener('click', () => {
    const device = state?.active;
    if (!device || starting) return;
    const choice = `${addressPick.value}|${device.udid}`;
    if (armed && armedFor !== choice) disarm();
    if (!armed) {
      armedFor = choice;
      // First click: name the risk; only a second click within 4 s starts.
      armed = setTimeout(() => {
        armed = null;
        drawStart();
        onToggle?.(true);
      }, START_ARMED_MS);
      drawStart();
      onToggle?.(true);
      return;
    }
    disarm();
    starting = true;
    error.hidden = true;
    drawStart();
    void (async () => {
      try {
        const result = await host().serviceRequest({ method: 'POST', path: '/serve-sim/start', body: JSON.stringify({ address: addressPick.value, udid: device.udid }) });
        const answer = JSON.parse(result.body) as { url?: string; error?: string };
        if (result.status === 200 && answer.url) {
          input.value = answer.url;
          starting = false;
          store();
          return;
        }
        error.textContent = answer.error ?? `${result.status}`;
        error.hidden = false;
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : String(cause);
        error.hidden = false;
      }
      starting = false;
      drawStart();
      onToggle?.(true);
    })();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') store();
    if (event.key === 'Escape') show(false);
  });

  return {
    show,
    visible: () => row.hidden === false,
    /** Texts, and the state whose device a start is for. */
    label(words: FrameContext['t'], next: SimState | null = null) {
      t = words;
      // Another device now (the page's focus moved): the warning was for the old one.
      if (armed && next?.active?.udid !== state?.active?.udid) disarm();
      state = next;
      drawStart();
      edit.setAttribute('aria-label', words.directEdit);
      label.textContent = words.directLabel;
      input.placeholder = words.directPlaceholder;
      save.textContent = words.directSave;
      clear.textContent = words.directClear;
      close.textContent = words.directClose;
      error.textContent = words.directInvalid;
      if (!armed) hint.textContent = words.directHint;
    },
  };
};
