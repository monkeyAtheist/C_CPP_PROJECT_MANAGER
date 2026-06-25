# LabWindows/CVI Project Manager 0.6.9 — Validation

## Scope

This release aligns the DLL target-settings webview with the native CVI enablement rules.

## Implemented changes

- Exported-header checkboxes are dimmed and disabled when `DLL Exports` is `Symbols Marked As Export`.
- `Import library base name` is dimmed and disabled while `Use default import library base name` is checked.
- `Custom copy directory` is dimmed and disabled unless `Where to copy DLL` is `Custom directory`.
- `Manifest file` is dimmed and disabled unless `Embed manifest` is checked.
- IVI and VXIplug&play import-library choices are edited in a dedicated CVI-like dialog opened by `Import library choices…`.
- Existing stored values are preserved while the corresponding controls are disabled.

## Automated checks

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| JavaScript syntax | OK |
| Webview script parsing | OK |
| Manifest version | `0.6.9` |
| Manifest conditional enablement | OK |
| Default import-library-name conditional enablement | OK |
| Custom DLL-copy-directory conditional enablement | OK |
| DLL export-header conditional enablement | OK |
| Import-library choices dialog | OK |
| IVI / VXIplug&play persisted controls | OK |
| VSIX packaging | OK |

## Remaining manual check

A Windows installation of LabWindows/CVI is still required to reopen the native **Target Settings** and **DLL Export Options** dialogs after saving a test project.
