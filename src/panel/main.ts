// Toolbar docked above the simulator picture. The picture, clicks and
// keyboard belong to the host's surface; the toolbar tells the service the
// panel's colour so the device frame sits on it. The serve-sim address row
// opens under the toolbar, and the dock grows to show it.
import { createDirectEditor } from '../frame/direct-editor.ts';
import { startFrame } from '../frame/host.ts';
import { createToolbar } from '../frame/toolbar.ts';
import { installStyle } from '../frame/ui.ts';

/** The dock's height without the address row (manifest `panel.size`). */
const BAR_HEIGHT = 44;

installStyle(`html,body{height:100%;overflow:hidden}#bar{height:${BAR_HEIGHT}px}`);

const bar = document.querySelector<HTMLElement>('#bar');
if (!bar) throw new Error('Missing #bar');

/** Grows the dock to the toolbar plus the address row, or back to the toolbar. */
const fit = (visible: boolean) => {
  requestAnimationFrame(() => {
    const height = visible ? Math.ceil(document.body.scrollHeight) : BAR_HEIGHT;
    void host.setHeight(height).catch(() => undefined);
  });
};

const toolbar = createToolbar(bar, () => host, { onEditDirect: () => direct.show(true) });
const direct = createDirectEditor({ bar, host: () => host, toolbar: () => toolbar, onToggle: fit });

const host = startFrame(
  (context) => {
    toolbar(context);
    direct.label(context.t);
  },
  {
    onReady: (context) => {
      const background = context.theme.tokens.background;
      void host.serviceRequest({ method: 'POST', path: '/frame-style', body: JSON.stringify({ background }) }).catch(() => undefined);
    },
  },
);

// The row's text wraps differently when the panel is resized: follow it while it is open.
new ResizeObserver(() => {
  if (direct.visible()) fit(true);
}).observe(document.body);
