# simulator-stream Specification

## Purpose
How the live picture of the device shown reaches the viewer through serve-sim on loopback, and how it stays up when devices are switched or other simulators shut down.

## Requirements

### Requirement: Stream through the device's own helper
The service SHALL stream a device, and send its input, through a serve-sim helper that belongs to that device. The helper SHALL listen on 127.0.0.1 only.

#### Scenario: Another simulator shuts down
- **WHEN** the device shown is running and a different simulator shuts down
- **THEN** the picture of the device shown keeps updating without a "No stream" state

#### Scenario: No helper belongs to the device yet
- **WHEN** a device is shown and no loopback helper belongs to it
- **THEN** the service starts a helper for that device on 127.0.0.1 and streams through it

### Requirement: Quick recovery after a switch
After the shown device changes or a boot or shutdown finishes, the picture of the device now shown SHALL appear within 5 seconds, and the service SHALL NOT reconnect to a helper that belonged to a device that shut down.

#### Scenario: Switching to another running device
- **WHEN** the user picks another running device
- **THEN** its picture appears within 5 seconds and the toolbar shows "Live" without passing through "No stream" for longer than that

#### Scenario: The stream drops
- **WHEN** the connection to the helper closes while a viewer is open
- **THEN** the service reconnects within about 2 seconds

### Requirement: One stream per watched device
The service SHALL keep one picture stream and one HID connection per device that a viewer (the panel's surface or a page tile) currently watches, and SHALL close a device's stream once no viewer has asked for it within the viewer grace period. Changing the panel's device SHALL NOT stop a stream a page tile still watches.

#### Scenario: Panel switches away from a device a tile shows
- **WHEN** a page tile shows device A and the panel switches from A to B
- **THEN** the tile's picture of A keeps updating and the panel shows B

#### Scenario: Last viewer of a device leaves
- **WHEN** the only tile showing device B is closed and no panel shows B
- **THEN** the service closes B's stream and HID connection after the grace period, and B's helper keeps running until B shuts down
