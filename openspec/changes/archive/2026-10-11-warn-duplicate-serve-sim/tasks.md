# Tasks

## 1. Service

- [x] 1.1 `parseServeSimProcesses` with own-helper detection; verify with unit tests on real command lines (helper, terminal preview with and without `--host`/`-p`, bare `serve-sim`, `repair-input -d`, `--list`, other node processes)
- [x] 1.2 Read `ps` (exec permission and binary list), cache 5 s, `serveSims` in the state for the panel's device and for `?udid=`; verify with a unit test of the attribution (bare serve-sim counts for every booted device, off devices get none)

## 2. UI

- [x] 2.1 Toolbar status warning with count and tooltip list, Work Status row, English and German; verify in the preview with a second serve-sim attached to a throwaway simulator shown in a page tile (warning appears, disappears after stopping it). Done in the preview's panel with a throwaway simulator: only the helper gave "Live"; with a second serve-sim on 127.0.0.1:3150 the status read "2 serve-sim an diesem Gerät", the tooltip listed "127.0.0.1:3102 (diese Extension), 127.0.0.1:3150" and the hint, the Work Status section had the row; after stopping it, "Live" again

## 3. Docs and release

- [x] 3.1 README: features, troubleshooting row "N serve-sim on this device", permissions (`ps`)
- [x] 3.2 `bun run check`, `node scripts/smoke.mjs`, privacy grep, commit with `dist/`, release after the owner's go (the new permission needs approval after the update), close #12 when the change is archived
