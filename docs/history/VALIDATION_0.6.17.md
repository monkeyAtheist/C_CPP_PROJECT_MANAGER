# Validation report — LabWindows/CVI Project Manager 0.6.17

## Scope

Version 0.6.17 corrects a PowerShell invocation defect exposed by the Windows workstation diagnostic from version 0.6.16. Commands such as `Get CVI State` do not require a CVI argument, but the extension forwarded `-Argument` followed by an empty argv entry. Windows command-line normalization can discard that entry before `powershell.exe` binds the script parameters, causing the script to terminate before emitting structured JSON.

The same diagnostic also showed that the ActiveX discovery script could fail before its JSON result was visible. The TypeScript layer previously retained only the generic child-process message.

## Corrections

- Omit `-Argument` entirely when the CVI command does not require one.
- Keep `-Argument <value>` for commands that require a value.
- Guard UTF-8 output initialization in both embedded PowerShell scripts.
- Construct the C# DDE client explicitly through `New-Object -TypeName ... -ArgumentList ...`.
- Preserve early PowerShell `stderr`, `stdout`, exit code, signal and timeout details.
- Increase ActiveX registry-discovery timeout from 10 seconds to 30 seconds.
- Reduce redundant registry scanning while retaining merged HKCR registrations and the explicit 32-bit machine view.
- Log ActiveX scanned roots and non-fatal warnings.

## Automated checks

| Check | Result |
|---|---|
| Manifest version `0.6.17` | OK |
| TypeScript compilation | OK |
| VSIX packaging | OK |
| ZIP integrity | OK |
| Conditional forwarding of optional `-Argument` | OK |
| No unconditional empty `-Argument` sequence remains | OK |
| Early PowerShell stderr/stdout/exit/timeout preservation | OK |
| Guarded UTF-8 output initialization in both scripts | OK |
| Explicit DDE-client constructor invocation | OK |
| ANSI-first and Unicode-fallback DDE compatibility | OK |
| CVI DDE contract `cvi` / `system` / `status` | OK |
| ActiveX discovery timeout increased to 30 seconds | OK |
| ActiveX scanned-root and warning diagnostics | OK |
| Eight native-command contributions and registrations | OK |
| 0.6.14 breakpoint serialization regression | OK |
| Uploaded CVI breakpoint fixture regression | OK |
| 0.6.13 workspace scaffold regression | OK |
| Generated JavaScript syntax check | OK |

## Runtime boundary

The packaging environment is Linux and cannot execute the Windows DDEML or registry paths. Install the VSIX on the CVI workstation and run the manual diagnostic. Version 0.6.17 is designed to distinguish a PowerShell startup failure from a genuine DDE conversation failure.
