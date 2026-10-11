# Tasks

## 1. Service

- [x] 1.1 Own addresses with interface names (`GET /serve-sim/addresses`), tailnet and LAN first; verify with a unit test on fake interfaces
- [x] 1.2 Start: validate address and booted device, pick the port, spawn detached, wait for health, record pid/url/udid; verify with unit tests on fake deps (foreign address 400, busy ports skipped, timeout ends the process)
- [x] 1.3 Stop and the record: prune dead pids, Stop only a recorded url that still answers, `started: true` in the server list; verify with unit tests
- [x] 1.4 Verify on a throwaway simulator: start on the tailnet address, the page answers there, taps through the extension's own helper still reach the device, Stop ends it; nothing else stopped. Done through the service with a throwaway simulator: start on the tailnet address in 0.5 s, its page answered, tap and typing through the extension's helper arrived, a foreign address 400, stopping someone else's server 404, Stop ended it, the other devices' helpers untouched. Found and fixed on the way: the preview overwrote the device's state file, so each new service run started another helper; helpers are now also found in the process list (three service runs with a preview in between: one helper)

## 2. Address row

- [x] 2.1 Start part: address picker, device named, two-click Start with the warning, stored address afterwards; Stop for started servers; English and German; verify in the preview (one click expires, two clicks start, Stop). Done on 127.0.0.1: one click showed the warning and expired, two clicks started and stored http://127.0.0.1:3200, the suggestion offered Stop, after Stop the red dot came

## 3. Rule, docs, release

- [x] 3.1 AGENTS.md, README (features, security boundary, German section), `openspec/config.yaml`: the changed rule
- [x] 3.2 `bun run check`, `node scripts/smoke.mjs`, privacy grep, commit with `dist/`, release after the owner's go, close #11 when the change is archived
