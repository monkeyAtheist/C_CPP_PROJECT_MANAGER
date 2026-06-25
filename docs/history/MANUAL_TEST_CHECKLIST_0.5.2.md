# Manual test checklist — LabWindows/CVI Project Manager 0.5.2

1. Install `labwindows-cvi-project-manager-0.5.2.vsix` over the previous version.
2. Run `Developer: Reload Window`.
3. Open a `.cws` file with `LabWindows/CVI: Open Workspace or Project`.
4. Confirm that the directory containing the `.cws` file appears automatically in the standard VS Code Explorer.
5. Confirm that `<project directory>/.vscode/c_cpp_properties.json` exists.
6. Open a project source file containing CVI and Windows headers.
7. Confirm that `toolbox.h`, `ansi.h` or `ansi_c.h`, and `windows.h` are resolved.
8. Run `LabWindows/CVI: Diagnose C/C++ IntelliSense Configuration`.
9. In the **LabWindows/CVI** output channel, verify that ANSI header candidates and `windows.h` candidates are listed.
10. If the C/C++ extension keeps stale diagnostics, run `C/C++: Reset IntelliSense Database` once.

Optional compatibility check:

1. Disable `labwindowsCvi.autoAddCviFolderToWorkspace`.
2. Reload VS Code.
3. Confirm that the extension no longer adds the directory automatically and that the dynamic provider remains available.
