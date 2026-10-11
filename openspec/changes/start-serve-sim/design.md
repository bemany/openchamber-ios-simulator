# Design

## Context

- The address row (`direct-editor.ts`) lists servers found by `findServers` and stores the address in instance storage; the toolbar checks it every 15 seconds.
- serve-sim's preview server (`serve-sim <udid> --host <addr> --port <p>`) serves its page, which carries a token for a shell route, plus `/helper/<udid>/...` for booted devices. It writes `$TMPDIR/serve-sim/server-<udid>.json`, overwriting the entry of the extension's loopback helper for the same device; the helper logic only trusts loopback entries and its own started helpers, so it is not misled.
- The owner decided to allow starting a preview server on any of the machine's own addresses from the extension, after a confirmation.
- Earlier, touch on one device stopped working while three serve-sim processes were attached to it; the cause was not proven.

## Goals / Non-Goals

**Goals:**
- One confirmed action from the address row to a working, stored preview address.
- Stop for what the extension started, and nothing else.

**Non-Goals:**
- Starting automatically (on a red dot, at boot, after a restart).
- Addresses other than the machine's own interfaces, or ports outside 3200 to 3209.
- Using a preview server as the extension's helper.

## Decisions

- **Addresses.** `GET /serve-sim/addresses` answers `[{ address, interface }]` from `os.networkInterfaces()` (IPv4, loopback included), tailnet (100.64.0.0/10) and LAN first. The start request must name one of them; anything else is 400.
- **Start.** `POST /serve-sim/start { address, udid }`: the device must be booted; the port is the first in 3200 to 3209 on which nothing answers at that address; spawn detached with `--exit-on-simulator-shutdown`, output to the service's serve-sim log; poll the health route for up to 30 s; answer `{ url }`. On timeout, end the process and answer the error.
- **Record.** `$TMPDIR/openchamber-ios-simulator-previews.json`: `[{ pid, url, udid }]`, pruned of dead pids on read. `GET /serve-sim/servers` marks entries the extension started (`started: true`), so the row can offer Stop.
- **Stop.** `POST /serve-sim/stop { url }` ends the recorded pid for that url (SIGTERM) and removes it from the record; a url not in the record is 404.
- **Confirmation.** The same two-click pattern as the repair button: Start arms for 4 s and the row's hint turns into the warning; a second click starts.
- **Rule.** AGENTS.md, README and `openspec/config.yaml` change from "only 127.0.0.1" to "own helpers only on 127.0.0.1; preview servers only on explicit, confirmed request, never reused".

## Risks / Trade-offs

- [The shell route becomes reachable for everyone on that network] → the confirmation names it every time, the README security section explains it, and nothing starts without the second click. The picker lists tailnet, LAN, then loopback, because the tailnet is the address the owner uses.
- [A second serve-sim on the same device might disturb touch] → check on a throwaway simulator that taps through the extension still arrive with a preview server attached; the repair button remains the fallback.
- [A stale pid in the record could belong to another process later] → Stop only ends a recorded pid while its url still answers serve-sim's health route.
