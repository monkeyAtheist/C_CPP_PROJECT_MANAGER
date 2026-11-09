### Structured build output

CPM now separates normal build readability from raw tool diagnostics. The main `C/C++ Project Manager` output channel shows a structured report with phases, compiled files, warnings, errors, contextual hints and the final status. Full commands and unfiltered stdout/stderr are preserved in `C/C++ Project Manager - Build Trace`.

Use `cpm.buildLogDetail` to select the main report density:

- `compact`: phase summaries, warnings, errors and final status.
- `normal`: compiled files, durations, structured diagnostics and hints.
- `verbose`: normal report plus commands and successful raw output in the main channel.

Parsed diagnostics are also sent to VS Code Problems with source `CPM Build`. The commands `C/C++ Project Manager: Show Build Problems` and `C/C++ Project Manager: Show Full Build Trace` are available from the Command Palette.


## File creation and reusable C bundles (0.2.100)

The creation workflow remains language-first: **C**, **C++**, or **Scripts and text**. Reusable modules are selected inside that language through **Bundles...** rather than through a separate root bundle menu. C bundles are now grouped into **Configuration & utilities**, **System**, **Data & serialization**, **Integrity & diagnostics**, **Communication**, and **Interoperability & UI**.

In addition to the dedicated section-aware **INI configuration** bundle and the packaged communication modules, CPM now ships focused C bundles for **File & Path**, **Strings/StringBuilder**, **Time & periodic timers**, **Threads & synchronization**, **Processes/environment**, **JSON**, **CSV**, **Byte buffers/endian**, **Vector/ring-buffer containers**, **Checksums/CRC**, and **Logging**. A **General C utility stack** can install the maintained configuration/system/data/diagnostics set in one operation. Each module is also independently selectable so projects do not need to copy a monolithic helper library.

The utility payloads are included physically in the VSIX and are compiled during release validation with strict C11 warnings. Legacy bundle entries whose backing files are absent remain hidden instead of failing after selection.


## 0.2.47 embedded library manager update

The embedded C/C++ library manager now includes the JC Lib 0.8.9 SDL2 / SDL3 pack update. SDL can be added as a combined SDL2 / SDL3 pack or as SDL2-only / SDL3-only packs. Enum-backed multi-select pickers also support combined flag expressions and refresh the generated-call preview correctly.

## 0.2.73 — Dynamic, static-runtime and fully-static linkage

CPM now separates the **link model** from runtime-DLL deployment. Open **Project Build Settings > Build > Linkage** or run **C/C++ Project Manager: Select Linkage Mode**:

- **Dynamic**: normal compiler/third-party DLL linkage. Runtime DLLs may be copied beside the target or resolved through `PATH`.
- **Static compiler runtime**: adds GCC/MinGW static runtime flags such as `-static-libgcc` and `-static-libstdc++`, while third-party libraries remain independently linkable.
- **Fully static when available**: requests static archive resolution with `-static`, keeps the compiler runtime static and forces SDL packages to static archives when the selected SDK provides them.

The status bar shows `DYN`, `RTS` or `STA` for the active project. After linking an EXE or DLL, CPM reads its PE import table and reports remaining non-system DLL dependencies. The command **Inspect Built Runtime DLL Dependencies** can repeat this check at any time. Normal Windows operating-system imports such as `kernel32.dll`, `user32.dll` or API-set DLLs remain expected even for a standalone executable. A third-party library can only disappear as a runtime dependency when a compatible static `.a`/archive is available and its own static dependencies are linkable.

When switching from a dynamic build to a static build, CPM removes runtime DLLs that it previously deployed and also cleans previously copied SDL runtime DLLs, avoiding misleading stale files beside the executable.

# C/C++ Project Manager and Build

Visual Studio Code extension for creating and managing lightweight C/C++ workspaces and projects without writing `tasks.json` or `launch.json` manually.

The extension is derived from the former C/C++ Project Manager project-manager architecture, but the build and debug workflow is now generic C/C++. It keeps the `.cws/.prj` project model for compatibility with the existing workspace explorer, while using configurable GCC/MinGW/Clang/GDB tools for compilation and debugging.

## Main features

