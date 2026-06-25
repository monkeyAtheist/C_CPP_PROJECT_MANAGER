# LabWindows/CVI Project Manager 0.6.23 — validation report

## Scope

This release refines the persistent native DDE debug session validated in 0.6.21 and the CVI Debug dashboard introduced in 0.6.22.

## Implemented changes

- silent startup polling for transient DDE failures such as `DMLERR_BUSY`;
- explicit persistent-session handshake log;
- strict action-command acceptance rule: status `0` only;
- conservative decoding of unexpected positive statuses;
- no cached-state transition after rejected controls;
- visually disabled contextual actions in the native CVI Debug tree view;
- asynchronous-breakpoint-safe availability for Continue and Stop.

## Static validation

- TypeScript compilation: PASS
- VSIX packaging: PASS
- VSIX ZIP integrity: PASS
- Silent DDE startup polling: PASS
- Explicit DDE session handshake log: PASS
- Strict non-zero status rejection: PASS
- Positive-status CVI error hint: PASS
- Contextual CVI Debug actions: PASS
- Disabled action rows remain visible: PASS
- No webview added to CVI Debug: PASS
- Persistent DDE session preserved: PASS

## Regression validation

- conservative VS Code breakpoint synchronization: PASS
- preservation of CVI-native breakpoints: PASS
- preservation of CVI-native tracepoints: PASS
- native workspace migration for projects created before 0.6.13: PASS

## Manual Windows validation still required

Install the VSIX on the CVI 2020 workstation and validate:

1. automatic CVI startup no longer prints transient `DMLERR_BUSY` rows during normal Build or Run;
2. the persistent-session log displays an explicit handshake line;
3. a rejected `Suspend Execution` status such as `12` is surfaced as a rejection and does not update the dashboard to `paused`;
4. contextual rows in the CVI Debug view are visibly unavailable when incompatible;
5. valid Run, Continue, Pause and Stop transitions remain operational.
