# LabWindows/CVI Project Manager 0.5.8 — validation

## Scope

This release fixes CVI-style runtime paths for DLL host executables, moves the CVI Actions commands to the persistent view-title toolbar, adds supplemental C/C++ completions, and introduces a source-file function navigator.

## Automated checks

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| Generated JavaScript syntax | OK |
| CVI runtime path `/c/PROG_CVI/EXE/Test.exe` → `C:\PROG_CVI\EXE\Test.exe` | OK |
| Cygwin-style path `/cygdrive/d/tools/app.exe` → `D:\tools\app.exe` | OK |
| Persistent CVI Actions toolbar contributed through `view/title` | OK |
| Persistent toolbar commands | 10 |
| `CVI File Symbols` view | OK |
| Source function scanner | OK |
| Embedded CVI API completion symbols | 1971 |
| Supplemental completion provider enabled by default | OK |
| VSIX package generation | OK |

## Notes

The generated completions complement Microsoft C/C++ IntelliSense. They do not replace header resolution or semantic analysis. The file-symbol view first asks VS Code for document symbols, then falls back to a lightweight C scanner when no language-server symbols are available.

The runtime path normalizer is deliberately applied only when executing a target or resolving its configured working directory. Native `.cws` values are preserved unchanged so that the same workspace remains compatible with LabWindows/CVI.
