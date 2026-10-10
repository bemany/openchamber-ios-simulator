# Tasks

## 1. Detection

- [x] 1.1 Extend `KeyboardLayout` and `layoutFromKeyboards` for `fr`, `gb`, `es`, `ch`, `it` (by language and region, e.g. `de_CH` is Swiss, `en_GB` is UK; explicit `hw=` names; the device locale when `AppleKeyboards` is missing); verify with unit tests over real `AppleKeyboards` outputs
- [x] 1.2 Name the layout used in the status tooltip (panel and page); verify in the preview with the German simulator ("Keyboard: German")

## 2. Tables

- [x] 2.1 Generate all tables from macOS's layouts (`scripts/macos-layouts.swift`, `scripts/build-layouts.ts`, Apple ISO keyboard type, dead keys with space and letters); verify the German result against the table read from a simulator with `scripts/discover-layout.ts` (217 of 217 identical)
- [x] 2.2 Type dead-key sequences (`sequenceForChar`, `typeText`); verify with unit tests (French `azerty@é`, German `^` and `é`, every layout types printable ASCII)
- [x] 2.3 The US table now comes from the ISO keyboard type like German (0x35/0x64 as on Apple ISO keyboards); verify with the unit test for US positions

## 3. Check on simulators

- [x] 3.1 On a throwaway simulator (German), type `é ñ ^ ô @ ß Zürich` through `typeText` and read it back from the text field (exact match); switching the simulator to other hardware layouts did not take effect (hw=, locale, Ctrl/Cmd+Space), so per-layout typing tests are not possible here; delete the simulator afterwards
- [x] 3.2 Record in the README which layouts exist, how they were made, and that only German was checked on a simulator

## 4. Release

- [x] 4.1 `bun run check` and `node scripts/smoke.mjs` green, `dist/` committed, issue #6 closed with the commit
