// Names for the toolbar's icon buttons. Each button carries a native `title`
// (OpenChamber shows it after the usual hover delay); while a button is hovered
// or focused, its name also shows at once in the status area. No host popover:
// together with the native tooltip it showed twice.

export type TooltipOptions = {
  /** The buttons to name, read when attaching (after the toolbar is complete). */
  buttons: () => HTMLElement[];
  /** Show this text in place of the status, `null` to restore it. */
  showInStatus: (text: string | null) => void;
};

const labelOf = (button: HTMLElement): string => button.getAttribute('aria-label') ?? button.title ?? '';

export const attachTooltips = ({ buttons, showInStatus }: TooltipOptions) => {
  for (const button of buttons()) {
    const show = () => showInStatus(labelOf(button));
    const hide = () => showInStatus(null);
    button.addEventListener('pointerenter', show);
    button.addEventListener('focus', show);
    button.addEventListener('pointerleave', hide);
    button.addEventListener('blur', hide);
  }
};