- Create or open a workspace containing one or more C/C++ projects.
- Uses a compact Qt-style CPM/PM sidebar logo for clearer identification in the VS Code activity bar.
- Add existing `.c`, `.cpp`, `.h`, `.hpp`, `.a`, `.lib`, `.o` and `.obj` files to a project.
- Organize project files by moving references between CPM logical folders with drag-and-drop or **Move File To Folder...**.
- Create starter files from embedded C/C++ templates.
- Generate richer C/C++ utility and error-management bundles with executable-path helpers, filesystem helpers and structured error logs with preserved C/C++ escape sequences.
- Select executable, dynamic-library or static-library targets.
- Build, rebuild, clean, run and debug the active project.
- Diagnose external instruments from a standalone COM / USB-PnP / VISA page, send manual text or HEX frames, and use common SCPI commands such as `*IDN?`.
- Detect C/C++ toolchains from `PATH`, common MinGW/MSYS2/Clang locations and manually configured folders.
- Store explicit compiler paths for `gcc`, `g++`, `ar` and `gdb` or compatible alternatives.
- Synchronize a managed `.vscode/c_cpp_properties.json` entry for Microsoft C/C++ IntelliSense.
- Manage project-scoped third-party dependencies with vcpkg manifest mode, Conan 2 and pkg-config/pkgconf, with normalized flags fed directly into GCC/Clang builds and IntelliSense.
- Browse embedded C/C++ library packs and insert snippets.
- Create or import editable library packs in Workspace or Global storage directly from the C/C++ Libraries view.
- Inspect C/C++ File Symbols without local-call/constructor false positives, copy or export the list, and generate `.h/.hpp` or `.c/.cpp` skeletons.
- Insert color values from the editor context menu in C/C++ friendly formats, including SDL and Qt initializers.
- Use editor context-menu utilities for character/encoding conversion, number/bit conversion, truth table / FSM generation and digital-filter coefficient design.
- Generate structured C and C++ utility/module bundles, including maintained communication transports and protocol layers.


## Maintained C/C++ communication bundles

CPM 0.2.101 provides the communication library as independent **C** modules plus matching **C++17 RAII** wrappers. The C++ bundles deliberately embed and wrap the maintained C backend instead of carrying a second transport implementation.

Available transports include **UART/serial**, local **IPC** (Windows named pipes / POSIX Unix-domain sockets), **TCP client/server**, **UDP**, application-level **Wi-Fi IP**, **Bluetooth Classic RFCOMM**, **CAN/CAN-FD** (SocketCAN), **I²C**, **SPI** and a compact dynamically-loaded Windows **VISA** backend. Higher-level protocol bundles provide **COBS/SLIP/length-prefix framing**, **SCPI/IEEE-488.2** and **Modbus RTU/TCP**.

The VISA bundle does not require vendor VISA headers or import libraries at compile time; on Windows it loads an installed `visa64.dll` / `visa32.dll` runtime dynamically. SCPI is transport-independent and can therefore be wired to UART, TCP, IPC, RFCOMM or VISA callbacks. Platform-specific hardware transports such as SocketCAN, Linux I²C/spidev and Windows RFCOMM return an explicit unsupported result on other platforms instead of silently emulating unavailable hardware.


## Settings & Tools without a project

CPM 0.2.98 keeps its global utilities accessible even when no C/C++ workspace/project is loaded. The persistent status bar is reduced to **Home**, **Open Workspace**, **Build / Rebuild / Clean**, **Run**, **Debug** and **Settings**. Build mode, target type, linkage mode and advanced run options remain available in CPM menus/settings instead of occupying permanent status-bar space.

Opening **Settings** with no active project now displays **CPM Settings & Tools** rather than an error. Project-specific build controls are shown as unavailable, while **Instrument Diagnostics**, **Network & Wireless Diagnostics**, **Unified CPM Device Manager**, **DLL Analyzer**, **.lib/.a/.dll.a Analyzer**, CPM extension settings, toolchain setup and workspace opening remain available. When a project is active, the same Settings command opens the complete project build-settings page.


## Instrument Diagnostics

CPM 0.2.93 provides a standalone **Instrument Diagnostics** page. It does not require a C/C++ workspace to be open and is available from the Home page, Quick Actions or **C/C++ Project Manager: Open Instrument Diagnostics**.

For **Serial / COM** devices on Windows, CPM enumerates the available ports and exposes the communication parameters normally required by laboratory equipment: baud rate, data bits, parity, stop bits, handshake, DTR/RTS and independent read/write timeouts. Frames can be entered as text (`ASCII`, `UTF-8` or `Latin-1`) or as raw hexadecimal bytes. `None`, `LF`, `CR` and `CRLF` termination can be selected explicitly.

The page now uses a persistent terminal model: **Connect** opens the COM/VISA resource and keeps it open until **Disconnect** or the diagnostics page is closed. Incoming bytes are monitored asynchronously, so SCPI replies and unsolicited serial/VISA frames appear in the TX/RX log without reopening the resource for every command. The console records decoded text and HEX bytes. `Ctrl+Enter` sends the current frame.

