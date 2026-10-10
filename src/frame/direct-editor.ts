// The serve-sim address row for "Open in serve-sim", shared by the docked
// panel and the full-screen page: a link button in the toolbar opens it, the
// toolbar's open button opens it too while no address is stored. A plain
// group, not a <form>: the sandbox (no allow-forms) blocks form submission.
import type { HostClient } from '@openchamber/sdk';

import { DIRECT_URL_KEY, normalizeDirectUrl } from '../shared/direct.ts';
import type { FrameContext } from './host.ts';
import { element, icon, installStyle } from './ui.ts';

const EDITOR_CSS = `
.direct{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;border-bottom:1px solid var(--oc-border)}
.direct input{font:inherit;color:var(--oc-fg);background:var(--oc-elevated,transparent);border:1px solid var(--oc-border);border-radius:var(--oc-radius,6px);height:26px;padding:0 8px;flex:1 1 200px;min-width:0}
.direct button{font:inherit;color:var(--oc-fg);background:transparent;border:1px solid var(--oc-border);border-radius:var(--oc-radius,6px);height:26px;padding:0 10px;cursor:pointer}
.direct button.save{background:var(--oc-primary);color:var(--oc-primary-foreground,#fff);border-color:transparent}
.direct .error{color:var(--oc-error-text)}
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
  row.append(label, input, save, clear, close, error, hint);
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
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') store();
    if (event.key === 'Escape') show(false);
  });

  return {
    show,
    visible: () => row.hidden === false,
    label(t: FrameContext['t']) {
      edit.setAttribute('aria-label', t.directEdit);
      label.textContent = t.directLabel;
      input.placeholder = t.directPlaceholder;
      save.textContent = t.directSave;
      clear.textContent = t.directClear;
      close.textContent = t.directClose;
      error.textContent = t.directInvalid;
      hint.textContent = t.directHint;
    },
  };
};
