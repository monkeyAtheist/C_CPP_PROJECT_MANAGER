# Validation — LabWindows/CVI Project Manager v0.6.31

## Scope

Version 0.6.31 is based on the stable native branch and keeps the v0.6.30 local `compile.exe` preflight before opening the native CVI debugger.

## Changes validated

- Renamed native debug actions to short labels: `Build & Run Debug`, `Pause`, `Continue`, `Stop`.
- `Build Debug and Open Native Debugger` now routes to the same implementation as `Build & Run Debug`.
- Removed the standalone `Build locally with compile.exe` action from the `CVI Debug` view because the main build command already covers that workflow.
- Exposed `Continue` while a persistent native debug session is active, including the cached `running` state, so it can be used to resume from a CVI breakpoint and move to the next breakpoint.
- Increased native DDE timing defaults:
  - command timeout: 10000 ms;
  - IDE startup timeout: 25000 ms;
  - persistent DDE session startup timeout: 30000 ms;
  - host PowerShell bridge timeout: 120000 ms.
- Added `labwindowsCvi.nativePostIdeStartDelayMs`, default 2000 ms, to wait briefly after an automatic CVI IDE launch before sending the debug command.

## Automated checks

```text
Compilation TypeScript                                  OK
Package manifest JSON                                   OK
DAP contribution remains removed                        OK
compile.exe preflight before native debug               OK
Build & Run Debug routing                               OK
Short CVI Debug action labels                           OK
Continue visible during native session                  OK
Standalone build action removed from CVI Debug view     OK
Timeout defaults increased                              OK
Post IDE startup delay setting present                  OK
Breakpoint mirror regression                            OK
Workspace compatibility scaffold regression             OK
```

## Limitations

The real DDE exchange with LabWindows/CVI 2020 and `compile.exe` cannot be executed in the Linux packaging environment. Final validation must be performed on the Windows CVI workstation.
