# CPM Setup / Toolchain Installer

This setup installs or updates the VS Code **C/C++ Project Manager and Build** extension and can provision supported Windows C/C++ toolchains through the official MSYS2 distribution.

Default components:

- MinGW-w64 GCC/G++ 64-bit through the MSYS2 **UCRT64** environment.
- MinGW-w64 GCC/G++ 32-bit through the MSYS2 **MINGW32** environment.
- GDB for both architectures.
- GNU Make for both architectures.
- CMake + Ninja in UCRT64.
- Microsoft C/C++ (`ms-vscode.cpptools`) for IntelliSense and cppdbg.
- CPM VSIX when the setup bundle contains it.

The two GCC environments are **not both added to PATH**. CPM detects them independently. The setup writes `MSYS2_ROOT` and `CPM_TOOLCHAINS_ROOT` as user environment variables. Adding `ucrt64\\bin` to user PATH is an explicit optional checkbox.

Preferred installation: run the single-file `CPM-Setup-0.2.88.exe`.

Fallback/developer mode: run `CPM-Setup.cmd`, or from PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\CPM-Toolchain-Installer.ps1
```

Silent example:

```powershell
.\CPM-Toolchain-Installer.ps1 -Silent -InstallX64 -InstallX86 -InstallBuildTools -InstallCppTools
```

Logs and the detected toolchain report are written under `%LOCALAPPDATA%\CPM\setup`.


## Single-file EXE bootstrapper

`CPM-Setup-0.2.88.exe` is built from `CPM-Setup-Launcher.go`. It embeds the VSIX and PowerShell installer, extracts them to a temporary directory, opens the graphical toolchain setup, then removes the temporary payload.

To rebuild the single-file EXE from source, package the 0.2.88 VSIX first and run `BUILD_INSTALLER_EXE.cmd` with Go available on PATH. The older NSIS source is retained only as an alternate packaging path.
