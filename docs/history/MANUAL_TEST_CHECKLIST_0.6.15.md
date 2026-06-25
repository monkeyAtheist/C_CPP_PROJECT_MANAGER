# Manual test checklist — 0.6.15

## Installation

1. Install `labwindows-cvi-project-manager-0.6.15.vsix` over the previous version.
2. Run `Developer: Reload Window`.
3. Load a `.cws` workspace containing an executable CVI project.

## Native command bridge diagnostic

1. Open the command palette.
2. Run `LabWindows/CVI: Diagnose Native Command Bridge` while CVI is closed.
3. Confirm that the diagnostic reports that the native command server is unavailable without modifying the workspace.
4. Open the workspace in CVI.
5. Run the diagnostic again.
6. Confirm that the bridge reports an operational connection and a readable project state.

## Debug controls

1. Place a standard enabled breakpoint in a `.c` file belonging to the active project.
2. Run `LabWindows/CVI: Run Project in Native CVI Debugger`.
3. Confirm that CVI opens automatically when initially closed.
4. Confirm that the breakpoint appears in CVI and is reached during execution.
5. Run `LabWindows/CVI: Read Native CVI State` and confirm that the state is reported as suspended at the breakpoint.
6. Run `LabWindows/CVI: Continue Native CVI Execution` and confirm that execution resumes.
7. Run `LabWindows/CVI: Pause Native CVI Execution` while the program is running and confirm that CVI suspends it.
8. Run `LabWindows/CVI: Stop Native CVI Execution` and confirm that the program terminates.

## Build command

1. Modify one source file.
2. Run `LabWindows/CVI: Build Project in Native CVI`.
3. Confirm that the native CVI build begins and that errors, if any, are displayed by CVI.

## Preserved behavior

1. Create one breakpoint manually in CVI and one from VS Code.
2. Synchronize breakpoints twice.
3. Confirm that the native CVI breakpoint and existing tracepoints remain intact.
4. Confirm that `.vscode/cvi-native-backups` receives timestamped `.cws` backups before serialization changes.

## Known boundary

Step Into, Step Over, Step Out, watch expressions, call-stack display and variable inspection remain in the native CVI IDE in 0.6.15.
