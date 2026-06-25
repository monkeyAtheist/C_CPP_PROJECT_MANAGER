# Manual test checklist — 0.6.4

1. Install `labwindows-cvi-project-manager-0.6.4.vsix` and run `Developer: Reload Window`.
2. Open a CVI workspace containing at least one EXE and one DLL project.
3. Open **Project Build Settings...** on the EXE project.
4. Confirm that the configuration selector offers `Debug`, `Release`, `Debug64`, `Release64` and `All Configurations`.
5. Confirm folder buttons beside output file, application icon, manifest, working directory and external DLL-debug executable.
6. Confirm the EXE runtime-binding list contains `Shared`, `Side-by-side for entire application` and `Side-by-side for executable only`.
7. Select `All Configurations`, change a harmless value such as Application title, save, then verify the four native CVI build configurations.
8. Open the DLL project and confirm DLL copy destination and export-mode lists.
9. Use the DLL custom-copy-directory browser and save. Reopen the project in CVI and verify Target Settings.
10. Confirm that `.vscode/cvi-native-backups` contains timestamped `.prj` / `.cws` backups after writes.
11. Run **Project Build Settings (Safe Mode)...** and verify the configuration-scope selector and runtime lists.
