# CPM 0.2.64 — Build settings UI audit

## Scope

This audit covers the CPM project build-settings webview and the controls exposed by `src/views/buildSettingsPanel.ts`.

## Navigation model

The former single long settings page is now split into thematic pages:

- Overview
- Project
- Toolchain
- Build
- Run & Debug
- SDL
- Dependencies
- Diagnostics

Each page has a local `Jump to a section...` selector and a local filter field. The active page is preserved through the VS Code webview state so switching between build scopes does not force the user back into the global scroll flow.

## Section mapping

| Page | Sections | Purpose |
| --- | --- | --- |
| Overview | Control center | Shortcuts for build/run/toolchain/SDL/diagnostics actions. |
| Project | Target and output; Settings storage | Target kind, output path and settings persistence model. |
| Toolchain | Compilers and predefined options; Runtime dependencies | Compiler paths, architecture, standards and runtime deployment. |
| Build | Compiler and linker inputs; Build steps | Defines, include paths, library paths, libraries, compiler flags, linker flags and pre/custom/post build actions. |
| Run & Debug | Run and debug command line | Arguments, working directory, environment and external host executable for DLL debugging. |
| SDL | SDL integration | SDL2/SDL3 SDK, packages, runtime handling and Windows subsystem. |
| Dependencies | Project dependencies and build order | Project build-order dependencies. |
| Diagnostics | Build logs and Problems | Log detail level plus shortcuts to Problems and Build Trace. |

## Naming cleanup

The previous generic `Advanced compiler and linker flags` block is now explicitly split into `Preprocessor and includes`, `Linkage` and `Compiler flags`. This prevents linker inputs from being visually interpreted as debug-specific options.

The settings editor title is now `C/C++ Project Settings`, while the command name remains compatible with the previous `Project Build Settings...` entry.

## Audit results

- No duplicated HTML input IDs were introduced.
- Existing browse-field IDs remain mapped by the backend browser handler.
- Existing save/import/export payload keys are preserved.
- Existing target-type conditional classes are preserved.
- Existing detached-workspace settings fallback remains unchanged.
- `cpm.buildLogDetail` is now editable from the Diagnostics page.

## Compatibility notes

The refactor is intentionally presentation-oriented. It does not change the build schema, `.prj` target writing, `.vscode/cpm-build.json` format, SDL build handling or runtime DLL handling.
