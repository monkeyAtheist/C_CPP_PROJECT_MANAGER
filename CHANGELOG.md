## 0.2.38 - Bundle Doxygen examples

- Added Doxygen-style usage examples to generated bundle headers, including the C Python execution bridge example requested for `CpmPython_RunScript`.
- Added generated `@file`, `@brief`, `@param` and `@return` documentation blocks to C bundle implementations and internal helpers where applicable.
- Extended the same documentation pass to copied C/C++ MY_Util bundle files so communication, Python, Web UI, utility and error-management modules are easier to understand after insertion.

## 0.2.37 - Python execution bridge MinGW compatibility

- Fixed the generated C `Python execution bridge` bundle for older MinGW/MinGW32 toolchains where `GetTickCount64` is not declared by default.
- Replaced the Windows timeout counter with a `GetTickCount`-based wrap-safe calculation so `cpm_python_exec.c` builds with the 32-bit MinGW toolchain used by CPM.

## 0.2.36 - Smaller special-character text sizes

- Reworked `Insert special-character text` size selection as five explicit presets.
- Added smaller outputs: Micro and Small use a compact 3x5 font, and Narrow uses the standard 5x7 font with a single-character stroke.
- Capped the largest preset to the previous size 2, which keeps generated banners usable inside source comments.

## 0.2.35 - Special-character text comments

- Added `Insert special-character text` under `CPM > Documentation / comments`.
- The command renders large ASCII-style text from a normal string, with selectable fill patterns such as `//`, `\\`, `||`, `**`, `##`, `==`, `--` and `++`, plus a custom pattern option.
- Added a size/scale selector from 1 to 5 and insertion modes for C/C++ line comments, C block comments or raw characters.


## 0.2.34 - Header change line wrapping

- Improved `Insert header change line`: long CHANGES/EVOLUTIONS descriptions now wrap on continuation rows instead of being truncated with an ellipsis.
- Added the table separator line automatically after each inserted change entry:
  `//**__________|____________|_________|______________________________________**`

## 0.2.33

- Added CAN communication bundles.
- Added `Module bundles > C > CAN communication` generating `cpm_can.c`, `cpm_can.h` and a README.
- Added `Module bundles > C++ > CAN communication` generating the `Communication/can` SocketCAN C++ helper.
- Updated the C full communication stack to include UART, IPC, Ethernet, Wi-Fi, Bluetooth, CAN, I2C and SPI.
- The generated CAN modules support Linux SocketCAN, classical CAN, CAN FD, receive timeouts, loopback, own-message reception, filters and diagnostic frame formatting.
- Unsupported platforms return a clear unsupported status by default; Windows CAN adapters are intentionally left for vendor-SDK adapters.

## 0.2.32

- Added C bundle equivalents for Wi-Fi and Bluetooth Classic RFCOMM communication.
- Added `Module bundles > C > Wi-Fi communication` generating `cpm_wifi.c`, `cpm_wifi.h` and a README.
- Added `Module bundles > C > Bluetooth RFCOMM communication` generating `cpm_bluetooth.c`, `cpm_bluetooth.h` and a README.
- Added separate C++ bundle entries for the original MY_Util Wi-Fi and Bluetooth classes.
- Updated the C full communication stack to include UART, IPC, Ethernet, Wi-Fi, Bluetooth, I2C and SPI.
- Documented the scope limits: Wi-Fi uses regular TCP/UDP after OS network connection, while the generated Bluetooth C module is Windows RFCOMM-first and returns an unsupported status elsewhere.

## 0.2.31

- Added C bundle equivalents for I2C and SPI communication.
- Added `Module bundles > C > I2C communication` generating `cpm_i2c.c`, `cpm_i2c.h` and a README.
- Added `Module bundles > C > SPI communication` generating `cpm_spi.c`, `cpm_spi.h` and a README.
- Updated the C full communication stack to include UART, IPC, Ethernet, I2C and SPI.
- Added separate C++ bundle entries for the original MY_Util I2C and SPI classes.

## 0.2.30

- Split the script bundles into generic starters and project-specific demos.
- Added `Module bundles > Scripts > Python worker protocol starter` for a minimal Python stdin/stdout worker protocol.
- Renamed the old project-specific Python scripts to `Robot demo Python scripts`.
- Added `Module bundles > Scripts > Minimal Web UI frontend` with a generic `/api/state` and `/api/action` frontend.
- Renamed the old Raspberry Pi/GPIO/camera-oriented frontend to `Embedded demo Web UI frontend`.
- Added README/API notes to generated C bundles and C communication bundles.
- Automatically adds `ws2_32` to CPM linker libraries on Windows when socket or Web UI backend bundles are added.

## 0.2.29

- Added pure C communication bundle equivalents for the exposed MY_Util C++ communication bundles.
- Added `Module bundles > C > UART communication` generating `cpm_uart.c` / `cpm_uart.h`.
- Added `Module bundles > C > IPC communication` generating `cpm_ipc.c` / `cpm_ipc.h`.
- Added `Module bundles > C > Ethernet TCP-UDP communication` generating `cpm_socket.c` / `cpm_socket.h`.
- Added `Module bundles > C > Full communication stack` to create the C UART, IPC and Ethernet modules together.

