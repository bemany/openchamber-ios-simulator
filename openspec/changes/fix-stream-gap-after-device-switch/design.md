# Design

## Context

`ensureHelper(udid, preferred)` probes the remembered port, ports from serve-sim's state files (`$TMPDIR/serve-sim/server-<udid>.json`, loopback only) and 3100 to 3109, and takes the first server that answers `/helper/<udid>/health` for the device. Any serve-sim server answers for any booted device, so the helper of another device is accepted. Helpers the service starts run `serve-sim <udid> --port … --host 127.0.0.1 --exit-on-simulator-shutdown` and exit with their device. The watcher in `simulator.ts` reconnects only on its 2 s device poll after `streamUdid` is cleared.

## Goals / Non-Goals

**Goals:**
- One helper per streamed device; the stream never depends on another simulator's lifetime.
- Recovery measured in seconds, testable on real simulators.

**Non-Goals:**
- Changing serve-sim, or binding anything to an interface other than 127.0.0.1.
- Stopping helpers of devices that stay running (they exit with their simulator).

## Decisions

- **Owner by state file.** A helper's device is the `device` field of its state file (written by serve-sim for the helper it runs). Prefer the port whose state file names the device; accept a helper of another device only while the device's own helper starts. Alternative considered: `--no-exit` helpers shared by all devices; rejected because they would outlive their simulators and serve-sim offers no clean shared mode.
- **Remember the helper per device** (`Map<udid, port>`) instead of one `helperPort`, and drop a device's entry when its stream or HID socket closes.
- **Immediate reconnect.** On a stream close while a viewer is present, schedule a reconnect after 1 s instead of waiting for the next poll; keep the poll as the safety net.
- **Spawn per device.** `startHelper` already serializes starts; make it per device so two devices can start helpers in parallel without sharing one promise.

## Risks / Trade-offs

- [More serve-sim processes, one per viewed device] → They exit with their simulator; only viewed devices get one.
- [State files can be stale or rewritten by other serve-sim runs] → Still probe `/health` before use; a stale entry falls back to starting a helper.
- [A helper of another device in use during startup] → Switch to the device's own helper as soon as it answers; verify with the switch scenario.
