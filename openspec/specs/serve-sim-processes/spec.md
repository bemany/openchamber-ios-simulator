# serve-sim-processes Specification

## Purpose
Shows which serve-sim processes are attached to a simulator and warns when more than one is, because several at once can disturb its input.

## Requirements

### Requirement: Find the serve-sim processes of a device
The service SHALL find the running serve-sim stream processes from the process list and SHALL attribute each to the device named on its command line, with its address (`--host`, default 127.0.0.1) and port (`--port` or `-p`, default 3200). Processes running a serve-sim subcommand or `--list`/`--kill` SHALL NOT count. A process without a device on its command line SHALL count for every booted device. The service SHALL read the process list at most every 5 seconds.

#### Scenario: Helper and a terminal preview on one device
- **WHEN** the extension's helper (`serve-sim <udid> --port 3101 --host 127.0.0.1 ...`) and a preview server (`serve-sim <udid> --host <tailnet address>`) run for the same device
- **THEN** the state for that device lists both, the helper marked as the extension's own, the preview with its address and port 3200

#### Scenario: A repair call
- **WHEN** `serve-sim repair-input -d <udid>` is running
- **THEN** it is not listed

### Requirement: Warn about several serve-sim on one device
When more than one serve-sim process is attached to the device the toolbar shows, the toolbar status SHALL show a warning with the number, and its tooltip SHALL list each process (address, port, the extension's own or not) and say that this can disturb touch input and that Repair input or stopping the extra one helps. The Work Status section SHALL show the same warning. Nothing SHALL be stopped automatically.

#### Scenario: A second serve-sim appears
- **WHEN** a second serve-sim starts for the device the panel shows
- **THEN** within 5 seconds of the next state poll the status reads "2 serve-sim on this device" with a warning dot

#### Scenario: Only the extension's helper
- **WHEN** only the extension's helper runs for the device
- **THEN** no warning shows
