# Manual test checklist — 0.6.0

## Persistent actions

- [ ] Install `labwindows-cvi-project-manager-0.6.0.vsix`.
- [ ] Run `Developer: Reload Window`.
- [ ] Collapse every view in the `LABWINDOWS/CVI` container.
- [ ] Confirm that Home, Open, Build, Build + Run, Run options, build mode and target type remain accessible in the VS Code status bar.
- [ ] Change D32/R32/D64/R64 and EXE/DLL/LIB through the persistent controls.
- [ ] Disable `labwindowsCvi.showPersistentStatusBarActions` and confirm that the strip disappears.

## Native C/C++ autocomplete

- [ ] Run `LabWindows/CVI: Repair C/C++ IntelliSense Provider Selection` once after upgrading from an older release.
- [ ] Reload VS Code.
- [ ] Run `C/C++: Reset IntelliSense Database`.
- [ ] Open a plain C file outside the CVI workspace.
- [ ] Add `#include <stdio.h>` and type `pri`.
- [ ] Confirm that Microsoft C/C++ proposes `printf`.
- [ ] Open a CVI source and confirm that supplemental CVI API suggestions remain available.
