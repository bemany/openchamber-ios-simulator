# input-repair Specification

## Purpose
Lets the viewer repair a simulator's touch and key input from the toolbar when it has stopped working, without a terminal.

## Requirements

### Requirement: Repair input from the toolbar
The toolbar SHALL offer a "Repair input" action for the device shown while it is live. The action SHALL run only after a second click within 4 seconds of the first; the first click SHALL state that the running apps on the device will close. The service SHALL then run `serve-sim repair-input` for that device, stop that device's serve-sim helpers bound to 127.0.0.1, and start one fresh helper.

#### Scenario: Touch works again after a repair
- **WHEN** taps on a live device have no effect, and the viewer clicks "Repair input" twice
- **THEN** the device's SpringBoard restarts, exactly one loopback helper runs for the device, the stream continues, and a tap reaches the device

#### Scenario: A single click does nothing
- **WHEN** the viewer clicks "Repair input" once and not again within 4 seconds
- **THEN** no command runs and the button returns to its normal state

#### Scenario: Other devices are untouched
- **WHEN** a repair runs while another simulator is booted
- **THEN** the other simulator's helper and apps keep running

### Requirement: Only loopback helpers are stopped
A repair SHALL NOT stop, restart or start any serve-sim server bound to an interface other than 127.0.0.1, and SHALL NOT boot or shut down any simulator.

#### Scenario: A serve-sim server on another interface exists
- **WHEN** the user runs their own serve-sim for the device on another interface and a repair runs
- **THEN** that server keeps running (the README says it needs a restart of its own to take input again)

### Requirement: Repair failures are visible
The toolbar SHALL show that a repair is running and SHALL show an error when `serve-sim repair-input` fails or the fresh helper does not start.

#### Scenario: serve-sim is missing
- **WHEN** the repair runs and serve-sim cannot be started
- **THEN** the status shows the error and the button becomes usable again
