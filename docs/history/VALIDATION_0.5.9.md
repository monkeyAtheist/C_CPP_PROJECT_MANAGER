# LabWindows/CVI Project Manager 0.5.9 — Validation

## Scope

This pass moves the persistent toolbar out of the collapsible `CVI Actions` webview and into the `CVI Workspace` title bar. It also separates direct Build + Run from advanced run choices and restores compact textual mode and target labels.

## Static verification

| Check | Result |
|---|---|
| Extension version | `0.5.9` |
| TypeScript compilation | OK |
| Generated JavaScript syntax | OK |
| VSIX packaging | OK |
| `CVI Workspace` view ordered before `CVI Actions` | OK |
| Workspace title toolbar used instead of Quick Actions title toolbar | OK |
| Duplicate Open Workspace in CVI toolbar item removed | OK |
| Direct Build + Run toolbar action | OK |
| Run Options picker | OK |
| Run without build option | OK |
| Native CVI debug option | OK |
| Build mode labels `D32`, `R32`, `D64`, `R64` | OK |
| Target labels `EXE`, `DLL`, `LIB` | OK |
| Dynamic context keys for build mode and target type | OK |
| Home page Build + Run and Run Options actions | OK |

## Notes

The toolbar is attached to the native `CVI Workspace` view title. It remains available when the `CVI Actions` dashboard is collapsed. If the `CVI Workspace` view itself is collapsed, VS Code may hide some title actions or move them into the view overflow menu depending on the available sidebar width.
