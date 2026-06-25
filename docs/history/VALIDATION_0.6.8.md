# LabWindows/CVI Project Manager 0.6.8 — Validation

## Scope

This release refines the DLL **Type information** section of the Project Build Settings editor.

## Implemented UI behavior

- The DLL Type information area is split into two visual sub-blocks:
  - Type library resource
  - NI Type Information resource
- When **Add type library resource to DLL** is unchecked:
  - **Include links to help file** is disabled.
  - The TLB help-file format selector is disabled.
  - The function-panel file field and browser button are disabled.
- The TLB help-file format is now selected from `HLP` or `CHM`.
- When **Include links to help file** is unchecked, the `HLP / CHM` selector is disabled.
- When **Add NI Type Information resource to DLL** is unchecked:
  - Both source radio buttons are disabled.
  - The header browser is hidden.
- The NI source options are represented by two radio buttons:
  - Data from all source files
  - Data from single header file
- The header path field and browser button appear only for the single-header mode.

## Checks

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| Generated JavaScript syntax | OK |
| VSIX ZIP integrity | OK |
| Manifest version | `0.6.8` |
| Marketplace publisher | `JerryCrozet-ElectronicEngineer` |
| Type-library sub-block | OK |
| NI type-information sub-block | OK |
| `HLP / CHM` select list | OK |
| Type-library conditional disabling | OK |
| Help-format conditional disabling | OK |
| NI source conditional disabling | OK |
| Single-header field conditional display | OK |
| Native boolean persistence through radio selection | OK |
