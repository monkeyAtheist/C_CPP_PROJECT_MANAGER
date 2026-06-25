# LabWindows/CVI Project Manager 0.5.1 — IntelliSense repair validation

## Scope

Version `0.5.1` repairs CVI header resolution in Microsoft C/C++ IntelliSense while keeping the CVI build pipeline unchanged.

## Reported symptom

A CVI project compiled successfully through `compile.exe`, but VS Code displayed unresolved include diagnostics for CVI Toolslib headers such as:

```c
#include "toolbox.h"
```

The supplied managed `c_cpp_properties.json` already contained `<CVI>/toolslib/**` and `<CVI>/toolslib/toolbox`, but it did not contain `compilerPath`. This exposed two weaknesses in `0.5.0`: internal Clang discovery was too narrow for newer CVI layouts, and JSON generation alone could not guarantee that Microsoft C/C++ applied the configuration when files were opened from the custom explorer outside the active VS Code folder.

## Changes validated

- dynamic provider registration through the Microsoft C/C++ custom configuration provider API;
- managed JSON fallback retained;
- provider ID emitted as `jc-tools.labwindows-cvi-project-manager`;
- `mergeConfigurations: true` emitted;
- nested CVI compiler search under `bin/clang/<version>`;
- detection of `clang-cc.exe`, `clang.exe` and `clang-cl.exe`;
- explicit ANSI, Clang, Toolslib and Toolbox paths;
- concrete Toolslib header-directory enumeration;
- project source and include-directory enumeration;
- manual compiler override setting;
- additional include-path setting;
- IntelliSense diagnostic command;
- command to add the CVI root folder to the current VS Code workspace.

## Automated fixture

A temporary CVI 2020-like installation tree was generated with:

```text
CVI2020/
├── bin/compile.exe
├── bin/cvi.exe
├── bin/clang/3.3/clang.exe
├── include/userint.h
├── include/ansi/stdio.h
├── include/clang/3.3/stddef.h
└── toolslib/
    ├── toolbox/toolbox.h
    └── custom/custom.h
```

A temporary CVI project tree contained `src/main.c` and `include/app.h`.

## Automated results

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| Nested `bin/clang/3.3/clang.exe` discovery | OK |
| Managed `compilerPath` emission | OK |
| Managed `configurationProvider` emission | OK |
| Managed `mergeConfigurations` emission | OK |
| Managed `<CVI>/toolslib/toolbox` inclusion | OK |
| Managed `<CVI>/include/ansi` inclusion | OK |
| Managed `<CVI>/include/clang/**` inclusion | OK |
| Dynamic provider registration | OK |
| Dynamic provider ready notification | OK |
| Dynamic source-file configuration | OK |
| Dynamic browse configuration | OK |
| Provider Toolslib Toolbox inclusion | OK |
| Provider nested Toolslib directory inclusion | OK |
| Provider project source-directory inclusion | OK |
| Provider project include-directory inclusion | OK |

## Fixture metrics

```text
Managed include paths: 12
Dynamic provider include paths: 9
Configuration provider: jc-tools.labwindows-cvi-project-manager
Detected compiler: <fixture>/CVI2020/bin/clang/3.3/clang.exe
```

## Manual Windows check

The Linux packaging environment cannot launch VS Code with a real Windows CVI installation. After installation on Windows:

1. reload VS Code;
2. open the CVI workspace;
3. execute **LabWindows/CVI: Synchronize C/C++ IntelliSense Configuration**;
4. execute **LabWindows/CVI: Diagnose C/C++ IntelliSense Configuration**;
5. confirm that `toolbox.h exists: yes` is displayed in the LabWindows/CVI output channel;
6. reopen a source containing `#include "toolbox.h"`;
7. run **C/C++: Reset IntelliSense Database** if stale diagnostics remain after the first reload.
