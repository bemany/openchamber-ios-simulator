# Proposal

GitHub issue: #12 (Warn when several serve-sim processes are attached to one simulator)

## Why

Several serve-sim processes can attach to the same simulator: the extension's own helper, a preview server started in a terminal or by another tool, or one left by a test. Touch input once stopped working on a device while three were attached (the cause was not proven), and nothing told the user. `serve-sim --list` is no help: in a test it showed neither of two processes attached to one device.

## What Changes

- The service reads the running serve-sim processes from the process list (`ps -axo pid=,command=`) and works out, from each command line, the device, the address (`--host`, default 127.0.0.1) and the port (`--port`/`-p`, default 3200). Subcommands (`repair-input`, `gesture`, ...) and `--list`/`--kill` calls are not streams and are left out.
- `SimState` gets `serveSims`: the serve-sim processes attached to the device the state is about (panel's device, or a page tile's with `/state?udid=`), each with pid, address, port and whether it is the extension's own helper.
- With more than one, the toolbar status warns ("2 serve-sim on this device", warning dot), and its tooltip lists them with the hint that this can disturb touch input and that Repair input or stopping the extra one helps. The Work Status section shows the same warning. A serve-sim without a device on its command line (it streams every booted one) counts for every booted device.
- Read only: nothing is stopped by this change.
- New exec permission `ps`; OpenChamber asks the user once to approve it after the update.

## Capabilities

### New Capabilities
- `serve-sim-processes`: finding the serve-sim processes attached to a simulator and warning when there is more than one.

### Modified Capabilities

## Impact

- `src/service/serve-sim-processes.ts` (new): parse the process list, pure and tested; read it at most every 5 seconds.
- `src/shared/state.ts`, `src/service/simulator.ts`: `serveSims` in the state.
- `src/frame/toolbar.ts`, `src/status/main.ts`, `src/frame/messages.ts`: the warning, English and German.
- `package.json`: `ps` in `openchamber.contributes.service.permissions.exec`.
- README: features, troubleshooting row, the permission list.