## 0.2.27

## 0.2.28

- Reworked the Web UI bundles so backend source files and frontend HTML/JS/CSS assets are selected separately.
- Added a generated pure C Web UI backend bridge (`cpm_webui.c` / `cpm_webui.h`).
- Changed the C++ Web UI bundle to copy only `webui.cpp` and `webui.h`; static frontend files are now in `Scripts > Web UI static frontend`.
- Curated the complete C++ bundle to avoid copying the OpenCV real-time demo and project-specific frontend assets by default.


- Added a generated pure C Python execution bridge bundle under `Module bundles > C > Python execution bridge`.
- The C bridge creates `cpm_python_exec.c` and `cpm_python_exec.h` and exposes a C API for running Python scripts, maintaining a session, sending lines/JSON and reading stdout.
- Kept the existing MY_Util C++ Python bridge under the C++ bundle group; companion Python scripts remain a separate script bundle.


## 0.2.26

- Reworked the file creation workflow into true category-based pickers: C, C++, Module bundles, Scripts and text, and Saved templates.
- Moved the Windows DLL starter into the C creation category to keep C-related starters together.
- Reworked module bundle selection into folder-like bundle categories: C, C++, and Scripts.
- Changed generated bundle default target folders to `Bundle/C`, `Bundle/C++`, and `Bundle/Scripts`.
- Added generated C++ equivalents for the generated CPM core utility and error-management bundles.
- Kept complex communication modules as C++-only MY_Util bundles because a reliable C conversion would require a dedicated API rewrite.

# Changelog

## 0.2.25

- Grouped the new-file/starter picker into C files, C++ files, Windows/DLL, module bundles, scripts/text and saved templates.
- Split the MY_Util Python integration into a C++ Python execution bridge and a separate Python companion scripts bundle.
- Renamed the C++ bundle group labels to avoid repeating MY_Util in the quick-pick list while keeping the original folder structure.

## 0.2.24

- Renamed the MY_Util creation entry to a generic `Module bundle...` action.
- Grouped module bundles by language with C and C++ sections.
- Removed repetitive `MY_Util /` prefixes from bundle labels.
- Added generated C module bundles for core utility helpers and CPM error management.


## 0.2.23

- Fixed local publishing/build failures caused by obsolete legacy `cvi*.ts` sources left in an existing source folder after copying a newer CPM archive over an older CVI-derived tree.
- Added a safe pre-compile cleanup step, `npm run clean:legacy-cvi`, which removes known obsolete LabWindows/CVI TypeScript files before `tsc`.
- Added `tsconfig.json` exclusions for legacy `cvi*.ts`, DDE and ActiveX bridge sources so stale files no longer participate in TypeScript compilation.

## 0.2.22

- Shortened the labels displayed inside the editor context-menu submenus.
- The root menu remains `CPM`, while nested actions now display as `Insert file description header`, `Insert header change line`, `Insert comment section`, `Insert snippet`, `Save selection as snippet` and `Manage snippets...` without repeating the `CPM:` prefix.

## 0.2.21

- Removed generated `(void)parameter;` and `static_cast<void>(parameter);` lines from the C, C++, WinMain, DLL and CPM error-handling starters.
- Added basic command-line argument handling blocks to generated `main()` starters.
- Added an `lpCmdLine` handling block to the generated WinMain starter so Windows command-line arguments are visible in the template.
- Updated the bundled DllMain snippets and JC Lib entry to avoid obsolete unused-parameter casts while still referencing `hinstDLL` and `lpvReserved`.

## 0.2.20

- Centralized editor context-menu actions under a single `CPM` submenu to avoid overloading the native VS Code right-click menu.
- Added `CPM > Documentation / comments` with commands to insert a file description header, append a CHANGES/EVOLUTIONS line and insert reusable comment-section separators.
- Added a creation starter `C main with CPM error handling` that can generate `main.c`, optional `main.h`, and optional `cpm_error.c/.h/.ini` support files.
- Added documentation/comment snippets for file headers, change lines and section separators.



## 0.2.19

- Added MinGW runtime DLL cleanup before runtime deployment.
- CPM now removes stale MinGW runtime DLLs and architecture-mismatched runtime DLLs from the target directory before copying the active toolchain runtime.
- This prevents keeping 32-bit runtime DLLs beside an executable after switching to a 64-bit build mode, and vice versa.

## 0.2.18

- Adds runtime deployment for MinGW DLL dependencies such as `libgcc_s_*.dll`, `libstdc++-6.dll` and `libwinpthread-1.dll` beside generated executable/DLL targets.
- The Run and Debug commands now prepend the selected toolchain `bin` directory and the target directory to the process `PATH`, preventing missing-runtime-DLL dialogs when launching from CPM.
- Adds a local object-directory fallback for projects located under OneDrive when Windows returns `EPERM`, `EACCES` or `EBUSY` while creating the normal build object directory.
- Adds the settings `cpm.deployRuntimeDlls` and `cpm.useLocalBuildCacheForOneDrive`.

