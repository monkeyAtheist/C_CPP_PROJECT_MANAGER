# Manual test checklist — 0.6.30

1. Install the VSIX and reload VS Code.
2. Close CVI and introduce a compile error in the active source file.
3. Run `LabWindows/CVI: Run Project in Native CVI Debugger`.
4. Confirm that `compile.exe` reports failure and CVI does not open.
5. Fix the source file and run the command again.
6. Confirm that the local build succeeds before CVI opens.
7. Confirm that CVI starts native debugging and the dashboard exposes Pause and Stop.
8. Confirm that Continue and Stop work through the persistent DDE session.
9. Let the program finish naturally and confirm that the dashboard returns to idle.
10. Confirm that the breakpoint list in CVI mirrors the enabled standard VS Code breakpoints.
