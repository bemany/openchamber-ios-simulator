# Tasks

## 1. Service

- [ ] 1.1 Own addresses with interface names (`GET /serve-sim/addresses`), tailnet and LAN first; verify with a unit test on fake interfaces
- [ ] 1.2 Start: validate address and booted device, pick the port, spawn detached, wait for health, record pid/url/udid; verify with unit tests on fake deps (foreign address 400, busy ports skipped, timeout ends the process)
- [ ] 1.3 Stop and the record: prune dead pids, Stop only a recorded url that still answers, `started: true` in the server list; verify with unit tests
- [ ] 1.4 Verify on a throwaway simulator: start on the tailnet address, the page answers there, taps through the extension's own helper still reach the device, Stop ends it; nothing else stopped

## 2. Address row

- [ ] 2.1 Start part: address picker, device named, two-click Start with the warning, stored address afterwards; Stop for started servers; English and German; verify in the preview (one click expires, two clicks start, Stop)

## 3. Rule, docs, release

- [ ] 3.1 AGENTS.md, README (features, security boundary, German section), `openspec/config.yaml`: the changed rule
- [ ] 3.2 `bun run check`, `node scripts/smoke.mjs`, privacy grep, commit with `dist/`, release after the owner's go, close #11 when the change is archived
