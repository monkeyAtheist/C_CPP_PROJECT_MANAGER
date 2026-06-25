# Manual test checklist — LabWindows/CVI Project Manager 0.6.21

## Installation

1. Install `labwindows-cvi-project-manager-0.6.21.vsix` over the previous version.
2. Run `Developer: Reload Window`.
3. Open the CVI workspace used for testing.

## Persistent DDE debug session

1. Close every native LabWindows/CVI window.
2. Add a standard VS Code breakpoint inside a sufficiently long-running C source file.
3. Run `LabWindows/CVI: Run Project in Native CVI Debugger`.
4. Confirm that CVI opens the requested workspace and starts the project in debug mode.
5. Open the `LabWindows/CVI` output channel and verify the presence of:

```text
[CVI] Persistent DDE debug session connected for ...
[CVI] dde-session Run Project -> 0
```

6. While the program is running, run `LabWindows/CVI: Pause Native CVI Execution`.
7. Confirm that the output contains:

```text
[CVI] dde-session Suspend Execution -> 0
```

8. Run `LabWindows/CVI: Continue Native CVI Execution` and verify:

```text
[CVI] dde-session Continue Execution -> 0
```

9. Run `LabWindows/CVI: Stop Native CVI Execution` and verify:

```text
[CVI] dde-session Terminate Execution -> 0
```

## State command while execution is active

1. Launch the project again from the native debugger command.
2. Run `LabWindows/CVI: Read Native CVI State` while execution is active.
3. Confirm that VS Code reports a cached active-session state without waiting for a new DDE connection.
4. Run `LabWindows/CVI: Diagnose Native Command Bridge` while execution is active.
5. Confirm that diagnostics report a connected persistent DDE session and do not block on `Get CVI State`.

## Regression checks

1. Run `LabWindows/CVI: Build Project in Native CVI` while no user program is executing.
2. Confirm that the ordinary DDE build path remains operational.
3. Synchronize breakpoints explicitly and confirm that manually created native CVI breakpoints and tracepoints remain present.
4. Open an older multi-project workspace and run the native compatibility repair command. Confirm that no workspace section is lost.
