# Spec Delta

## ADDED Requirements

### Requirement: Start a preview server on request
The address row SHALL offer to start a serve-sim preview server for the device the toolbar shows, on one of the machine's own IPv4 addresses that the user picks. The service SHALL start it only after a second click within 4 seconds of the first, and the first click SHALL show that anyone who can reach the address can run commands on this machine through serve-sim's page. The service SHALL use the first free port from 3200 to 3209, SHALL answer the server's address once its helper health route answers, and the row SHALL store that address as the open address.

#### Scenario: Starting on the tailnet address
- **WHEN** no serve-sim preview server runs, the user picks the tailnet address and clicks Start twice
- **THEN** a serve-sim preview server for the shown device answers at `http://<tailnet address>:3200`, that address is stored, and the open button shows no red dot

#### Scenario: One click only
- **WHEN** the user clicks Start once and not again within 4 seconds
- **THEN** nothing starts

#### Scenario: An address that is not the machine's own
- **WHEN** a start request names an address that is not one of the machine's own IPv4 addresses
- **THEN** the service answers 400 and starts nothing

### Requirement: Stop only what the extension started
The row SHALL offer Stop for a preview server the extension started, and the service SHALL end only processes it started itself (recorded with pid, address and device, kept across service restarts). It SHALL NOT stop preview servers started by other means, nor its own loopback helpers through this action.

#### Scenario: Stopping a started server
- **WHEN** the user clicks Stop for a server the extension started
- **THEN** that server ends, and within 15 seconds the open button shows the red dot

#### Scenario: A server started in a terminal
- **WHEN** the stored address belongs to a serve-sim started in a terminal
- **THEN** the row offers no Stop for it

### Requirement: Never started by itself
The extension SHALL NOT start, restart or reuse a preview server on any address without that confirmed request, and SHALL NOT stream or send input through such a server; its own helpers stay on 127.0.0.1.

#### Scenario: The stored server is down
- **WHEN** the stored address does not answer
- **THEN** the open button shows the red dot and nothing is started until the user asks
