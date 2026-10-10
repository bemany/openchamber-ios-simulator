# Design

## Context

- The surface protocol: the host sends Cmd+C as key events, then calls `GET /surface/clipboard` and puts `{ text }` on the user's clipboard. Paste never sends the paste chord; it sends a `text` event with the pasted text. The page (`/page/input`) follows the same events.
- Today the service types every `text` event through the keyboard table and answers the clipboard read with 404.
- `xcrun simctl pbcopy <udid>` / `pbpaste <udid>` worked on one running simulator and silently failed on another on the same machine (see proposal). Each simulator runs its own `com.apple.pasteboard.pasted` and `dtpasteboardd`.

## Goals / Non-Goals

**Goals:**
- Both directions work on every simulator where the pasteboard daemons respond; a silent failure is detected, never trusted.

**Non-Goals:**
- Images or rich text; only plain text.
- Syncing the clipboard continuously (no `simctl pbsync -p` process left running).

## Decisions

- **Confirm every write by reading it back.** `pbcopy` can succeed without effect, so a paste through the pasteboard is used only when `pbpaste` returns the written text; otherwise fall back to typing. Alternative considered: always typing plus a Unicode input method; rejected, iOS has no hardware-keyboard Unicode entry.
- **Paste chord after a confirmed write:** Cmd down, V, V up, Cmd up over the HID socket, with the same key gap as typing. Text that the layout can type completely keeps being typed, which avoids touching the pasteboard at all.
- **Copy out is a read only.** After the host's copy chord reached the simulator, wait about 150 ms, then `pbpaste`; empty or failing reads answer 404.
- **First task is the open question**, because it decides how often the fallback runs: find why `pbcopy` has no effect on some simulators (fresh boot timing, pasteboard daemon state, the simulator being shown in Simulator.app or not) and document the condition.

## Risks / Trade-offs

- [Reading the pasteboard after Cmd+C may return the previous content if the app copies late] → Wait briefly and accept it; the user can copy again.
- [Writing the pasteboard replaces what an app in the simulator had there] → Only on paste, which the user triggered.
- [Unknown cause of silent failures] → Read-back check plus fallback keep behavior correct either way.
