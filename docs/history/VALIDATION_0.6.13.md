# LabWindows/CVI Project Manager 0.6.13 — Validation

## Scope

This release fixes settings persistence for projects created or added directly from VS Code. Version 0.6.12 appended the `.prj` reference to the workspace header but did not initialize the corresponding CVI-native per-project blocks in the `.cws` file.

## Reproduced failure

The supplied `Testing.cws` declares three projects but initially contains native workspace blocks only for project `0001`. Saving settings for project `0003` therefore failed with:

```text
Refusing to update CVI run settings: [Default Build Config 0003 Debug] is missing.
Open and save the workspace once in CVI, then retry.
```

## Implemented correction

When a project is added to a workspace, the extension now initializes the native CVI blocks for that project:

```text
[Project Header NNNN]
[Default Build Config NNNN Debug]
[Default Build Config NNNN Release]
[Default Build Config NNNN Debug64]
[Default Build Config NNNN Release64]
[Build Dependencies NNNN]       CVI 2020+ workspace formats
[Build Options NNNN]
[Execution Target NNNN]
[SCC Options NNNN]
[DLL Debugging Support NNNN]
[Command Line Args NNNN]
```

The compatibility-repair command adds missing blocks to workspaces produced by earlier extension versions. Saving run settings also initializes the missing blocks for the selected project before writing the requested values.

## Automated checks

| Check | Result |
|---|---:|
| TypeScript compilation | OK |
| Supplied `Testing.cws` failure reproduced | OK |
| Missing blocks detected for projects `0002` and `0003` | OK |
| Project `0003` auto-initialized during run-settings save | OK |
| Existing project `0001` values preserved | OK |
| Project `0002` initialized by compatibility repair | OK |
| New project `0004` initialized immediately when added | OK |
| First project initialized in a newly generated workspace | OK |
| Timestamped native `.cws` backups preserved | OK |
| Compatibility issues after repair | 0 |
| VSIX packaging | OK |
| VSIX ZIP integrity | OK |

## Windows verification still required

Install the VSIX, run the workspace repair once on the supplied test workspace, save project settings for the added project and open the resulting `.cws` in native LabWindows/CVI. This confirms CVI-side acceptance and optional metadata normalization.
