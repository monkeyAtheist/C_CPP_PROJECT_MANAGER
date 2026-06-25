# Manual test checklist — LabWindows/CVI Project Manager 0.6.24

## Installation

1. Install `labwindows-cvi-project-manager-0.6.24.vsix`.
2. Execute `Developer: Reload Window`.
3. Open the supplied CVI workspace and confirm that the **CVI Debug** view is visible.

## VS Code-owned debug launch

1. Close every native CVI window.
2. Place a standard enabled breakpoint in a `.c` file belonging to the active CVI project.
3. In **CVI Debug**, select **Start debugging in VS Code**.
4. Confirm that the standard VS Code debug toolbar appears.
5. Confirm that CVI starts minimized or remains in the background.
6. Confirm that the `LabWindows/CVI` output channel contains the persistent DDE handshake and `dde-session Run Project -> 0`.

## Toolbar controls

1. Use the VS Code toolbar **Pause** button while the program is running.
2. Confirm that `dde-session Suspend Execution -> 0` appears.
3. Use the VS Code toolbar **Continue** button.
4. Confirm that `dde-session Continue Execution -> 0` appears.
5. Use the VS Code toolbar **Stop** button.
6. Confirm that `dde-session Terminate Execution -> 0` appears and the VS Code debug session closes.

## Breakpoint detection

1. Start the VS Code-owned debug session with a reachable source breakpoint.
2. Confirm that the breakpoint is synchronized before launch.
3. Observe whether the VS Code debug toolbar switches to a suspended state when CVI reaches the breakpoint.
4. If CVI refuses state polling during execution, confirm that the output channel reports a temporary polling limitation without disconnecting the persistent DDE control session.
5. Confirm that manual **Continue** and **Stop** remain usable.

## Background CVI behavior

1. Confirm that a single CVI backend instance is started.
2. Confirm that the CVI backend remains minimized after Run, Pause, Continue, and Stop when `labwindowsCvi.keepNativeIdeMinimizedDuringVsCodeDebug` is `true`.
3. Set `labwindowsCvi.nativeDebuggerIdeWindowMode` to `normal` and confirm that the backend can still be shown for native inspection when required.

## Explicit limitations

1. Confirm that VS Code does not show fabricated call-stack frames or variable values.
2. Confirm that requesting evaluation or step-by-step commands returns an explicit unsupported-operation message.
3. Confirm that the legacy **Run in native CVI window (legacy)** action remains available.
