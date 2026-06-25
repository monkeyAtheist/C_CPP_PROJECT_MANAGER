# Manual test checklist — 0.6.16

## Installation

1. Install `labwindows-cvi-project-manager-0.6.16.vsix` over version 0.6.15.
2. Run `Developer: Reload Window`.
3. Load the CVI `.cws` workspace used for the previous diagnostic.
4. Open the workspace in LabWindows/CVI before the first test.

## Compatibility diagnostic

1. Run `LabWindows/CVI: Diagnose Native Command Bridge`.
2. Open the `LabWindows/CVI` output channel.
3. Check the DDE attempt lines.
4. If the bridge succeeds, confirm that one attempt reports `connected`, normally in `ansi` mode.
5. Confirm that the decoded native CVI project state appears.

Expected successful pattern:

```text
[CVI]   DDE attempt ansi: connected
[CVI] Native CVI state: ...
```

## Failure information to capture

If both compatibility modes fail, copy the full `LabWindows/CVI` output-channel diagnostic. It must contain:

```text
DDE attempt ansi: ...
DDE attempt unicode: ...
ActiveX registry discovery -> ... candidate(s)
ActiveX candidate: CLSID=... · ProgID=...
```

The ActiveX lines are required to implement a release-specific modern transport if DDE remains unavailable.

## Native debug controls

When the diagnostic succeeds:

1. Place one standard enabled breakpoint in a `.c` file of the active project.
2. Run `LabWindows/CVI: Run Project in Native CVI Debugger`.
3. Confirm that the synchronized breakpoint is visible and reached in CVI.
4. Test `Read Native CVI State`, `Continue Native CVI Execution`, `Pause Native CVI Execution`, and `Stop Native CVI Execution`.
5. Run `Build Project in Native CVI` after modifying a source file.

## Preserved behavior

1. Create one breakpoint manually in CVI and one breakpoint in VS Code.
2. Synchronize twice.
3. Confirm that the CVI-native breakpoint and tracepoints are preserved.
4. Confirm that timestamped `.cws` backups are written under `.vscode/cvi-native-backups` before serialization changes.

## Known boundary

The ActiveX registry scan is diagnostic-only in 0.6.16. Step Into, Step Over, Step Out, watch expressions, call-stack display and variable inspection remain in the native CVI IDE.
