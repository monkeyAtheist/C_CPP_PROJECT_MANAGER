
## 0.2.47 embedded library manager update

The embedded C/C++ library manager now includes the JC Lib 0.8.9 SDL2 / SDL3 pack update. SDL can be added as a combined SDL2 / SDL3 pack or as SDL2-only / SDL3-only packs. Enum-backed multi-select pickers also support combined flag expressions and refresh the generated-call preview correctly.

# C/C++ Project Manager and Build

Visual Studio Code extension for creating and managing lightweight C/C++ workspaces and projects without writing `tasks.json` or `launch.json` manually.

The extension is derived from the former C/C++ Project Manager project-manager architecture, but the build and debug workflow is now generic C/C++. It keeps the `.cws/.prj` project model for compatibility with the existing workspace explorer, while using configurable GCC/MinGW/Clang/GDB tools for compilation and debugging.

## Main features

- Create or open a workspace containing one or more C/C++ projects.
- Add existing `.c`, `.cpp`, `.h`, `.hpp`, `.a`, `.lib`, `.o` and `.obj` files to a project.
- Create starter files from embedded C/C++ templates.
- Select executable, dynamic-library or static-library targets.
- Build, rebuild, clean, run and debug the active project.
- Detect C/C++ toolchains from `PATH`, common MinGW/MSYS2/Clang locations and manually configured folders.
- Store explicit compiler paths for `gcc`, `g++`, `ar` and `gdb` or compatible alternatives.
- Synchronize a managed `.vscode/c_cpp_properties.json` entry for Microsoft C/C++ IntelliSense.
- Browse embedded C/C++ library packs and insert snippets.
- Insert color values from the editor context menu in C/C++ friendly formats, including SDL and Qt initializers.
- Use editor context-menu utilities for character/encoding conversion, number/bit conversion, truth table / FSM generation and digital-filter coefficient design.
- Generate C and C++ utility module bundles, including pure C Python, Lua, Web UI, UART, IPC and TCP/UDP communication bridges, plus separate companion script/frontend bundles.

## Toolchain selection

Use **C/C++ Project Manager: Detect / Select Toolchain** or the **Detect / select toolchain** button on the home page.

The selector lists detected GCC, MinGW, MSYS2 and Clang toolchains. It also provides two manual options:

- add a toolchain from a root or `bin` directory;
- enter the C compiler, C++ compiler, archiver and debugger executable paths manually.

The selected paths are stored in these settings:

- `cpm.cCompilerPath`
- `cpm.cppCompilerPath`
- `cpm.archiverPath`
- `cpm.debuggerPath`
- `cpm.intelliSenseCompilerPath`

The setting prefix is kept for compatibility with the original project-manager codebase and may be migrated in a later version.

## Build and debug

The generic build pipeline compiles each included C/C++ source into an object file, then links the configured target.

Supported target types:

- `Executable` -> `.exe` on Windows-style project outputs;
- `Dynamic Link Library` -> `.dll`;
- `Static Library` -> `.a`.

Debug uses VS Code `cppdbg` with the configured debugger path, usually `gdb` for MinGW/GCC projects.

## Notes

Some internal command identifiers still use the historical `cpm` namespace to avoid breaking the existing workspace, project, template and parser services. User-visible labels have been moved to C/C++ Project Manager terminology where this version touches the UI.

## Documentation layout

Historical validation reports and migration notes are stored under `docs/history/`. The project root keeps only `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md` and `TEMPLATES_AND_SNIPPETS.md` as active documentation.

### 0.2.49 editor-context utilities

The CPM editor context menu now mirrors the latest JC Lib utility layout. Under `CPM > Utilities`, the extension exposes the color picker, character table/converter, selected text/numeric conversion helpers, number/bit converter, truth-table/FSM designer and digital-filter designer. These tools insert generated values back into the active C/C++ editor selection when requested.


### 0.2.25 workflow update

The new-file picker is grouped by category: C, C++, module bundles, scripts/text and saved templates. Module bundles are split into C, C++ and Scripts. The C group includes generated pure C core/error modules plus Python, Lua, Web UI, UART, IPC and TCP/UDP communication bridges; C++ MY_Util modules and companion assets remain separate bundles.



### 0.2.29 C communication bundles

