# Proposal

GitHub issue: #10 (Suggest local serve-sim servers for the open address, show when it is not running)

## Why

The "Open in serve-sim" address is typed by hand, although the service runs on the very machine where serve-sim runs and could name the address. And nothing tells the user that the server behind a stored address has stopped (after a reboot, say): the button then opens a page that does not load.

## What Changes

- While the address row is open, the service lists serve-sim preview servers it finds on its own machine, and the row shows them as suggestions (address and the device it shows). A click fills the field; storing stays a deliberate click on Save.
- Servers are found without starting anything: serve-sim's state files, and a short probe of the preview ports 3200 to 3209 on the machine's own interface addresses. Each candidate counts only when serve-sim's helper health route answers; the device it shows is read from the start of its preview page. The extension's own loopback helpers are not suggested.
- The open button shows whether the stored address answers: no mark while it does, a red dot and the tooltip "serve-sim is not running at <address>" while it does not. The check runs while a toolbar is visible, at most every 15 seconds.
- Only the service probes; it reads nothing but the health answer, and it only probes the stored address and its own machine's addresses.

## Capabilities

### New Capabilities
- `serve-sim-address`: finding local serve-sim preview servers for the open address, and showing whether the stored address answers.

### Modified Capabilities

## Impact

- `src/service/serve-sim-servers.ts` (new): discovery (state files, interface addresses, port probe) and the address check, pure parts tested.
- `src/service/main.ts`: `GET /serve-sim/servers`, `GET /serve-sim/check?url=`.
- `src/frame/direct-editor.ts`, `src/frame/toolbar.ts`, `src/frame/messages.ts`: suggestions in the row, the indicator on the open button, English and German text.
- README: the open button section and a troubleshooting row. No addresses go into the repo; suggestions exist only at runtime.
- No new exec permissions: discovery uses files, `os.networkInterfaces()` and HTTP.
