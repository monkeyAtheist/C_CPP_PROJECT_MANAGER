# Validation report — LabWindows/CVI Project Manager 0.6.20

## Trigger

Windows testing confirmed that the historical DDE path connects successfully once CVI is open:

```text
[CVI] dde Get CVI State -> 0 0 0 0 0 0
[CVI]   DDE attempt ansi: connected
```

The ActiveX bridge can time out and COM activation can open a second empty CVI workspace. Continue and Stop were also being sent while the project was idle, producing opaque negative values such as `-2147221494` and `-2147221493`.

## Implemented behavior

```text
VS Code native command
  -> DDE cvi/system/status by default
  -> explicit cvi.exe <workspace.cws> launch when the server is absent
  -> DDE-only readiness polling
  -> ActiveX only in optional compatibility modes
```

State-sensitive guards now block invalid operations before sending them to CVI:

```text
Build     blocked while execution is active
Run       blocked while execution is already active or suspended
Pause     sent only while running
Continue  sent only while suspended
Stop      sent only while running or suspended
```

ActiveX HRESULT-like values in the `0x800400xx` range are normalized to the corresponding CVI error index before display.

## Static validation

- Manifest version: `0.6.20`
- TypeScript compilation: OK
- VSIX packaging: OK
- ZIP integrity: OK
- Default transport `dde`: OK
- Optional modes `auto` and `activex`: OK
- ActiveX auto-start disabled by default: OK
- DDE-only startup polling: OK
- State guards for Build / Run / Pause / Continue / Stop: OK
- HRESULT normalization: OK
- DDE helper cache preserved: OK
- ActiveX compatibility scripts preserved: OK
- Conservative breakpoint synchronization regression: OK
- Native workspace scaffold regression: OK

## Platform validation still required

Install the VSIX on Windows with CVI 2020 and confirm that Build opens only one native workspace instance and that valid Pause / Continue / Stop transitions behave as expected.