## 0.2.17

- Added a more robust Windows launch path strategy for GCC/MinGW installed under directories containing spaces, such as `C:\Program Files`.
- The build service now tries, in order: DOS 8.3 short path, NTFS junction alias, then basename launch with the selected toolchain `bin` directory prepended to `PATH`.
- Added explicit output diagnostics for the selected fallback path so toolchain path issues are easier to identify.

## 0.2.9


## 0.2.15

- Fixes toolchain selection persistence: selecting a toolchain now updates workspace settings as well as user/global settings, so old workspace-local `gcc`/`g++` values no longer silently override the selected toolchain.
- Makes `Debug x64` and `Release x64` force `-m64` when architecture mode is left on Auto, matching the visible build mode and preventing accidental 32-bit objects.
- Uses the compiled object architecture as the primary source for linked-library compatibility diagnostics; compiler-path heuristics are used only as fallback.

## 0.2.14

- Added an automatic no-space junction alias fallback for GCC/MinGW toolchains installed under paths containing spaces, such as `C:\Program Files\mingw64`.
- The build output now reports `Windows no-space tool path` when a short path or CPM alias is used for `gcc`, `g++`, `clang` or compatible tools.
- This avoids MinGW linker failures where internal paths are split as `C:/Program` and `Files/.../default-manifest.o`.

## 0.2.11

- Renamed the context-menu command used to save the current editor selection as a snippet.
- The command is now displayed as `CPM: Save selection as snippet` instead of the previous long C/C++ Project Manager label.


## 0.2.10

- Adapted the C/C++ build settings panel to the selected target type.
- Static library targets now expose archiver-related options and hide run/debug/linker-only fields.
- Executable targets expose debugger and run command-line options.
- DLL targets expose linker settings and external-host run options while hiding direct debugger fields.
- Added target-specific explanatory notes in the build settings webview.

- Added predefined build-option lists for architecture, warning level, optimization level and debug-information generation in the C/C++ build-settings editor.
- Wired those predefined options into the generic GCC/MinGW build command generation, while keeping advanced free-form flags available for project-specific cases.
- Added file/folder browser buttons to path-oriented build fields: compiler executables, archiver, debugger, output directory, include directories and library directories.


## 0.2.8

- Cleaned the build-settings editor for the generic C/C++ workflow. CVI-only target creation options, LoadExternalModule controls, NI type information, version-resource editing and signing blocks are no longer displayed in the CPM build settings page.
- Added a generic compiler/linker section to the build-settings page for compiler paths, language standards, defines, include paths, library paths, libraries and flags.
- Migrated project build metadata from `.vscode/labwindows-cvi-build.json` to `.vscode/cpm-build.json` while retaining read compatibility with the legacy file.
- Moved historical validation and manual-test documents to `docs/history/`; the root now keeps only active documentation.

## 0.2.2

- Fixed generated error/logging module C string escaping.
- The generated `cpm_error.c` no longer emits NUL bytes from `\0` escapes.
- Multi-line `CpmError_Log` format strings now keep escaped `\n` sequences instead of breaking C string literals.

## 0.6.23

- Treat transient `DMLERR_BUSY` and unavailable DDE responses as silent polling states while CVI is starting and loading the requested workspace.
- Replace the empty persistent-session log row with an explicit `Persistent DDE session handshake accepted` message.
- Enforce the `cmdsrvr.h` action-response contract: only status `0` is accepted for action commands; every non-zero value is surfaced as a rejection.
- Decode unexpected positive status values conservatively by showing the matching CVI command-error description when one exists, without advancing the cached execution state.
- Make **CVI Debug** action rows contextual: unavailable controls remain visible but are dimmed and non-clickable.
- Preserve `Continue` and `Stop` availability throughout an active persistent session so breakpoints that suspend CVI asynchronously remain controllable even when the local state is cached.

## 0.6.22

- Adds a native resizable **CVI Debug** view below **CVI Actions**.
- Displays native bridge availability, persistent DDE-session state, cached execution state, active project, link state, selected transport, state source, last transmitted command and last result.
- Adds direct **Build**, **Run**, **Pause**, **Continue**, **Stop**, **Refresh native state** and **Diagnose native bridge** actions inside the new view.
- Replaces the static native-debug status-bar icon with a live indicator: `CVI:off`, `CVI:idle`, `CVI:run` or `CVI:pause`.
- Publishes native-command state transitions through a VS Code event so the view and status bar update immediately after persistent-session commands.

# Changelog

## 0.6.24