Common IEEE 488.2 / SCPI presets remain available, including `*IDN?`, `*CLS`, `*RST`, `*OPC?`, `*TST?`, `SYST:ERR?`, `SYST:VERS?`, `*ESR?` and `*STB?`. Commands such as `*RST` can change instrument state, so no preset is transmitted automatically. CPM can also persist named **instrument profiles**, reusable **saved commands**, and a recent command history for fast diagnostic sessions.

The page also supports reusable **diagnostic sequences**. Each ordered step can send text or HEX data, select its decoding format, declare whether a response is expected, define a timeout and post-step delay, and validate decoded RX data with **Any response**, **Contains**, **Equals** or **Regular expression**. Runs report PASS/FAIL per step, can stop on the first failure or continue, and can be cancelled manually. Saved sequences are stored globally with the other instrument-diagnostics data.

CPM also enumerates Windows USB/PnP devices and extracts USB VID/PID values when possible. This inventory is intentionally informational: a USB device cannot be treated as a generic byte stream merely because Windows can enumerate it. Communication is enabled when the instrument exposes a COM endpoint or an installed VISA runtime exposes a resource such as `USB0::...::INSTR`.

For **VISA / USBTMC**, CPM uses the system VISA C API through PowerShell/.NET interop rather than bundling a native Node module. It tries a 64-bit VISA runtime first and can fall back to the 32-bit runtime through Windows PowerShell x86. NI-VISA, Keysight VISA or another compatible runtime can therefore provide the USBTMC/VISA transport; if no runtime is present, COM diagnostics and USB/PnP inventory remain available.


## Network & Wireless Diagnostics

CPM 0.2.98 provides a project-independent **Network & Wireless Diagnostics** page for Ethernet, Wi-Fi and socket-level troubleshooting. It is available from Home, Quick Actions, **Settings & Tools**, the Command Palette and directly from Instrument Diagnostics.

The **Network** view inventories local interfaces with status, MAC address, link speed, IPv4/IPv6 addresses, gateways and DNS servers. It also displays the operating system's existing ARP/ND neighbor cache without performing an active subnet sweep. Single-target tools provide ICMP Ping, DNS resolution and a TCP connection test with configurable timeout. A local-service discovery section sends mDNS/Bonjour and SSDP/UPnP discovery requests and lists the records/devices that answer.

The **TCP / UDP terminal** keeps a TCP client connection or UDP socket open while the page is active. Frames can be entered as text or raw HEX, decoded as ASCII/UTF-8/Latin-1 and terminated with None/LF/CR/CRLF. Incoming TCP bytes and UDP datagrams are displayed asynchronously with decoded text and HEX bytes. UDP supports an explicit local port or port `0` for automatic allocation and enables broadcast transmission for controlled diagnostic use. CPM 0.2.98 also adds a **TCP listener/server** that can accept several incoming clients and broadcast the current terminal frame to every connected client.

The **Wi-Fi / BLE / Bluetooth** view is currently implemented on Windows. Wi-Fi discovery lists visible SSID/BSSID entries with signal quality, channel, authentication, encryption and radio type. BLE uses the Windows advertisement watcher and reports address, advertised local name, RSSI and connectability metadata when available. Scanning can run once or continuously; continuous mode keeps recently observed entries for a short period and exposes a **Last seen** age. Bluetooth Classic/known-device inventory is read from the Windows Bluetooth PnP device list. CPM 0.2.98 adds a **BLE GATT Inspector** for a selected BLE address: it enumerates services and characteristics, exposes one-shot Read/Write operations when supported and can monitor Notify/Indicate values for a bounded five-second diagnostic window.

These tools are limited to discovery and explicit diagnostics against endpoints selected by the user. They do **not** passively capture third-party payload traffic, credentials, protected Wi-Fi handshakes or decrypted frames. The GATT Inspector can directly read/write characteristics on a selected BLE device when Windows and that device allow it; writes can change device state.


## Unified CPM Device Manager

CPM 0.2.98 includes a project-independent **Device Manager** to the communication toolset. It is available from Home, Quick Actions, **Settings & Tools**, the Command Palette (`C/C++ Project Manager: Open CPM Device Manager`) and the **Devices** tab of Network & Wireless Diagnostics.

A device represents one physical or logical piece of equipment and can contain several communication endpoints at the same time: **COM**, **VISA**, **TCP**, **UDP** and **SSH**. For example, one `Raspberry Pi bench #2` profile can retain its TCP service and OpenSSH alias, while a laboratory instrument can retain both a serial fallback and a VISA/USBTMC endpoint.

Instrument Diagnostics exposes **Add endpoint to CPM device** and saved instrument profiles can be promoted directly. The TCP/UDP terminal provides the same action for its current socket settings, and configured OpenSSH aliases can be attached from **SSH Devices**. Device cards then reopen the appropriate diagnostic tool with the stored endpoint already selected.

