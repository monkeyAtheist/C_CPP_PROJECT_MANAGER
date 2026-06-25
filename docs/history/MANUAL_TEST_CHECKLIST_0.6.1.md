# Manual test checklist — 0.6.1

1. Install `labwindows-cvi-project-manager-0.6.1.vsix` and run `Developer: Reload Window`.
2. Open a copy of an existing `.cws` workspace.
3. Open `Project Build Settings...` and configure an external DLL host with a Windows path such as `C:\\PROG_CVI\\EXE\\Test.exe`.
4. Save the settings.
5. Inspect the `.cws` file and verify that the active `[Default Build Config NNNN ...]` section stores `/c/PROG_CVI/EXE/Test.exe`.
6. Verify that `[Command Line Args NNNN]` does not gain an `External Process Path` key.
7. Verify that `.vscode/cvi-native-backups` contains a timestamped `.cws` backup.
8. Open the workspace in LabWindows/CVI and verify that CVI loads it normally.
9. For a workspace modified by version 0.5.6–0.6.0, run `LabWindows/CVI: Repair Native Workspace Compatibility` and re-open it in CVI.
10. Run the DLL target from VS Code and verify that `/c/...` is converted in memory to `C:\\...` for Windows execution.
