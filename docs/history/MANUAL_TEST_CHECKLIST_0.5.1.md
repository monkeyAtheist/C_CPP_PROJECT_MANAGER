# Manual test checklist — 0.5.1 CVI IntelliSense

1. Install `labwindows-cvi-project-manager-0.5.1.vsix` and reload VS Code.
2. Select the CVI 2020 installation with **LabWindows/CVI: Select Installation**.
3. Open a `.cws` workspace through the CVI extension explorer.
4. Execute **LabWindows/CVI: Synchronize C/C++ IntelliSense Configuration**.
5. Inspect `.vscode/c_cpp_properties.json` and verify:
   - `configurationProvider` equals `jc-tools.labwindows-cvi-project-manager`;
   - `mergeConfigurations` equals `true`;
   - `<CVI>/include/ansi` exists;
   - `<CVI>/include/clang/**` exists;
   - `<CVI>/toolslib/toolbox` exists;
   - `compilerPath` exists when an internal CVI Clang executable is detected.
6. Execute **LabWindows/CVI: Diagnose C/C++ IntelliSense Configuration**.
7. Confirm `toolbox.h exists: yes` in the LabWindows/CVI output channel.
8. Open a project source containing `#include "toolbox.h"`.
9. Confirm that the missing-header diagnostic disappears.
10. Open a source file from a CVI project located outside the initially opened VS Code folder and confirm that the dynamic provider still resolves CVI includes.
11. If several VS Code configuration providers are installed, use **C/C++: Select IntelliSense Configuration...** and select **LabWindows/CVI Project Manager**.
12. If stale red squiggles remain, execute **C/C++: Reset IntelliSense Database** once.
