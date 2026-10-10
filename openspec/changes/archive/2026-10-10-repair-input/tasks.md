# Tasks

## 1. Service

- [x] 1.1 Add `restart(udid)` to `createHelpers`: stop the device's helpers this service started and its loopback state-file entries, wait until their ports are closed, then start one fresh helper; verify with unit tests over the fake deps (other devices' helpers untouched, non-loopback entries ignored, one helper afterwards)
- [x] 1.2 Add `POST /repair-input` for the device shown: busy state, `serve-sim repair-input -d <udid>`, `restart(udid)`, error in the state on failure; verify with a unit test using a stubbed runner (failure leaves the state usable)

## 2. Toolbar

- [x] 2.1 Add the "Repair input" button with the two-click confirmation (armed for 4 s, label and status name the closing apps) to panel and page, English and German text; verify in the preview: one click arms and expires, two clicks call the route
- [x] 2.2 Disable the button unless the device shown is live and nothing is pending; verify in the preview with a device that is off

## 3. Check on a simulator

- [x] 3.1 On a throwaway simulator with a second loopback serve-sim attached (touch broken), run the repair from the toolbar; verify a tap reaches the device afterwards (accessibility tree), exactly one helper runs for it, and the other running simulators' helpers are unchanged; delete the simulator afterwards (done through the service route: touch was already broken on the fresh device and stayed broken with the second serve-sim; after `POST /repair-input`, 3 s, the tap and typing arrived, one helper ran for the device, the other devices' serve-sim processes were unchanged)

## 4. Docs and release

- [x] 4.1 README: feature line, troubleshooting row "Touch does nothing, buttons work", note that the user's own serve-sim on another interface needs its own restart; German section
- [x] 4.2 `bun run check`, `node scripts/smoke.mjs`, commit with `dist/`, release after the owner's go, close #8 when the change is archived
