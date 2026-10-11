# Proposal

GitHub issue: #11 (Start a serve-sim preview server from the address row)

## Why

"Open in serve-sim" needs a serve-sim preview server reachable from the user's browser. When none runs (after a reboot, say), the user has to open a terminal on the OpenChamber machine and start one by hand. The address row already finds running servers and shows when the stored one is down; it should also be able to start one.

## What Changes

- The address row gets a "Start serve-sim" part: an address picker (the machine's own IPv4 addresses with their interface names: loopback, LAN, tailnet), the device (the one the panel shows, or the page's focused tile), and a Start button.
- Starting takes two clicks: the first shows the warning that serve-sim's page carries a shell route, so anyone who can reach that address can run commands on this machine; the second starts it.
- The service starts `serve-sim <udid> --host <address> --port <port> --exit-on-simulator-shutdown` detached, on the first free port from 3200 to 3209, waits until it answers, and answers its address. The row stores that address as the open address.
- A Stop button ends a preview server the extension started (and only those); the servers it started survive a service restart and are remembered in a small file in the temp directory.
- **BREAKING (project rule):** "serve-sim is only ever bound to 127.0.0.1" becomes: the extension's own helpers stay on 127.0.0.1; a preview server on another address is started only on the user's explicit, confirmed request, never by itself, and never reused as a helper. AGENTS.md, README (features, security boundary) and `openspec/config.yaml` say so.

## Capabilities

### New Capabilities

### Modified Capabilities
- `serve-sim-address`: adds starting and stopping a preview server from the address row, with a confirmation, on an address of the user's choice.

## Impact

- `src/service/serve-sim-servers.ts`: own addresses with interface names, port pick, start and stop, the record of started servers.
- `src/service/main.ts`: `GET /serve-sim/addresses`, `POST /serve-sim/start`, `POST /serve-sim/stop`.
- `src/frame/direct-editor.ts`, `src/frame/messages.ts`: the start part, the confirmation, Stop.
- AGENTS.md, README, `openspec/config.yaml`: the changed rule.
- Exec permissions unchanged (`serve-sim` is already granted).
- Risk: a second serve-sim attached to a device the extension also streams; seen once together with broken touch. Checked on a throwaway simulator before release; the repair button is the fallback.
