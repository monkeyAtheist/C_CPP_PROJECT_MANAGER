# Manual test checklist — 0.6.13

1. Install `labwindows-cvi-project-manager-0.6.13.vsix` and run `Developer: Reload Window`.
2. Open the existing `Testing.cws` workspace created with version `0.6.12`.
3. Accept **Repair workspace** when the compatibility warning appears, or run `LabWindows/CVI: Repair Native Workspace Compatibility` from the command palette.
4. Confirm that `.vscode/cvi-native-backups` contains a new backup of `Testing.cws`.
5. Select the added project `dqdzdad` as active.
6. Open **Project Build Settings...**, modify a harmless field such as the command-line arguments, then click **Save project build settings**.
7. Confirm that the previous `[Default Build Config 0003 Debug] is missing` error no longer appears.
8. Right-click the workspace root and create another test project with **Create New Project in Workspace...**.
9. Save settings for the newly created project immediately, without opening LabWindows/CVI first.
10. Open the resulting `.cws` in native LabWindows/CVI and verify that all projects are accepted and displayed.