- Add an inline VS Code Debug Adapter Protocol bridge under the `labwindows-cvi-native` debug type.
- Add **LabWindows/CVI: Start Debugging in VS Code** and expose it as the primary action in the `CVI Debug` view.
- Keep the native CVI IDE as the backend engine but launch it minimized by default for VS Code-controlled sessions.
- Route VS Code debug toolbar actions `Pause`, `Continue`, and `Stop` through the validated persistent DDE conversation.
- Advertise standard source breakpoints to VS Code and keep the existing conservative `.cws` synchronization before native launch.
- Add non-destructive polling over the persistent DDE session to detect asynchronous native breakpoint suspensions when CVI accepts state queries during execution.
- Keep polling failures non-fatal: the persistent control session remains usable even if native CVI temporarily refuses `Get CVI State`.
- Add `cpm.nativeDebuggerIdeWindowMode`, `cpm.keepNativeIdeMinimizedDuringVsCodeDebug`, `cpm.nativeDapPollIntervalMs`, and `cpm.nativeDapPollTimeoutMs`.
- Preserve the legacy direct native CVI-window launch as a compatibility fallback.
- Explicitly report the phase-one limitations: native call stack, variable evaluation, and step-over/step-in/step-out are not exposed until a stable CVI automation primitive is identified.

## 0.6.21

- Keep a persistent DDE conversation open before `Run Project` so native debug controls remain available while the CVI user program is executing.
- Route `Suspend Execution`, `Continue Execution`, and `Terminate Execution` through the already-established DDE session instead of opening a new PowerShell process and reconnecting after the run has started.
- Remove synchronous `Get CVI State` probes from active Pause, Continue, and Stop controls because CVI 2020 can stop servicing new DDE conversations while the debugged program is running.
- Track an optimistic cached execution state during the persistent session and expose it in diagnostics without blocking the control channel.
- Close the persistent DDE session when the extension is disposed or the selected workspace changes.
- Add `cpm.nativeDdeSessionStartupTimeoutMs` for the initial persistent-session handshake.

## 0.6.20

- Switch the default native CVI command transport back to the validated historical DDE server (`cvi` / `system` / `status`).
- Keep the `CVI.Application` ActiveX bridge as an explicit experimental compatibility mode instead of invoking it automatically.
- Prevent automatic ActiveX COM activation from opening a second empty CVI workspace while the extension is waiting for the requested `.cws` file.
- Poll the DDE server directly after launching CVI with the workspace path, ensuring one deterministic native IDE instance.
- Add state-aware guards for Build, Run, Pause, Continue and Stop so incompatible commands are not sent to CVI.
- Decode CVI ActiveX HRESULT-style values in the `0x800400xx` range back to readable CVI command statuses.
- Add `cpm.nativeCommandTransport` (`dde`, `auto`, `activex`) and `cpm.allowActiveXAutoStart` (disabled by default).

## 0.6.19

- Promote the officially registered `CVI.Application` ActiveX automation server to the primary native-command transport.
- Detect the active CVI automation object through the Running Object Table first, then create or attach `CVI.Application` only when the command explicitly permits it.
- Map the existing native controls to the ActiveX methods `GetCVIState`, `BuildProject`, `RunProject`, `SuspendExecution`, `ContinueExecution` and `TerminateExecution`.
- Keep the historical ANSI/Unicode DDE implementation only as a compatibility fallback for older CVI installations.
- Add the embedded `native/cvi-activex-command.ps1` script and `cpm.nativeActiveXProcessTimeoutMs`.
- Extend the output-channel diagnostic with the ActiveX ProgID, connection mode, invoked method and per-connection attempt details.

## 0.6.18

- Fixed native-command diagnostics that could be killed before returning JSON when Windows PowerShell needed more time to compile the embedded C# DDE helper.
- Split the DDE transaction timeout from the PowerShell host-process timeout. The first invocation now receives a configurable host allowance while the actual CVI command response remains bounded independently.
- Cache the managed DDE helper under `%LOCALAPPDATA%\LabWindowsCviProjectManager\NativeBridge\CviDdeBridge.0.6.18.dll`; later invocations load the cached assembly instead of recompiling inline C# source.
- Replace the slow full CLSID PowerShell-provider traversal with a targeted .NET registry scan of plausible CVI ProgIDs, both 32-bit and 64-bit registry views, plus `cvi.exe` App Paths.
- Add cache-bootstrap details to the `LabWindows/CVI` output channel.
- Add `cpm.nativeBridgeProcessTimeoutMs` and `cpm.activeXDiscoveryTimeoutMs`.

## 0.6.14

- Added a native CVI breakpoint bridge that serializes standard enabled VS Code source breakpoints into the active `.cws` workspace.
- Added `Synchronize VS Code Breakpoints to Native Workspace`, `Remove Synchronized Breakpoints from Native Workspace`, and `Diagnose Native Breakpoint Bridge`.
- Native CVI breakpoints created manually in LabWindows/CVI are preserved; only breakpoints previously injected by the extension are removed during resynchronization.
- Debug builds now synchronize supported VS Code breakpoints automatically before opening the native CVI debugger.
- Conditional, hit-count, log and disabled VS Code breakpoints are skipped conservatively until their native CVI serialization has been validated.

## 0.6.13

