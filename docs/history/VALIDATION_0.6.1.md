# LabWindows/CVI Project Manager 0.6.1 — Native workspace write safety validation

## Scope

This release prevents the extension from corrupting LabWindows/CVI `.cws` files while saving command-line and DLL-debugging settings.

## Verified changes

- Run settings are written only to the native per-configuration section:
  - `[Default Build Config NNNN Debug]`
  - `[Default Build Config NNNN Release]`
  - `[Default Build Config NNNN Debug64]`
  - `[Default Build Config NNNN Release64]`
- The extension no longer mirrors values into the legacy compatibility sections:
  - `[Command Line Args NNNN]`
  - `[DLL Debugging Support NNNN]`
- Absolute Windows runtime paths are converted back to CVI storage notation before persistence:
  - `C:\\tools\\runner.exe` → `/c/tools/runner.exe`
  - `D:\\runtime\\folder` → `/d/runtime/folder`
- Runtime conversion to Windows paths remains in-memory only when launching an executable.
- Every `.cws` or `.prj` overwrite creates a timestamped backup in `.vscode/cvi-native-backups`.
- Generated native documents are validated before overwrite. A `.cws` without `[Workspace Header]` or a `.prj` without `[Project Header]` is rejected.
- A new command repairs workspaces affected by previous extension versions:
  - `LabWindows/CVI: Repair Native Workspace Compatibility`

## Regression fixture

The automated test uses the supplied `MCO_MSR/MSR_TEST.cws` fixture containing the previously observed pollution:

- `c:/...` path representation written into CVI-native fields;
- duplicated `External Process Path` in `[DLL Debugging Support 0001]`;
- unexpected `External Process Path` in `[Command Line Args 0001]`;
- duplicated generic command-line arguments.

## Automated result

`node scripts/test-native-workspace-safety-061.js`

Result: `OK`

The full JSON output is stored in `NATIVE_WORKSPACE_SAFETY_0.6.1_VALIDATION.json`.

## Environment limitation

The Linux generation environment cannot launch LabWindows/CVI. A final opening test must still be performed on Windows with CVI after installation.
