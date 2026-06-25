# LabWindows/CVI Project Manager 0.6.10 — Validation

## Scope

Visual refinement of the DLL target-settings grid.

## Verified layout

| Grid position | Field |
|---|---|
| Row 1, column 1 | `Custom copy directory` |
| Row 1, column 2 | `Where to copy DLL` |
| Row 2, column 1 | `Import library base name` |
| Row 2, column 2 | `Export mode` |

## Regression checks

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| VSIX packaging | OK |
| VSIX ZIP integrity | OK |
| Custom-directory conditional enablement preserved | OK |
| Default import-library name conditional enablement preserved | OK |
| Export-header conditional enablement preserved | OK |
| Native CVI persistence code unchanged | OK |
