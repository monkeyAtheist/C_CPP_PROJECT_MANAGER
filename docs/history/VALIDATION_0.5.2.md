# LabWindows/CVI Project Manager 0.5.2 — validation

## Scope

Version 0.5.2 addresses IntelliSense failures observed when a CVI project was opened only from the dedicated CVI explorer. Build commands already worked, but Microsoft C/C++ could fail to resolve CVI ANSI headers and `windows.h` until the same directory was opened manually in the standard VS Code Explorer.

## Implemented behavior

When a `.cws` or standalone `.prj` file is loaded, the extension now adds its containing directory to the standard VS Code Explorer by default. The operation uses `vscode.workspace.updateWorkspaceFolders()` and is skipped when the directory is already contained in an open VS Code folder.

The behavior can be disabled with:

```text
labwindowsCvi.autoAddCviFolderToWorkspace
```

The managed `c_cpp_properties.json` configuration and the dynamic Microsoft C/C++ provider now expose:

```text
<CVI>/include
<CVI>/include/ansi
<CVI>/include/clang/**
<CVI>/toolslib
<CVI>/toolslib/**
<CVI>/toolslib/toolbox
<Windows Kits>/10/Include/**
<Windows Kits>/8.1/Include/**
<Microsoft SDKs>/Windows/v7.1A/Include/**
```

For Windows Kits, the resolver also enumerates concrete versioned directories and the standard SDK segments:

```text
um
shared
ucrt
winrt
cppwinrt
```

The diagnostic command reports discovered `ansi.h` / `ansi_c.h` candidates and `windows.h` candidates.

## Automated validation

The validation script creates a simulated CVI 2020 installation and Windows SDK tree, then verifies:

| Check | Result |
|---|---|
| Standard VS Code Explorer receives the CVI project directory | OK |
| `.vscode/c_cpp_properties.json` is generated in the CVI directory | OK |
| Nested CVI Clang compiler path is preserved | OK |
| `<CVI>/include/ansi` is present in dynamic and static paths | OK |
| Windows SDK `um` directory containing `windows.h` is present | OK |
| Windows SDK `shared` directory is present | OK |
| Windows SDK `ucrt` directory is present | OK |
| TypeScript compilation | OK |
| VSIX packaging | OK |

Detailed machine-readable result:

```text
INTELLISENSE_WORKSPACE_SYNC_0.5.2_VALIDATION.json
```

## Remaining manual check

The generated VSIX must still be installed on the Windows workstation to confirm the actual CVI 2020 and Windows SDK layout. After reloading VS Code, open the CVI workspace and check that the directory appears automatically in the standard Explorer. Then open a source file containing:

```c
#include <windows.h>
#include <ansi.h>
#include "toolbox.h"
```

If a header remains unresolved, run **LabWindows/CVI: Diagnose C/C++ IntelliSense Configuration** and inspect the candidate paths in the **LabWindows/CVI** output channel.
