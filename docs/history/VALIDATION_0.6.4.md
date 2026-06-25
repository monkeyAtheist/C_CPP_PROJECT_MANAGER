# LabWindows/CVI Project Manager 0.6.4 — validation

## Scope

This pass improves the Project Build Settings editor without changing the guarded native CVI persistence model introduced in 0.6.1 and expanded in 0.6.2.

## Implemented controls

- File or folder browser buttons for output file, application icon, manifest, DLL custom-copy directory, function-panel file, NI type-information header, working directory and external DLL-debugging executable.
- Configuration scope selector: Debug, Release, Debug64, Release64 and All Configurations.
- Target-aware run-time support and run-time binding selectors.
- Generated source-documentation selector.
- DLL copy-destination and DLL export-mode selectors.
- Safe-mode configuration scope and verified selectors.

## Automated checks

- TypeScript compilation: OK.
- Native target-settings persistence across Debug, Release, Debug64 and Release64: OK.
- All-configurations simulation: OK.
- Browser fields static presence: OK.
- Scope list static presence: OK.
- Select-list static presence: OK.
- VSIX packaging: OK.

## Remaining manual validation

The Linux build environment cannot open the graphical Windows instance of LabWindows/CVI or VS Code. The visual layout and native CVI dialog round-trip must be checked on a Windows workstation with CVI installed.
