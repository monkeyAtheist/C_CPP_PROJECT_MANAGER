### Build report and diagnostic pipeline

The CPM build service now uses two output channels. `C/C++ Project Manager` is a human-readable report, while `C/C++ Project Manager - Build Trace` stores the complete raw execution trace for every compiler, archiver and linker process. Tool stdout/stderr is captured per child process and rendered only after process completion, which keeps each compile/link step coherent.

The build service parses GCC/G++/MinGW/Clang/MSVC-style diagnostics and common GNU linker failures into an internal diagnostic model. Parsed errors and warnings are rendered in the report, enriched with lightweight contextual hints, and published to a VS Code `DiagnosticCollection` named `CPM Build`.

## 0.2.50 SDL add-on build planning

The SDL build planner now combines configured packages with a lightweight source scan. During compile/link planning it infers SDL add-ons from includes and API prefixes: `SDL_ttf.h` / `TTF_*`, `SDL_image.h` / `IMG_*`, `SDL_mixer.h` / `Mix_*`, `SDL_net.h` / `SDLNet_*`, and SDL2_gfx patterns. Inferred packages are filtered against the actually detected SDK artifacts before link arguments are emitted.

For multi-architecture SDL SDKs, include directory resolution now returns the preferred compiler architecture group first, avoiding mixed `i686` and `x86_64` include paths in the same compile command. Static SDL link mode resolves extension static archives when present and appends known package-private Windows libraries after SDL archives.

# Architecture notes — C/C++ Project Manager and Build

## Main components

- `src/model/iniDocument.ts`: INI-like parser and serializer used by the `.cws` and `.prj` workspace/project files.
- `src/model/cpmParser.ts`: compatibility parser for the existing `.cws/.prj` format. The class name is inherited, but it is used as the generic CPM project-file backend.
- `src/services/cpmWorkspaceService.ts`: workspace lifecycle, active-project selection and project-tree file operations.
- `src/services/cpmInstallationService.ts`: generic C/C++ toolchain discovery for GCC, MinGW, MSYS2, LLVM/Clang and manually added compiler roots.
- `src/services/cpmBuildService.ts`: generic build pipeline based on `gcc`, `g++`, `ar` and `gdb`; handles build, rebuild, clean, run and VS Code `cppdbg` launch.
- `src/services/cpmProjectSettingsService.ts`: project build actions, run options and build-order dependencies. Current files are stored in `.vscode/cpm-build.json`; legacy `.vscode/labwindows-cvi-build.json` is still readable for migration.
- `src/services/cpmCppToolsService.ts`: optional Microsoft C/C++ IntelliSense synchronization and lightweight toolchain include-path discovery.
- `src/services/cpmTemplateService.ts`: C/C++ starter files, snippets, DLL helpers, error/logging modules and CPM_Utility bundle integration.
- `src/services/cpmColorValueService.ts`: editor context-menu color picker webview and color value insertion/copy helpers.
- `src/services/cpmLibraryPackService.ts`: embedded JC Lib / CPM library-pack seeding and migration.
- `src/providers/cpmTreeProvider.ts`: native VS Code tree views for workspaces, actions, file symbols and libraries. The workspace tree also owns the internal file drag-and-drop controller for logical folder moves.
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

Adding a file appends a new project file section and records its path. Removing, excluding or moving a file between CPM logical folders updates the project reference only; disk files are not deleted or relocated unless a command explicitly renames or replaces them. Logical file moves are implemented by updating the `Folder` field of the relevant `File XXXX` sections and ensuring the target folder is declared in `[Folders]`.

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
CPM_Utility module bundles
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


### 0.2.38 bundle documentation pass

The template service now treats documentation as part of the bundle payload. Internal generators for CPM C/C++ core utilities, error handling, Python execution and Web UI backend prepend Doxygen-style header examples and source-level implementation comments. Static MY_Util bundle assets under `data/templates/my_util/MY_Util` are also enriched before packaging, so copied C and C++ modules retain usage examples and source documentation when inserted into a project.

## Runtime deployment and OneDrive fallback

CPM prepends the selected toolchain bin directory to the Run/Debug process PATH and can deploy common toolchain runtime DLLs beside generated targets. When a OneDrive-hosted project refuses object-directory creation with EPERM/EACCES/EBUSY, CPM can fall back to a local object cache under the user profile while keeping the final target path unchanged.

## Generated C Python bridge bundle

The template service can generate a pure C Python execution bridge (`cpm_python_exec.c/.h`) from internal templates. It is exposed as a C module bundle and intentionally remains separate from the CPM_Utility C++ bridge and companion Python scripts.

### 0.2.30 bundle clarification

Script bundles are now split between generic starters and project-specific demos. The Python worker protocol starter creates only a minimal `catj_py_helper.py`, `logger.py`, `example_worker.py` and README. The older Raspberry Pi / robot-oriented Python files are available separately as `Robot demo Python scripts`.

