# Validation report — LabWindows/CVI Project Manager 0.6.24

## Scope

Version `0.6.24` introduces a phase-one VS Code Debug Adapter Protocol facade over the validated native CVI persistent DDE bridge.

## Implemented controls

```text
VS Code DAP launch -> native CVI backend start -> persistent DDE session -> Run Project
VS Code pause      -> Suspend Execution
VS Code continue   -> Continue Execution
VS Code terminate  -> Terminate Execution
```

## Safety properties

- The CVI IDE remains the real native debugger engine.
- VS Code does not fabricate stack frames, scopes, variables, watches, or stepping results.
- Existing conservative breakpoint synchronization remains active before native launch.
- Native backend startup is minimized by default for VS Code-owned sessions.
- State polling uses the already-established persistent session and is non-destructive on timeout.
- The legacy direct CVI-window workflow remains available.

## Local automated validation

- TypeScript compilation: OK.
- VSIX packaging and ZIP integrity: OK.
- Inline DAP adapter registration: OK.
- Debugger contribution `labwindows-cvi-native`: OK.
- Command `labwindowsCvi.startVsCodeDebugging`: OK.
- Persistent DDE control routing: OK by static verification.
- Background-launch helper packaging: OK.
- Window-minimization helper packaging: OK.
- Historical breakpoint serialization regression: OK.
- Historical workspace-scaffold regression: OK.

## Windows validation still required

The real VS Code toolbar interaction, minimized CVI startup, and optional asynchronous breakpoint-state polling must be tested on a Windows host with CVI 2020 installed.
