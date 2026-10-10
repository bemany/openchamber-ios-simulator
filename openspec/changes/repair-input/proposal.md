# Proposal

GitHub issue: #8 (Repair input button (SpringBoard reload) when touch stops working)

## Why

Touch input to a simulator can stop working while hardware buttons, appearance and rotation (which go through `simctl`) keep working. It was seen after a second serve-sim process attached to the same device. The fix was manual: `serve-sim repair-input -d <udid>` in a terminal, then stopping and restarting the device's helper. The viewer in OpenChamber has no way to do that.

## What Changes

- A "Repair input" icon button in the toolbar (panel and page) for the device shown, enabled while it is live.
- The first click arms the button (the label and the status say that the running apps will close); a second click within a few seconds runs the repair. There is no modal dialog, because the frames have no `allow-modals`.
- The service runs `serve-sim repair-input -d <udid>` (which restarts SpringBoard and closes the running apps), then stops the device's loopback helpers and starts one fresh helper, as serve-sim asks after a repair. The stream and input come back without a reload of the panel.
- The status shows "Repairing input" while it runs and an error if serve-sim fails.

## Capabilities

### New Capabilities
- `input-repair`: repairing a simulator's touch and key input from the toolbar, with a confirmation step and a fresh helper afterwards.

### Modified Capabilities

## Impact

- `src/service/helper.ts`: stop the loopback helpers of one device (the ones this service started and the ones serve-sim recorded for it on 127.0.0.1), then start a fresh one.
- `src/service/simulator.ts`, `src/service/main.ts`: `POST /repair-input` for the device shown, busy state while it runs.
- `src/frame/toolbar.ts`, `src/frame/messages.ts`, icons: the button, the two-step confirmation, English and German text.
- README: feature line, troubleshooting row ("Touch does nothing, buttons work").
- No new dependencies. serve-sim servers on other interfaces are never stopped or started.
