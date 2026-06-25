# Validation — LabWindows/CVI Project Manager 0.6.30

## Scope

This release is based on the proven native DDE path from 0.6.24. It removes the experimental VS Code DAP adapter and adds a local `compile.exe` build-and-link preflight before CVI is opened for native debugging.

## Expected runtime workflow

1. Build active project locally with `compile.exe`.
2. Abort native debugger launch if build or link fails.
3. Synchronize VS Code source breakpoints to the native `.cws` workspace.
4. Open CVI only after a successful preflight build.
5. Use the stable persistent DDE session for Run, Pause, Continue and Stop.
6. Detect natural completion conservatively with independent DDE state probes.
