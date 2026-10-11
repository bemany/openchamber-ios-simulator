# multi-device-page Specification

## Purpose
Lets the viewer watch and use several running simulators side by side on the full-screen page, while the rail panel keeps showing one.

## Requirements

### Requirement: Tiles side by side
The full-screen page SHALL show between one and four tiles, each with its own device, live picture, device frame and rotation. The viewer SHALL be able to add a tile for another device and close any tile but the last. The page SHALL remember its tiles in instance storage and restore them on reload.

#### Scenario: Two running devices
- **WHEN** two simulators are booted and the viewer adds a second tile and picks the other device in it
- **THEN** both pictures update live at the same time, each in its own tile

#### Scenario: Reload
- **WHEN** the page with two tiles is reloaded
- **THEN** the same two devices show in the same order

### Requirement: Focused tile takes input and toolbar actions
Touch, wheel, keys and paste SHALL go to the device of the tile they happen on; a click SHALL make that tile the focused one (outlined). Keys and paste SHALL go to the focused tile. The page toolbar SHALL show and act on the focused tile's device (picker, power, repair, Home, rotation, appearance, lock).

#### Scenario: Typing after clicking a tile
- **WHEN** the viewer clicks into a text field in the right tile and types
- **THEN** the text arrives on the right tile's device only

#### Scenario: Home in the toolbar
- **WHEN** the left tile is focused and the viewer clicks Home
- **THEN** only the left tile's device goes to the home screen

### Requirement: Tiles never boot or shut down other devices
A tile whose device is off SHALL show it as off with a Boot button and SHALL NOT boot it by itself. Picking a device in one tile, or closing a tile, SHALL NOT shut down any simulator. Power in the toolbar SHALL act on the focused tile's device only.

#### Scenario: Picking a device that is off
- **WHEN** the viewer picks a device that is off in a tile
- **THEN** the tile shows it as off with a Boot button, and the other tiles keep streaming

### Requirement: The panel is unchanged
The rail panel SHALL keep showing one device through the shared surface. Page tiles SHALL NOT change the panel's device, and the panel's device picker SHALL NOT change a page tile.

#### Scenario: Panel and page side by side
- **WHEN** the panel shows device A and the page shows tiles for A and B
- **THEN** switching the panel to B leaves both tiles streaming, and focusing tile B leaves the panel on B
