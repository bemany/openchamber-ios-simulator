// Tooltips for the toolbar's icon buttons. A native `title` shows only now and
// then inside OpenChamber's sandboxed frames, and the docked toolbar is only
// 44 px tall, so a tooltip drawn in the frame would be cut off. Hosts that
// offer popovers draw a small card under the button outside the frame; on
// others the button's name shows in the status area while hovered or focused.
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
  /** More elements that get the popover only (the status, whose own text is the fallback). */
  extras?: () => HTMLElement[];
  /** Fallback without popovers: show this text in place of the status, `null` to restore it. */
  showInStatus: (text: string | null) => void;
};

/** A button's accessible name; for other elements (the status) their current title, which changes with the state. */
const labelOf = (element: HTMLElement): string =>
  element.tagName === 'BUTTON' ? (element.getAttribute('aria-label') ?? element.title ?? '') : element.title;

/** Wires tooltips once the host said whether it can show popovers. */
export const attachTooltips = ({ host, buttons, extras, showInStatus }: TooltipOptions) => {
  let attached = false;
  host().onReady((context) => {
    if (attached || context.surface === 'popover') return;
    attached = true;
    if (context.features?.popovers) {
      for (const element of [...buttons(), ...(extras?.() ?? [])]) {
        mountPopoverAnchor(element, {
          host: host(),
          getData: (): JsonValue => ({ tooltip: labelOf(element) }),
          width: WIDTH,
          height: HEIGHT,
          side: 'bottom',
          // Buttons keep their own accessible name up to date; the status must not get a fixed one.
          ...(element.tagName === 'BUTTON' ? { label: labelOf(element) } : {}),
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
  // The host keeps the popover at least 48 px tall: center the name in it like a tooltip.
  installStyle(`
html,body{margin:0;height:100%;overflow:hidden;background:var(--oc-elevated,var(--oc-bg))}
.tooltip{box-sizing:border-box;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px 10px;font:12px/1.3 var(--oc-font);color:var(--oc-fg)}
`);
  const card = document.createElement('div');
  card.className = 'tooltip';
  card.textContent = text;
  document.body.replaceChildren(card);
  void host;
  return true;
};
