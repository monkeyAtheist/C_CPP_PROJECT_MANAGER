# Validation report — LabWindows/CVI Project Manager 0.6.21

## Scope

Version 0.6.21 fixes native debug controls after `Run Project` has been accepted by CVI. The previous implementation opened a new PowerShell DDE client and sent `Get CVI State` before Pause, Continue, and Stop. On the tested CVI 2020 environment, new state queries stopped responding while the user program was executing.

## Implemented architecture

The extension now starts `native/cvi-dde-command.ps1` in persistent-session mode before `Run Project`. The PowerShell process keeps the DDE conversation alive and accepts JSON-line requests over stdin. Responses are returned as JSON lines over stdout.

The following commands use the existing DDE conversation while the program is active:

```text
Suspend Execution
Continue Execution
Terminate Execution
```

The extension no longer performs a synchronous `Get CVI State` query before those commands. A cached execution state is used for informational diagnostics until the session returns to idle.

## Automated controls

```text
Manifest version                                      0.6.21
TypeScript compilation                                OK
VSIX packaging                                        OK
VSIX ZIP integrity                                    OK
Persistent PowerShell DDE session mode                OK
JSON-line session handshake                           OK
Session opened before Run Project                     OK
Pause routed through retained DDE conversation        OK
Continue routed through retained DDE conversation     OK
Stop routed through retained DDE conversation         OK
Blocking state probes removed from active controls    OK
Cached active-session state                           OK
Extension-disposal cleanup                            OK
Breakpoint synchronization regression                 OK
Native breakpoint preservation regression             OK
Native tracepoint preservation regression              OK
Workspace compatibility migration regression          OK
```

## Remaining Windows validation

The persistent conversation must be verified on a Windows workstation with LabWindows/CVI 2020 installed. The expected output lines are documented in `MANUAL_TEST_CHECKLIST_0.6.21.md`.
