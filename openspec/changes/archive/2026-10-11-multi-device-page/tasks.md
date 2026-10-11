# Tasks

## 1. Service: one link per device

- [x] 1.1 Record the panel baseline: `scripts/switch.mjs`, `scripts/gap.mjs`, `scripts/bench.mjs` (framed:balanced) results in this file. Baseline (v0.6.0): switch between two running devices 0.3 s, slowest 0.4 s; bench framed:balanced on a throwaway device with Safari turning: 14.8 fps from serve-sim, 14.1 delivered, 56 KB per frame (serve-sim's own rate is the limit here). `gap.mjs` was not run: it kills or shuts down devices that other sessions use
- [x] 1.2 Extract `createDeviceLink(udid)` (hub, stream with reconnect, HID socket, orientation, keyboard layout, viewer time) from `createSimulator`; the panel uses the link of its shown device; verify unit tests and `scripts/smoke.mjs` green, baseline numbers unchanged within noise (after: switch slowest 0.3 s, bench 15.9 fps from serve-sim, 15.5 delivered)
- [x] 1.3 Keep a map of links, open on first frame request, close after the grace period without viewers; verify with a unit test on fake links (panel switch keeps a link a tile still watches, last viewer leaving closes it)
- [x] 1.4 Accept `udid` on `/page/frame`, `/page/input`, `/button`, `/rotate`, `/appearance`, `/repair-input`, `/shutdown`, `/boot` (default: panel's device, unknown: 404); blob ids per device; verify with service tests and a run against two booted simulators (frames from both at once: 32 and 32 pictures in 10 s with the panel streaming a third device, first picture after 0.3 s; unknown udid 404)

## 2. Page: tiles

- [x] 2.1 Turn the page's drawing and input into a tile component, one per device, in a grid (1, 2 side by side, 2 by 2); verify in the preview with one tile that nothing changed visually
- [x] 2.2 "+" adds a tile (first running device not shown, else the first device), close removes one (not the last); tiles stored in instance storage `pageTiles`, restored on reload; verify in the preview
- [x] 2.3 Focus: pointer down focuses a tile (outline), keys and paste go to the focused tile; verify in the preview by typing into two different simulators
- [x] 2.4 Toolbar target: the page toolbar shows and acts on the focused tile (picker, power, repair, Home, rotation, appearance, lock); the panel is unchanged; verify Home on one tile leaves the other untouched, and the panel's device stays put while tiles change

## 3. Check and measure

- [x] 3.1 With two booted simulators (owner's go for booting a second one if none runs), page with two tiles: both live, taps and typing reach the right device, a device that is off shows Boot and does not boot by itself (two throwaway iPhones in the preview: "left" typed into tile A's search field arrived only on A, "right" only on B, Home with A focused moved only A, two tiles restored after reloading the page, an iPad that was off showed "is off" with Boot and stayed off, closing a tile worked, the panel stayed on its device throughout)
- [x] 3.2 Add a multi-tile mode to `scripts/bench.mjs` and measure fps and CPU for one, two and four tiles; README speed table and page section. Measured under load from other sessions (load 18 to 24 on 18 cores): 1 tile 10.4, 2 tiles 8.4/8.1, 4 tiles 6.0/6.1 turning and 2.7 idle pictures per second; a second, busier run gave 6.6, 2.5/2.5, 2.5 to 2.7 with service CPU 50, 47, 86 %. The page path without a tile device compared with v0.6.0 in alternating runs: 8.5, 8.5, 8.8 against 9.4, 9.2, 8.7 pictures per second (within noise, slightly lower)

## 4. Release

- [x] 4.1 `bun run check`, `node scripts/smoke.mjs`, commit with `dist/`, release after the owner's go, close #9 when the change is archived