- Fixed project-build settings persistence for projects created or added directly from VS Code.
- Initialize the native `.cws` project blocks immediately when a workspace project reference is added: project header, four default build configurations, build options, execution target, SCC compatibility fields, DLL-debugging support and command-line compatibility fields.
- Initialize CVI 2020+ build-dependency blocks when the workspace format requires them.
- Extend `LabWindows/CVI: Repair Native Workspace Compatibility` so workspaces created with 0.6.12 can be migrated without opening and resaving them in LabWindows/CVI first.
- Auto-initialize missing native project blocks when run settings are saved, while preserving timestamped `.cws` backups.
- Create fully initialized native project blocks for the first project of a newly generated workspace.

## 0.6.12

- Added **Create New Project in Workspace...** to the CVI workspace context menu.
- Kept **Add Existing Project to Workspace** as a separate command for existing `.prj` files.
- The new-project wizard selects a destination directory, project name and target type (`Executable`, `Dynamic Link Library` or `Static Library`).
- Newly created projects are added to the current `.cws` and selected as the active project.
- Native `.cws` backup creation remains active before the workspace reference is updated.

## 0.6.10

- Reordered the DLL options grid for a more coherent visual layout.
- Placed **Custom copy directory** directly opposite **Where to copy DLL**.
- Moved **Import library base name** to the second row opposite **Export mode**.
- Preserved all existing DLL conditional enablement rules and native persistence behavior.

## 0.6.9

- Added CVI-like conditional enablement for DLL target settings.
- Disabled exported-header selection when the export mode is `Symbols Marked As Export`.
- Disabled the import-library base-name field when the default base name is selected.
- Disabled the custom DLL-copy directory unless `Custom directory` is selected.
- Disabled the manifest path and browse button unless `Embed manifest` is enabled.
- Moved IVI and VXIplug&play import-library subdirectory choices behind a dedicated `Import library choices…` dialog matching the native CVI workflow.

## 0.6.8

- Refined the DLL Type Information editor with two CVI-like sub-blocks.
- Added conditional enablement for type-library controls.
- Added HLP / CHM TLB help-file selection.
- Added conditional NI type-information source controls and a header selector shown only for the single-header mode.

## 0.6.7

- Stacked **Target** and **Project dependencies and build order** vertically so their collapsible sections resize consistently.
- Disabled and visually dimmed **LoadExternalModule options** whenever run-time support is set to `Instrument Driver Support Only`, matching CVI behavior.
- Preserved previously selected LoadExternalModule entries while the section is unavailable; no native project data is deleted implicitly.
- Added the same guard to the native safe-mode build-settings editor.


## 0.6.6

- Made the Project Build Settings sections collapsible.
- Replaced the raw LoadExternalModule textarea with CVI-style enable/add/preview/remove controls.
- Added editor-context conversion of selected integer literals to decimal, hexadecimal or binary.
# Change Log

## 0.6.5

- Added `Copy Path` and `Copy Relative Path` to the context menu of every file in the CVI workspace explorer.
- `Copy Relative Path` uses the containing VS Code workspace folder first, then the loaded CVI workspace directory, and finally the CVI project directory as a fallback.
- Clipboard actions are silent, matching the behavior of the native VS Code explorer.

# Changelog

## 0.6.21

- Keep a persistent DDE conversation open before `Run Project` so native debug controls remain available while the CVI user program is executing.
- Route `Suspend Execution`, `Continue Execution`, and `Terminate Execution` through the already-established DDE session instead of opening a new PowerShell process and reconnecting after the run has started.
- Remove synchronous `Get CVI State` probes from active Pause, Continue, and Stop controls because CVI 2020 can stop servicing new DDE conversations while the debugged program is running.
- Track an optimistic cached execution state during the persistent session and expose it in diagnostics without blocking the control channel.
- Close the persistent DDE session when the extension is disposed or the selected workspace changes.
- Add `cpm.nativeDdeSessionStartupTimeoutMs` for the initial persistent-session handshake.

## 0.6.4

- Added native folder/file browser buttons beside build-settings path fields.
- Added a configuration scope selector for `Debug`, `Release`, `Debug64`, `Release64` and `All Configurations`.
- Added target-aware drop-down lists for run-time support, run-time engine binding and generated source documentation.
- Added verified DLL drop-down lists for DLL copy destination and export mode.
- Applied `All Configurations` changes through the existing guarded native `.prj` / `.cws` writers and backup mechanism.
- Extended safe mode with the same configuration scope and verified list selectors.

## 0.6.3

- Replaced the auto-loaded CVI Actions WebviewView with a native TreeView summary to avoid triggering Chromium service-worker initialization during extension startup.
- Added `Project Build Settings (Safe Mode)…`, a native Quick Pick/Input Box fallback for environments where VS Code webviews are temporarily unavailable.
- Kept the full HTML project settings editor for normal use.

## 0.6.2

- Add native EXE, DLL and static-library target-settings editing based on CVI-generated reference projects.
- Add version information, signing fields, LoadExternalModule module lists, DLL export options and DLL type-information settings.
- Add a guided header context action for native CVI DLL import-library generation.
- Preserve native backup creation before project-file writes.

# Changelog

## 0.6.21

