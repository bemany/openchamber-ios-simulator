# Proposal

Issue: https://github.com/bemany/openchamber-ios-simulator/issues/2

## Why

After switching devices, or whenever another simulator shuts down, the picture can stop for a few seconds ("No stream") before it reconnects by itself. The service streams every device through whichever serve-sim helper it finds on loopback, but each helper is started with `--exit-on-simulator-shutdown` for one device and exits when that device shuts down, taking the streams of other devices with it. Observed on 2026-10-10: the iPhone 18 Pro was streamed through the helper that belonged to a different simulator.

## What Changes

- The service streams a device only through a loopback helper that belongs to that device (its target device), and starts one for the device when none exists.
- A helper reused from serve-sim's state files is matched by its recorded device; a helper of another device is used only as a fallback while the device's own helper starts.
- After a boot, a shutdown or a device switch the service drops its remembered helper port, so it never reconnects to a helper that is exiting.
- When the stream drops anyway, the service reconnects within about 2 seconds instead of waiting for the next device poll.

## Capabilities

### New Capabilities
- `simulator-stream`: how the picture of the device shown reaches the viewer, and how it survives device switches and other simulators shutting down.

### Modified Capabilities

## Impact

- `src/service/helper.ts` (helper discovery and start, per device), `src/service/simulator.ts` (stream and HID connection, reconnect after a drop).
- No change to the service routes, the manifest or the permissions. serve-sim stays bound to 127.0.0.1 only.
- One more serve-sim process per running device that is viewed (each exits with its simulator).
