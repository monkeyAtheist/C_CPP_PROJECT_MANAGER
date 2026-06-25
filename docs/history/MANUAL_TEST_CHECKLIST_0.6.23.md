# Manual test checklist — LabWindows/CVI Project Manager 0.6.23

## Installation

1. Install `labwindows-cvi-project-manager-0.6.23.vsix`.
2. Run `Developer: Reload Window`.
3. Open the CVI test workspace.

## Automatic startup and transient busy handling

1. Close all CVI windows.
2. Run `LabWindows/CVI: Build Project in Native CVI`.
3. Verify that CVI opens the requested workspace and builds it.
4. Check the `LabWindows/CVI` output channel: transient `DMLERR_BUSY` and initial connection failures should not be printed during normal polling.

## Persistent session handshake

1. Place a breakpoint in a `.c` file.
2. Run `LabWindows/CVI: Run Project in Native CVI Debugger`.
3. Verify these lines appear:

```text
[CVI] Persistent DDE session handshake accepted (ansi).
[CVI] Persistent DDE debug session connected for ...
[CVI] dde-session Run Project -> 0
```

4. Verify that no blank `dde-session  ->` row appears.

## Contextual dashboard controls

1. Before Run, verify that Pause, Continue and Stop are visible but marked `Unavailable`.
2. During Run, verify that Build and Run are unavailable.
3. Verify that Pause, Continue and Stop are available while the persistent session is active.
4. After an accepted Stop, verify that the dashboard returns to `CVI:idle`.

## Non-zero command status

1. Exercise Pause when CVI is already stopped or in an incompatible state.
2. Verify that a non-zero status is shown as a rejected command.
3. For status `12`, verify the message mentions the possible CVI error `No program is running`.
4. Verify that a rejected command does not advance the cached dashboard state.

## Regression

1. Synchronize a VS Code breakpoint.
2. Verify manually created CVI breakpoints remain present.
3. Verify CVI tracepoints remain present.
4. Verify Build, Run, Pause, Continue and Stop still work for valid states.
