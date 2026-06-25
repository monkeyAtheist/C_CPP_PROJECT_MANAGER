# Manual test checklist — LabWindows/CVI Project Manager 0.6.14

## Installation

1. Install `labwindows-cvi-project-manager-0.6.14.vsix` over the previous version.
2. Run `Developer: Reload Window`.
3. Open a native `.cws` workspace, not only a standalone `.prj` file.

## Explicit breakpoint synchronization

1. Open a `.c` file referenced by the active CVI project.
2. Add one or more standard enabled VS Code breakpoints in the editor gutter.
3. Right-click the workspace root or the target project in the CVI Workspace view.
4. Run `Synchronize VS Code Breakpoints to Native Workspace`.
5. Open the workspace in LabWindows/CVI.
6. Confirm that the synchronized breakpoints appear in the CVI source editor.

## Automatic synchronization before native debugging

1. Keep `labwindowsCvi.synchronizeBreakpointsBeforeNativeDebug` enabled.
2. Add or move a standard breakpoint in VS Code.
3. Run `LabWindows/CVI: Build Debug and Open Native Debugger`.
4. Confirm that CVI opens with the breakpoint already available.
5. Use CVI for Run, Pause, Step Into, Step Over, Step Out, watch expressions and variable inspection.

## Native breakpoint preservation

1. Add a breakpoint manually in LabWindows/CVI and save the workspace.
2. Add a different breakpoint in VS Code.
3. Run the synchronization command.
4. Confirm that both the manually created CVI breakpoint and the synchronized VS Code breakpoint remain present.
5. Run `Remove Synchronized Breakpoints from Native Workspace`.
6. Confirm that only the breakpoint injected from VS Code is removed.

## Conservative exclusions

Verify that the extension skips these breakpoint types without converting them into unconditional CVI breakpoints:

- disabled breakpoints;
- conditional breakpoints;
- hit-count breakpoints;
- logpoints;
- breakpoints outside the selected CVI project.

Use `LabWindows/CVI: Diagnose Native Breakpoint Bridge` to inspect the skipped counters in the `LabWindows/CVI` output channel.

## Native-file safety

After synchronization, verify that a timestamped `.cws` backup exists under:

```text
.vscode/cvi-native-backups
```

## Known first-stage limitation

Version 0.6.14 synchronizes breakpoints into the native CVI workspace. Step commands, stack inspection, watch expressions and variable inspection still run in the LabWindows/CVI debugger window, not inside the VS Code Run and Debug panel.
