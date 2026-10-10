# Tasks

## 1. Helper per device

- [ ] 1.1 Read the owning device from serve-sim's state files and prefer that helper in `ensureHelper`; verify with a unit test over sample state files (own device first, other device only as fallback)
- [ ] 1.2 Make helper starts per device (one pending start per udid) and verify two devices can start helpers in parallel in a unit test with a stubbed spawn
- [ ] 1.3 Replace the single `helperPort` in `simulator.ts` with a per-device map and drop the entry when the stream or HID socket closes; verify `bun run typecheck` and existing tests stay green

## 2. Recovery

- [ ] 2.1 Reconnect about 1 s after the stream closes while a viewer is present; verify with the preview: kill the helper process and see "Live" again within 2 s
- [ ] 2.2 Drop remembered helpers after boot and shutdown; verify by switching devices in the preview that no request goes to a helper that is exiting

## 3. Verification

- [ ] 3.1 With two running simulators, view one and shut down the other: the picture keeps updating (no "No stream"); record the result in the issue
- [ ] 3.2 Switch between two running devices five times and confirm "Live" within 5 s each time
- [ ] 3.3 `bun run check` and `node scripts/smoke.mjs` green, `dist/` committed, issue #2 closed with the commit
