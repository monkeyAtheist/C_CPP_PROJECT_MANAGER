# CPM 0.2.82 - Run Debug icon unification

## Scope

This release is a focused UI consistency update requested after CPM 0.2.81.

The **Run Debug** action now uses the same VS Code codicon as **Build and debug**: `$(debug-alt)`.

Updated visible surfaces:

- C/C++ Workspace toolbar command `cpm.runDebug`.
- Project-level `cpm.runDebugProject` command.
- Run Options quick pick entry for Run Debug without build.
- C/C++ Quick Actions view.
- CPM status-bar Run Debug shortcut.

The build/debug behavior is unchanged. `Run Debug` still starts the existing binary without rebuilding, while `Build & Debug` still compiles first.

## Validation

- `package.json`: both Run Debug commands use `$(debug-alt)`.
- TypeScript sources: no local Run Debug entry uses `$(debug-start)`.
- Published JavaScript: same icon mapping verified after VSIX packaging.
- `node --check` passes on the three changed runtime JavaScript modules.
- Dedicated regression test `scripts/test-cpm-debug-icon-0282.js`: PASS.
- Extracted VSIX manifest/version/runtime verification: PASS.
- Windows setup bootstrapper rebuilt as `CPM-Setup-0.2.82.exe` and verified as a PE32+ x86-64 GUI executable embedding the 0.2.82 VSIX.

## Note on TypeScript compilation

A clean `npm ci` could not complete in the execution environment before timeout, leaving incomplete type-definition directories. Because this change only alters icon identifiers/string literals and package contribution metadata, the already-compiled 0.2.81 runtime was patched with the corresponding literal changes and syntax-checked. No executable control flow or TypeScript type surface changed.