- Keep a persistent DDE conversation open before `Run Project` so native debug controls remain available while the CVI user program is executing.
- Route `Suspend Execution`, `Continue Execution`, and `Terminate Execution` through the already-established DDE session instead of opening a new PowerShell process and reconnecting after the run has started.
- Remove synchronous `Get CVI State` probes from active Pause, Continue, and Stop controls because CVI 2020 can stop servicing new DDE conversations while the debugged program is running.
- Track an optimistic cached execution state during the persistent session and expose it in diagnostics without blocking the control channel.
- Close the persistent DDE session when the extension is disposed or the selected workspace changes.
- Add `cpm.nativeDdeSessionStartupTimeoutMs` for the initial persistent-session handshake.

## 0.6.1

- Prevented native CVI workspace corruption when saving command-line and DLL-debugging settings.
- Persist runtime settings only in `[Default Build Config NNNN <mode>]`; legacy compatibility sections are no longer rewritten.
- Convert Windows absolute runtime paths back to CVI `/c/...` notation before writing `.cws` files.
- Added timestamped `.cws` and `.prj` backups under `.vscode/cvi-native-backups`.
- Added `LabWindows/CVI: Repair Native Workspace Compatibility` for files affected by earlier releases.
- Added compatibility inspection when opening a `.cws` workspace.

# 0.5.9

- Moved the persistent command toolbar from the collapsible CVI Actions webview to the CVI Workspace title bar.
- Removed the duplicated Open Workspace in CVI toolbar icon; the workspace inline action remains available.
- Added direct Build + Run and a Run Options picker with Build + Run, Run without build, and native CVI debug choices.
- Restored compact dynamic toolbar labels for build mode (`D32`, `R32`, `D64`, `R64`) and target type (`EXE`, `DLL`, `LIB`).
- Reordered the sidebar so CVI Workspace appears before the collapsible CVI Actions summary.

# Changelog

## 0.6.21

- Keep a persistent DDE conversation open before `Run Project` so native debug controls remain available while the CVI user program is executing.
- Route `Suspend Execution`, `Continue Execution`, and `Terminate Execution` through the already-established DDE session instead of opening a new PowerShell process and reconnecting after the run has started.
- Remove synchronous `Get CVI State` probes from active Pause, Continue, and Stop controls because CVI 2020 can stop servicing new DDE conversations while the debugged program is running.
- Track an optimistic cached execution state during the persistent session and expose it in diagnostics without blocking the control channel.
- Close the persistent DDE session when the extension is disposed or the selected workspace changes.
- Add `cpm.nativeDdeSessionStartupTimeoutMs` for the initial persistent-session handshake.

## 0.5.8

- Normalize CVI/MSYS runtime paths such as `/c/PROG_CVI/EXE/Test.exe` before starting DLL host executables.
- Move the CVI Actions toolbar to persistent `view/title` commands so it remains available when the dashboard is collapsed.
- Add supplemental project and CVI API completion items for C/C++ files.
- Add the `CVI File Symbols` view with click-to-navigate function entries.

# 0.5.6

- Added a persistent compact **CVI Actions** webview at the top of the LabWindows/CVI side-bar container. It exposes Home, open, native-CVI open, build/rebuild/clean, run, debug, build mode, target type, project settings and refresh actions without requiring mouse hover.
- Removed duplicate hover-only workspace toolbar buttons from the **CVI Workspace** view.
- Added native parsing and persistence of CVI project build steps from `.prj` sections such as `[Debug Pre-build Actions]`, `[Debug Custom Build Actions]` and `[Debug Post-build Actions]`.
- Added native parsing and persistence of per-configuration launch arguments, working directory, environment options and external process path from `.cws` sections such as `[Default Build Config 0001 Debug]`.
- Prevented duplicate execution of native CVI build steps: when native `.prj` sections are present, `compile.exe` remains responsible for running them.
- Retained extension-side dependency ordering as a fallback until a CVI workspace containing at least one non-empty native dependency graph is available for exact format validation.

# 0.5.5

- Added a compact **Build / Rebuild / Clean** picker to the project explorer toolbar.
- Added full build-output streaming through `compile.exe -log`, with timestamped logs under `.vscode/cvi-build-logs`.
- Added a workspace context-menu action to open the current `.cws` or standalone `.prj` in the native CVI IDE.
- Added target-type selection for `Executable`, `Dynamic Link Library` and `Static Library` projects.
- Added a project build-settings editor for extension-managed pre-build, custom-build and post-build shell actions.
- Added extension-managed project dependencies and deterministic dependency build order.
- Added command-line arguments, working directory, environment options and DLL host executable settings; supported values are mirrored into the CVI workspace sections when a `.cws` is loaded.
- Added conservative generated-target cleaning without deleting source files or referenced external libraries.
- Added **Generate Prototypes Header...** for C source files. The generator creates an editable `.h` baseline and adds it to the CVI project.
- Moved IntelliSense synchronization, diagnosis and provider-repair actions from the explorer toolbar to the Home installation section.

# 0.5.4