Device metadata includes a name, description and tags. The registry is stored globally in VS Code extension state and can be exported/imported as JSON for backup or transfer between workstations. CPM 0.2.98 adds **Diagnose** and **Diagnose all** actions: COM/VISA endpoints are checked against current enumeration, TCP/SSH endpoints are tested for reachability, and UDP endpoints are resolved with an explicit warning that UDP has no connection handshake. Existing instrument profiles, network settings and `~/.ssh/config` are not removed or rewritten by this feature.


## External dependencies — vcpkg, Conan 2 and pkg-config

CPM 0.2.76 adds a **Packages** page to Project Build Settings and a dedicated **C/C++ Dependencies** view. Dependency configuration is stored per project in `.vscode/cpm-build.json`; generated package-manager output defaults to `.cpm/dependencies`.

Supported flows:

- **vcpkg manifest mode**: CPM generates `vcpkg.json`, supports feature syntax such as `fmt[core]`, optional builtin baselines, overlay ports/triplets and custom target/host triplets. If the target triplet is empty, CPM derives x86/x64 from the active build mode and selects the Windows `-static` triplet automatically for fully-static builds.
- **Conan 2**: CPM generates `conanfile.txt` with requires/tool-requires/options plus `PkgConfigDeps`, `CMakeDeps`, `CMakeToolchain` and `cmake_layout`, then supports host/build profiles, lockfiles and `--build=missing`.
- **pkg-config / pkgconf**: CPM resolves `--cflags --libs` output, optional `--static`, custom `PKG_CONFIG_PATH` entries and additional arguments. Parsed include paths, library paths, libraries, compiler flags and linker flags are merged into the direct build. Conan generator directories are automatically included in the pkg-config search path.

All managers feed a normalized `.cpm/dependencies/integration.json` file. The GCC/Clang pipeline consumes that file during compile and link, and the managed C/C++ IntelliSense configuration also receives dependency include directories. Manual include/library paths, libraries and flags can be added on the Packages page for SDKs whose metadata is incomplete.

The **Synchronize dependencies automatically before each build** option is intentionally disabled by default. When disabled, package installation remains explicit and reproducible; CPM still reuses existing integration metadata during builds.


## Workspace file organization

The C/C++ Workspace tree supports logical file organization inside the `.prj` file. Drag one or more files onto another logical folder to update their `Folder` entry. Dropping onto the project node moves the selected files back to the project root. The same operation is available from a file context menu through **Move File To Folder...**.

This operation updates project references only; it does not move, copy or delete the physical files on disk. Use **Rename File...** when the file itself must be renamed on disk.

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


## Build backends: Direct GCC/Clang or CMake/Ninja

CPM 0.2.79 keeps the native **Direct GCC/Clang** engine as the default for every existing project and adds an optional **CMake / Ninja** backend. Select it only from **Project Build Settings → Build → Build backend**. CPM keeps this project-scoped choice out of the main workspace toolbar to preserve space for frequent Run/Debug/build actions.

The CMake backend is designed for projects that already contain a `CMakeLists.txt`. CPM can configure the source/build directories, generator, CMake/Ninja executable, selected target, generator platform/toolset, cache variables, toolchain file and extra configure/build arguments. `Ninja` is the default generator, but CMake default, Ninja Multi-Config, MinGW Makefiles and Unix Makefiles are also available.

Before configure, CPM writes a **CMake File API** query under the build tree. The codemodel reply is then used to discover the real CMake targets and artifacts. This means **Build & Run**, **Debug** and **Build & Debug** use the artifact produced by CMake instead of assuming CPM's direct-build output path. If several targets of the expected type exist, configure the CMake target name explicitly.

Build/Rebuild/Clean map to standard CMake commands (`cmake -S/-B`, `cmake --build`, `--clean-first`, and the `clean` target). The existing CPM parallel-jobs setting is reused for `cmake --build --parallel`. Multi-config generators receive `--config Debug/Release`.

When **Inherit CPM C/C++ compilers** is enabled, the selected CPM compiler paths are passed as `CMAKE_C_COMPILER` and `CMAKE_CXX_COMPILER`. When **Use dependency-manager toolchain automatically** is enabled and no explicit toolchain is set, CPM can reuse Conan's generated `conan_toolchain.cmake` or vcpkg's standard `vcpkg.cmake`.

PCH, Unity Build, direct linker flags and `.d` tracking remain features of the Direct backend. For CMake projects, configure their equivalents in `CMakeLists.txt` (`target_precompile_headers`, `UNITY_BUILD`, target link properties, etc.). Project Health makes this distinction explicit.

## Debug, Precompiled Headers and Unity Build

