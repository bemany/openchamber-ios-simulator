# Tasks

## 1. Pasteboard behavior

- [ ] 1.1 Find when `simctl pbcopy` has no effect: compare two running simulators (time since boot, `launchctl list` pasteboard daemons, pasteboard after a reboot of the throwaway device); write the finding into design.md and the README troubleshooting table
- [ ] 1.2 Add `readPasteboard(udid)` and `writePasteboard(udid, text)` with a read-back check to `simctl.ts`; verify with a unit test using a stubbed `run` (success, silent failure, error)

## 2. Copy out

- [ ] 2.1 Answer `GET /surface/clipboard` with the pasteboard text, 404 when empty or unreadable; verify in the preview by selecting a word in a simulator text field, pressing Cmd+C and checking the logged clipboard answer

## 3. Paste in

- [ ] 3.1 For `text` events with characters the layout cannot type, write the pasteboard, confirm it, then send Cmd+V; otherwise keep typing; verify `Hallo 👋 café` arrives unchanged in a text field (screenshot)
- [ ] 3.2 Show the number of skipped characters in the toolbar when the fallback ran; verify on a simulator whose pasteboard write fails (or with the write stubbed to fail)
- [ ] 3.3 Check that no clipboard text appears in the service output or cache files after copy and paste (grep the logs)

## 4. Release

- [ ] 4.1 Update README (features, limitations, troubleshooting), `bun run check` and `node scripts/smoke.mjs` green, `dist/` committed, issue #5 closed with the commit
