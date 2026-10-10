# keyboard-input Specification

## Purpose
How characters typed or pasted by the viewer arrive in the simulator as written, through the simulator's own hardware keyboard layout.

## Requirements

### Requirement: Characters arrive as written
For every supported layout, each character the layout has a key for SHALL arrive in a focused text field of the simulator exactly as typed or pasted, independent of the viewer's own keyboard layout.

#### Scenario: Typing on a French simulator
- **WHEN** the simulator's first hardware keyboard is French (AZERTY) and the viewer types `azerty@é`
- **THEN** the text field shows `azerty@é`

#### Scenario: Accented letter through a dead key
- **WHEN** the simulator's layout is German and the viewer types `é ñ ^ ô`
- **THEN** the text field shows `é ñ ^ ô`

#### Scenario: Character without a key
- **WHEN** the pasted text contains a character the layout has no key for (for example an emoji)
- **THEN** that character is skipped, the others arrive, and the service reports the number of skipped characters

### Requirement: Supported layouts and fallback
The service SHALL support the German, US, French, UK, Spanish, Swiss German and Italian Apple hardware layouts, detected from the simulator's first `AppleKeyboards` entry, or from the device locale when that setting is missing, and SHALL fall back to US for any other layout.

#### Scenario: Unknown layout
- **WHEN** the simulator's first keyboard is a layout without a table (for example `nl_NL`)
- **THEN** input is typed with the US table and the status tooltip names the layout used