The Web UI assets are split the same way: `Minimal Web UI frontend` generates a small generic HTML/JS/CSS frontend for `/api/state` and `/api/action`, while `Embedded demo Web UI frontend` keeps the original GPIO/camera/bus demo assets.

C bundles now include README/API notes where useful. When a socket or Web UI backend bundle is added on Windows, CPM adds `ws2_32` to the workspace linker libraries if it is not already present.

### 0.2.31 communication bundle parity

The bundle layer continues to move toward C/C++ parity. Pure C UART, IPC, Ethernet, I2C and SPI modules are now available as separate generated modules. The I2C/SPI implementations target Linux device files by default and return explicit unsupported statuses on platforms without a backend.



## 0.2.32 bundle note

The C communication bundle set now includes Wi-Fi and Bluetooth RFCOMM modules in addition to UART, IPC, Ethernet, I2C and SPI. The Wi-Fi module handles application TCP/UDP traffic once the operating system is connected to Wi-Fi; it does not manage SSID association. The Bluetooth C module targets Windows RFCOMM by default and reports unsupported on other platforms unless extended with a platform backend.

### 0.2.33 CAN communication bundle

CAN is now modeled as a first-class communication bundle alongside UART, IPC, Ethernet, Wi-Fi, Bluetooth, I2C and SPI. The default implementation is Linux SocketCAN because it is the most portable open API for PC-side CAN tooling and embedded Linux targets.

The C API is intentionally procedural and independent from the C++ MY_Util classes. The C++ helper follows the same behavior but wraps the resource lifetime in a movable `jc_can::CanLink` class.

Windows CAN support is not hard-coded because common adapters use incompatible vendor SDKs such as PCAN-Basic, Kvaser CANlib, Vector XL or NI-XNET. The generated module therefore exposes a clean adapter boundary rather than pretending that one backend covers all Windows CAN hardware.



## 0.2.39 Lua bridge generator

The bundle generator now has a `c-lua-bridge` path. It reuses the same cross-platform process/pipe model as the C Python bridge but targets the external `lua` interpreter and omits Python-specific unbuffered interpreter flags. The generated C header uses an `extern "C"` ABI guard so the bridge can be inserted from either the C or C++ bundle menus.

## Bundle header documentation policy

From version 0.2.40, bundle headers are treated as user-facing documentation. A bundle header should contain a Doxygen `@file` block with four practical sections: main features, typical applications, usage notes and a minimal example. This applies both to files generated from TypeScript templates and to files copied from `data/templates/my_util/MY_Util`.

When a new bundle is added, the header should explain non-obvious runtime behavior directly in the file. For example, script execution bridges must state where command-line arguments are retrieved on the script side and where stdout/stderr is captured on the C/C++ side.

## SDL2 / SDL3 integration architecture

The SDL integration is split into three areas:

1. `CpmSdlService` detects SDL2 and SDL3 SDK roots, persists the selected SDK, selected SDL major version and exposes the selected package/runtime configuration.
2. `CpmWorkspaceService` owns the SDL project wizard and writes a minimal SDL2 or SDL3 source starter into a normal CPM executable project.
3. `CpmBuildService` consumes SDL settings during compile/link/run/debug: it appends include paths, package libraries, subsystem flags and SDL runtime DLL deployment. SDL2 links `SDL2main` on Windows; SDL3 links `SDL3` directly and expects the generated source to include `<SDL3/SDL_main.h>`.

The integration remains optional. `cpm.sdlEnabled = auto` only activates SDL flags for projects whose sources visibly use SDL, while `on` forces SDL flags for the active build.

## Generic toolchain runtime dependency handling

The build service resolves `cpm.runtimeDependencyMode` after compiler settings are loaded. `copy-dlls` indexes the selected toolchain `bin` directories, reads the generated PE import table and deploys CPM-managed runtime DLLs beside executable/DLL targets. This covers common GCC/MinGW/MSYS2 runtimes and LLVM/Clang runtimes. Copied DLLs are recorded in `.cpm-runtime-dlls.json` so stale or architecture-mismatched copies can be cleaned safely. `path-only` leaves the output directory untouched and relies on the run/debug environment builder to prepend the toolchain `bin` directory to `PATH`. `static-link` adds GCC/Clang static runtime link flags before the target is linked; it is intentionally best-effort because third-party import libraries may still require dynamic DLLs.


### Build parameter import/export

The build settings webview can export the currently edited configuration to a `.cpm-build.json` file. Imports are applied to the currently selected configuration scope and then persisted through the same parser/settings services used by the Save action.

### SDL SDK path normalization

SDL resolution accepts package roots, architecture triplet roots and nested `bin`, `lib`, `include` or `include/SDLx` folders. The resolver derives candidate SDK roots before detecting include directories, import libraries, runtime DLLs and architecture.

### 0.2.47 embedded library synchronization

The embedded library manager imports the JC Lib 0.8.9 SDL2 / SDL3 pack routing and enum-backed multi-select picker fix. SDL content is now available as combined SDL2 / SDL3, SDL2-only, or SDL3-only bundled packs.

## 0.2.49 editor utility integration

