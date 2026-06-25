# Validation report — LabWindows/CVI Project Manager 0.6.18

## Scope

Version 0.6.18 addresses the timeout observed on the Windows CVI workstation with version 0.6.17. The DDE script and the ActiveX diagnostic were terminated by the Node.js child-process timeout before either script emitted JSON.

The DDE script embeds a C# P/Invoke client. In previous releases, Windows PowerShell compiled that source through `Add-Type` for every invocation. The ActiveX discovery script also enumerated a broad CLSID set through the PowerShell registry provider. These startup costs were mixed with the actual CVI command timeout.

## Corrections

- Keep the native CVI DDE transaction timeout under `labwindowsCvi.nativeCommandTimeoutMs` (default: `3000 ms`).
- Add `labwindowsCvi.nativeBridgeProcessTimeoutMs` (default: `90000 ms`) for the PowerShell host process.
- Compile the C# DDE helper once and cache it in `%LOCALAPPDATA%\LabWindowsCviProjectManager\NativeBridge\CviDdeBridge.0.6.18.dll`.
- Load the cached DLL through `Add-Type -LiteralPath` on subsequent invocations.
- Report cache path, compile/load mode and cache warnings in the output channel.
- Replace broad registry traversal with a targeted .NET registry scan of plausible CVI ProgIDs and `cvi.exe` App Paths in `Registry64` and `Registry32` views.
- Add `labwindowsCvi.activeXDiscoveryTimeoutMs` (default: `10000 ms`).

## Automated checks

| Check | Result |
|---|---|
| Manifest version `0.6.18` | OK |
| TypeScript compilation | OK |
| VSIX packaging | OK |
| ZIP integrity | OK |
| Cached DDE helper path versioned for `0.6.18` | OK |
| First-run helper compilation uses `-OutputAssembly` and `-PassThru` | OK |
| Subsequent helper loading uses `Add-Type -LiteralPath` | OK |
| PowerShell host timeout separated from CVI transaction timeout | OK |
| Targeted ActiveX scan uses .NET `RegistryKey` API | OK |
| ActiveX scan covers `Registry64` and `Registry32` | OK |
| ActiveX scan checks `cvi.exe` App Paths | OK |
| Eight native-command contributions and registrations | OK |
| Breakpoint bridge command regression | OK |
| Conservative breakpoint serialization regression | OK |
| Uploaded CVI breakpoint fixture regression | OK |
| Workspace scaffold regression | OK |
| Generated JavaScript syntax check | OK |

## Runtime boundary

The packaging environment is Linux and cannot execute Windows DDEML or the Windows registry API. Install the VSIX on the CVI workstation and run the manual diagnostic. The first native diagnostic can take longer than later calls because it creates the local managed-helper cache.
