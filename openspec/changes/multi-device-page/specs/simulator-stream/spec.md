# Spec Delta

## ADDED Requirements

### Requirement: One stream per watched device
The service SHALL keep one picture stream and one HID connection per device that a viewer (the panel's surface or a page tile) currently watches, and SHALL close a device's stream once no viewer has asked for it within the viewer grace period. Changing the panel's device SHALL NOT stop a stream a page tile still watches.

#### Scenario: Panel switches away from a device a tile shows
- **WHEN** a page tile shows device A and the panel switches from A to B
- **THEN** the tile's picture of A keeps updating and the panel shows B

#### Scenario: Last viewer of a device leaves
- **WHEN** the only tile showing device B is closed and no panel shows B
- **THEN** the service closes B's stream and HID connection after the grace period, and B's helper keeps running until B shuts down