The common MY_Util C++ communication bundles now have pure C equivalents for UART, IPC and Ethernet TCP/UDP. They are available under `Module bundles > C`, either individually or through `Full communication stack`.

### 0.2.28 Web UI bundle split

The Web UI backend and frontend assets are now separate bundle choices. C projects can generate `cpm_webui.c` / `cpm_webui.h`; C++ projects can copy only `webui.cpp` / `webui.h`; HTML, JavaScript, CSS and images are available from `Module bundles > Scripts > Minimal Web UI frontend`.

### 0.2.30 bundle clarification

Script bundles are now split between generic starters and project-specific demos. The Python worker protocol starter creates only a minimal `catj_py_helper.py`, `logger.py`, `example_worker.py` and README. The older Raspberry Pi / robot-oriented Python files are available separately as `Robot demo Python scripts`.

The Web UI assets are split the same way: `Minimal Web UI frontend` generates a small generic HTML/JS/CSS frontend for `/api/state` and `/api/action`, while `Embedded demo Web UI frontend` keeps the original GPIO/camera/bus demo assets.

C bundles now include README/API notes where useful. When a socket or Web UI backend bundle is added on Windows, CPM adds `ws2_32` to the workspace linker libraries if it is not already present.

### 0.2.31 C I2C/SPI bundles

The C bundle set now includes `I2C communication` and `SPI communication`. These generated modules provide pure C wrappers for Linux `/dev/i2c-*` and spidev devices, with unsupported-platform returns on Windows or non-Linux systems. The C full communication stack now creates UART, IPC, Ethernet, I2C and SPI modules together.



## 0.2.32 bundle note

The C communication bundle set now includes Wi-Fi and Bluetooth RFCOMM modules in addition to UART, IPC, Ethernet, I2C and SPI. The Wi-Fi module handles application TCP/UDP traffic once the operating system is connected to Wi-Fi; it does not manage SSID association. The Bluetooth C module targets Windows RFCOMM by default and reports unsupported on other platforms unless extended with a platform backend.

## 0.2.33 CAN bundle note

The bundle system now includes CAN communication helpers:

- `Module bundles > C > CAN communication` generates `Bundle/C/Communication/CAN/cpm_can.c`, `cpm_can.h` and a README.
- `Module bundles > C++ > CAN communication` copies the C++ `Communication/can` helper.
- `Module bundles > C > Full communication stack` now includes CAN in addition to UART, IPC, Ethernet, Wi-Fi, Bluetooth, I2C and SPI.

The default backend targets Linux SocketCAN. It supports classical CAN, CAN FD, filters, timeouts, loopback and own-message reception. On unsupported platforms the functions return an explicit unsupported status instead of compiling into silent no-op behavior.

### 0.2.38 bundle documentation

Generated and copied bundle headers now include Doxygen-style usage examples directly in the inserted `.h` / `.hpp` files. The generated C implementation files also include `@file`, `@brief`, `@param` and `@return` documentation blocks on helpers and API functions where applicable. This covers the CPM-native C bundles and the copied MY_Util C/C++ communication, Python, Web UI, utility and error-management modules.


### 0.2.43 Generic toolchain runtime handling

Classic C/C++ builds use the same runtime-dependency strategy as SDL projects, now generalized for the toolchains detected by CPM rather than only MinGW. In the build settings page, open `Generic toolchain runtime dependencies` and select one of the following modes:

- `copy-dlls`: copy detected compiler/runtime DLLs beside the generated executable or DLL. CPM handles common GCC/MinGW/MSYS2 DLLs such as `libgcc_s_*.dll`, `libstdc++-6.dll` and `libwinpthread-1.dll`, and also LLVM/Clang runtime DLLs such as `libc++.dll`, `libunwind.dll`, `libomp.dll` and `clang_rt.*.dll` when they are found in the selected toolchain `bin` directory.
- `path-only`: do not copy DLLs. CPM prepends the selected compiler toolchain `bin` directory to `PATH` only when using the extension's Run or Debug commands. Launching the `.exe` manually from Explorer may still fail if the toolchain `bin` directory is not in the system PATH.
- `static-link`: inject GCC/Clang static runtime flags when the selected toolchain supports them. This can produce a more standalone executable for classic C/C++ programs, but it can fail when third-party libraries are only available as dynamic/import libraries.

