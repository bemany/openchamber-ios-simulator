# Design

## Context

- serve-sim runs as `node /opt/homebrew/bin/serve-sim <args>`; the extension's helpers are `serve-sim <udid> --port 31xx --host 127.0.0.1 --exit-on-simulator-shutdown`. A preview started by hand is often `serve-sim <udid> --host <addr>` (port 3200 by default) or `serve-sim` alone (all booted devices).
- `serve-sim --list` reads its own records and missed two processes attached to one test device; state files keep one entry per device. Only the process list is complete.
- The service may run `xcrun`, `serve-sim`, `sips`; the owner approved adding `ps`.

## Goals / Non-Goals

**Goals:**
- A visible warning, wherever the device is shown, when more than one serve-sim is attached to it.
- The facts to act on: address, port, whose process.

**Non-Goals:**
- Stopping processes (the repair button and #11's Stop cover what the extension may end).
- Telling which of several processes holds the input.

## Decisions

- **Parsing.** `parseServeSimProcesses(psOutput)`: lines whose command runs a `serve-sim` binary (`/serve-sim` path segment or `serve-sim` as argv[0] or argv[1] after `node`); the arguments after it are scanned: flags with values (`--port`/`-p`, `--host`, `--codec`, `--panes`, `--theme`, `-d`) consume the next token; the first token that is not a flag is a subcommand when it is a known one (`gesture`, `repair-input`, `fold`, and any other non-UUID word) and the line is dropped; UUID tokens are devices; `--list`/`-l`/`--kill`/`-k` drop the line. Pure function, tested with real command lines.
- **Own helper.** A process is the extension's own when it is bound to 127.0.0.1 on a port from 3100 to 3109 with `--exit-on-simulator-shutdown` (the extension's exact command shape).
- **Reading.** `ps -axo pid=,command=` through the existing `run` with `ps` added to the exec permission and the binary list (`/bin/ps`), cached for 5 seconds; errors give an empty list (no warning rather than a false one).
- **State.** `serveSims: Array<{ pid, host, port, own }>` for the state's device; empty when the device is off.
- **UI.** The toolbar status uses the busy dot and `t.serveSimsWarning(n)`; the tooltip (popover) lists `host:port (extension)` lines and the hint. The status section adds a row. Status priority: errors and busy states first, then this warning, then skipped characters, then Live.

## Risks / Trade-offs

- [Command lines can contain secrets of other tools] → only lines that run serve-sim are parsed, and only pid, host and port leave the service.
- [A new permission needs the user's approval after the update] → the README names it; until approved the service does not start, as for any permission change.
- [Port defaults differ between serve-sim versions] → `--port` is used when given; the default 3200 is serve-sim's documented preview default.
