# Validation — C/C++ Project Manager and Build 0.2.8

## Scope

This version audits and cleans the remaining LabWindows/CVI build-settings inheritance in the generic C/C++ extension.

## Changes validated

- The extension manifest version is `0.2.8` and the marketplace identifier remains `c-cpp-project-manager-and-build`.
- Obsolete user-facing configuration entries were removed from `package.json`:
  - `labwindowsCvi.customBuildConfiguration`
  - `labwindowsCvi.extraCompilerArguments`
  - `labwindowsCvi.uirTemplateVersion`
  - `labwindowsCvi.useCppToolsConfigurationProvider`
- Kept active settings are now limited to the generic C/C++ workflow: toolchain paths, build mode, compiler/linker flags, standards, include/library paths, IntelliSense options, snippets/completion and status-bar options.
- The build-settings webview title and content now use `C/C++ Project Build Settings`.
- CVI-only build-setting blocks are no longer displayed:
  - run-time engine support/binding
  - generated source help
  - embedded project UIRs
  - LoadExternalModule controls
  - NI type information
  - CVI version-resource editor
  - signing block inherited from CVI
- A generic toolchain section was added to the build-settings page:
  - C compiler
  - C++ compiler/linker
  - archiver
  - debugger
  - output directory
  - C/C++ standard
  - optional `-m32`/`-m64` build-mode flags
- A generic compiler/linker flags section was added:
  - defines
  - include paths
  - library paths
  - libraries
  - common/C/C++ compiler flags
  - linker flags
- Project build metadata now writes to `.vscode/cpm-build.json`.
- Legacy `.vscode/labwindows-cvi-build.json` is still read as a migration fallback.
- Historical validation, regression and manual-test documents were moved to `docs/history/`.
- Root documentation now keeps only active files: `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, `TEMPLATES_AND_SNIPPETS.md`.

## Commands executed

```powershell
npm ci --ignore-scripts
npm run compile
npm run package
```

## Results

- TypeScript compilation: OK
- VSIX packaging: OK
- VSIX generated: `c-cpp-project-manager-and-build-0.2.8.vsix`
- Historical documentation folder present: OK
- Root Markdown cleanup: OK
- Build-settings webview no longer contains the visible obsolete CVI build sections listed above: OK

## Known compatibility note

The internal TypeScript class names and configuration namespace still use the historical `cvi` / `labwindowsCvi` identifiers. This is deliberate to avoid breaking existing workspace migration logic and previously saved settings. The user-facing workflow, titles and settings descriptions are generic C/C++.
