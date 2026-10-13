import { connectHost, HostRequestError, type HostClient, type HostReadyContext } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

import type { SimState } from '../shared/state.ts';
import { messagesFor, type Messages } from './messages.ts';
import { renderTooltipPopover } from './tooltip.ts';

export type ViewState =
  | { kind: 'loading' }
  | { kind: 'blocked'; reason: 'not-granted' | 'disabled' | 'failed'; detail?: string }
  | { kind: 'ready'; state: SimState };

export type FrameContext = {
  view: ViewState;
  t: Messages;
  /** POST to the service; a state in the answer replaces the shown one. */
  act: (path: string, body?: object) => Promise<void>;
  /** Path of the action in flight, for the spinner state. */
  pending: string | null;
};

const POLL_MS = 2_500;
const POLL_BUSY_MS = 1_000;

const blockedReason = (cause: unknown): ViewState => {
  if (cause instanceof HostRequestError) {
    if (cause.code === 'NO_SERVICE') return { kind: 'blocked', reason: 'not-granted' };
    if (cause.code === 'DISABLED') return { kind: 'blocked', reason: 'disabled' };
  }
  return { kind: 'blocked', reason: 'failed', detail: cause instanceof Error ? cause.message : String(cause) };
};

const parseState = (body: string): SimState | null => {
  try {
    const value = JSON.parse(body) as SimState;
    return Array.isArray(value.devices) ? value : null;
  } catch {
    return null;
  }
};

const errorText = (body: string): string => {
  try {
    return (JSON.parse(body) as { error?: string }).error ?? body;
  } catch {
    return body;
  }
};

export type FrameOptions = {
  onReady?: (context: HostReadyContext) => void;
  /**
   * The device the toolbar shows and acts on, when it is not the panel's (the
   * page's focused tile): `/state` asks for it, actions carry it and never
   * move the panel to it.
   */
  target?: () => string | null;
  /** Hands out a function that polls `/state` at once (after the target changed). */
  bindRefresh?: (refresh: () => void) => void;
};

/** Wiring shared by the frames: theme and locale from the host, `/state` polling while visible, redraw on change. */
export const startFrame = (render: (context: FrameContext) => void, options: FrameOptions = {}): HostClient => {
  const host = connectHost();
  let view: ViewState = { kind: 'loading' };
  let t = messagesFor(navigator.language || 'en');
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** This frame was opened by the host as a tooltip popover: it shows only the card. */
  let popover = false;

  const draw = () => {
    if (!popover) render({ view, t, act, pending });
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    if (popover || document.visibilityState !== 'visible') return;
    const busy = view.kind === 'ready' && view.state.busy !== null;
    timer = setTimeout(poll, busy || pending ? POLL_BUSY_MS : POLL_MS);
  };

  /** The device the toolbar is about now (the page's focused tile), `null` for the panel's. */
  const targetNow = () => options.target?.() ?? null;

  /** Only the newest poll's answer is drawn. */
  let pollSeq = 0;

  async function poll() {
    const mine = ++pollSeq;
    const asked = targetNow();
    let next: ViewState;
    try {
      const result = await host.serviceRequest({ method: 'GET', path: '/state', ...(asked ? { query: { udid: asked } } : {}) });
      const state = result.status === 200 ? parseState(result.body) : null;
      next = state ? { kind: 'ready', state } : { kind: 'blocked', reason: 'failed', detail: errorText(result.body).slice(0, 200) };
    } catch (cause) {
      next = blockedReason(cause);
    }
    // A newer poll is on its way, or the focus moved meanwhile: this answer is outdated.
    if (mine !== pollSeq) return;
    if (asked !== targetNow()) return void poll();
    view = next;
    draw();
    schedule();
  }

  async function act(path: string, body: object = {}) {
    if (pending) return;
    pending = path;
    draw();
    schedule();
    try {
      const udid = targetNow();
      const sent = udid ? { udid, ...body, select: false } : body;
      const result = await host.serviceRequest({ method: 'POST', path, body: JSON.stringify(sent) });
      const state = parseState(result.body);
      if (state && udid === targetNow()) view = { kind: 'ready', state };
      if (result.status >= 400) {
        void host.toast({ kind: 'error', message: errorText(result.body).slice(0, 300) }).catch(() => undefined);
      }
    } catch (cause) {
      view = blockedReason(cause);
    } finally {
      pending = null;
    }
    // (A blocked view stays until the poll below: it is about the service, not a device.)
    await poll();
  }

  host.onReady((context) => {
    applyHostReady(context, document.documentElement);
    if (popover || renderTooltipPopover(context, host)) {
      popover = true;
      if (timer) clearTimeout(timer);
      return;
    }
    t = messagesFor(context.locale);
    document.documentElement.lang = context.locale;
    options.onReady?.(context);
    draw();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void poll();
  });
  window.addEventListener('pagehide', () => {
    if (timer) clearTimeout(timer);
    host.dispose();
  });

  options.bindRefresh?.(() => void poll());
  draw();
  void poll();
  return host;
};