The editor context menu now imports the JC Lib 0.8.24 utility surface into CPM-specific commands. The implementation lives in `src/services/cpmEditorUtilitiesService.ts` and registers character/encoding tools, number/bit tools, logic/FSM generation and digital filter design alongside the existing snippet, header, special-text and color services.

### v0.2.51 embedded library pack refresh

The embedded JC Lib manager now includes the JC Lib 0.8.27 structured packs. Pack imports preserve the source environment/library hierarchy, including the refreshed SDL, Lua, Embedded and Windows API / Devices layouts, plus the new Assembly and Visual Basic / VBA packs.


### 0.2.55 utility/error bundle update

Generated CPM error bundles now use a structured, date-stamped error block instead of a minimal raw message. The C++ variant also exposes `CPM_ERROR(code, message)` for direct reports. The embedded CPM_Utility core helper has been expanded with common C++17 helpers for executable path discovery, filesystem checks, directory creation, text-file I/O, environment variables and string transformations.


### 0.2.56 source-template escaping

CPM source templates that emit C/C++ code containing escape sequences are stored with `String.raw` when the emitted code must preserve backslashes. This is required for generated logging statements such as `stream << header << '\n'` and for Windows helpers using `L'\0'`. Without raw template storage, JavaScript/TypeScript expands these sequences before file generation and corrupts the emitted C/C++ source.


## CPM_Utility consolidation

The embedded C++ helper layer is exposed as `CPM_Utility`. The extension still stores several legacy communication modules under the internal template tree, but the user-facing bundle name and generated core helper files are `cpm_utility.cpp` and `cpm_utility.h`. A compatibility namespace alias keeps existing `jc_utility::...` code valid.


## 0.2.58 Notes

The embedded JC Lib scripting data was refreshed for the Windows CMD & Batch library while preserving the broader CPM Scripting / System pack. The C++ utility bundle keeps a single CPM-oriented identity around `CPM_Utility` and introduces `CPM_String` with compatibility aliases for older `MyString` code.

## 0.2.60 — CPM_String sequence-removal operators

The `CPM_Utility` template now extends `CPM_String` with subtraction-style removal operators. `operator-` returns a copy with the requested sequence removed, while `operator-=` mutates the current object. The implementation removes all exact occurrences and trims only leading/trailing whitespace exposed by the removal, preserving internal whitespace for normal text use.

## 0.2.59 — CPM_String compound operators

The `CPM_Utility` template keeps `CPM_String` as the unified string helper and adds compound append/repeat operators so generated utility code can build separators and formatted text in-place.

### CPM 0.2.62 - Marketplace package footprint

The embedded JC Lib payload is now curated for CPM publication. The VSIX keeps the C, C++, C/C++ preprocessor/core, OpenCV, build/toolchains, SDL, Windows API/devices, scripting/system, Python, JavaScript/HTML/CSS, TypeScript, database, PHP and embedded-systems packs. Larger non-essential packs such as legacy/default/CVI, Qt, Java, C#, Kotlin, VBA, Lua and Assembly are no longer shipped in the CPM VSIX. This reduces upload size and lowers the risk of Visual Studio Marketplace request timeouts during publication.



### Detached CPM configuration

`CpmProjectSettingsService` centralizes CPM configuration reads and writes. When VS Code has no workspace folder opened but CPM has loaded a `.cws` or `.prj`, generic build settings are persisted manually to `<configuration-root>/.vscode/settings.json`. This avoids `ConfigurationTarget.Workspace` failures while keeping settings next to the CPM workspace instead of forcing them into global user settings.


## CPM 0.2.64 settings webview organization

The `BuildSettingsPanel` is now organized around thematic pages. The webview still posts the same save/import/export payloads to the extension host, but the visual hierarchy is page-oriented: project identity, toolchain, build inputs, run/debug, SDL, dependencies and diagnostics are separated.

This keeps the build model compatible with previous releases while reducing coupling between unrelated controls in the UI.

### Build Settings webview navigation guard

From v0.2.65, the Build Settings webview uses a two-layer guard for thematic pages: the JavaScript controller applies the active page/filter state, and a CSS fallback hides non-Overview sections while the controller is not initialized. The embedded script also avoids raw `\r?\n` regex text inside the TypeScript HTML template to prevent runtime line-break injection in the webview script.



### CPM application icon pipeline

CPM stores icon settings per native project configuration in the `.prj` file. `Icon File` is used for the Windows executable icon, while `Window Icon File` and `Apply Window Icon Automatically` control SDL runtime icon support. During an executable build, the generic build service can generate `cpm_application_icon.rc`, compile it with `windres`/`llvm-windres`, and append the generated resource object to the link command.

For SDL targets, CPM can also generate `cpm_application_icon_autoload.h/.c` in the build generated directory. The header is force-included for project sources so `SDL_CreateWindow(...)` is wrapped and `SDL_SetWindowIcon(...)` is called immediately after window creation. The source file is compiled as an additional generated translation unit and the selected image is copied beside the executable after a successful link.
