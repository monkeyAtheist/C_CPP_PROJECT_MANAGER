# CPM 0.2.78 — Run Debug, Precompiled Headers and Unity Build

## Scope

This revision adds a direct **Run Debug** workflow and two opt-in build-acceleration mechanisms to the direct GCC/Clang CPM backend: managed precompiled headers and Unity Build.

## Run Debug

`cpm.runDebug` is exposed in the C/C++ Workspace title toolbar with the VS Code `debug-start` icon. Unlike `cpm.debugWithGdb` (Build & Debug), it does not build before launching the debugger. It resolves the existing target for the active build mode, validates the executable or DLL host, prepares runtime search paths/environment, and launches `cppdbg`/GDB directly.

If no existing target is available, CPM offers **Build & Debug** as a fallback. Static-library targets remain non-runnable. DLL projects continue to use their configured host `Program name`.

The stale `cpm.debugInCpm` references in Home/Quick Actions were removed. Home and Quick Actions now expose Run Debug and Build & Debug explicitly.

## Precompiled Headers

Project Build Settings -> Build -> Build acceleration now contains:

- Enable CPM-managed precompiled headers
- C PCH header
- C++ PCH header

C and C++ PCH are independent. CPM generates wrappers in the active object directory:

- `cpm_pch_c.h` + `cpm_pch_c.h.gch`
- `cpm_pch_cpp.hpp` + `cpm_pch_cpp.hpp.gch`

The generated PCH uses the same standard, architecture, optimization/debug flags, warning options, defines, include directories, SDL flags, dependency-manager flags and language-specific compiler flags as normal compilation.

PCH compilation also emits GCC/Clang `.d` metadata. Nested includes therefore invalidate the PCH when required. The generated wrapper additionally contains a build-configuration signature, so changing compiler/flags/defines/includes/standard also rewrites the wrapper and rebuilds the `.gch`.

Normal source compilation uses `-include <generated-wrapper>`, allowing GCC/MinGW to load the adjacent `.gch` automatically.

## Unity Build

Unity Build is disabled by default and is configured with a batch size from 2 to 128. CPM groups C and C++ sources separately and generates files such as:

- `cpm_unity_c_001.c`
- `cpm_unity_cpp_001.cpp`

Each generated translation unit includes a batch of original sources by absolute normalized include path. A one-file remainder stays as a normal translation unit instead of creating a pointless one-source unity file.

The existing `.d` dependency engine remains active. A generated unity object is invalidated when the generated unity file, any included original source, or any header dependency changes.

Unity Build can alter translation-unit semantics. File-local macro state, anonymous declarations, and same-named `static` symbols can collide once multiple source files share one translation unit. For that reason the option is explicitly opt-in.

## Combined mode

PCH and Unity Build can be enabled together. The PCH is generated first, then each unity source is compiled with the generated PCH wrapper forced into the translation unit.

## Project Health

Project Health reports:

- whether PCH is enabled;
- configured C/C++ PCH headers;
- missing PCH header paths;
- Unity Build state and batch size.

## Validation

The following checks pass on the final source tree:

- TypeScript compilation: PASS
- CPM 0.2.78 acceleration/debug tests: 6/6 PASS
- Real GCC/G++ PCH generation: PASS
- Real GCC/G++ Unity compilation using the generated PCH: PASS
- Generated `.d` contains original Unity member sources: PASS
- Remote Linux 0.2.77 regression: 11/11 PASS
- External dependencies 0.2.76 regression: 8/8 PASS
- Project Health 0.2.75 regression: 9/9 PASS
- Build engine 0.2.74 regression: 10/10 PASS
- Static linkage 0.2.73 regression: 9/9 PASS
- DLL/autocompletion 0.2.72 regression: 11/11 PASS
- File Symbols / pack editor regression suites: PASS
- Final VSIX package version: 0.2.78

Both PCH and Unity Build are disabled by default, so upgrading an existing project does not change its compilation model until explicitly enabled.
