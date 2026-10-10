// Tooltips for the toolbar's icon buttons. Inside OpenChamber's sandboxed
// frames a plain `title` does not show, and the docked toolbar is only 44 px
// tall, so a tooltip drawn in the frame would be cut off. Hosts that offer
// popovers draw a small card next to the button outside the frame; on others
// the button's name shows in the status area while hovered or focused.
import type { HostClient, HostReadyContext, JsonValue } from '@openchamber/sdk';
import { mountPopoverAnchor } from '@openchamber/sdk/ui';

import { installStyle } from './ui.ts';

/** Popover size limits are 160..640 x 48..480 CSS px; the card shrinks itself after loading. */
const WIDTH = 160;
const HEIGHT = 48;

export type TooltipOptions = {
  host: () => HostClient;
  /** The buttons to explain, read when attaching (after the toolbar is complete). */
  buttons: () => HTMLElement[];
  /** Fallback without popovers: show this text in place of the status, `null` to restore it. */
  showInStatus: (text: string | null) => void;
};

const labelOf = (button: HTMLElement): string => button.getAttribute('aria-label') ?? button.title ?? '';

/** Wires tooltips once the host said whether it can show popovers. */
export const attachTooltips = ({ host, buttons, showInStatus }: TooltipOptions) => {
  let attached = false;
  host().onReady((context) => {
    if (attached || context.surface === 'popover') return;
    attached = true;
    if (context.features?.popovers) {
      for (const button of buttons()) {
        mountPopoverAnchor(button, {
          host: host(),
          getData: (): JsonValue => ({ tooltip: labelOf(button) }),
          width: WIDTH,
          height: HEIGHT,
          side: 'bottom',
          label: labelOf(button),
        });
      }
      return;
    }
    for (const button of buttons()) {
      const show = () => showInStatus(labelOf(button));
      const hide = () => showInStatus(null);
      button.addEventListener('pointerenter', show);
      button.addEventListener('focus', show);
      button.addEventListener('pointerleave', hide);
      button.addEventListener('blur', hide);
    }
  });
};

/**
 * In a frame the host opened as a tooltip popover: draws only the card and
 * fits the popover to it. Returns `true` when this frame is such a popover.
 */
export const renderTooltipPopover = (context: HostReadyContext, host: HostClient): boolean => {
  if (context.surface !== 'popover') return false;
  const data = context.popover?.data as { tooltip?: unknown } | undefined;
  const text = typeof data?.tooltip === 'string' ? data.tooltip : '';
  installStyle(`
html,body{margin:0;height:auto;overflow:hidden;background:var(--oc-elevated,var(--oc-bg))}
.tooltip{padding:6px 10px;font:12px/1.35 var(--oc-font);color:var(--oc-fg);white-space:normal}
`);
  const card = document.createElement('div');
  card.className = 'tooltip';
  card.textContent = text;
  document.body.replaceChildren(card);
  requestAnimationFrame(() => void host.setHeight(Math.ceil(card.getBoundingClientRect().height)).catch(() => undefined));
  return true;
};
