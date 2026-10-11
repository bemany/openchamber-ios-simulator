# Design

## Context

- The address is kept in instance storage (`serveSimUrl`) by the frames; the service never sees it unless a frame sends it. `normalizeDirectUrl` cleans what the user types.
- serve-sim writes `$TMPDIR/serve-sim/server-<udid>.json` (`pid`, `port`, `device`, `url`) per device. A second server for the same device overwrites the file, so a preview server can be missing there once the extension's helper for that device restarts.
- A preview server started without `--port` listens on 3200 (serve-sim's preview default) on the `--host` interface. Every serve-sim server answers `/helper/<udid>/health` with `{ status: "ok" }` for a booted device.
- The service's exec permissions are `xcrun`, `serve-sim`, `sips`; adding `ps` or `lsof` would change the grant the user approved.

## Goals / Non-Goals

**Goals:**
- Suggest the preview server the user most likely wants without typing.
- Make a dead stored address visible before the click.

**Non-Goals:**
- Starting a preview server from the extension (it would bind to another interface, which the extension never does).
- Scanning other machines or port ranges beyond 3200 to 3209.
- Storing a suggestion automatically.

## Decisions

- **Discovery sources.** Union of (a) state-file entries whose `url` is not one of the extension's own helpers (loopback, ports 3100 to 3109) and (b) `http://<address>:<port>` for every IPv4 address from `os.networkInterfaces()` (loopback included) and ports 3200 to 3209. Each candidate is probed with `/helper/<udid>/health` for all booted devices at once (3 s timeout: a freshly started serve-sim took up to about 2 s for its first answer; refused ports fail at once). Every serve-sim answers health for any booted device, so the device a preview shows comes from its page: `window.__SIM_PREVIEW__ = {..."device": "<udid>"...}`, about 140 KB into a page that takes 1.7 to 3.5 s to arrive (8 s timeout). The page is read only up to that field; the shell-route token right after it is never kept, logged or passed on. Measured: a scan takes 2 to 3.3 s. Alternative: read the process list (needs a new exec permission; rejected).
- **Order.** Non-loopback addresses first (they work from other machines too), then loopback ones with the note "this machine only".
- **Routes.** `GET /serve-sim/servers` answers `[{ url, device, loopback }]`. `GET /serve-sim/check?url=` normalizes the url with `normalizeDirectUrl`, probes its health route for the booted devices and answers `{ running }`; with no booted device it answers `{ running: null }` (unknown, no mark).
- **Indicator.** The toolbar keeps `directState: 'running' | 'stopped' | 'unknown'`, checks when the stored address changes and then every 15 seconds while the frame is visible (`document.visibilityState`). The red dot is a small CSS mark on the open button; the tooltip text goes through the existing popover tooltip.
- **Suggestions UI.** Small buttons under the input (no `<form>`, no datalist, which sandboxed frames render poorly); fetched when the row opens.

## Risks / Trade-offs

- [A preview server on a port outside 3200 to 3209 with no state file is not found] → the user can still type it; the README names the range.
- [Probing the stored address lets a frame make the service fetch a URL] → only GET to `/helper/<udid>/health`, http(s) only, 3 s timeout, the answer is reduced to a boolean.
- [Reading a preview page passes serve-sim's shell-route token through the service's memory] → only the device field is parsed, the read stops right after it, nothing of the page is stored or returned.
- [Probing every 15 s costs a request] → only while a toolbar is visible and an address is stored.
