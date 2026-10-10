# Proposal

Issue: https://github.com/bemany/openchamber-ios-simulator/issues/5

## Why

Copying out of the simulator is not offered (`GET /surface/clipboard` answers 404), and pasting types the text key by key, so characters without a key in the layout (emoji, many accents) are lost. OpenChamber's surface already sends a copy chord followed by a clipboard read, and sends pasted text as one event, so a working pasteboard bridge makes both directions behave like a local app.

Finding on 2026-10-10: `xcrun simctl pbcopy` / `pbpaste` round-trip on one running iOS 27.0 simulator, while on another running simulator `pbcopy` silently has no effect. Earlier the same day `pbpaste` returned nothing on a freshly booted device. The cause is unknown and decides how reliable the bridge can be.

## What Changes

- Copy out: after the copy chord, the service reads the simulator's pasteboard with `simctl pbpaste` and answers `GET /surface/clipboard` with the text, so OpenChamber puts it on the user's clipboard. When the pasteboard cannot be read, the service keeps answering 404 (never an empty text that would clear the user's clipboard).
- Paste in: for pasted text with characters the layout cannot type, the service writes the text to the simulator's pasteboard and sends Cmd+V; plain text keeps being typed key by key. If the write cannot be confirmed by reading it back, it falls back to typing and reports the skipped characters.
- The toolbar shows a short note when characters had to be skipped.

## Capabilities

### New Capabilities
- `simulator-clipboard`: copy from the simulator to the viewer's clipboard, and paste any text into the simulator.

### Modified Capabilities

## Impact

- `src/service/simctl.ts` (pasteboard read and write), `src/service/main.ts` (`GET /surface/clipboard`, paste path in `/surface/input` and `/page/input`), `src/frame/toolbar.ts` (note), `src/frame/messages.ts`.
- `xcrun` is already in the service's exec list; no new permission.
- Privacy: pasteboard text is only passed between the simulator and the user's own clipboard on request; it is never logged or stored.