CPM separates **Debug** from **Build & Debug**. The debug button in the C/C++ Workspace title bar launches the already-built executable (or a DLL through its configured host `Program name`) directly under Microsoft C/C++ `cppdbg`/GDB. It does not rebuild first. **Build & Debug** remains available from Run Options, Home, Quick Actions and the command palette. If the selected build mode has no existing target, Debug offers to switch to **Build & Debug**.

The Build page also provides two opt-in acceleration mechanisms for large projects. **Precompiled Headers (PCH)** can be configured independently for C and C++. CPM writes generated wrapper headers and GCC-compatible `.gch` files inside the active object directory and uses the existing `.d` dependency engine to rebuild a PCH when its configured header or a nested include changes.

**Unity Build** groups several original translation units into generated `cpm_unity_*.c/.cpp` files before compilation. The batch size is configurable from 2 to 128. Unity Build can substantially reduce front-end/compiler startup time, but can expose collisions between file-local macros, anonymous declarations or same-named `static` symbols that are harmless when files are separate translation units; it is therefore disabled by default. PCH and Unity Build can be enabled independently or together.

## Build & Debug

The generic build pipeline compiles each included C/C++ source into an object file, then links the configured target.

Supported target types:

- `Executable` -> `.exe` on Windows-style project outputs;
- `Dynamic Link Library` -> `.dll`, optionally accompanied by GNU/MinGW `.dll.a` and/or `.a` import libraries, a Windows `.lib` import library, any supported combination, or none;
- `Static Library` -> a real static archive in `.a` (GNU/LLVM `ar`) or `.lib` (Microsoft/LLVM librarian) format, selected from Project Build Settings.

Debug uses VS Code `cppdbg` with the configured debugger path, usually `gdb` for MinGW/GCC projects.


## Remote Linux / Raspberry Pi

CPM 0.2.77 adds a project-scoped **Remote Linux** workflow for Linux machines and Raspberry Pi targets. Configure the SSH host or OpenSSH alias from **Project Build Settings → Remote Linux** or the **C/C++ Remote Linux** view. The same area exposes the OpenSSH Device Manager for `~/.ssh/config`, keys and host aliases. CPM never stores private-key material itself.

The default workflow synchronizes the active project with `rsync` when available and falls back to `scp`, generates `.cpm/remote/cpm_remote_build.sh`, and builds directly with the configured remote `gcc`, `g++` and `ar`. The generated build maps project-relative paths and deliberately skips absolute host-only Windows include/library paths. Remote-only include/library locations, libraries, flags and pkg-config packages can be added on the Remote Linux page. Projects that require a different build system can replace the generated script with a custom remote build command.

**Build & Run on Remote Linux** uses the existing CPM Run output policy: Integrated Terminal supports stdin plus stdout/stderr, Program Output captures non-interactive output, and Detached uses `nohup`. **Debug on Remote Linux** can start `gdbserver` automatically and then uses Microsoft C/C++ `cppdbg` through SSH `pipeTransport`; GDB runs on the Linux target, while `sourceFileMap` maps remote paths back to the local project for breakpoints and source navigation.

The generated direct build intentionally focuses on files contained in the active project directory. Source files outside that tree, Windows-only SDK paths, complex workspace-level multi-project layouts, or platform-specific build systems should use a custom remote build command (for example Make/Ninja/CMake) and explicit remote search paths.

## Project Health and repair

CPM 0.2.75 adds a native **C/C++ Project Health** view. It summarizes the active project without changing it automatically and highlights issues in the workspace/project files, build dependencies, toolchain, architecture, include/library search paths, linkage/runtime DLLs, DLL host executable, debugger and IntelliSense configuration.

Use the view-title actions to **Refresh**, **Open Project Health Report**, or **Repair Project Health...**. The repair command presents only findings that have an existing corrective action, such as selecting a toolchain, synchronizing IntelliSense, repairing a stale C/C++ provider, editing project build settings, repairing `.cws` compatibility, or inspecting remaining runtime DLL dependencies.


## Notes

Some internal command identifiers still use the historical `cpm` namespace to avoid breaking the existing workspace, project, template and parser services. User-visible labels have been moved to C/C++ Project Manager terminology where this version touches the UI.

## Documentation layout

Historical validation reports and migration notes are stored under `docs/history/`. The project root keeps only `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md` and `TEMPLATES_AND_SNIPPETS.md` as active documentation.

### 0.2.49 editor-context utilities

The CPM editor context menu now mirrors the latest JC Lib utility layout. Under `CPM > Utilities`, the extension exposes the color picker, character table/converter, selected text/numeric conversion helpers, number/bit converter, truth-table/FSM designer and digital-filter designer. These tools insert generated values back into the active C/C++ editor selection when requested.

