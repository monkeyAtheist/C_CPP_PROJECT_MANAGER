# LabWindows/CVI Project Manager 0.5.6 — validation report

## Scope

Version 0.5.6 adds a compact persistent **CVI Actions** strip and synchronizes the verified CVI-native build-setting formats found in the supplied CVI project sample.

## Verified native CVI persistence

The supplied project stores build steps in the `.prj` file with the following native sections:

```ini
[Debug Custom Build Actions]
Build Action1 = "Custom build actions"

[Debug Pre-build Actions]
Build Action1 = "Pre build actions"

[Debug Post-build Actions]
Build Action1 = "Post build actions"
```

The supplied workspace stores launch configuration fields per project and per build mode in the `.cws` file:

```ini
[Default Build Config 0001 Debug]
Command Line Args = "Comment line arguments"
Working Directory = "Working directories"
Environment Options = "Environnement options"
External Process Path = ""
```

The parser now reads and writes these native sections. Native values take precedence over stale extension-side fallback values when both exist.

## Duplicate-execution prevention

CVI generates `preBuild.bat`, `customBuild.bat` and `postBuild.bat` from native project sections. When native sections are present, the extension delegates their execution to `compile.exe` and does not execute them a second time.

## Dependency limitation

The supplied `.cws` file contains:

```ini
[Build Dependencies 0001]
Number of Dependencies = 0
```

This validates the empty native structure only. The extension continues to store and apply its dependency graph under `.vscode/labwindows-cvi-build.json` until a sample workspace containing at least two projects and one enabled dependency is available for exact native-format validation.

## Toolbar behavior

VS Code does not expose a standard contribution point for arbitrary buttons directly inside the outer View Container header. Version 0.5.6 therefore contributes a first, compact, always-expanded-by-default webview named **CVI Actions** above **CVI Workspace**. Its buttons remain visible without hovering a tree row.

The strip exposes:

- Home;
- open workspace or project;
- open current workspace in CVI;
- build / rebuild / clean picker;
- run;
- debug in CVI;
- build-mode selector;
- target-type selector;
- project build settings;
- refresh.

## Automated checks

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| Generated JavaScript syntax | OK |
| Quick Actions view contribution | OK |
| Quick Actions view initially visible | OK |
| Hover-only workspace title actions removed | OK |
| Native `.prj` Debug actions parsed | OK |
| Native `.prj` Release actions written and re-read | OK |
| Native `.cws` Debug launch settings parsed | OK |
| Native `.cws` Debug64 launch settings written and re-read | OK |
| Debug launch settings preserved after Debug64 write | OK |
| Native values take precedence over stale fallback values | OK |

## Environment boundary

The automated validation was executed outside Windows and without a LabWindows/CVI installation. The generated VSIX, parser behavior and static runtime routes were validated. A final manual test with CVI remains required for graphical rendering and an actual `compile.exe` build.