- Restored the larger native VS Code file-type icons used by the early project explorer while retaining an explicit child branch marker in file labels.
- Reworked the home page into vertical sections: workspace and active project, libraries and reusable tools, then CVI installation.
- Added a dedicated empty-project state with primary actions to open a workspace, create a starter workspace and select a CVI installation.
- Clarified the UIR editing boundary: panels are opened directly in the LabWindows/CVI User Interface Editor, which is part of the CVI IDE; CVI does not provide a standalone UIR editor.

# Changelog

## 0.6.21

- Keep a persistent DDE conversation open before `Run Project` so native debug controls remain available while the CVI user program is executing.
- Route `Suspend Execution`, `Continue Execution`, and `Terminate Execution` through the already-established DDE session instead of opening a new PowerShell process and reconnecting after the run has started.
- Remove synchronous `Get CVI State` probes from active Pause, Continue, and Stop controls because CVI 2020 can stop servicing new DDE conversations while the debugged program is running.
- Track an optimistic cached execution state during the persistent session and expose it in diagnostics without blocking the control channel.
- Close the persistent DDE session when the extension is disposed or the selected workspace changes.
- Add `cpm.nativeDdeSessionStartupTimeoutMs` for the initial persistent-session handshake.

## 0.5.3

- Disables the dynamic Microsoft C/C++ configuration provider by default. The normal path is now the managed `.vscode/c_cpp_properties.json` file in the CVI folder automatically added to the standard VS Code Explorer.
- Adds `LabWindows/CVI: Repair C/C++ IntelliSense Provider Selection` to remove stale global, workspace and folder-level `C_Cpp.default.configurationProvider` values and clean managed `c_cpp_properties.json` entries.
- Migrates the provider identifier from the historical `jc-tools.labwindows-cvi-project-manager` value to the published Marketplace identifier `JerryCrozet-ElectronicEngineer.labwindows-cvi-project-manager`.
- Detects MSVC compatibility include directories exposing `excpt.h` when the optional provider is enabled.
- Adds the 128 × 128 Marketplace icon.

# Changelog

## 0.6.21

- Keep a persistent DDE conversation open before `Run Project` so native debug controls remain available while the CVI user program is executing.
- Route `Suspend Execution`, `Continue Execution`, and `Terminate Execution` through the already-established DDE session instead of opening a new PowerShell process and reconnecting after the run has started.
- Remove synchronous `Get CVI State` probes from active Pause, Continue, and Stop controls because CVI 2020 can stop servicing new DDE conversations while the debugged program is running.
- Track an optimistic cached execution state during the persistent session and expose it in diagnostics without blocking the control channel.
- Close the persistent DDE session when the extension is disposed or the selected workspace changes.
- Add `cpm.nativeDdeSessionStartupTimeoutMs` for the initial persistent-session handshake.

## 0.5.2

- Automatically adds the directory containing an opened CVI workspace or project to the standard VS Code Explorer.
- Adds `cpm.autoAddCviFolderToWorkspace` to disable this behavior when a manual multi-root workspace is preferred.
- Extends Windows SDK discovery to Windows Kits 10, Windows Kits 8.1 and the historical Windows v7.1A SDK.
- Adds explicit versioned Windows SDK include directories, including `um`, `shared`, `ucrt`, `winrt` and `cppwinrt`, so `windows.h` is resolved reliably.
- Adds targeted CVI ANSI header discovery and diagnostic output for `ansi.h` / `ansi_c.h`.

## 0.5.1

- Added a dynamic Microsoft C/C++ custom configuration provider for CVI project files.
- Kept managed `.vscode/c_cpp_properties.json` generation as a readable fallback and added `configurationProvider` plus `mergeConfigurations` to the managed entry.
- Added explicit `include`, `include/ansi`, `include/clang/**`, `toolslib`, `toolslib/**` and `toolslib/toolbox` paths.
- Added concrete recursive header-directory enumeration in the dynamic provider to improve `toolbox.h` and nested Toolslib resolution.
- Added project source and header directories to generated and dynamic IntelliSense configurations.
- Extended CVI compiler detection to nested `bin/clang/<version>` directories and to `clang-cc.exe`, `clang.exe` and `clang-cl.exe`.
- Added `cpm.intelliSenseCompilerPath` for manual compiler override.
- Added `cpm.additionalIncludePaths` for project-specific external headers.
- Added `cpm.useCppToolsConfigurationProvider` to disable the dynamic provider when required.
- Added **LabWindows/CVI: Diagnose C/C++ IntelliSense Configuration**.
- Added **LabWindows/CVI: Add CVI Folder to VS Code Workspace for IntelliSense**.

## 0.5.0