### 0.2.50 SDL add-on auto-linking

SDL builds now auto-detect common add-on usage from project sources. If the project calls `TTF_Init`, `IMG_Load`, `Mix_OpenAudio`, `SDLNet_Init` or SDL2_gfx helpers and the selected SDK contains the matching headers/libraries, CPM adds the corresponding package to the SDL build plan even when the build settings only list the SDL2 or SDL3 core package. The `SDL packages` field also accepts aliases such as `ttf`, `image`, `mixer` and `net`.


### 0.2.25 workflow update

The new-file picker is grouped by category: C, C++, module bundles, scripts/text and saved templates. Module bundles are split into C, C++ and Scripts. The C group includes generated pure C core/error modules plus Python, Lua, Web UI, UART, IPC and TCP/UDP communication bridges; C++ CPM_Utility modules and companion assets remain separate bundles.



### 0.2.29 C communication bundles

The common CPM_Utility C++ communication bundles now have pure C equivalents for UART, IPC and Ethernet TCP/UDP. They are available under `Module bundles > C`, either individually or through `Full communication stack`.

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

Generated and copied bundle headers now include Doxygen-style usage examples directly in the inserted `.h` / `.hpp` files. The generated C implementation files also include `@file`, `@brief`, `@param` and `@return` documentation blocks on helpers and API functions where applicable. This covers the CPM-native C bundles and the copied CPM_Utility C/C++ communication, Python, Web UI, utility and error-management modules.



### 0.2.72 DLL host execution and advanced autocompletion

### Incremental and parallel build engine

CPM 0.2.74 uses GCC/Clang dependency files for exact incremental rebuilds. Each object has an adjacent `.d` file produced with `-MMD -MP`; changing an included project header recompiles only the translation units that really depend on it. The Build page exposes **Parallel jobs** (`0` = automatic CPU count) and **GNU response files** for long linker command lines. On Windows, Clean/Rebuild uses an atomic rename-and-retry strategy before falling back to in-place deletion, which is more resilient to antivirus, IntelliSense, OneDrive and temporary file locks.

DLL targets can now be launched in the same way as LabWindows/CVI projects. Open **Project Build Settings → Run & Debug** and set **Program name** to the `.exe` that loads or exercises the DLL. The same run configuration supplies command-line arguments, working directory and environment variables. Relative Program name and working-directory paths are resolved from the `.prj` directory. **Run** starts the existing host without building; **Debug** starts that existing host under GDB/cppdbg without building; **Build & Run** and **Build & Debug** remain available when a rebuild is required. Static libraries remain intentionally non-runnable.

The Build Settings editor now also contains an **Autocompletion** page. CPM can participate in C/C++ completion with one of five profiles: **Hybrid** (project symbols + standard-library assist + Signature Help), **Native** (CPM withdraws and leaves the installed native provider alone), **Native + CPM Signature Help**, **Standard Library Assist**, or **Custom**. Custom mode exposes independent switches for CPM completion, active-project symbols, standard-library fallback entries and immediate Signature Help. The standard-library helper can continue to insert a missing `#include` when accepting a fallback item. These controls are also available through VS Code settings and the `C/C++ Project Manager: Select Autocompletion Profile` command.

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

### v0.2.51 embedded library pack refresh

The embedded JC Lib manager now includes the JC Lib 0.8.27 structured packs. Pack imports preserve the source environment/library hierarchy, including the refreshed SDL, Lua, Embedded and Windows API / Devices layouts, plus the new Assembly and Visual Basic / VBA packs.



### 0.2.56 error-template escaping fix

The generated CPM error-management and C++ utility templates now use raw template storage for source code sections that contain C/C++ escape sequences. This prevents `\n`, `\t` and `\0` from being expanded by the extension generator before the `.c`/`.cpp` file is written.

### CPM_Utility C++ helper bundle

The C++ module bundles now use `CPM_Utility` as the canonical utility layer. It generates `cpm_utility.cpp`, `cpm_utility.h` and `utility.ini`, replacing the older split between `MY_Util` and generated `cpm_util` helpers. The bundle includes executable-path helpers, filesystem helpers, text-file I/O, INI parsing, string helpers, timestamp/date/time helpers, delay helpers and a small stopwatch for profiling.



### 0.2.58 — CPM_Utility string helpers and scripting pack refresh

The embedded scripting pack now includes the JC Lib 0.8.28 Windows CMD & Batch structure. The `CPM_Utility` bundle also provides `CPM_String`, with repeat helpers such as `CPM_String("=") * 10`, `10 * CPM_String("-")`, `"*"_cpm * 8` and `cpm_utility::repeat("//", 4)`.

