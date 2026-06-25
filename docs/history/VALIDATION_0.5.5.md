# LabWindows/CVI Project Manager 0.5.5 — Validation

## Scope

This release extends the build workflow without replacing LabWindows/CVI `compile.exe` or the native CVI IDE.

## Automated checks

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| Generated JavaScript syntax | OK |
| VSIX packaging | OK |
| Manifest version | 0.5.5 |
| Publisher | JerryCrozet-ElectronicEngineer |
| Explorer build picker command | OK |
| Workspace context action: Open Workspace in CVI | OK |
| IntelliSense actions removed from explorer title | OK |
| Home installation IntelliSense actions | OK |
| Target type round-trip: EXE → DLL → LIB → EXE | OK |
| Workspace run-options round-trip | OK |
| Prototype generator excludes static definitions | OK |
| Prototype generator emits global declarations | OK |
| Build log option `-log` present in build service | OK |
| Extension-managed settings file | `.vscode/labwindows-cvi-build.json` |
| Dependency order resolution `C → B → A` | OK |
| Circular dependency detection | OK |

## Native and extension-managed boundaries

Native CVI project metadata is updated for target type. Command-line settings are mirrored into CVI workspace sections when a `.cws` workspace is loaded.

Dependencies, pre-build actions, custom-build actions and post-build actions are stored in `.vscode/labwindows-cvi-build.json` and executed by the VS Code extension. They are intentionally not presented as a byte-for-byte editor for the private CVI project-dialog metadata.

## Prototype generator boundary

The built-in generator is a conservative source scanner intended to produce an editable header baseline. It is not a full C parser and does not claim exact parity with the native CVI **Generate Prototypes** engine.
