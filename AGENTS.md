# Agent notes

- OpenChamber extension (manifest under `openchamber` in `package.json`). Read `node_modules/@openchamber/sdk/GUEST_SERVICES.md` (shared surface, services) before changing the service contract.
- `src/service/`: Node service the host spawns (ESM bundle, loopback only). `src/panel/`: toolbar docked to the surface. `src/status/`: Work Status section. `src/frame/`: wiring shared by both frames. Frames are sandboxed iframes: classic IIFE bundles, no ESM.
- Always `bun run check` (typecheck, tests, build) and commit `dist/` with the sources; the host never builds.
- serve-sim is only ever bound to `127.0.0.1`. Never start or reuse a serve-sim preview server on another interface: it exposes a token-gated shell route.
- One simulator at a time: booting shuts the others down.
- Real-device checks: `node scripts/smoke.mjs` (needs a booted simulator), `bun run preview` for the toolbar and the surface without OpenChamber.
- No em dashes in text.
