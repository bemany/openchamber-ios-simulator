# Proposal

GitHub issue: #9 (Several simulators side by side on the full-screen page)

## Why

Several simulators often run at once (one per project), but the extension shows and controls one at a time. The rail panel cannot do more: OpenChamber gives an extension one shared surface, which every session and window sees. The full-screen page draws its own pictures through its own routes, so it is the place where several devices can be live and usable side by side.

## What Changes

- The full-screen page shows up to four tiles side by side, each a live simulator with its own picture, frame and rotation. A "+" adds a tile for another device; each tile can be closed.
- Touch, keys and paste go to the tile last clicked (the focused tile, outlined). The page toolbar acts on the focused tile: device picker, power, repair, Home, rotation, appearance, lock.
- A tile whose device is off shows it as off with a Boot button; nothing boots by itself, and picking a device in one tile never shuts down another.
- The service keeps one upstream link (picture stream and HID socket) per device that someone watches, instead of one for the whole service. Page routes and toolbar actions take an optional `udid`; without it they act on the panel's device as now.
- The rail panel and its shared surface stay as they are: one device, the host's control rules.
- The page remembers its tiles (instance storage) so a reload shows the same devices.

## Capabilities

### New Capabilities
- `multi-device-page`: several simulators live and usable side by side on the full-screen page, with a focused tile for input and toolbar actions.

### Modified Capabilities
- `simulator-stream`: streams are kept per watched device instead of one for the service; switching the panel's device no longer stops a device a page tile still shows.

## Impact

- `src/service/simulator.ts`: split the single stream and HID socket into a per-device link (hub, stream, HID, orientation, keyboard layout), kept while that device has a viewer.
- `src/service/main.ts`, `present.ts`: `/page/frame`, `/page/input` and the action routes take `udid`; page pictures are composed per device.
- `src/page/main.ts`: tile grid, one drawing and input path per tile, focused tile, "+" and close; `src/frame/toolbar.ts`: act on a target device given by the page.
- README: page section, speed table row for two and four tiles (measured with `scripts/bench.mjs`).
- CPU: each live tile is its own stream and compose work; the README states the cost. RAM: running several simulators is the user's choice; the page never boots one by itself.
