# CPM 0.2.69 — Program output routing

## Problem

CPM 0.2.68 launched executable targets with Node `spawn(..., { stdio: 'ignore' })`. As a result, normal program stdout/stderr was intentionally discarded, so calls such as `printf`, `puts`, `std::cout`, `std::cerr` and similar output were not visible from VS Code.

## Changes

A new `cpm.runOutputMode` setting is available from **Project Build Settings → Run → Program output** and from VS Code settings.

- `integrated-terminal` (default): runs the executable directly in a VS Code integrated terminal. stdout/stderr are visible and interactive stdin is supported (`scanf`, `fgets(stdin)`, `std::cin`, etc.).
- `output-channel`: captures stdout/stderr into **C/C++ Project Manager - Program Output**. This mode is intended for non-interactive programs because stdin is not attached.
- `detached`: preserves the legacy CPM behavior; the executable runs detached and stdout/stderr are not captured.

For cppdbg/GDB debugging, CPM now explicitly configures `externalConsole: false`, `avoidWindowsConsoleRedirection: false`, and `internalConsoleOptions: neverOpen`, so Windows debuggee console I/O is routed to the VS Code integrated terminal instead of being hidden behind the Debug Console.

## Validation

- TypeScript clean compilation: PASS.
- VSIX packaging: PASS.
- VSIX version: 0.2.69.
- `cpm.runOutputMode` manifest setting and default: PASS.
- Integrated Terminal run path present in packaged runtime: PASS.
- Program Output stdout/stderr capture path present: PASS.
- Detached legacy path preserved: PASS.
- Explicit cppdbg Windows console redirection settings present: PASS.

## Manual checks recommended on Windows

1. Console C test: `printf("hello\n");`.
2. Console C++ test: `std::cout << "hello" << std::endl;`.
3. Interactive C test with `scanf` in Integrated Terminal mode.
4. Interactive C++ test with `std::cin` in Integrated Terminal mode.
5. Program Output mode with stdout and stderr.
6. GDB debug session and verify output/input in the integrated terminal.
7. Detached mode to confirm backward-compatible GUI/background launch behavior.
