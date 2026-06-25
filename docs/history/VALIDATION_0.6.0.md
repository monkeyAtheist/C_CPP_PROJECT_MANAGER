# LabWindows/CVI Project Manager 0.6.0 — validation

## Scope

This pass addresses two UI and IntelliSense issues:

1. The view toolbar disappears when the `CVI Workspace` view is collapsed. VS Code does not expose a public menu contribution point for the outer view-container header, so a persistent compact status-bar strip was added.
2. Older releases could register a Microsoft C/C++ custom configuration provider. A stale provider selection could interfere with completion in unrelated C/C++ folders. Dynamic registration is now disabled permanently and stale references are cleaned automatically.

## Automated checks

- TypeScript compilation: OK
- Generated JavaScript syntax: OK
- VSIX packaging: OK
- Manifest version: `0.6.0`
- Marketplace publisher: `JerryCrozet-ElectronicEngineer`
- Persistent status-bar controls: 7
- Status-bar controls configurable through `labwindowsCvi.showPersistentStatusBarActions`: OK
- Dynamic C/C++ provider registration: disabled
- Managed `c_cpp_properties.json`: no generated `configurationProvider`
- Automatic stale-provider cleanup invoked during activation: OK
- Supplemental completion provider scoped to loaded CVI workspace files: OK
- Existing `CVI Workspace` toolbar retained: OK

## Manual verification on Windows

1. Install the VSIX and run `Developer: Reload Window`.
2. Collapse `CVI Workspace`, `CVI Actions`, `CVI File Symbols` and `CVI Libraries`.
3. Confirm that the compact actions remain visible in the VS Code status bar.
4. Open a CVI source and verify CVI suggestions.
5. Open an unrelated C folder and verify that CVI-specific suggestions are no longer injected.
6. Run `C/C++: Reset IntelliSense Database` once and confirm native completion for `printf` after including `<stdio.h>`.
