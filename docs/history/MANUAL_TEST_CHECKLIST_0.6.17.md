# Manual test checklist — 0.6.17

## Installation

1. Install `labwindows-cvi-project-manager-0.6.17.vsix` over version 0.6.16.
2. Run `Developer: Reload Window`.
3. Load the CVI `.cws` workspace.
4. Open the same workspace in LabWindows/CVI before the first diagnostic.

## Native-command diagnostic

Run:

```text
LabWindows/CVI: Diagnose Native Command Bridge
```

Then open the `LabWindows/CVI` output channel.

### Successful result

At least one DDE mode reports:

```text
[CVI]   DDE attempt ansi: connected
```

or:

```text
[CVI]   DDE attempt unicode: connected
```

The decoded native CVI state must follow.

### Failure result to capture

If the bridge still fails, copy the complete output channel. Version 0.6.17 must expose either structured DDE attempts or an early PowerShell failure with details such as:

```text
stderr: ...
exit/code=...
process terminated by timeout
```

If DDE reaches the script but cannot connect, capture:

```text
[CVI]   DDE attempt ansi: connect · ...
[CVI]   DDE attempt unicode: connect · ...
[CVI] ActiveX registry discovery -> ...
[CVI]   ActiveX scanned root: ...
```

## Preserved behavior

1. Place one standard enabled VS Code breakpoint in a `.c` file of the active project.
2. Run `LabWindows/CVI: Synchronize VS Code Breakpoints to Native Workspace`.
3. Confirm that the breakpoint appears in CVI.
4. Confirm that native CVI breakpoints and tracepoints are preserved.
5. Confirm that `.vscode/cvi-native-backups` receives a timestamped `.cws` backup.