### 0.2.67 — Embedded JC Lib synchronization

The curated embedded library has been synchronized with JC Lib 0.8.36 for the C, C++ and Scripting/System packs. The main auto-seeded C/C++ core pack is rebuilt from the updated language libraries, and the embedded parameter engine now supports nested `insertValueMap` expansion plus optional empty multi-select pickers. This fixes the new dynamic-allocation generators and Git commands such as `git push -u origin <branch>` while allowing optional flag lists to remain empty. See `docs/CPM_0.2.67_JCLIB_SYNC.md`.

### 0.2.60 — CPM_String sequence removal

`CPM_String` now supports sequence removal through `operator-` and `operator-=`. Example: `CPM_String text = "bonjour ça va ?"_cpm; text -= "bonjour";` produces `"ça va ?"` after removing the matching sequence and trimming leading/trailing whitespace.

### 0.2.59 — CPM_String compound operators

`CPM_Utility` now exposes compound operators for `CPM_String`: `+=` for append, `*=` for in-place repetition and `^=` as the compatibility repeat alias.

### CPM 0.2.62 - Marketplace package footprint

The embedded JC Lib payload is now curated for CPM publication. The VSIX keeps the C, C++, C/C++ preprocessor/core, OpenCV, build/toolchains, SDL, Windows API/devices, scripting/system, Python, JavaScript/HTML/CSS, TypeScript, database, PHP and embedded-systems packs. Larger non-essential packs such as legacy/default/CVI, Qt, Java, C#, Kotlin, VBA, Lua and Assembly are no longer shipped in the CPM VSIX. This reduces upload size and lowers the risk of Visual Studio Marketplace request timeouts during publication.


See `docs/PUBLISHING_MARKETPLACE.md` for the Marketplace publication workflow and the curated embedded pack list.

### Detached workspace settings fallback

When a `.cws` or `.prj` is opened directly from CPM without opening the containing folder as a VS Code workspace, CPM cannot use VS Code `Workspace Settings`. In this mode, project Build Settings now write generic compiler, runtime and SDL parameters to `<workspace-root>/.vscode/settings.json` and the build pipeline reads those values back directly.


### Project settings thematic editor

CPM 0.2.64 reorganizes the project settings webview into thematic pages: Overview, Project, Toolchain, Build, Run & Debug, SDL, Packages, Remote Linux, Dependencies and Diagnostics. Each page has its own section jump selector and local filter, which makes the settings editor easier to extend without returning to a single long scroll page.

The Diagnostics page also exposes `cpm.buildLogDetail`, while full compiler commands remain available through the dedicated Build Trace output channel.

### v0.2.65 - Build Settings navigation fix

The thematic Build Settings editor keeps its page navigation active after the webview loads. The inline controller now avoids escape sequences that can break the generated script, and non-Overview sections are hidden until the controller is initialized.


### Application icons

The project settings editor contains an **Application icons** section for executable and DLL-oriented targets.

- **Executable icon (Windows .ico)** embeds a Windows icon into generated `.exe` files by producing a temporary resource script and compiling it with `windres` or `llvm-windres` from the selected toolchain.
- **SDL window / application icon image** copies the selected image beside the executable. When **Apply SDL window icon automatically** is enabled and the project uses SDL2 or SDL3, CPM generates a small `SDL_CreateWindow(...)` wrapper so the icon is applied to the created window.

For SDL window icons, BMP works with the core SDL runtime. PNG, JPG and WebP should be used together with the corresponding `SDL2_image` or `SDL3_image` package.


### Embedded library payload (0.2.68)

The current Marketplace payload includes the curated CPM packs plus the cleaned Lua catalog from JC Lib 0.8.38 and the LabWindows/CVI structured API catalog. CVI is exposed under its own `CVI` environment. On activation, CPM also performs a one-way cleanup of retired catalog content left in user global pack storage by older versions.


## Windows CPM Setup / supported toolchains

CPM 0.2.80 includes a Windows toolchain installer. Use **C/C++ Project Manager: Install / Manage Supported Toolchains** or select **Install / update supported MinGW toolchains...** from the toolchain picker.

The supported setup provisions side-by-side MSYS2 environments:

- `ucrt64` — MinGW-w64 GCC/G++ 64-bit (recommended), GDB, Make and pkgconf; optional CMake/Ninja.
- `mingw32` — MinGW-w64 GCC/G++ 32-bit plus GDB and Make.

The installer does not place both compiler directories on PATH. It records the MSYS2 root and CPM discovers the architecture-specific `bin` directories independently. A standalone setup bundle can also install/update the VSIX and Microsoft C/C++ (`ms-vscode.cpptools`).

## Windows import libraries (.lib)