When `copy-dlls` is active, CPM traces the PE import table of the generated target and recursively follows copied toolchain DLL dependencies. A `.cpm-runtime-dlls.json` manifest is written beside the target so stale CPM-managed DLLs can be removed safely when changing architecture, compiler or runtime mode. The setting behind this section is `cpm.runtimeDependencyMode`. The old `cpm.deployRuntimeDlls` setting remains supported for existing workspaces.

### 0.2.45 SDL2 / SDL3 project support

CPM can detect and use SDL2 and SDL3 SDK folders such as `C:\Program Files\SDL64`, `C:\Program Files (x86)\SDL2`, `C:\Program Files\SDL3`, MSYS2 `mingw64`, `ucrt64` or `clang64` prefixes. Use `C/C++ Project Manager: Detect / Select SDL2 or SDL3 SDK` to select the SDK, SDL major version, packages and runtime mode. The SDL SDK field also accepts nested SDK folders such as `...\i686-w64-mingw32\bin`, `lib`, `include` or `include\SDL2`; CPM normalizes them before build resolution. The build pipeline injects SDL include paths, SDL libraries and Windows subsystem flags without manually editing the normal include/linker lists. If `cpm.sdlRootPath` is empty, CPM auto-scans common SDK roots when the project source includes or calls SDL.

New project commands are available for SDL applications:

- `C/C++ Project Manager: Create SDL Workspace and Project` creates a workspace, an executable project and a minimal SDL event/render loop.
- `Create New SDL Project in Workspace...` adds the same kind of SDL executable project to an existing `.cws` workspace.

Supported package switches include `SDL2`, `SDL2_image`, `SDL2_mixer`, `SDL2_ttf`, `SDL2_net`, `SDL2_gfx`, `SDL3`, `SDL3_image`, `SDL3_mixer`, `SDL3_ttf` and `SDL3_net`. For SDKs that contain both `i686-w64-mingw32` and `x86_64-w64-mingw32`, CPM prefers the directory matching the active compiler architecture. Runtime handling can copy SDL DLLs beside the executable, use PATH only at run/debug time, or attempt static linking when the SDK provides suitable static libraries. The recommended Windows mode is DLL copying. SDL2 keeps the classic Windows `SDL2main` link path; SDL3 uses `<SDL3/SDL_main.h>` in the generated source and links `SDL3` directly.

### 0.2.39 Lua execution bridge

The module bundle system now includes Lua execution helpers:

- `Module bundles > C > Lua execution bridge` generates `cpm_lua_exec.c`, `cpm_lua_exec.h` and a README.
- `Module bundles > C++ > Lua execution bridge` generates the same C ABI bridge in a C++ bundle folder. The header is protected with `extern "C"`, so it can be called from C++ code.
- `Module bundles > Scripts > Lua worker protocol starter` generates a minimal `example_worker.lua`.

The bridge launches the external `lua` interpreter, passes C/C++ string arguments to the script command line, captures `print(...)` output in `CpmLuaResult.output`, and also supports interactive stdin/stdout sessions. In Lua, arguments are read through the global `arg` table: `arg[1]`, `arg[2]`, etc.

### Special-character text comments

The C `Python execution bridge` bundle is compatible with older MinGW/MinGW32 headers and avoids Windows APIs that are not declared by default in those toolchains.

`Insert special-character text` generates ASCII-style text from a normal string. The command lets you choose the fill pattern (`//`, `\\`, `||`, `**`, `##`, `==`, `--`, `++` or custom), one of five size presets, and whether the result is inserted as C/C++ line comments, a C block comment or raw characters. Sizes now range from Micro/Small compact 3x5 text up to Large, which corresponds to the previous size 2.

### Header change entries

`Insert header change line` keeps the CHANGES/EVOLUTIONS table width stable. Descriptions longer than the Description column are wrapped onto continuation rows, and a separator row is inserted under the generated entry.


### Bundle header documentation

As of 0.2.40, generated and copied module bundles include fuller Doxygen header notes. The header of each audited bundle summarizes its features, suitable applications, usage constraints and a minimal example. Script bridges also document how arguments and console output move between C/C++ and Python or Lua.

The build settings page also provides `Export build parameters` and `Import build parameters` buttons near `Save project build settings`. The exported `.cpm-build.json` file captures target settings, run/build actions, dependencies, toolchain paths, generic runtime handling and SDL options so a working configuration can be moved to another project.
