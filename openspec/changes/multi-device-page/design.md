# Design

## Context

- `createSimulator` (`src/service/simulator.ts`) holds one `selected` device, one MJPEG stream (`streamUdid`), one HID socket (`hidUdid`), one orientation and a frame hub. The panel's surface (`/surface/*`) and the page (`/page/frame`, `/page/input`) both read that one hub, and every toolbar action goes to `activeDevice()`.
- Helpers are already per device (`createHelpers`), so several upstream streams at once need no change there.
- `present.ts` composes frames for the surface (framed, shrunk, one `shown` hub) and shrinks raw frames for the page (`forPage`). Measured: one framed half-size stream runs at about 28 fps.
- The host gives one shared surface per service; the page is a sandboxed frame that polls the service through `host.serviceRequest` and reads large answers through the blob store.

## Goals / Non-Goals

**Goals:**
- Up to four devices live and usable at once on the page.
- No change in behaviour or speed for the panel when the page shows one tile.
- One code path per device for stream, HID, orientation and keyboard layout.

**Non-Goals:**
- Several devices in the rail panel (the host allows one surface).
- Several pages with different tiles in different windows beyond what instance storage gives (they share the stored tile list).
- Booting or shutting down devices automatically to fit the tiles.

## Decisions

- **Per-device link.** Extract a `createDeviceLink(udid)` from `createSimulator`: frame hub, stream with the 300 ms reconnect, HID socket, orientation, keyboard layout, `lastViewerAt`. The simulator keeps a `Map<udid, link>`, opens a link on the first frame request for that device and closes it after `VIEWER_GRACE_MS` without one. The panel's "shown device" is one more viewer of its link. Alternative: separate service processes per device (not possible, the host spawns one service).
- **Routes take `udid`.** `/page/frame`, `/page/input`, `/button`, `/rotate`, `/appearance`, `/repair-input`, `/shutdown`, `/boot` accept an optional `udid`; without it they act on the panel's device as today, so the panel and older pages keep working. A `udid` must be a listed device; unknown ones get 404.
- **Page pictures per device.** `forPage` already works on a raw frame; it runs per link. Blob ids carry the udid so tiles never read each other's pictures.
- **Page tiles.** `src/page/main.ts` becomes a tile component (canvas, frame layer, mask, rotation, input mapping) instantiated per tile in a CSS grid (1 tile full, 2 side by side, 3 to 4 as a 2 by 2 grid). Each tile polls its own `/page/frame?udid=`. The focused tile has an outline; pointer down on a tile focuses it.
- **Toolbar target.** `createToolbar` gets an optional `target()` that names the device to show and act on; the page passes the focused tile's udid, the panel passes nothing. The device picker in the page toolbar changes the focused tile's device, not the panel's. "+" and close live in the tile corner, not in the toolbar, so the toolbar keeps its width.
- **Storage.** Instance storage key `pageTiles`: list of udids, at most four. Missing devices (deleted simulators) are dropped on load.
- **Quality.** One picture size setting for all tiles, as now. With three or four tiles the page asks for at most the balanced size; measured before claiming numbers.

## Risks / Trade-offs

- [CPU: every live tile is a decode, shrink and encode path] → measure two and four tiles with `scripts/bench.mjs` (new mode) and state it in the README; compose workers stay shared (2 to 4).
- [RAM: four booted simulators on a small machine] → the page never boots by itself; the README says each running simulator costs memory.
- [Larger refactor of `simulator.ts` touches the panel path] → keep the panel's routes and `SimState` shape; run `scripts/smoke.mjs`, `scripts/switch.mjs` and `scripts/gap.mjs` before and after and compare.
- [Instance storage shared by two open pages] → last writer wins; acceptable.
