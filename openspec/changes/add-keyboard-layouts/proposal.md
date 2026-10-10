# Proposal

Issue: https://github.com/bemany/openchamber-ios-simulator/issues/6

## Why

Typed and pasted text reaches the simulator as USB HID key presses, so the characters depend on the simulator's hardware keyboard layout. Only German (Apple ISO) and US are built in; every other layout is typed as US, so for example a French simulator gets `q` for `a`. The extension is public now and should work for users outside Germany and the US.

## What Changes

- Add Apple hardware keyboard layouts: French (AZERTY), UK (ISO), Spanish (ISO), Swiss German (QWERTZ, ISO) and Italian (ISO). Each table is checked key by key on a simulator before it ships.
- Recognize them from the simulator's `AppleKeyboards` setting (`fr_FR@sw=AZERTY-French`, `en_GB`, `es_ES`, `de_CH`, `it_IT`), and keep US as the fallback for anything unknown.
- Show the detected layout in the toolbar tooltip of the status, so a wrong fallback is visible.
- Check the US table against an ISO keyboard (usages 0x35 and 0x64 are swapped on Apple ISO keyboards, as found for German).

## Capabilities

### New Capabilities
- `keyboard-input`: how typed and pasted characters from the viewer reach the simulator for its hardware keyboard layout.

### Modified Capabilities

## Impact

- `src/service/keymap.ts` (tables and detection), `src/shared/state.ts` (`KeyboardLayout`), `src/frame/toolbar.ts` (tooltip), tests in `test/keymap.test.ts`.
- Verification needs simulators set to each layout: a throwaway simulator created for the test, never an existing one, and only with the owner's go.
