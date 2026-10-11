# Tasks

## 1. Service: one link per device

- [ ] 1.1 Record the panel baseline: `scripts/switch.mjs`, `scripts/gap.mjs`, `scripts/bench.mjs` (framed:balanced) results in this file
- [ ] 1.2 Extract `createDeviceLink(udid)` (hub, stream with reconnect, HID socket, orientation, keyboard layout, viewer time) from `createSimulator`; the panel uses the link of its shown device; verify unit tests and `scripts/smoke.mjs` green, baseline numbers unchanged within noise
- [ ] 1.3 Keep a map of links, open on first frame request, close after the grace period without viewers; verify with a unit test on fake links (panel switch keeps a link a tile still watches, last viewer leaving closes it)
- [ ] 1.4 Accept `udid` on `/page/frame`, `/page/input`, `/button`, `/rotate`, `/appearance`, `/repair-input`, `/shutdown`, `/boot` (default: panel's device, unknown: 404); blob ids per device; verify with service tests and a run against two booted simulators (frames from both at once)

## 2. Page: tiles

- [ ] 2.1 Turn the page's drawing and input into a tile component, one per device, in a grid (1, 2 side by side, 2 by 2); verify in the preview with one tile that nothing changed visually
- [ ] 2.2 "+" adds a tile (first running device not shown, else the first device), close removes one (not the last); tiles stored in instance storage `pageTiles`, restored on reload; verify in the preview
- [ ] 2.3 Focus: pointer down focuses a tile (outline), keys and paste go to the focused tile; verify in the preview by typing into two different simulators
- [ ] 2.4 Toolbar target: the page toolbar shows and acts on the focused tile (picker, power, repair, Home, rotation, appearance, lock); the panel is unchanged; verify Home on one tile leaves the other untouched, and the panel's device stays put while tiles change

## 3. Check and measure

- [ ] 3.1 With two booted simulators (owner's go for booting a second one if none runs), page with two tiles: both live, taps and typing reach the right device, a device that is off shows Boot and does not boot by itself
- [ ] 3.2 Add a multi-tile mode to `scripts/bench.mjs` and measure fps and CPU for one, two and four tiles; README speed table and page section

## 4. Release

- [ ] 4.1 `bun run check`, `node scripts/smoke.mjs`, commit with `dist/`, release after the owner's go, close #9 when the change is archived
