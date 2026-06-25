# Validation — LabWindows/CVI Project Manager 0.6.6

## Scope

This release improves the Project Build Settings editor and adds an editor-context integer conversion utility.

## Build-settings UI

- All major sections are collapsible through native HTML `details` elements.
- Target and frequently used creation/run sections are expanded initially.
- Version information, signing information, DLL type information and build steps remain available but can stay folded.
- `LoadExternalModule` no longer exposes a raw editable textarea as the primary UI.
- The compatibility checkbox enables or disables the add controls.
- `Add files to executable…` / `Add files to DLL…` opens a multiple-selection browser for `.lib` and `.obj` files.
- `Add module name…` supports CVI-resolved modules such as `advanlys.lib` and `toolbox.obj` without requiring a physical path.
- A preview list displays the modules that will be written to `[Modules Forced Into Executable]` and supports individual removal.

## Integer conversion commands

The editor context menu contains `Convert selected integer to` with:

- Decimal
- Hexadecimal
- Binary

Supported input examples:

- `42`
- `0x2A`
- `0b101010`
- `-0b101010U`

The implementation uses `BigInt` to avoid precision loss and preserves an optional sign and C integer suffix.

## Automated checks

- `npm run compile`: OK
- `node --check out/extension.js`: OK
- `node --check out/views/buildSettingsPanel.js`: OK
- rendered webview script syntax: OK
- collapsible-section markers: OK
- LoadExternalModule preview/add controls: OK
- conversion submenu contribution: OK
- conversion checks `42 -> 0x2A`, `0x2A -> 0b101010`, `-0b101010U -> -42U`: OK
- VSIX packaging: OK
