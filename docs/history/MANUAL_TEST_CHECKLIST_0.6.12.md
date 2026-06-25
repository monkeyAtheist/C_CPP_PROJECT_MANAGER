# Manual test checklist — 0.6.12

1. Install `labwindows-cvi-project-manager-0.6.12.vsix` and run `Developer: Reload Window`.
2. Open an existing `.cws` workspace.
3. Right-click the workspace root in **CVI Workspace**.
4. Confirm that the menu exposes both:
   - `Create New Project in Workspace...`
   - `Add Existing Project to Workspace`
5. Select `Create New Project in Workspace...`.
6. Choose a directory, enter `TestCreatedProject`, then select `Static Library`.
7. Confirm that `TestCreatedProject.prj` is written, added to the tree and selected as active.
8. Open the `.cws` workspace in native LabWindows/CVI and confirm it still loads.
9. Repeat with an `Executable` project if required.
10. Verify that `.vscode/cvi-native-backups` contains a backup of the workspace before the new reference was written.
