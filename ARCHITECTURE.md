# Architecture notes — C/C++ Project Manager and Build

## Main components

- `src/model/iniDocument.ts`: INI-like parser and serializer used by the `.cws` and `.prj` workspace/project files.
- `src/model/cpmParser.ts`: compatibility parser for the existing `.cws/.prj` format. The class name is inherited, but it is used as the generic CPM project-file backend.
- `src/services/cpmWorkspaceService.ts`: workspace lifecycle, active-project selection and project-tree file operations.
- `src/services/cpmInstallationService.ts`: generic C/C++ toolchain discovery for GCC, MinGW, MSYS2, LLVM/Clang and manually added compiler roots.
- `src/services/cpmBuildService.ts`: generic build pipeline based on `gcc`, `g++`, `ar` and `gdb`; handles build, rebuild, clean, run and VS Code `cppdbg` launch.
- `src/services/cpmProjectSettingsService.ts`: project build actions, run options and build-order dependencies. Current files are stored in `.vscode/cpm-build.json`; legacy `.vscode/labwindows-cvi-build.json` is still readable for migration.
- `src/services/cpmCppToolsService.ts`: optional Microsoft C/C++ IntelliSense synchronization and lightweight toolchain include-path discovery.
- `src/services/cpmTemplateService.ts`: C/C++ starter files, snippets, DLL helpers, error/logging modules and MY_Util bundle integration.
- `src/services/cpmLibraryPackService.ts`: embedded JC Lib / CPM library-pack seeding and migration.
- `src/providers/cpmTreeProvider.ts`: native VS Code tree views for workspaces, actions, file symbols and libraries.
- `src/jcLibEmbedded.ts`: embedded library explorer and structured prototype/snippet UI.
- `src/views/homePanel.ts`: global workspace and toolchain dashboard.
- `src/views/buildSettingsPanel.ts`: generic CPM build-settings editor.

The public command and configuration namespace is `cpm.*`. A small compatibility migration shim reads old settings only once and rewrites them to the CPM namespace.

## View layout

```text
C/C++ PM activity-bar container
├── C/C++ Workspace
├── C/C++ Actions
├── C/C++ File Symbols
└── C/C++ Libraries
```

## Workspace/project model

The extension keeps the existing `.cws/.prj` model because it already supports a workspace containing multiple projects, project-local source/header/library references, target type and output path. Unknown sections and keys are preserved when the files are rewritten.

Adding a file appends a new project file section and records its path. Removing or excluding a file updates the project reference only; disk files are not deleted unless a command explicitly renames or replaces them.

## Build pipeline

```text
Build / Rebuild / Clean
  -> resolve active project and dependency order
  -> run pre-build actions
  -> compile C sources with gcc or configured C compiler
  -> compile C++ sources with g++ or configured C++ compiler
  -> link executable / shared library with g++
  -> archive static library with ar
  -> run post-build actions
```

Compiler options are read from the `cpm.*` settings namespace:

```text
cCompilerPath, cppCompilerPath, archiverPath, debuggerPath
cStandard, cppStandard, defineSymbols
includePaths, libraryPaths, libraries
compilerFlags, cCompilerFlags, cppCompilerFlags, linkerFlags
useBuildModeArchitectureFlags
```

These settings can be edited from the CPM build-settings page. Per-project run arguments, working directory, environment and custom build steps are stored in `.vscode/cpm-build.json`.

## Debug pipeline

```text
Build & Debug
  -> force or keep a debug build mode
  -> build the active executable
  -> start a VS Code cppdbg session
  -> use configured gdb as miDebuggerPath
```

The historical native IDE bridge is no longer part of the C/C++ workflow. Build, run and debug are handled by the generic GCC/MinGW/Clang/GDB pipeline.

## IntelliSense

The extension can optionally generate or synchronize `.vscode/c_cpp_properties.json`. Automatic synchronization is disabled by default to avoid wide workspace indexing and slow startup. Manual commands remain available for explicit synchronization.

The standard Microsoft C/C++ extension remains the primary IntelliSense engine. CPM only adds a lightweight standard-library completion helper when a known header is missing, and suppresses its helper suggestions once the matching header is already included.

## Templates and snippets

Template generation supports:

```text
main.c / main.cpp
headers and classes
Windows DLL starter
error/logging module with .ini configuration
MY_Util module bundles
custom user templates and snippets
```

Template placeholders include:

```text
{{baseName}} {{fileName}} {{headerFile}} {{guard}}
{{prefix}}   {{date}}     {{year}}
```

## Documentation layout

Active documentation remains at the repository root:

```text
README.md
CHANGELOG.md
ARCHITECTURE.md
TEMPLATES_AND_SNIPPETS.md
```

Historical validation reports, manual test checklists and migration artifacts are stored under:

```text
docs/history/
```


## Runtime deployment and OneDrive fallback

CPM prepends the selected toolchain bin directory to the Run/Debug process PATH and can deploy common MinGW runtime DLLs beside generated targets. When a OneDrive-hosted project refuses object-directory creation with EPERM/EACCES/EBUSY, CPM can fall back to a local object cache under the user profile while keeping the final target path unchanged.
