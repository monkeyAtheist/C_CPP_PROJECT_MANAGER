# Manual test checklist — 0.6.18

## Installation

1. Install `labwindows-cvi-project-manager-0.6.18.vsix` over version 0.6.17.
2. Run `Developer: Reload Window`.
3. Load the CVI `.cws` workspace.
4. Open the same workspace in LabWindows/CVI before the first diagnostic.

## First native-command diagnostic

Run:

```text
LabWindows/CVI: Diagnose Native Command Bridge
```

The first invocation may take longer than subsequent calls because the extension creates this local cache:

```text
%LOCALAPPDATA%\LabWindowsCviProjectManager\NativeBridge\CviDdeBridge.0.6.18.dll
```

Open the `LabWindows/CVI` output channel. Confirm that it reports either:

```text
[CVI]   DDE helper cache: ...CviDdeBridge.0.6.18.dll · compiled now
```

or:

```text
[CVI]   DDE helper cache: ...CviDdeBridge.0.6.18.dll · loaded from cache
```

### Successful DDE result

At least one mode reports:

```text
[CVI]   DDE attempt ansi: connected
```

or:

```text
[CVI]   DDE attempt unicode: connected
```

The decoded native CVI state must follow.

### Failure result to capture

If DDE still fails, copy the complete `LabWindows/CVI` output channel. Version 0.6.18 should return structured DDE attempts rather than a host-process timeout. Capture the ANSI and Unicode attempt lines, the helper-cache line and the targeted ActiveX discovery lines.

## Cache reuse

Run the diagnostic a second time. The helper-cache line should normally change from `compiled now` to `loaded from cache`.

## Preserved breakpoint behavior

1. Place one standard enabled VS Code breakpoint in a `.c` file of the active project.
2. Run `LabWindows/CVI: Synchronize VS Code Breakpoints to Native Workspace`.
3. Confirm that the breakpoint appears in CVI.
4. Confirm that native CVI breakpoints and tracepoints are preserved.
5. Confirm that `.vscode/cvi-native-backups` receives a timestamped `.cws` backup.
