# Manual Test Checklist — v0.6.31

1. Install `labwindows-cvi-project-manager-0.6.31.vsix`.
2. Run `Developer: Reload Window`.
3. Open the CVI workspace.
4. Verify that `CVI Debug` shows short action labels:
   - `Build & Run Debug` before execution;
   - `Continue`, `Pause`, `Stop` while a native session is active.
5. Launch `Build & Run Debug`.
6. Confirm that `compile.exe` builds first. If the build fails, CVI must not open.
7. Confirm that, after a successful build, CVI opens and the debug session starts.
8. When the program is suspended on a CVI breakpoint, use `Continue` from VS Code to move to the next breakpoint.
9. Use `Pause` and `Stop` from VS Code.
10. Open the run action quick pick and confirm that `Build and run debug` routes to the same native debug launch as `Build & Run Debug`.
11. Verify that the old standalone `Build locally with compile.exe` action is not listed in `CVI Debug`.