CPM can generate Windows **DLL import libraries** from either C/C++ header declarations or from an existing DLL. The feature is available from file context menus and from **Project Build Settings → Libraries**.

### Header(s) → import library

Select one or several `.h/.hpp/.hh/.hxx` files in the project tree and use **Generate Import Library (.lib) from Header(s)...**. CPM scans free-function declarations, lets you choose the exported names, writes a module-definition (`.def`) file and invokes the configured generator.

A header contains declarations, not the DLL implementation. This workflow therefore creates an **import library**, not a self-contained static library: the matching DLL is still required when the application runs. For overloaded C++ APIs, exact decorated export names cannot be reconstructed reliably from headers alone; prefer DLL-based generation or an `extern "C"` API.

### DLL(s) → import libraries

Right-click a `.dll` registered in the CPM project and choose **Generate DLL Import Library (.lib)...**. CPM opens a dedicated batch editor instead of a simple export picker. The clicked DLL is preloaded and **+ Add DLL(s)…** can add more inputs. Every DLL row has its own source-file browser, `.lib` output browser, export filter and Select All/None controls. CPM generates **one `.lib` per DLL**, which keeps the Windows import descriptor/runtime DLL association explicit. Duplicate DLL base names receive unique default output names.

CPM reads each PE export directory, detects x86/x64/ARM64 and preserves decorated C++ export names because they come from the DLL itself. An additional **Extract DLL Exports (.def)...** action remains available for manual review/editing.

Supported generators are Microsoft `lib.exe`, LLVM `llvm-lib`, LLVM `llvm-dlltool` and GNU/MinGW `dlltool`. Automatic mode follows the active CPM toolchain. Generated libraries may be added directly to the project.

## DLL Analyzer

CPM 0.2.86 added **Analyze DLL...** to DLL context menus. In CPM 0.2.92 the analyzer is hosted under **Libraries → DLL Analyzer** when project settings are open, and is also available from the project-independent **Settings & Tools → Libraries & Analyzers** hub when no project is loaded. The analyzer works directly on Windows PE files and displays: architecture and PE32/PE32+ format, image base/entry point/subsystem, link timestamp, file size and SHA-256, fixed/string VERSIONINFO fields (including FileVersion/ProductVersion and revision), named/ordinal exports, imported DLLs and functions, sections, resource types, PE/DLL flags, Authenticode certificate-table presence, CLR/.NET header presence and CodeView/PDB information when present. The analysis can be exported as Markdown. Long CodeView/PDB fields are displayed vertically and wrapped to avoid layout overlap.

The analyzer is structural and read-only: certificate-table presence does not by itself validate trust/signature status, and a PE export table does not reliably distinguish exported data from exported functions. Those limits are reported rather than guessed.

## .a / .lib Library Analyzer and library output formats

CPM 0.2.87 added **Analyze .a / .lib Library...** to `.a` and `.lib` project-file context menus. In CPM 0.2.92 this analyzer is grouped under **Libraries → .lib / .a / .dll.a Analyzer** and is also available without an active project from **Settings & Tools → Libraries & Analyzers**. The analyzer reads the archive itself rather than trusting the extension. It reports archive members, linker symbols, detected COFF/ELF/LLVM object members, architectures, short COFF import objects and referenced runtime DLL names. It classifies an archive as a **static library**, **import library**, **mixed archive**, or **unknown**.

A `.lib` extension is not a separate semantic target type: a `.lib` can contain real static COFF object code or act as a Windows DLL import library. Likewise, MinGW commonly uses `.dll.a` for import libraries. CPM therefore keeps the target types **Static Library** and **Dynamic Link Library** and exposes the format separately.

For the Direct GCC/Clang backend, **Static Library format** can be `Automatic`, `GNU/LLVM archive (.a)`, or `Windows COFF library (.lib)`. A real static `.lib` requires a compatible librarian such as Microsoft `lib.exe` or LLVM `llvm-lib`; CPM does not merely rename an `ar` archive to `.lib`.

For **Dynamic Link Library**, **DLL import-library outputs** can be `Automatic`, GNU/MinGW `.dll.a`, GNU/MinGW `.a` (legacy/ambiguous naming), Windows `.lib`, combinations of those outputs, or `none`. GNU output is emitted directly by the linker with `--out-implib`; when both GNU names are requested CPM duplicates the same import archive under both `.dll.a` and `.a`. `.lib` generation reuses CPM's DLL export/import-library generator. The `.dll` always remains the runtime implementation.

Archive files generally do not carry a PE `VERSIONINFO` block at archive level, so CPM does not invent FileVersion/ProductVersion/revision values for `.a/.lib`. Versioning must come from project/package metadata or from a DLL/executable that embeds Windows version resources.

