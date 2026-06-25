# Manual test checklist — LabWindows/CVI Project Manager 0.5.8

1. Install `labwindows-cvi-project-manager-0.5.8.vsix` and reload VS Code.
2. Collapse `CVI Actions` and verify that the title toolbar remains visible.
3. Open a CVI DLL project whose external executable path is `/c/PROG_CVI/EXE/Test.exe`.
4. Run the project and verify in the LabWindows/CVI output channel that the path is normalized to `C:\PROG_CVI\EXE\Test.exe`.
5. Open a `.c` file, type the beginning of a project function name and verify that completion suggestions appear.
6. Type the beginning of a CVI API function such as `SetCtrl` and verify that supplemental CVI suggestions appear.
7. Select a `.c` or `.h` file in `CVI Workspace`.
8. Expand `CVI File Symbols`, select a function, and verify that the editor jumps to its declaration or definition.
9. Disable `labwindowsCvi.enableSupplementalCompletionProvider` and verify that the extension stops contributing its supplemental completion list.
