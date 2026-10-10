# Tasks

## 1. Detection

- [ ] 1.1 Extend `KeyboardLayout` and `layoutFromKeyboards` for `fr`, `gb`, `es`, `ch`, `it` (by language and region, e.g. `de_CH` is Swiss, `en_GB` is UK); verify with unit tests over real `AppleKeyboards` outputs
- [ ] 1.2 Name the layout used in the status tooltip (panel and page); verify in the preview with the German simulator ("Keyboard: German")

## 2. Tables

- [ ] 2.1 Write the French AZERTY table (letters, digit row with and without Shift, Option characters `@ # [ ] { } | \`); verify with unit tests for the remapped keys
- [ ] 2.2 Write UK, Spanish, Swiss German and Italian tables the same way; verify with unit tests per layout
- [ ] 2.3 Check the US table on an ISO keyboard (0x35/0x64) and fix it if needed; verify on a simulator set to `en_US`

## 3. Check on simulators

- [ ] 3.1 With the owner's go, create a throwaway simulator, set its `AppleKeyboards` per layout, type each table's full character set into a text field and compare against a screenshot; delete the simulator afterwards
- [ ] 3.2 Record per layout which characters were verified in the README limitations section

## 4. Release

- [ ] 4.1 `bun run check` and `node scripts/smoke.mjs` green, `dist/` committed, issue #6 closed with the commit
