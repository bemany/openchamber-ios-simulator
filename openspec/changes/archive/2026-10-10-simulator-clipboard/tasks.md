# Tasks

## 1. Pasteboard behavior

- [x] 1.1 Find when `simctl pbcopy` has no effect: compare two running simulators (time since boot, `launchctl list` pasteboard daemons, pasteboard after a reboot of the throwaway device); write the finding into design.md and the README troubleshooting table (finding: without Simulator.app the bridge almost never confirms a write, fresh devices included; no reliable trigger found)
- [x] 1.2 Add pasteboard read and write with a read-back check (`createPasteboard` in `paste.ts`); verify with a unit test using a stubbed `run` (success, silent failure, empty read)

## 2. Copy out

- [x] 2.1 Answer `GET /surface/clipboard` with the pasteboard text, 404 when empty or unreadable; verified on a simulator: 404 for an empty pasteboard (never an empty text); the text answer is covered by a unit test only, because the bridge stayed empty on this machine

## 3. Paste in

- [x] 3.1 For `text` events with characters the layout cannot type, write the pasteboard, confirm it, then send Cmd+V; otherwise keep typing; verified the paste path with a unit test (confirmed write sends Cmd+V only); on a simulator the write was never confirmed, so the device check covers the fallback (3.2)
- [x] 3.2 Show the number of skipped characters in the toolbar when the fallback ran; verified on a simulator: `Hallo 👋 café` arrives as `Hallo café` (one space, so iOS does not insert ". "), `skippedChars` 1 and the state's `skipped` 1
- [x] 3.3 Check that no clipboard text appears in the service output or cache files after copy and paste (grep the logs); verified with a marker text: not in the service output, the helper log or the frame cache

## 4. Release

- [x] 4.1 Update README (features, limitations, troubleshooting), `bun run check` and `node scripts/smoke.mjs` green, `dist/` committed, issue #5 closed with the commit
