# C/C++ Project Manager

Visual Studio Code extension for creating and managing lightweight C/C++ workspaces and projects without writing `tasks.json` or `launch.json` manually.

The extension is derived from the former LabWindows/CVI project-manager architecture, but the build and debug workflow is now generic C/C++. It keeps the `.cws/.prj` project model for compatibility with the existing workspace explorer, while using configurable GCC/MinGW/Clang/GDB tools for compilation and debugging.

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

## Toolchain selection

Use **C/C++ Project Manager: Detect / Select Toolchain** or the **Detect / select toolchain** button on the home page.

The selector lists detected GCC, MinGW, MSYS2 and Clang toolchains. It also provides two manual options:

- add a toolchain from a root or `bin` directory;
- enter the C compiler, C++ compiler, archiver and debugger executable paths manually.

The selected paths are stored in these settings:

- `labwindowsCvi.cCompilerPath`
- `labwindowsCvi.cppCompilerPath`
- `labwindowsCvi.archiverPath`
- `labwindowsCvi.debuggerPath`
- `labwindowsCvi.intelliSenseCompilerPath`

The setting prefix is kept for compatibility with the original project-manager codebase and may be migrated in a later version.

## Build and debug

The generic build pipeline compiles each included C/C++ source into an object file, then links the configured target.

Supported target types:

- `Executable` -> `.exe` on Windows-style project outputs;
- `Dynamic Link Library` -> `.dll`;
- `Static Library` -> `.a`.

Debug uses VS Code `cppdbg` with the configured debugger path, usually `gdb` for MinGW/GCC projects.

## Notes

Some internal command identifiers still use the historical `labwindowsCvi` namespace to avoid breaking the existing workspace, project, template and parser services. User-visible labels have been moved to C/C++ Project Manager terminology where this version touches the UI.
