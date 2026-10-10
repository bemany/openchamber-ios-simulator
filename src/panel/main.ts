// Toolbar docked above the simulator picture. The picture, clicks and
// keyboard belong to the host's surface; the toolbar tells the service the
// panel's colour so the device frame sits on it.
import { startFrame } from '../frame/host.ts';
import { createToolbar } from '../frame/toolbar.ts';
import { installStyle } from '../frame/ui.ts';

installStyle('html,body{height:100%;overflow:hidden}#bar{height:100%}');

const bar = document.querySelector<HTMLElement>('#bar');
if (!bar) throw new Error('Missing #bar');

const render = createToolbar(bar, () => host);

const host = startFrame(render, {
  onReady: (context) => {
    const background = context.theme.tokens.background;
    void host.serviceRequest({ method: 'POST', path: '/frame-style', body: JSON.stringify({ background }) }).catch(() => undefined);
  },
});
