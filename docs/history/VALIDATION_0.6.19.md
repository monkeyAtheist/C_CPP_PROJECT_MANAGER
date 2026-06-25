# Validation report — LabWindows/CVI Project Manager 0.6.19

## Trigger

The CVI 2020 registry diagnostic exposed the 32-bit out-of-process automation server:

```text
ProgID        = CVI.Application
CLSID         = {5AB151E3-414A-11D0-A62C-0020AF16F78E}
LocalServer32 = c:\program files (x86)\national instruments\cvi2020\cvi.exe /Automation
```

Both historical DDE variants (`ansi` and `unicode`) returned `DMLERR_NO_CONV_ESTABLISHED`. The primary native-command transport has therefore been moved to ActiveX.

## Implemented transport

```text
VS Code native command
  -> native/cvi-activex-command.ps1
  -> attach active CVI object through ROT when available
  -> otherwise create or attach CVI.Application when explicitly permitted
  -> invoke CVI automation method
  -> historical DDE bridge only if ActiveX fails
```

Mapped methods:

```text
Get CVI State       -> GetCVIState
Build Project       -> BuildProject
Run Project         -> RunProject(0)
Suspend Execution   -> SuspendExecution
Continue Execution  -> ContinueExecution
Terminate Execution -> TerminateExecution(0)
```

## Static validation

- Manifest version: `0.6.19`
- TypeScript compilation: OK
- VSIX packaging: OK
- ZIP integrity: OK
- ActiveX command script packaged: OK
- DDE compatibility fallback preserved: OK
- Registry diagnostic preserved: OK
- Eight native commands declared and registered: OK
- New `labwindowsCvi.nativeActiveXProcessTimeoutMs` setting: OK
- Conservative breakpoint synchronization regression: OK
- Native workspace scaffold regression: OK

## Platform validation still required

The COM invocation must be tested on Windows with the installed CVI 2020 automation server. The expected first diagnostic transport is `activex`, with ProgID `CVI.Application` and method `GetCVIState`.
