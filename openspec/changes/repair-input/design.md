# Design

## Context

- Each device streams and takes input through its own serve-sim helper on 127.0.0.1 (`createHelpers` in `helper.ts`). The service remembers the helpers it started (`started`, port to device) and also finds helpers through serve-sim's state files (`helpersFromStateFiles`, loopback only). A state file holds one server per device, so a second serve-sim for the same device overwrites it.
- Observed failure: with a second serve-sim attached to the same device, taps stopped arriving while `simctl` actions kept working. `serve-sim repair-input -d <udid>` printed "Input repaired. Restart serve-sim to reconnect its guest services, then reopen your app." After stopping the old helpers, the service started a fresh one by itself on the next frame, and touch worked again.
- `repair-input` restarts SpringBoard and closes the running apps. The frames are sandboxed without `allow-modals`, so `confirm()` is not available.

## Goals / Non-Goals

**Goals:**
- One action that repeats the manual fix for the device shown.
- A confirmation that cannot be triggered by one stray click.
- Exactly one loopback helper for the device afterwards.

**Non-Goals:**
- Detecting broken input automatically, or repairing without the user asking.
- Stopping or restarting serve-sim servers on other interfaces, or serve-sim processes whose port the service cannot attribute to the device.
- Reopening the app that was in front before the repair.

## Decisions

- **Two-click confirmation in the toolbar.** The first click sets the button to an armed state (warning colour, label "Click again: closes the running apps") for 4 seconds; a second click sends `POST /repair-input`. Alternatives: a host popover with buttons (more code, popover sizing in two frames), or no confirmation (closing apps unasked is not acceptable).
- **Service sequence.** For the shown udid: mark busy (`pending: '/repair-input'`), run `serve-sim repair-input -d <udid>` with the same binary lookup as `launchServeSim`, then `helpers.restart(udid)`: send SIGTERM to every helper of that device the service started, and to the pids of loopback state-file entries for that device, wait until their ports stop answering (at most 3 s), then `ensure` a fresh one. The stream's existing reconnect (300 ms after a drop) picks up the new port.
- **Which processes are stopped.** Only pids the service can tie to the device on 127.0.0.1: its own children and loopback state-file entries. No process-list scan by command line, because that could hit serve-sim processes started by the user with their own options.
- **Button placement.** In the device group next to power, with a wrench icon from the existing icon set style; disabled unless the device shown is live and nothing is pending.

## Risks / Trade-offs

- [The running apps close] → the two-click confirmation names it; the README says so.
- [A second helper the service cannot see (another tool's serve-sim on 127.0.0.1 without a state file) stays attached and may keep breaking input] → documented in the README troubleshooting row; out of scope here.
- [repair-input changes in a later serve-sim version] → the command's exit code decides success; its output goes to the service log only.
