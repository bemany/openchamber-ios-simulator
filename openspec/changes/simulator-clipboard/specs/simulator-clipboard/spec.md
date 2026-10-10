# Spec Delta

## Purpose

Moving text between the simulator and the viewer's own clipboard: copying out of the simulator, and pasting any text into it, including characters the keyboard layout has no key for.

## ADDED Requirements

### Requirement: Copy out of the simulator
When the user copies inside the simulator in the surface, the service SHALL answer the host's clipboard read with the simulator's pasteboard text. When the pasteboard cannot be read, the service SHALL answer without text (HTTP 404) and SHALL NOT clear the user's clipboard.

#### Scenario: Copy a selected word
- **WHEN** the user selects a word in a simulator text field and presses Cmd+C in the surface
- **THEN** that word is on the user's clipboard

#### Scenario: Pasteboard unreadable
- **WHEN** the simulator's pasteboard cannot be read
- **THEN** the user's clipboard keeps its previous content

### Requirement: Paste any text
Pasted text SHALL arrive in the focused simulator text field unchanged, including emoji and accented characters, when the simulator's pasteboard can be written. When it cannot, characters without a key SHALL be skipped and the toolbar SHALL say how many were skipped.

#### Scenario: Paste with an emoji
- **WHEN** the user pastes `Hallo 👋 café` into a focused text field
- **THEN** the field shows `Hallo 👋 café`

#### Scenario: Pasteboard not writable
- **WHEN** writing the simulator's pasteboard has no effect
- **THEN** `Hallo café` arrives as typed characters on a German simulator (one space where the emoji was) and the toolbar notes 1 character not typed

### Requirement: Clipboard text stays private
The service SHALL NOT log, store or send clipboard text anywhere other than between the simulator's pasteboard and the requesting viewer.

#### Scenario: Service logs
- **WHEN** text is copied or pasted
- **THEN** neither the service log nor any file in the extension's cache contains that text
