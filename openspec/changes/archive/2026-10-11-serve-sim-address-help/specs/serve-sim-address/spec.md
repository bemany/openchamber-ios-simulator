# Spec Delta

## Purpose

Helps the user set the address the "Open in serve-sim" button opens, and shows when the server behind it is not running.

## ADDED Requirements

### Requirement: Suggest local serve-sim servers
While the address row is open, the toolbar SHALL show the serve-sim preview servers the service finds on its own machine, each with its address and the name of the device it shows. A server SHALL be suggested only when its helper health route answers for a booted device; the device named SHALL be the one its preview page shows. The extension's own loopback helpers SHALL NOT be suggested. Picking a suggestion SHALL fill the address field and SHALL NOT store it.

#### Scenario: A preview server runs on a network address
- **WHEN** serve-sim runs as a preview server on one of the machine's interface addresses, port 3200, and the user opens the address row
- **THEN** that address shows as a suggestion with its device's name, and a click puts it into the field

#### Scenario: Only the extension's helpers run
- **WHEN** no serve-sim preview server runs and the user opens the address row
- **THEN** no suggestion shows, and the row says that no serve-sim server was found on this machine

### Requirement: Show when the stored address does not answer
While a toolbar is visible and an address is stored, the service SHALL check at most every 15 seconds whether serve-sim answers at that address. The open button SHALL show a red dot and a tooltip naming the address while it does not answer, and no mark while it does.

#### Scenario: The server stopped
- **WHEN** the stored address belonged to a serve-sim that has since stopped
- **THEN** within 15 seconds the open button shows the red dot and the tooltip "serve-sim is not running at <address>"

#### Scenario: The server is back
- **WHEN** serve-sim runs again at the stored address
- **THEN** within 15 seconds the red dot disappears

### Requirement: Discovery only reads
Finding and checking servers SHALL NOT start, stop or store anything. The service SHALL only probe the stored address and addresses of its own machine, with a timeout of at most 3 seconds per health probe and 8 seconds per page read, SHALL read a preview page only up to the device it names, and SHALL only report whether serve-sim answered and which device it shows.

#### Scenario: Checking an address
- **WHEN** the toolbar asks for the state of the stored address
- **THEN** the service answers running or not running, and no serve-sim process starts or stops
