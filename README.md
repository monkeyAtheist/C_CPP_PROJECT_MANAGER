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
- Generate C and C++ utility module bundles, including pure C Python, Web UI, UART, IPC and TCP/UDP communication bridges, plus separate companion script/frontend bundles.

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


### 0.2.25 workflow update

The new-file picker is grouped by category: C, C++, module bundles, scripts/text and saved templates. Module bundles are split into C, C++ and Scripts. The C group includes generated pure C core/error modules plus Python, Web UI, UART, IPC and TCP/UDP communication bridges; C++ MY_Util modules and companion assets remain separate bundles.



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

### Special-character text comments

The C `Python execution bridge` bundle is compatible with older MinGW/MinGW32 headers and avoids Windows APIs that are not declared by default in those toolchains.

`Insert special-character text` generates ASCII-style text from a normal string. The command lets you choose the fill pattern (`//`, `\\`, `||`, `**`, `##`, `==`, `--`, `++` or custom), one of five size presets, and whether the result is inserted as C/C++ line comments, a C block comment or raw characters. Sizes now range from Micro/Small compact 3x5 text up to Large, which corresponds to the previous size 2.

### Header change entries

`Insert header change line` keeps the CHANGES/EVOLUTIONS table width stable. Descriptions longer than the Description column are wrapped onto continuation rows, and a separator row is inserted under the generated entry.

