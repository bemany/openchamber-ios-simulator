# Proposal

Issue: https://github.com/bemany/openchamber-ios-simulator/issues/6

## Why

Typed and pasted text reaches the simulator as USB HID key presses, so the characters depend on the simulator's hardware keyboard layout. Only German (Apple ISO) and US are built in; every other layout is typed as US, so for example a French simulator gets `q` for `a`. The extension is public now and should work for users outside Germany and the US.

## What Changes

- Add Apple hardware keyboard layouts: French (AZERTY), UK (ISO), Spanish (ISO), Swiss German (QWERTZ, ISO) and Italian (ISO). The tables are generated from macOS's own layouts (the same Apple layouts iOS uses for hardware keyboards) and replace the hand-written German and US tables.
- Type dead keys: an accent alone (`^`, `´`, `` ` ``, `~`, `¨`) as the dead key plus space, composed letters (`é`, `ñ`, `ô`) as the dead key plus the letter.
- Recognize the layout from the simulator's `AppleKeyboards` setting (`fr_FR@sw=AZERTY-French`, `en_GB`, `es_ES`, `de_CH`, `it_IT`, or an explicit `hw=` name), from the device locale when the setting is missing (fresh simulators have none), and keep US as the fallback for anything unknown.
- Show the detected layout in the toolbar tooltip of the status, so a wrong fallback is visible.
- Check the US table against an ISO keyboard (usages 0x35 and 0x64 are swapped on Apple ISO keyboards, as found for German).

## Capabilities

### New Capabilities
- `keyboard-input`: how typed and pasted characters from the viewer reach the simulator for its hardware keyboard layout.

### Modified Capabilities

## Impact

- `src/service/keymap.ts` (tables and detection), `src/shared/state.ts` (`KeyboardLayout`), `src/frame/toolbar.ts` (tooltip), tests in `test/keymap.test.ts`.
- Verification: the German table generated from macOS matches the table read key by key from a simulator (217 of 217 characters, dead keys included). Switching a simulator's hardware layout programmatically did not work, so the other layouts rely on the generator being proven on German.