- Updated the embedded JC Lib runtime from `0.7.93` to `0.7.96`.
- Updated the bundled LabWindows/CVI Structured API Pack from `1.2.0` to `1.5.0`.
- Added `data/metadata/cvi_callback_event_catalog.json` while retaining the User Interface attribute catalog.
- Consolidated `CVI Patterns & References` into `CVI Basics`.
- Added CVIRTE lifecycle cards, editable callback typedefs, parameterized callback skeletons, grouped event selectors, event-data selectors, recipes, keywords and workflows through the updated CVI pack.
- Replaced the basic new-file prompt with **Create New File or Starter...**.
- Added blank CVI `.uir + .h` generation using embedded CVI 2012 and CVI 2020 binary resources.
- Added a complete CVI UI application starter generating `.c + .uir + .h`.
- Added paired `.c + .h` module generation with include guards.
- Added cleaned `main`, `WinMain`, `RTmain` and DLL starter templates.
- Added a cleaned generic CVI error-management module derived from the supplied legacy files.
- Added persistent user-defined creation templates with placeholder expansion.
- Added insertable built-in and user-defined CVI snippets.
- Added configurable snippet shortcut `Ctrl+Alt+I` / `Cmd+Alt+I`.
- Added editor contextual actions for inserting and saving snippets.
- Added a project-tree contextual action for saving a source or header as a creation template.
- Added `cpm.uirTemplateVersion` with `auto`, `cvi2012` and `cvi2020` modes.

## 0.4.2

- Updated the embedded JC Lib engine from 0.7.90 to 0.7.93.
- Updated the bundled LabWindows/CVI Structured API Pack from 1.1.0 to 1.2.0.
- Added `data/metadata/cvi_ui_attribute_catalog.json`.
- Extended structured attribute pickers to the 24 `Set*Attribute` functions from the CVI User Interface API.
- Added contextual value pickers based on the selected `ATTR_*` constant.
- Added safe bundled-pack migration with a timestamped backup of the previous writable CVI pack.

## 0.4.1

- Replaced the Activity Bar IHI-style glyph with a compact CVI glyph.
- Displayed the workspace home action as a Home icon.
- Added configurable Find Symbol shortcut `Ctrl+Alt+P` / `Cmd+Alt+P`.

## 0.4.0

- Added composite branch-and-file-type SVG icons.
- Added the resizable **CVI Libraries** view below **CVI Workspace**.
- Embedded the JC Lib-based CVI function explorer.
- Added **Build Debug and Open Native Debugger**.

## 0.3.0

- Added CVI-like context menus, logical folders, new-file creation, file replacement, include/exclude toggles, `.Obj` toggling and single-file compilation.

## 0.2.0

- Added managed `.vscode/c_cpp_properties.json` generation and CVI IntelliSense paths.

## 0.1.0

- Initial CVI workspace, project, build, run and native panel-opening MVP.

## 0.5.7

- Replaced the empty lower area of the always-visible `CVI Actions` view with a compact active-project dashboard.
- Added live summaries for target type, build mode, command-line options, working directory, environment options, native build steps, project dependencies and missing project files.
- Added explicit empty states for workspaces without an active project and for sessions without a loaded CVI workspace.
- Kept the native VS Code resizable view separator so the dashboard can be collapsed or expanded as needed.

## 0.6.0

- Keep the existing `CVI Workspace` view toolbar and add a compact persistent VS Code status-bar action strip for Home, Open, Build, Build + Run, Run options, build mode and target type. These controls remain available when the sidebar views are collapsed.
- Disable the legacy Microsoft C/C++ custom configuration-provider registration permanently. The extension now relies on its generated `.vscode/c_cpp_properties.json` entry.
- Automatically remove stale LabWindows/CVI provider references from user, workspace, folder and managed `c_cpp_properties.json` settings during activation.
- Scope the supplemental CVI completion provider to files belonging to the loaded CVI workspace. Unrelated C and C++ folders no longer receive CVI completion candidates.
- Add `cpm.showPersistentStatusBarActions` to hide the persistent status-bar controls when a minimal layout is preferred.

## 0.6.11

- Dims and disables the signing-certificate controls unless **Sign target** is checked.
- Dims **External executable for DLL debugging** unless the current target is a DLL.
- Hides the **Executable command line** section entirely for static-library targets.
- Adds native `.fp` function-panel browsing from the CVI workspace explorer. Opening a function-panel file lists its embedded functions and prototypes without starting the CVI IDE.
- Routes selected `.fp` functions into the embedded JC Lib details view when a matching card exists, with an extracted prototype-and-parameter fallback when the function is not yet present in the bundled pack.

## 0.6.30

- Restored the proven native DDE debug launch path from 0.6.24.
- Removed the experimental VS Code DAP integration from the shipped extension.
- Added a local `compile.exe` preflight build before native debugger launch. CVI is not opened when compile or link fails.
- Routed the CVI Debug build action to the local `compile.exe` workflow.
- Kept the compact grouped CVI Debug dashboard and exact VS Code breakpoint mirror.
- Added conservative natural-completion detection through independent short-lived DDE probes without modifying the persistent control session.
## 0.2.12

- Added pre-link diagnostics for COFF/PE library architecture mismatches.
- Detects 32-bit vs 64-bit object/import-library conflicts before invoking the linker when possible.
- Adds clearer guidance for MinGW/MSVC `.lib` import-library issues, including the common case of linking a 32-bit object with a 64-bit DLL import library.

