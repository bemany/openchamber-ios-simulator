# Tasks

## 1. Service

- [x] 1.1 Add `serve-sim-servers.ts`: candidates from state files (without the extension's helpers) and interface addresses with ports 3200 to 3209, probe with the helper health route for booted devices; verify with unit tests on fake files, interfaces and probes (order, own helpers left out, duplicates merged)
- [x] 1.2 Add `GET /serve-sim/servers` and `GET /serve-sim/check?url=` (normalized url, `{ running }`, `null` without a booted device); verify against a preview server started on the machine's own address for the test and stopped afterwards (on 127.0.0.1:3205 for a throwaway simulator, so no second serve-sim attached to a device in use: found with the right device in 2.0 s, 3.3 s right after a cold start; check running, then not running after stopping it)

## 2. Toolbar

- [x] 2.1 Show suggestions under the address field when the row opens (address, device name, "this machine only" for loopback), a click fills the field, the empty state names that nothing was found; verify in the preview with and without a preview server
- [x] 2.2 Show the red dot and tooltip on the open button while the stored address does not answer, checked on change and every 15 s while visible; verify in the preview by stopping and starting the test preview server

## 3. Docs and release

- [x] 3.1 README: open button section (suggestions, port range, indicator), troubleshooting row "red dot on the open button"; German section
- [x] 3.2 `bun run check`, `node scripts/smoke.mjs`, privacy grep, commit with `dist/`, release after the owner's go, close #10 when the change is archived
