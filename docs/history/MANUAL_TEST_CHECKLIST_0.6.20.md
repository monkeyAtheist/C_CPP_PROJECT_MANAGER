# Manual test checklist — 0.6.20

1. Install `labwindows-cvi-project-manager-0.6.20.vsix` and run `Developer: Reload Window`.
2. Verify that `labwindowsCvi.nativeCommandTransport` remains at its default value `dde`.
3. Close all LabWindows/CVI windows.
4. Load a `.cws` workspace in the extension and run `LabWindows/CVI: Build Project in Native CVI`.
5. Confirm that exactly one CVI instance opens and that it contains the requested workspace rather than an empty workspace.
6. Confirm that the output channel contains `Native transport strategy: dde` and a successful `DDE attempt ansi: connected`.
7. Run `LabWindows/CVI: Read Native CVI State` and verify that the state is decoded.
8. While execution is idle, run `Pause`, `Continue` and `Stop`; verify that the extension returns precise informational messages and does not send invalid commands.
9. Start the project, then test `Pause`, `Continue` and `Stop` in their valid states.
10. Place a standard enabled VS Code breakpoint in a project `.c` file and run `LabWindows/CVI: Run Project in Native CVI Debugger`; verify breakpoint synchronization.
11. Optional compatibility test: set `labwindowsCvi.nativeCommandTransport` to `auto` and verify that DDE remains the first attempted transport. Keep `labwindowsCvi.allowActiveXAutoStart` disabled unless explicitly testing COM activation.
