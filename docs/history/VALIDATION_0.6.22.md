# Validation report — LabWindows/CVI Project Manager 0.6.22

## Scope

Version `0.6.22` adds a native VS Code `CVI Debug` dashboard and a dynamic native-debug status-bar indicator on top of the persistent DDE session validated in `0.6.21`.

## Static validation

| Check | Result |
|---|---|
| Manifest version is `0.6.22` | OK |
| TypeScript compilation | OK |
| Native `labwindowsCvi.debugControls` tree view contribution | OK |
| `onView:labwindowsCvi.debugControls` activation | OK |
| `CviDebugView` tree provider | OK |
| No WebviewView dependency in the dashboard | OK |
| Snapshot event publication from `CviNativeCommandService` | OK |
| Bridge availability, session, execution, project, linked state, transport, state source, last command and last result rows | OK |
| Build / Run / Pause / Continue / Stop actions | OK |
| Refresh and Diagnose actions | OK |
| Dynamic `CVI:off`, `CVI:idle`, `CVI:run`, `CVI:pause` status-bar indicator | OK |
| Persistent DDE-session implementation retained | OK |
| VSIX package integrity | OK |

## Runtime validation still required on Windows

The visual transitions must be confirmed against LabWindows/CVI 2020:

```text
CVI:off -> CVI:idle -> CVI:run -> CVI:pause -> CVI:run -> CVI:idle
```

The underlying persistent DDE commands were validated by the user in version `0.6.21`; this pass adds presentation and event propagation around that working transport.
