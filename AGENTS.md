# Agent notes

- OpenChamber extension (manifest under `openchamber` in `package.json`). Read `node_modules/@openchamber/sdk/GUEST_SERVICES.md` (shared surface, services) before changing the service contract.
- `src/service/`: Node service the host spawns (ESM bundle, loopback only). `src/panel/`: toolbar docked to the surface. `src/status/`: Work Status section. `src/frame/`: wiring shared by both frames. Frames are sandboxed iframes: classic IIFE bundles, no ESM.
- Always `bun run check` (typecheck, tests, build) and commit `dist/` with the sources; the host never builds.
- serve-sim is only ever bound to `127.0.0.1`. Never start or reuse a serve-sim preview server on another interface: it exposes a token-gated shell route.
- Several simulators may run at once: picking a running device switches the stream, booting does not shut others down, power shuts down only the device shown.
- Never boot a simulator unasked: picking a device that is off shows it as off (`shownDevice` in `simctl.ts`); only the toolbar's Boot button calls `POST /boot`.
- Picture size (`Quality`: full/balanced/fast = divisor 1/2/3, default balanced) applies everywhere: `shrunkSize` is the one rounding rule, `loadChrome(type, divisor)` renders the frame at that size, the page draws and sends input at it. `present.ts` runs 2 to 4 workers (newest frame wins); shrunk pictures are encoded with MozJPEG, full size with jpeg-js.
- Measure before claiming speed: `node scripts/bench.mjs` (turns the device shown; `BENCH_UDID` picks another running one, `BENCH_MODES` e.g. `framed:balanced`). Keep the README's speed table in step.
- "Open in serve-sim" only opens an address the user stored (instance storage `serveSimUrl`, `normalizeDirectUrl`) via `host.openUrl`. Do not try to embed serve-sim: OpenChamber's guest CSP forbids foreign frames and connections. Never put such an address in the repo.
- `src/page/`: full-screen page (`contributes.page`). The host cuts `serviceRequest` answers at 256 000 characters: anything larger goes through the blob store (`BlobRef`, `GET /blob`, `BLOB_CHUNK`).
- Device frame: read from the local Xcode at runtime (`src/service/chrome.ts`), never ship Apple's frame assets. Pixel work lives in `compose.ts`/`png.ts` (pure, tested) and runs in `compose-worker.ts`.
- Bundled third-party code (jpeg-js, @jsquash/jpeg with MozJPEG): keep `THIRD_PARTY_NOTICES.md` in step when versions change.
- Real-device checks: `node scripts/smoke.mjs` (needs a booted simulator), `bun run preview` for the toolbar, the surface, the page (`<prefix>/page`), storage and `openUrl` without OpenChamber. Sandboxed frames have no `allow-forms`: use buttons and key handlers, never a `<form>` submit.
- No em dashes in text.
