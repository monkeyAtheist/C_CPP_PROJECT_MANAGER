# 0.2.105

- Reworked the right-click snippet picker into a hierarchical browser: C/C++ -> category -> optional sub-category -> snippet, with a dedicated global search and saved-snippet collection.
- Expanded the built-in catalog from 38 to 107 maintained snippets.
- Added C variadic-function patterns (`va_list`, `VFoo/Foo`, `va_copy`) and variadic/preprocessor patterns (`__VA_ARGS__`, `__VA_OPT__`, GNU optional arguments, arity dispatch, argument counting, stringify, token paste, safe multi-statement macros, X-macros, array count and `_Generic`).
- Added C callback/function-pointer, formatting, files, process, CSV, containers, logging and maintained communication examples.
- Added C++17 parameter-pack/fold/perfect-forwarding patterns, callbacks/lambdas, optional/default parameters, RAII/smart pointers, variant visitation, compile-time branching, concurrency and maintained utility/communication examples.
- Added per-snippet language/category/sub-category metadata and catalog auditing for duplicate IDs, missing metadata, empty bodies, encoding errors and obsolete IPC API names.
- Saved personal snippets now record an inferred language and category for clearer presentation.
- Fixed obsolete IPC framed-message names and the CAN open signature in embedded examples.
- Added strict C11/GNU11/C2x and C++17 compile validation for the new variadic/macro/template patterns.

# 0.2.104

- Added a complete maintained C++17 general-utility bundle catalog: INI, File/Path, String, Time/Timers, Thread/Synchronization, Process, JSON, CSV, Byte Buffer/Endian, Containers, Checksum/CRC and Logging.
- Added a General C++ utility stack mirroring the maintained C utility stack.
- Added C++ snippets for typed INI access, periodic timers, JSON access, ring buffers and process capture.
- Reclassified the old C Core utilities and C++ CPM_Utility monolith as Legacy & compatibility while keeping them available for existing projects.
- Fixed strict POSIX feature declarations in the File/Path, Process and Logging C backends used by the utility bundles.
- Added strict GCC/Clang and integrated C++ utility validation.

## 0.2.103

- Added TLS transport bundle (OpenSSL-backed, peer verification enabled by default).
- Added generic USB/libusb dynamic runtime bundle for control/bulk/interrupt transfers.
- Added native Windows BLE GATT project bundle for services/characteristics read/write.
- Added ready-to-use stacks: SCPI over TCP/VISA, Modbus RTU over RS-485, MQTT automatic reconnect/resubscription.
- Added C++17 RAII wrappers and snippets for the new communication modules.
- Hardened POSIX sockets against SIGPIPE on peer disconnects.
- Fixed composed Modbus/RS-485 response framing and write-response CRC validation.

# Changelog

## 0.2.102

- Expanded maintained C/C++ communication bundles with RS-485, LIN and USB HID transports.
- Added transport-independent retry/reconnect/backoff helpers.
- Added HTTP/REST, MQTT 3.1.1 and RFC 6455 WebSocket clients over the maintained socket backend.
- Added C++17 RAII wrappers for the new communication modules.
- Added communication snippets for RS-485, HTTP, MQTT, WebSocket and USB HID.
- Kept TLS boundaries explicit: HTTPS/MQTTS/WSS are not emulated without a genuine TLS transport.


## 0.2.101

### Expanded C/C++ communication bundles

- Reworked the maintained **C communication layer** instead of growing the monolithic utility bundle: UART, IPC, TCP/UDP, Wi-Fi IP transport, Bluetooth RFCOMM, CAN, I²C and SPI now expose richer timeout/configuration/diagnostic helpers.
- Expanded **UART** with a configuration structure, parity/flow-control options, DTR/RTS, purge/flush, break generation, send-all and exact/delimited reads.
- Expanded **TCP/UDP** with TCP server/accept timeouts, exact/line reads, endpoint inspection, keepalive/TCP_NODELAY/buffer controls, connected UDP, broadcast and IPv4 multicast helpers.
- Expanded **IPC** with reconnectable server sessions, exact I/O and 32-bit big-endian length-prefixed messages. Client connect timeouts are supported on both platforms; POSIX server accept can time out while the compact synchronous Windows named-pipe accept remains blocking.
- Expanded **CAN / I²C / SPI / Bluetooth** with filter arrays/error masks, repeated-start/register I²C helpers, multi-segment SPI transfers and richer RFCOMM stream helpers.
- Added a dependency-free **binary framing** bundle with COBS, SLIP, 16/32-bit length prefixes and delimiter search.
- Added a transport-independent **SCPI / IEEE-488.2** bundle with typed queries, terminators, partial-read-safe definite-length binary blocks and common commands.
- Added a dependency-free **Modbus RTU/TCP** codec with CRC-16, RTU validation, read/write register request builders, MBAP framing, exceptions and register-response parsing.
- Added a compact **VISA** bundle that dynamically loads a Windows VISA runtime (`visa64.dll` / `visa32.dll`) without requiring vendor VISA headers/import libraries at compile time, including discovery, session I/O, query and timeout/termination control.
- Replaced the obsolete/missing legacy C++ communication payloads with maintained **C++17 RAII bundles** for UART, IPC, TCP/UDP, Wi-Fi, Bluetooth RFCOMM, CAN, I²C, SPI and VISA. Each wrapper embeds the corresponding maintained C backend rather than duplicating the transport implementation.
- Added C++17 protocol wrappers for **Framing, SCPI and Modbus**, plus selectable **Communication protocol stack** and **Full communication stack** bundles in both C and C++.
- Removed obsolete bundle choices whose historical payload was no longer distributed, so the Create menu no longer advertises entries that fail after selection.
- Validation covers strict GCC/Clang C11 compilation, strict GCC/Clang C++17 wrapper checks, partial-read SCPI binary blocks, IPC framed messages, protocol reference vectors and real loopback TCP/C++ RAII exchanges.

## 0.2.100

### Expanded general-purpose C bundle library

- Added focused **File & Path** helpers for whole-file text/binary I/O, recursive directory creation, path join/dirname/basename/extension, separator normalization and executable-path discovery.
- Added **String utilities** with bounded copy/append, trim/case/search/replace/split helpers and a growable `CpmStringBuilder`.
- Added **Time & periodic timers** with monotonic ns/us/ms clocks, Unix epoch milliseconds, Windows/POSIX sleeps, stopwatch support and a drift-resistant periodic timer.
- Added **Threads & synchronization** using Win32 primitives on Windows and pthreads on POSIX, including mutexes, condition variables and timed waits.
- Added **Process & environment** helpers for command execution, captured stdout, detached commands, PID and environment variables.
- Added a dependency-free **JSON tokenizer/writer**, **CSV reader/writer**, **Byte buffer/endian/HEX** helpers and generic **Vector/Ring Buffer** containers.
- Added **Checksums & CRC** helpers (XOR8, Sum8, Fletcher-16, Adler-32, CRC-8, CRC-16/CCITT-FALSE, CRC-16/MODBUS and CRC-32) plus a lightweight leveled **Logging** bundle.
- Added **General C utility stack** to install INI + System + Data + Diagnostics modules in one operation while keeping every module independently selectable.
- Expanded C bundle categories to **Configuration & utilities**, **System**, **Data & serialization**, **Integrity & diagnostics**, **Communication**, and **Interoperability & UI**.
- Release validation now compiles every new C module with strict C11 warnings and runs integrated tests covering files, strings, time, threads, process capture, JSON, CSV, binary buffers, containers and standard CRC vectors.

## 0.2.99

### C bundle organization and INI configuration bundle

- Reorganized **Create New File or Starter** so bundles live under their language instead of a separate root `Module bundles` category: `C > Bundles`, `C++ > Bundles`, and `Scripts and text > Bundles`.
- Added second-level bundle categories such as **Configuration & utilities**, **Communication**, and **Interoperability & UI**.
- Added a dependency-free **C INI configuration** bundle with section-aware parsing, typed string/int/int64/double/bool accessors, defaults, editing, removal, enumeration, save and one-shot read/write helpers.
- Added INI snippets for typed loading, one-shot reads and update/save workflows.
- Kept `CpmUtil_ReadIniValue` as a lightweight compatibility helper and corrected its README example; the dedicated INI bundle is now the recommended configuration API.
- Restored the missing C communication bundle payloads in the packaged extension: UART, IPC, Ethernet TCP/UDP, Wi-Fi IP transport, Bluetooth RFCOMM, CAN, I2C and SPI.
- Added strict C11 compile validation for all restored C bundle sources plus runtime checks for the INI parser, local IPC and TCP client/server paths.
- Added bundle-source availability filtering so legacy C++/demo choices whose historical payload is not present are hidden instead of failing after selection. Maintained C++ core/error/Python/Lua/Web UI generators remain available.

## 0.2.98

- Added continuous Wi-Fi/BLE scanning with Last seen tracking and short stale-entry retention.
- Added a BLE GATT Inspector with service/characteristic enumeration, Read, Write and bounded Notify/Indicate monitoring on Windows.
- Added a multi-client TCP listener/server with asynchronous RX and broadcast TX through the existing terminal frame controls.
- Added mDNS/Bonjour and SSDP/UPnP local-service discovery.
- Added unified-device Diagnose / Diagnose all checks across COM, VISA, TCP, UDP and SSH endpoints.
- Fixed a duplicate wireless-scan invocation inherited from 0.2.97.
- Added regression coverage for TCP client, UDP, TCP server, mDNS and SSDP data paths.

## 0.2.97

### Unified CPM Device Manager

- Added a project-independent **Unified CPM Device Manager** inside Network & Wireless Diagnostics.
- A single equipment profile can now group **COM**, **VISA**, **TCP**, **UDP** and **SSH** endpoints instead of maintaining unrelated communication profiles for the same physical device.
- Added device metadata (name, description and tags), endpoint-level removal, device deletion and JSON import/export.
- Instrument Diagnostics can save the current COM/VISA endpoint to a CPM device and promote an existing saved instrument profile directly.
- The TCP/UDP terminal can save its current endpoint to a CPM device; configured SSH aliases can be attached from the SSH Devices page.
- Device cards can reopen the correct diagnostic tool with the saved endpoint preloaded. Opening a saved TCP/UDP endpoint first closes any current socket session to prevent UI/session mismatch.
- Added **Open CPM Device Manager** to the Command Palette, Home, Quick Actions, Settings & Tools and the project Tools page.
- Existing Instrument profiles, network settings and `~/.ssh/config` remain compatible and continue to be stored in their original locations. Unified devices reference/copy endpoint settings rather than replacing those workflows.
- Added registry regression tests plus generated Instrument/Network webview JavaScript syntax validation.

## 0.2.96

### Tool navigation, Windows diagnostics robustness and wireless cleanup

- Added the familiar **Filter sections** and **Jump to a section** navigation controls inside Instrument Diagnostics and Network & Wireless Diagnostics. Network navigation follows the currently selected Network / TCP-UDP / Wireless / SSH page.
- Moved the external **SCPI reference** action to the far right of the Instrument Diagnostics toolbar and added a globe/external-link indicator so it is clearly distinguished from internal CPM navigation.
- Normalized warning typography and forced the PowerShell diagnostic bridge to UTF-8 to prevent corrupted accented characters in Windows error messages.
- Simplified the no-VISA-runtime warning shown in the UI; low-level `visa64.dll` / `visa32.dll` probe errors are kept in the CPM output channel instead of flooding the page.
- Made COM discovery more resilient by seeding the list from `System.IO.Ports.SerialPort.GetPortNames()` before enriching it with CIM/PnP metadata.
- Reworked Windows network-adapter discovery around `Win32_NetworkAdapter` / `Win32_NetworkAdapterConfiguration`, avoiding the fragile `Get-NetIPConfiguration` → `Get-NetIPInterface` dependency observed on some Windows installations.
- Added `arp.exe -a` fallback when `Get-NetNeighbor` is unavailable.
- Fixed the BLE watcher output bug: the WinRT `EventRegistrationToken` is now retained and removed correctly instead of leaking into the JSON diagnostic stream.
- BLE scans now explain that an empty result can be normal when no nearby device is currently advertising and default to a slightly longer 5 s scan for new configurations.
- Bluetooth inventory now filters common Generic Attribute service pseudo-devices, de-duplicates devices where possible, extracts a physical address when available and displays **RSSI** when the same device is observed in the BLE advertisement scan.
- Long Bluetooth/PnP identifiers and warning text now wrap instead of forcing layout overflow.
- Revalidated TypeScript compilation, generated webview JavaScript syntax, TCP/UDP echo sessions and the published VSIX contents.

## 0.2.95

### Always-visible CPM Tools

- Fixed a discoverability regression introduced by the project-independent Settings & Tools hub: when a project was active, the full Project Settings page replaced the global hub and hid Instrument/Network/SSH tools from the settings navigation.
- Added a permanent **Tools** page to Project Settings. It is visible alongside Overview, Project, Build, Libraries, Remote Linux, etc.
- The Tools page exposes **Instrument Diagnostics**, **Network & Wireless Diagnostics**, **SSH Devices**, **Libraries & Analyzers**, **Extension Settings** and **Toolchains**.
- Added **Open CPM Tools** to the Command Palette and Quick Actions.
- Split the Home shortcuts into explicit **Settings** and **Tools** actions and added a dedicated SSH Device Manager card.
- Added a **Communication tools** shortcut from the Overview control center.
- The no-project Settings & Tools hub now also exposes the SSH Device Manager directly.
- Existing direct commands remain available: `Open Instrument Diagnostics`, `Open Network & Wireless Diagnostics` and `OpenSSH Device Manager`.

## 0.2.94

- Integrated the OpenSSH Device Manager from JC Lib directly into `Network & Wireless Diagnostics` as a new `SSH Devices` page.
- `cpm.openSshDeviceManager` now opens the integrated SSH page instead of a separate webview.
- Reuses the current user `~/.ssh/config` as the source of truth; CPM still does not store private-key material.
- Added SSH alias create/edit/delete, identity selection, Ed25519 key generation and public-key installation workflows.
- Added per-device actions for Connect, `ssh -G`, BatchMode key test, Ping, TCP/SSH-port test and reuse in general host diagnostics.
- Added discovered ARP/ND neighbours and local hosts aliases to the SSH page with `Add SSH device` actions.
- Added `Remote Linux target` integration: a configured SSH alias can populate the active project's Remote Linux host/user/port settings.
- Wildcard and multi-host OpenSSH blocks are now shown as read-only configuration blocks and are no longer offered invalid device actions.
- Added SSH alias count to the network diagnostics summary and retained project-independent access to the whole network/SSH toolset.
- Audited the generated webview JavaScript with a real syntax check and validated SSH config parse/save/delete against an isolated HOME directory.

## 0.2.93

### Network & Wireless Diagnostics

- Added a standalone **Network & Wireless Diagnostics** page that remains available without an active CPM project.
- Added local network-interface inventory with adapter status, MAC address, link speed, IPv4/IPv6 addresses, default gateways and DNS servers, plus the existing ARP/ND neighbor cache without actively sweeping the subnet.
- Added single-target **Ping**, **DNS lookup** and **TCP connection** diagnostics with configurable timeout and detailed results.
- Added a persistent **TCP client terminal** and **UDP terminal** with asynchronous RX, text/HEX frames, ASCII/UTF-8/Latin-1 decoding, configurable TX line ending, remote endpoint and UDP local-port selection.
- Added Windows **Wi-Fi scanning** for visible SSID/BSSID entries with signal quality, channel, authentication, encryption and radio type.
- Added Windows **BLE advertisement scanning** with address, local name, RSSI, connectability metadata and timestamp, plus a Windows Bluetooth device inventory.
- Wireless discovery is intentionally diagnostic-only: CPM does not capture third-party payload traffic, credentials, protected handshakes or encrypted Wi-Fi/Bluetooth frames.
- Added cross-links between Instrument Diagnostics and Network & Wireless Diagnostics, and exposed the new page from Home, Quick Actions, Settings & Tools and the Command Palette.
- Added real TCP/UDP echo-session regression tests during development and validated the generated webview JavaScript separately from TypeScript compilation.

## 0.2.92

### Compact status bar and project-independent Settings & Tools

- Simplified the persistent CPM status bar to exactly six actions: **Home**, **Open Workspace**, **Build / Rebuild / Clean**, **Run active target**, **Debug active target** and **Settings**.
- Removed the persistent **Run options**, build-mode (`DBG/D64/...`), target-type (`EXE/DLL/LIB`) and linkage (`DYN/STA/...`) items from the status bar; the same controls remain available from the normal CPM menus/settings.
- Changed **Settings** so it can be opened with no active workspace/project instead of showing an error.
- Added a project-independent **CPM Settings & Tools** hub for the no-project state. Project build controls are clearly disabled while global tools remain available.
- Exposed **Instrument Diagnostics**, **DLL Analyzer**, **.lib/.a/.dll.a Analyzer**, CPM extension settings, toolchain setup and workspace opening from the global hub.
- Made DLL/archive analyzers work without an active CPM project, including browse, analysis and Markdown report export.
- Analyzer report locations now fall back to the current workspace folder or user home when no project is loaded.
- Added **Settings & Tools** shortcuts to Home and Quick Actions in the no-project state.

## 0.2.91

### Diagnostic sequences and consolidated library tools

- Added reusable **Diagnostic sequences** to Instrument Diagnostics. A sequence can chain text or HEX frames over the currently connected COM/VISA session.
- Each sequence step stores its own label, frame format, encoding, response expectation, response timeout and post-step delay.
- Added response validation modes **Any response**, **Contains**, **Equals** and **Regular expression**, with per-step PASS/FAIL results and captured response text.
- Added **Stop on first failure**, manual sequence cancellation, saved sequence definitions and ordered step editing/reordering.
- Sequence execution reuses the persistent asynchronous RX stream and restores the terminal framing after completion or cancellation.
- Consolidated the former **DLL Analyzer** and **.a / .lib Analyzer** top-level settings tabs into **Project Build Settings → Libraries**.
- The Libraries page now contains distinct **DLL Analyzer** and **.lib / .a / .dll.a Analyzer** sections below the import-library generation tools.
- Existing context-menu / command-palette analyzer actions now open the common Libraries page directly.
- Reworked **Debug / PDB** metadata in DLL Analyzer into a vertical layout and added aggressive wrapping for long paths/GUIDs to prevent overlap.

## 0.2.90

### Persistent Instrument Terminal, profiles and command history

- Upgraded **Instrument Diagnostics** from one-shot transactions to persistent COM and VISA sessions with explicit **Connect / Disconnect** controls.
- Serial sessions keep `System.IO.Ports.SerialPort` open and stream incoming bytes asynchronously to the TX/RX console, including unsolicited instrument frames.
- VISA sessions keep the resource open and poll reads in the background through the installed 64-bit or 32-bit VISA runtime while preserving the existing fallback behavior.
- Communication-resource settings are locked while connected so the visible COM/VISA target cannot silently diverge from the resource that is actually open. Text/RX encoding and TX line termination remain adjustable during a session.
- Added reusable **instrument profiles** that persist transport and communication settings globally. Loading a profile closes an active session before applying the new target/configuration.
- Added **saved commands** with name, text/HEX mode, encoding and query metadata, plus a persistent recent-command history (up to 100 sends) that can recall previous frames.
- Kept the built-in IEEE 488.2 / SCPI presets and added `Ctrl+Enter` as a terminal send shortcut.
- Closing the Instrument Diagnostics page now closes the active resource cleanly so COM ports and VISA sessions are not left locked in the background.
- Preserved the 0.2.89 one-shot exchange helpers internally for compatibility while routing the UI through the new persistent-session backend.

## 0.2.89

### Instrument Diagnostics — COM, USB/PnP and SCPI/VISA

- Added a standalone **Instrument Diagnostics** page that can be opened even when no CPM workspace/project is loaded.
- Added Windows COM-port discovery with device name, manufacturer, PnP identifier and status.
- Added complete serial framing controls: baud rate, 5/6/7/8 data bits, parity, 1/1.5/2 stop bits, handshake, DTR/RTS, read/write timeouts, text encoding and configurable `None`/`LF`/`CR`/`CRLF` termination.
- Added manual text and raw HEX frame transmission plus a timestamped TX/RX diagnostic console that displays both decoded text and response bytes.
- Added predefined IEEE 488.2 / SCPI diagnostic frames including `*IDN?`, `*CLS`, `*RST`, `*OPC?`, `*TST?`, `SYST:ERR?`, `SYST:VERS?`, `*ESR?` and `*STB?`.
- Added Windows USB/PnP inventory with VID/PID extraction when available. USB enumeration is deliberately distinct from communication: a generic USB device is not treated as directly writable unless it exposes a serial port or VISA resource.
- Added optional VISA discovery and communication through the installed VISA C runtime, supporting resources such as USBTMC `USB...::INSTR` without adding a native Node dependency to CPM. CPM tries the 64-bit VISA runtime first and can fall back to the 32-bit runtime through Windows PowerShell x86.
- Added the diagnostics entry to Home, Quick Actions and the Command Palette. Communication preferences are retained globally between sessions.
- Added webview-script syntax validation during development and kept the module independent from the build engine/project settings.

## 0.2.88

### Explicit DLL output formats

- Expanded **Dynamic Link Library → DLL import-library outputs** in Project Build Settings with explicit GNU `.dll.a`, GNU `.a`, Windows `.lib`, combined and all-format choices.
- Kept the `.dll` as the mandatory runtime artifact; selected `.a`/`.dll.a`/`.lib` files are link-time import libraries generated alongside it.
- Added the legacy GNU `.a` import-library naming mode without confusing it with the separate **Static Library** target type.
- When both GNU names are requested, CPM emits the conventional `.dll.a` during the link then mirrors the same import archive as `.a`.
- Safe-mode Build Settings now show static-library format only for Static Library targets and DLL import-library outputs only for Dynamic Link Library targets.
- Clean/rebuild removes the generated GNU `.a` alias in addition to `.dll.a`, `.lib`, `.def` and `.exp`.
- Extended Project Health and regression tests for all DLL output combinations.

## 0.2.87

### .a/.lib Library Analyzer and explicit library build formats

- Added **Analyze .a / .lib Library...** to `.a`/`.lib` project-file context menus and a dedicated Project Build Settings analyzer page.
- The archive analyzer classifies static/import/mixed libraries from member/symbol evidence, reports archive members, linker symbols, detected architectures, COFF/ELF/LLVM object members, import objects and referenced runtime DLLs.
- Clarified that `.a`/`.lib` are library formats rather than additional semantic CPM target types. **Static Library** now has an explicit format setting: automatic, GNU/LLVM `.a`, or Windows COFF `.lib`.
- Direct static `.lib` builds require Microsoft `lib.exe` or LLVM `llvm-lib`; CPM no longer presents a GNU `ar` archive with a renamed `.lib` extension as an equivalent result.
- **Dynamic Link Library** now has a configurable import-library output: automatic, GNU/MinGW `.dll.a`, Windows `.lib`, both, or disabled.
- GNU DLL builds can emit `.dll.a` directly through `--out-implib`; Windows `.lib` generation is chained through the existing DLL export/import-library service.
- Clean/rebuild removes generated `.dll.a`, `.lib`, `.def` and `.exp` artifacts associated with the DLL target.
- Extended Project Health and Build Settings to surface the selected static/import-library formats and report missing compatible `.lib` librarians.
- Added real-archive analyzer regression tests using GCC/`ar` plus a synthetic COFF short-import-object archive.

## 0.2.86

### Multi-DLL import-library workflow and DLL Analyzer

- Replaced the single-DLL export Quick Pick with a dedicated multi-DLL webview. The right-click DLL action now opens a batch editor with **+ Add DLL(s)**, a source browser on every row, a per-row `.lib` output browser, export filtering and Select All/None controls.
- Batch generation deliberately creates **one import library per DLL** instead of merging unrelated DLL import descriptors into one ambiguous `.lib`. Duplicate DLL base names receive unique default output names.
- Added **Analyze DLL...** to DLL context menus and a dedicated **DLL Analyzer** page in Project Build Settings. The analyzer reports PE architecture/format, link timestamp, SHA-256, file/product version and revision, imports, exports, sections, resources, PE flags, certificate-table presence, CLR presence and CodeView/PDB metadata when available.
- Hardened PE export parsing by respecting `NumberOfRvaAndSizes` before reading the export directory.
- Audited the 0.2.85 import-library implementation and kept the existing header-to-import-library, `.def` extraction and generator selection workflows intact.
- Reworked historical regression version assertions so old feature tests no longer fail solely because the CPM patch version advanced. All CPM regression suites now run green together with the new DLL analyzer tests.

## 0.2.85

### Windows import-library generation

- Replaced the historical header-path clipboard placeholder with real Windows import-library generation.
- Added **Generate Import Library (.lib) from Header(s)...** with multi-header selection from the CPM tree or a file picker.
- Added **Generate DLL Import Library (.lib)...** on `.dll` project files; CPM reads the PE export table and preserves named/decorated exports.
- Added `.def` extraction, generator auto-detection (`lib.exe`, `llvm-lib`, `llvm-dlltool`, GNU `dlltool`), architecture selection and a generation report.
- Added a dedicated **Libraries** page in Project Build Settings for generator/output configuration and access to all import-library workflows.
- Generated `.lib` files can be added back to the active CPM project.
- Header-based generation is explicitly treated as import-library generation: the corresponding DLL remains required at runtime; no static implementation can be reconstructed from declarations alone.

## 0.2.84

- Unified the local execution UX: **Run** and **Debug** never build first; **Build & Run** and **Build & Debug** are explicit separate actions.
- Renamed the visible `Run Debug` action to **Debug** across the workspace toolbar, Home, Quick Actions, Run Options and project context menus.
- Project right-click **Run** now launches the existing target instead of invoking Build & Run.
- Added a project-specific **Build & Run** context action and made project Run Options operate on the clicked project.
- Normalized local labels to `Run`, `Debug`, `Build & Run`, and `Build & Debug`.
- Added the `C/C++ Project Manager` command category to short command titles for cleaner Command Palette grouping.
- Kept legacy command IDs such as `cpm.executeProject` and `cpm.runWithoutBuild` for compatibility while hiding redundant aliases from the Command Palette.

## 0.2.82

- Unified the local **Run Debug** visual language with **Build & Debug**: the workspace toolbar, Run Options picker, Quick Actions and status-bar debug shortcut now use the same `debug-alt` codicon (run/debug bug icon) instead of `debug-start`.
- No build/debug behavior changed; this release is a focused UI consistency update.

## 0.2.81

- Removed **Select Build Backend** from the crowded C/C++ Workspace toolbar and removed the DIR/CMAKE status-bar shortcut. The backend is now intentionally configured from **Project Build Settings → Build → Build backend**.
- Added a single-file Windows setup bootstrapper (`CPM-Setup-0.2.81.exe`) that embeds the CPM VSIX and the toolchain installer script, then launches the existing graphical MSYS2/MinGW x64+x86 setup.

# 0.2.80

- Added a Windows **CPM Toolchain Installer** available from `Detect / Select Toolchain`, the Home page and Build Settings.
- Added supported side-by-side MSYS2 toolchain provisioning for **MinGW-w64 UCRT64 x64** and **MinGW-w64 MINGW32 x86**, with optional CMake/Ninja and Microsoft C/C++ installation.
- The installer keeps the 32-bit and 64-bit GCC directories out of PATH by default to avoid `gcc/g++` collisions; it records `MSYS2_ROOT` and `CPM_TOOLCHAINS_ROOT` instead.
- Toolchain discovery now expands `MSYS2_ROOT`/`CPM_TOOLCHAINS_ROOT` into `ucrt64/bin`, `mingw64/bin`, `mingw32/bin` and `clang64/bin`, so both x86 and x64 installations can be selected independently.
- A standalone CPM Setup bundle can install the VSIX and the supported development environment from one graphical PowerShell setup.

# Changelog

## 0.2.79

- Added a project-scoped **Build backend** selector with **Direct GCC/Clang** (existing CPM engine) and **CMake / Ninja**. Existing projects remain on the direct backend by default.
- Added CMake settings for executable, generator, Ninja path, source/build directories, target, generator platform/toolset, toolchain file, cache variables and extra configure/build arguments.
- Added `Configure CMake Project`, `Select Build Backend` and `Open CMake Backend Report` commands plus a DIR/CMAKE status-bar indicator.
- Added CMake File API integration. CPM writes a client query before configure, reads the codemodel reply, discovers CMake targets/artifacts and reuses the resolved executable/shared/static-library artifact for Run and Debug.
- Routed Build, Rebuild and Clean through `cmake --build` when the CMake backend is selected, including configurable parallel jobs, `--clean-first`, multi-config `--config`, and selected target support.
- Added automatic generator-cache reset when the configured generator changes, and support for an explicit/custom Ninja executable through `CMAKE_MAKE_PROGRAM`.
- Added optional inheritance of CPM C/C++ compiler paths and automatic dependency-manager toolchain reuse: explicit toolchain first, then Conan `conan_toolchain.cmake`, then vcpkg `scripts/buildsystems/vcpkg.cmake`.
- Extended Project Health with CMake executable/Ninja/CMakeLists/cache/target/artifact checks. Direct-only PCH/Unity/link-engine settings are identified as CMake-managed when the backend is CMake.
- Added real CMake 3/Ninja validation covering configure, File API discovery, build, artifact resolution and executable launch, while keeping all previous regression suites green.

## 0.2.78

- Added a dedicated **Run Debug** command and workspace-toolbar button using the VS Code `debug-start` icon. It launches the existing executable or configured DLL host directly under `cppdbg`/GDB without rebuilding.
- Kept **Build & Debug** as a separate action. If Run Debug cannot find the binary for the active build mode it offers to fall back to Build & Debug.
- Fixed stale Home/Quick Actions references to the removed `cpm.debugInCpm` command and exposed both Run Debug and Build & Debug explicitly.
- Added project-scoped **Precompiled Headers (PCH)** for C and C++ independently. CPM generates wrapper headers and `.gch` artifacts inside the object directory, tracks nested PCH dependencies with `.d` files, and rebuilds the PCH only when required.
- Added opt-in **Unity Build** with configurable batch size (2-128). CPM generates C and C++ unity translation units in the object directory, while existing GCC/Clang dependency tracking invalidates a unity unit whenever any included source/header changes.
- Added Build Settings and safe-mode controls for PCH/Unity and surfaced their state in Project Health. Both accelerators are disabled by default to preserve existing build semantics.
- Added real GCC/G++ validation covering a generated C++ PCH reused by a Unity translation unit, plus toolbar/debug and settings regression tests.

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.76

- Added project-scoped external dependency management inspired by QPM, with dedicated support for **vcpkg manifest mode**, **Conan 2**, and **pkg-config/pkgconf**.
- Added a new **C/C++ Dependencies** tree view with tool detection, manifest generation, synchronization/install, report, reveal-output and clean actions.
- Added a new **Packages** page in Project Build Settings covering manager enablement, auto-sync before build, vcpkg triplets/baselines/overlays, Conan profiles/options/lockfiles, pkg-config search paths/static mode and manual build-integration overrides.
- Added normalized `.cpm/dependencies/integration.json` metadata. The direct GCC/Clang build now consumes dependency include directories, library directories, libraries, compiler flags and linker flags automatically.
- Added automatic vcpkg triplet inference from the active CPM 32/64-bit build mode; fully-static Windows linkage defaults to the matching `-static` triplet when no explicit triplet is configured.
- Added Conan manifest generation with `PkgConfigDeps`, `CMakeDeps`, `CMakeToolchain` and `cmake_layout`. Conan generator folders are automatically appended to pkg-config search paths for direct-build metadata resolution.
- Added pkg-config flag parsing for `-I`, `-isystem`, `-L`, `-l`, defines, compiler flags, pthread and linker flags, including optional `--static`.
- Added dependency preparation to normal builds and single-file compilation. Optional auto-install runs enabled package managers before the build; otherwise CPM generates/uses the normalized integration metadata.
- Integrated dependency include directories into the managed Microsoft C/C++ IntelliSense configuration.
- Extended Project Health with external dependency-manager state, missing-tool detection and repair/navigation actions.
- Added regression coverage for manifest generation, pkg-config parsing, build integration, settings UI and IntelliSense integration.

## 0.2.75

- Added a QPM-inspired **C/C++ Project Health** view with read-only checks for project/workspace integrity, files, dependency order, compiler toolchain, architecture, include/library paths, build engine, linkage, runtime DLLs, run/debug readiness, IntelliSense and configured icons.
- Added **Refresh Project Health**, **Open Project Health Report**, and **Repair Project Health...** commands. The repair picker routes each finding to the existing CPM command that owns the change instead of mutating project settings silently.
- Added workspace compatibility repair to Project Health and exposed the existing native `.cws` repair path through a command.
- Added build and IntelliSense health snapshots so the diagnostic view uses the same resolved target paths, linkage state, runtime imports and managed C/C++ configuration as the real build/services.
- Added Project Health shortcuts to the Home panel and C/C++ Actions view.
- Added regression coverage for healthy projects, missing registered files, DLL host errors, stale IntelliSense provider state, static-link DLL leftovers and obvious architecture mismatches.

## 0.2.74

- Ported the generic QPM build-engine improvements to CPM: exact GCC/Clang dependency tracking, configurable parallel compilation, GNU linker response files and robust Windows cleanup.
- Every C/C++ compile now emits an adjacent `.d` dependency file with `-MMD -MP -MF`. Incremental builds recompile a source when its own file or any actually included non-system header is newer, missing, or when dependency metadata is unavailable.
- Added per-project **Parallel jobs** (`0 = automatic logical CPU count`, `1 = sequential`, up to 256) and a **Use GNU response files** option to the Build settings page and safe-mode editor.
- Compilation jobs now run concurrently while preserving the deterministic object-file order used by the linker. A failed compile stops scheduling new work and skips the link step.
- Long GNU/MinGW linker command lines automatically switch to `cpm_link.rsp` (24,000-character safety threshold on Windows; 100,000 on POSIX). Small links keep normal arguments.
- Reworked Clean/Rebuild to use atomic directory rename plus retry/backoff where possible, with an in-place fallback for Windows `EPERM`, `EACCES`, `EBUSY` and `ENOTEMPTY` conditions. The whole build-mode directory is cleaned, including objects, `.d` files, response files and generated helpers.
- Avoided rewriting unchanged generated SDL icon helper files, preventing the new dependency tracker from forcing unnecessary recompilation.

## 0.2.73

- Added explicit per-project **Linkage** modes inspired by QPM: **Dynamic**, **Static compiler runtime**, and **Fully static when available**.
- Static compiler-runtime mode adds GCC/MinGW static runtime flags without forcing third-party libraries static; fully-static mode adds the global static link request and forces SDL packages to their static archives when available.
- Added `C/C++ Project Manager: Select Linkage Mode`, a DYN/RTS/STA status-bar indicator, and `Inspect Built Runtime DLL Dependencies`.
- Added post-link PE import inspection. CPM now separates normal Windows system DLL imports from remaining third-party/runtime DLL dependencies and warns when a supposedly standalone build still imports external DLLs.
- Switching to a static mode stops CPM from copying toolchain runtime DLLs; fully-static builds also remove previously deployed SDL runtime DLLs so stale files do not make a static build look dynamic.
- Kept the historical workspace `static-link` runtime-deployment value as a migration path, but new builds store linkage explicitly in the project settings.
- Audited QPM 0.34.11 for generic features that can strengthen CPM. The highest-value future ports are exact `.d` dependency tracking, parallel compilation, GNU linker response files, robust Windows build cleanup, project-health/repair diagnostics, dependency managers and Remote Linux/Raspberry Pi build/debug support.

## 0.2.72

- Added LabWindows/CVI-style DLL host execution: DLL projects now use an editable **Program name** executable plus command-line arguments, working directory and environment options.
- Run / Build and Run can launch a DLL through its configured host executable; relative Program name and working-directory paths are resolved from the project directory.
- GDB/cppdbg debugging now supports DLL projects by building the DLL and launching the configured host executable under the debugger. Static libraries remain non-runnable.
- Added advanced autocompletion profiles inspired by the CVI extension: **Hybrid**, **Native**, **Native + CPM Signature Help**, **Standard Library Assist**, and **Custom**.
- Added configurable project-symbol completion, standard-library fallback completion, immediate Signature Help, and the existing standard-header auto-include behavior to the new Autocompletion settings page.
- Added `C/C++ Project Manager: Select Autocompletion Profile` and exposed all profile controls in VS Code settings and CPM Build Settings. Legacy completion booleans are preserved through automatic Custom-profile compatibility.

## 0.2.71

- Fixed File Symbols false positives inside C++ overloaded-operator bodies.
- The fallback scanner now recognises symbolic operators (`operator+`, `operator+=`, `operator<<`, etc.), call/subscript operators, allocation operators and conversion operators when determining function-body ranges.
- Local direct-initialisation such as `Widget result(other);` is no longer reported as a file symbol when used inside an overloaded operator.
- Added regression coverage based on the JC Lib 0.8.48 File Symbols fix.

## 0.2.70

- Improved File Symbols filtering to reject calls, macro-like expressions and local class instances inside function bodies.
- Added copy/export actions and `.h/.hpp` plus `.c/.cpp` generation from File Symbols.
- Exposed separate Create Library Pack and Import Library Pack actions in the Libraries title bar and CPM editor menu.

## 0.2.69

- Fixed normal Run output: CPM no longer discards executable stdout/stderr with `stdio: ignore`.
- Added `cpm.runOutputMode` with Integrated Terminal (default), CPM Program Output, and Detached legacy modes.
- Integrated Terminal mode supports both output (`printf`, `std::cout`, `stderr`) and interactive input (`scanf`, `std::cin`).
- Added a dedicated `C/C++ Project Manager - Program Output` channel for non-interactive stdout/stderr capture.
- Made cppdbg/GDB console routing explicit on Windows (`externalConsole: false`, console redirection enabled, integrated terminal kept visible).

## 0.2.68 - Library cleanup, storage migration and CVI/Lua restoration

- Replaced the embedded Lua payload with the cleaned JC Lib 0.8.38 Lua catalog: Lua 5.4, industrial/test-bench helpers, LuaFileSystem and Stormworks content only.
- Added a one-way activation migration that removes retired catalog files, environments and libraries from the user's CPM global pack storage, including installations created by older releases.
- Added the JC Lib 0.8.38 LabWindows/CVI structured API pack as a dedicated `CVI` environment instead of merging its libraries into the generic `C` environment.
- Restored the cleaned Lua family in the embedded pack picker and removed stale picker routes that referenced content no longer shipped.
- Updated the Marketplace payload to include `data/cvi_pack.json` and the cleaned `data/lua_pack.json`.
- Changed the TypeScript build to clean the emitted `out/` directory before compilation, preventing orphaned JavaScript from older source layouts from being packaged.
- Audited current sources, generated runtime, manifests, README, architecture notes and changelog for retired catalog references.

## 0.2.67 - Embedded JC Lib pack synchronization

- Synchronized the embedded **C Language** pack from JC Lib 0.8.36 (`1.12.0` → `2.0.0`), including the modern C audit and dynamic allocation/pointer-tree generators.
- Rebuilt the auto-seeded **CPM C/C++ core pack** (`0.1.5` → `0.1.6`) from the updated C/C++ libraries while preserving CPM DLL/preprocessor helpers and the compact Marketplace picker payload.
- Synchronized the embedded **C++ Language** pack (`2.16.0` → `3.2.0`), including the modernized C++ catalog and typed `new[]` / `std::malloc` pointer-depth generators.
- Synchronized the embedded **Scripting / System** pack (`1.9.1` → `1.12.0`), including the completed Git command options and optional multi-select flags.
- Updated the embedded JC Lib parameter engine with `insertValueMap` and bounded nested placeholder expansion so generated allocation previews/insertion match JC Lib 0.8.36.
- Added optional empty multi-select support and a **Clear selection** action to structured pickers, fixing optional Git flag fields such as `git clone` flags.
- Normalized whitespace for generated Git/CMD parameterized commands when optional arguments are empty.
- Kept CPM's Marketplace-safe curated payload unchanged: Qt and other packs deliberately removed in 0.2.62 were not re-added.

## 0.2.66 - Application icons for CPM targets

- Added an **Application icons** section to the CPM project settings page.
- Restored and exposed the existing per-configuration executable icon field as **Executable icon (Windows .ico)**.
- Added **SDL window / application icon image** and **Apply SDL window icon automatically** project settings.
- Generic Windows executable builds now generate a temporary `.rc` file and compile it with `windres` / `llvm-windres` to embed the configured `.ico` into the `.exe`.
- SDL2/SDL3 builds can now copy a window icon asset beside the executable and auto-wrap `SDL_CreateWindow(...)` through a generated helper when enabled. BMP is supported by SDL alone; PNG/JPG/WebP require the matching SDL_image package.

## 0.2.65 - Settings page navigation fix

- Fixed the Build Settings webview page tabs not switching pages.
- Removed an unsafe inline regular-expression escape from the generated webview script; it could be converted into a literal line break and stop the script before event handlers were registered.
- Added a CSS fallback so non-Overview sections remain hidden until the settings webview controller has initialized.
- Kept the thematic settings layout introduced in 0.2.64: Overview, Project, Toolchain, Build, Run & Debug, SDL, Dependencies and Diagnostics.


## 0.2.64

- Reworked the CPM project settings editor into thematic pages inspired by the QPM settings UI.
- Added local page navigation with `Overview`, `Project`, `Toolchain`, `Build`, `Run & Debug`, `SDL`, `Dependencies` and `Diagnostics`.
- Added a per-page `Jump to a section...` selector and `Filter settings on this page...` search field.
- Added an Overview control center with shortcuts to build/run, toolchain, IntelliSense, SDL and build diagnostics commands.
- Split compiler/linker settings into clearer subsections: preprocessor/includes, linkage, compiler flags and build steps.
- Added `cpm.buildLogDetail` editing directly in the Diagnostics page.
- Added `docs/CPM_0.2.64_SETTINGS_AUDIT.md`.


## 0.2.63

- Fixed Build Settings save when a `.cws` / `.prj` is loaded directly in CPM without an opened VS Code workspace folder.
- Added detached workspace settings fallback: generic compiler/toolchain/SDL settings are now written to `<workspace-root>/.vscode/settings.json` when VS Code cannot use `ConfigurationTarget.Workspace`.
- Build, run and debug now read the detached CPM settings in this mode, so saved parameters are immediately reused by the build pipeline.
- Build mode selection now uses the same fallback and no longer fails with “Unable to write to Workspace Settings because no workspace is opened”.


## 0.2.62

- Reduced the embedded JC Lib data footprint for Marketplace publishing.
- Kept only the curated embedded library packs required for CPM usage: C, C++, C/C++ preprocessor/core, OpenCV, build/toolchains, SDL, Windows API/devices, scripting/system, Python, JavaScript/HTML/CSS, TypeScript, databases, PHP and embedded systems.
- Removed large non-CPM packs from the shipped data payload: legacy/default/CVI, Qt, Java, C#, Kotlin, VBA, Lua and Assembly structured packs.
- Updated the embedded library pack menu so unavailable pack families are no longer proposed by the CPM starter-pack picker.
- Added marketplace-oriented package/publish scripts and documentation notes recommending VSIX size reduction over relying on request-timeout changes.

# Changelog

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.61
- Added logical file moves in the C/C++ Workspace tree.
- Files can now be moved to another CPM logical folder from the file context menu with `Move File To Folder...`.
- Added drag-and-drop support inside the CPM workspace tree: drag one or more project files onto a logical folder, or onto the project node to move them back to the project root.
- Project file references are updated in the `.prj` file; disk files are not moved by this logical-folder operation.

## 0.2.60
- Added `CPM_String::operator-` overloads for `std::string`, C strings and single characters.
- Added in-place sequence removal with `CPM_String::operator-=` overloads.
- Added `remove_all_in_place(...)`, `removed_all(...)`, `trim_edges()` and `trim_edges_copy()` helpers.
- Updated CPM_Utility documentation with sequence-removal examples such as `text -= "bonjour"`.

## 0.2.59
- Added `CPM_String::operator+=` overloads for `std::string`, C strings and single characters.
- Added in-place repetition operators `CPM_String::operator*=` and `CPM_String::operator^=`.
- Updated CPM_Utility examples to document compound string operations.


## 0.2.58

- Updated the embedded Scripting / System pack with the JC Lib 0.8.28 Windows CMD & Batch structure.
- Added `CPM_String` to the `CPM_Utility` C++ bundle and kept `MyString` as a compatibility alias.
- Added string repetition helpers: `CPM_String("=") * 10`, `10 * CPM_String("-")`, `"*"_cpm * 8` and `cpm_utility::repeat(...)`.
- Documented why raw C++ string literals cannot support the exact expression `"=" * 10` without a CPM user-defined type.

## 0.2.57 - CPM_Utility consolidation

- Consolidated the former C++ `MY_Util` and generated `cpm_util` workflows into a canonical `CPM_Utility` bundle.
- Added `cpm_utility.cpp` / `cpm_utility.h` as the default C++ utility bundle.
- Added helpers for executable path, executable directory, filesystem operations, text I/O, INI loading, string processing, timestamps, delays, Unix timestamps and stopwatch timing.
- Preserved source compatibility through the `jc_utility` namespace alias while recommending `cpm_utility` for new code.
- Updated C++ error management to include `cpm_utility.h` instead of the old `myUtil.h`.

## 0.2.56 - Escaped error-log bundle templates

- Fixed generated C++ CPM error-management sources where `\n`, `\t` and `\0` sequences could be expanded too early by the TypeScript template and appear as literal line breaks or NUL characters in the generated `.cpp` file.
- Converted the affected C/C++ source templates to raw template strings so generated code keeps valid C/C++ escape sequences such as `'\n'`, `"\n"`, `"\tFile"` and `L'\0'`.
- Applied the same escaping fix to the generated C error source and C++ core utility source, including append-log helpers and executable-path helpers.
- Added template-level validation for the generated utility/error sources to ensure the emitted C/C++ no longer contains broken string or character literals.

## 0.2.55 - Error log formatting and C++ utility helpers

- Integrated the improved CPM C++ error-log block formatting supplied through `CPM_Error.zip`, while keeping the generated module portable across Windows/Linux/macOS.
- Updated generated C and C++ error modules to emit date-stamped separator blocks with code, message, file, line and function context.
- Added `CPM_ERROR(code, message)` to the generated C++ error header for direct one-line reports outside the `goto error` macros.
- Expanded the generated C++ core utility bundle with executable path/directory helpers, filesystem helpers, text-file I/O, environment-variable access and common string helpers.
- Expanded the bundled `MY_Util` core module with `getExecutablePath()`, `getExecutableDirectory()`, path normalization, directory creation, file read/write/append helpers, string helpers, `safe_filename()` and `sleep_ms()`.
- Updated `CPM_Utility/ErrorManagement` macros to write structured error blocks with source file, line and function context.

## 0.2.54 - Structured CPM build reports

- Reworked the main `C/C++ Project Manager` output channel into a structured build report with clear build order, project/toolchain, compilation, link and final summary sections.
- Added the secondary `C/C++ Project Manager - Build Trace` output channel, which keeps full commands, working directories, stdout, stderr, exit codes and tool durations.
- Captured compiler/linker output per process before rendering it, preventing parallel or sequential tool output from becoming interleaved in the readable build report.
- Added diagnostic parsing for GCC, G++, MinGW, Clang, MSVC-style diagnostics and common GNU linker errors.
- Added contextual hints for common errors: undeclared identifiers, incomplete types, no matching overload, undefined references, missing libraries/includes and multiple definitions.
- Published parsed build diagnostics to VS Code Problems with source `CPM Build`.
- Added commands `C/C++ Project Manager: Show Build Problems` and `C/C++ Project Manager: Show Full Build Trace`.
- Added setting `cpm.buildLogDetail` with `compact`, `normal` and `verbose` modes.

## 0.2.52 - CPM activity bar logo refresh

- Reworked the CPM activity-bar icon to use a Qt-style rounded-square outline with a compact `PM` monogram for better readability at VS Code sidebar size.
- Updated the marketplace PNG icons so the extension branding remains consistent with the new sidebar logo.

## 0.2.50 - SDL add-on package auto-linking


## 0.2.51

- Updated embedded JC Lib packs from JC Lib 0.8.27.
- Refreshed structured pack hierarchy for SDL, Lua, Embedded, Windows API / Devices, Web, C, C++, OpenCV and related bundled packs.
- Added bundled Assembly and Visual Basic / VBA packs to the CPM embedded library manager.
- Improved starter pack insertion so imported bundled packs preserve their source environment and library hierarchy instead of being flattened into a generic target.
- Added updated metadata files used by the embedded library tools.

- Fixed SDL2 builds where source files used SDL_ttf, SDL_image or SDL_mixer APIs while the build settings still listed only the SDL2 core package.
- CPM now scans project sources during SDL build planning and auto-adds installed SDL add-on packages when it detects `TTF_*`, `IMG_*`, `Mix_*`, `SDLNet_*` or SDL2_gfx usage.
- SDL package settings now accept short aliases such as `ttf`, `image`, `mixer` and `net`, mapped to SDL2 or SDL3 according to the selected SDL version.
- SDL include path resolution now keeps the active architecture include directories instead of mixing 32-bit and 64-bit SDK include folders when a multi-architecture SDL SDK is selected.
- SDL static-link mode now resolves extension static libraries such as `libSDL2_ttf.a` and appends known private Windows libraries needed by SDL_ttf, SDL_mixer, SDL_net and SDL2_gfx.

## 0.2.49 - JC Lib context-menu utilities update

- Integrated the latest JC Lib editor-context utilities into CPM.
- Added `Utilities > Character / encoding tools` with a character table/converter webview, selected-text to decimal conversion and selected numeric values back to text.
- Added `Utilities > Number / bit tools` with the full number / bit converter webview while keeping the quick selected-integer decimal/hex/binary conversions.
- Added `Utilities > Logic / state tools` with the truth-table and FSM designer.
- Added `Utilities > Signal / filter tools` with the digital-filter designer.
- Reorganized the CPM editor context menu so snippets, documentation helpers and utilities match the updated JC Lib layout.

## 0.2.48 - Context-menu color value picker

- Added `CPM: Insert color value` to the editor context menu.
- Integrated the JC Lib color picker workflow into CPM with a VS Code webview color selector, RGB channel editing, alpha control, brightness slider and presets.
- The generated value can be inserted or copied in several C/C++-oriented formats: `#RRGGBB`, `0xRRGGBB`, decimal RGB integer, `rgb(...)`, `rgba(...)`, raw RGB/RGBA channel lists, `SDL_Color` initializer, `RGB(...)` helper and `QColor(...)`.
- Current selections such as `#RRGGBB` or `0xRRGGBB` are used as the initial color when opening the picker.

## 0.2.47

- Integrated JC Lib 0.8.9 embedded-library fixes for enum-backed multi-select pickers. Combined values such as `SDL_WINDOW_FULLSCREEN | SDL_WINDOW_OPENGL` are now injected into enum/select parameter fields and update the generated-call preview.
- Added bundled SDL2 and SDL3 standalone library packs in the embedded library manager.
- Updated the SDL pack route to expose a combined SDL2 / SDL3 pack plus separate SDL2-only and SDL3-only import choices.

## 0.2.46 - SDL path normalization and build settings import/export

- Fixed SDL builds when `cpm.sdlRootPath` points directly to a nested SDK folder such as `...\SDL2\i686-w64-mingw32\bin`, `lib`, `include` or `include\SDL2`; CPM now normalizes those selections to a usable SDL SDK root before resolving includes, libraries and runtime DLLs.
- SDL2 link flags are now injected correctly for the common MinGW 32-bit SDK layout selected from `C:\Program Files (x86)\SDL2\i686-w64-mingw32\bin`.
- Added `Export build parameters` and `Import build parameters` buttons at the bottom of the build settings webview. The exported JSON includes the target settings, run/build actions, dependencies and generic compiler/SDL settings.
- Import applies the selected JSON to the currently selected build configuration scope, so a known-good setup can be reused across projects.

## 0.2.45 - SDL2 auto-detection and architecture selection fix

- Fixed SDL2 builds where sources were detected as `SDL_main` but SDL link flags were not injected because no explicit `cpm.sdlRootPath` was selected.
- Added build-time SDL SDK auto-scan when `cpm.sdlRootPath` is empty and `cpm.sdlEnabled` is `auto`/`on`; projects that include or call SDL can now pick up common SDL2/SDL3 roots automatically.
- Added common Windows SDK roots for `C:\Program Files (x86)\SDL2` and nested MinGW layouts such as `i686-w64-mingw32` / `x86_64-w64-mingw32`.
- SDL library, include and DLL folder resolution now prefers the active compiler architecture, preventing a 32-bit MinGW build from selecting the x64 SDL import library when both are present in the SDK.
- SDL3 source detection now takes precedence over the default SDL2 package list when `cpm.sdlVersion` is `auto`.

## 0.2.44 - SDL3 project and build integration

- Added SDL3 support alongside the existing SDL2 workflow.
- Added `cpm.sdlVersion` with `auto`, `SDL2` and `SDL3` modes.
- Extended SDK detection to recognize SDL3 roots, `SDL3_DIR` / `SDL3_HOME` / `SDL3_ROOT`, MSYS2 `clang64`, and artifacts such as `include/SDL3/SDL.h`, `libSDL3.dll.a` and `SDL3.dll`.
- Extended SDL package support to `SDL3`, `SDL3_image`, `SDL3_mixer`, `SDL3_ttf` and `SDL3_net` when those packages are present in the selected SDK.
- Added SDL3 starter generation for C and C++ projects using `<SDL3/SDL.h>`, `<SDL3/SDL_main.h>`, SDL3 event constants and the SDL3 renderer/window API.
- Updated the generic build pipeline so SDL2 keeps the `SDL2main` Windows link path, while SDL3 links with `-lSDL3` and no `SDL3main` library.
- SDL runtime handling now works for both SDL2 and SDL3 in `copy-dlls`, `path-only` and experimental `static-link` modes.

## 0.2.43

- Generalized normal C/C++ runtime dependency handling beyond MinGW-only names.
- `copy-dlls` now indexes the selected toolchain `bin` directories and copies detected GCC/MinGW/MSYS2 and LLVM/Clang runtime DLLs when they are imported by the generated target or recognized as compiler runtimes.
- Added PE import-table tracing with recursive dependency detection for copied runtime DLLs, so transitive toolchain DLLs can be deployed when they live in the selected compiler `bin` directory.
- Added a `.cpm-runtime-dlls.json` manifest beside the target to safely clean DLLs previously copied by CPM when switching runtime modes, architectures or toolchains.
- Renamed the build-settings section to `Generic toolchain runtime dependencies`.

## 0.2.42

- Added generic toolchain runtime dependency handling modes for normal C/C++ builds, aligned with the SDL runtime workflow: `copy-dlls`, `path-only` and `static-link`.
- The build settings page now exposes a dedicated `Generic toolchain runtime dependencies` section.
- `copy-dlls` keeps the previous behavior and deploys runtime DLLs such as `libgcc_s_*.dll`, `libstdc++-6.dll` and `libwinpthread-1.dll` beside the executable or DLL target.
- `path-only` disables runtime DLL copying and relies on CPM run/debug to prepend the selected toolchain `bin` directory to `PATH`.
- `static-link` injects MinGW static runtime flags where supported by the selected toolchain. This is useful for classic executable projects that should not depend on copied MinGW runtime DLLs.
- Added the setting `cpm.runtimeDependencyMode`; the legacy `cpm.deployRuntimeDlls` setting is still read for backward compatibility.

## 0.2.41 - SDL2 project and build integration

- Added SDL SDK detection and selection with common Windows roots such as `C:\Program Files\SDL64`, environment variables and manually selected SDK folders.
- Added commands to create a complete SDL workspace/project or add an SDL project to the current workspace.
- Generated SDL starters create `main.c` or `main.cpp`, an assets folder and a README explaining SDL settings.
- Added SDL build integration settings for `SDL2`, `SDL2_image`, `SDL2_mixer`, `SDL2_ttf`, `SDL2_net` and `SDL2_gfx`.
- The generic build pipeline now injects SDL include paths, link libraries and Windows subsystem flags when SDL is enabled.
- Added SDL runtime handling modes: copy DLLs beside the executable, use PATH only, or attempt static linking when the SDK provides static libraries.
- SDL DLL deployment copies all DLLs from the selected SDL `bin` folder by default to avoid missing transitive package DLLs.
- C/C++ IntelliSense now receives SDL include directories from the selected SDK.

## 0.2.40 - Bundle header documentation audit

- Audited generated and copied module-bundle headers for C and C++ bundles.
- Expanded header Doxygen blocks with explicit feature lists, typical applications, usage notes and minimal examples.
- Covered C communication bundles: UART, IPC, Ethernet TCP/UDP, Wi-Fi TCP/UDP, Bluetooth RFCOMM, CAN/SocketCAN, I2C and SPI.
- Covered C++ CPM_Utility bundles: generic utilities, error management, Python bridge, Web UI, UART, IPC, Ethernet, Wi-Fi, Bluetooth, CAN, I2C, SPI, CommsManager and CommsListenService.
- Covered generated CPM bundles in the creation workflow: C/C++ core utilities, C/C++ error management, C Python execution bridge, C Lua execution bridge and C Web UI backend.
- Corrected several header examples so they use the actual public API names exposed by the generated/copied headers.

## 0.2.39 - Lua execution bridge and bundle API notes

- Added `Module bundles > C > Lua execution bridge`, generating `cpm_lua_exec.c`, `cpm_lua_exec.h` and a README.
- Added `Module bundles > C++ > Lua execution bridge`, generating the same C ABI bridge in a C++ bundle folder so it can be linked from C++ projects.
- Added `Module bundles > Scripts > Lua worker protocol starter` with an `example_worker.lua` showing command-line argument access through `arg[1]`, `arg[2]`, etc.
- Expanded the generated Python bridge header with explicit feature notes: arguments are available through `sys.argv[1:]`, and `print(...)` output is captured in `CpmPythonResult.output`.
- Added matching Lua bridge header documentation explaining `CpmLuaResult.output`, command-line arguments and interactive stdout flushing.

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
- Added separate C++ bundle entries for the original CPM_Utility Wi-Fi and Bluetooth classes.
- Updated the C full communication stack to include UART, IPC, Ethernet, Wi-Fi, Bluetooth, I2C and SPI.
- Documented the scope limits: Wi-Fi uses regular TCP/UDP after OS network connection, while the generated Bluetooth C module is Windows RFCOMM-first and returns an unsupported status elsewhere.

## 0.2.31

- Added C bundle equivalents for I2C and SPI communication.
- Added `Module bundles > C > I2C communication` generating `cpm_i2c.c`, `cpm_i2c.h` and a README.
- Added `Module bundles > C > SPI communication` generating `cpm_spi.c`, `cpm_spi.h` and a README.
- Updated the C full communication stack to include UART, IPC, Ethernet, I2C and SPI.
- Added separate C++ bundle entries for the original CPM_Utility I2C and SPI classes.

## 0.2.30

- Split the script bundles into generic starters and project-specific demos.
- Added `Module bundles > Scripts > Python worker protocol starter` for a minimal Python stdin/stdout worker protocol.
- Renamed the old project-specific Python scripts to `Robot demo Python scripts`.
- Added `Module bundles > Scripts > Minimal Web UI frontend` with a generic `/api/state` and `/api/action` frontend.
- Renamed the old Raspberry Pi/GPIO/camera-oriented frontend to `Embedded demo Web UI frontend`.
- Added README/API notes to generated C bundles and C communication bundles.
- Automatically adds `ws2_32` to CPM linker libraries on Windows when socket or Web UI backend bundles are added.

## 0.2.29

- Added pure C communication bundle equivalents for the exposed CPM_Utility C++ communication bundles.
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

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.61
- Added logical file moves in the C/C++ Workspace tree.
- Files can now be moved to another CPM logical folder from the file context menu with `Move File To Folder...`.
- Added drag-and-drop support inside the CPM workspace tree: drag one or more project files onto a logical folder, or onto the project node to move them back to the project root.
- Project file references are updated in the `.prj` file; disk files are not moved by this logical-folder operation.

## 0.2.25

- Grouped the new-file/starter picker into C files, C++ files, Windows/DLL, module bundles, scripts/text and saved templates.
- Split the MY_Util Python integration into a C++ Python execution bridge and a separate Python companion scripts bundle.
- Renamed the C++ bundle group labels to avoid repeating MY_Util in the quick-pick list while keeping the original folder structure.

## 0.2.24

- Renamed the MY_Util creation entry to a generic `Module bundle...` action.
- Grouped module bundles by language with C and C++ sections.
- Removed repetitive `CPM_Utility /` prefixes from bundle labels.
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

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.61
- Added logical file moves in the C/C++ Workspace tree.
- Files can now be moved to another CPM logical folder from the file context menu with `Move File To Folder...`.
- Added drag-and-drop support inside the CPM workspace tree: drag one or more project files onto a logical folder, or onto the project node to move them back to the project root.
- Project file references are updated in the `.prj` file; disk files are not moved by this logical-folder operation.

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

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.61
- Added logical file moves in the C/C++ Workspace tree.
- Files can now be moved to another CPM logical folder from the file context menu with `Move File To Folder...`.
- Added drag-and-drop support inside the CPM workspace tree: drag one or more project files onto a logical folder, or onto the project node to move them back to the project root.
- Project file references are updated in the `.prj` file; disk files are not moved by this logical-folder operation.

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

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.61
- Added logical file moves in the C/C++ Workspace tree.
- Files can now be moved to another CPM logical folder from the file context menu with `Move File To Folder...`.
- Added drag-and-drop support inside the CPM workspace tree: drag one or more project files onto a logical folder, or onto the project node to move them back to the project root.
- Project file references are updated in the `.prj` file; disk files are not moved by this logical-folder operation.

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

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.61
- Added logical file moves in the C/C++ Workspace tree.
- Files can now be moved to another CPM logical folder from the file context menu with `Move File To Folder...`.
- Added drag-and-drop support inside the CPM workspace tree: drag one or more project files onto a logical folder, or onto the project node to move them back to the project root.
- Project file references are updated in the `.prj` file; disk files are not moved by this logical-folder operation.

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

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.61
- Added logical file moves in the C/C++ Workspace tree.
- Files can now be moved to another CPM logical folder from the file context menu with `Move File To Folder...`.
- Added drag-and-drop support inside the CPM workspace tree: drag one or more project files onto a logical folder, or onto the project node to move them back to the project root.
- Project file references are updated in the `.prj` file; disk files are not moved by this logical-folder operation.

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

## 0.2.77

- Added project-scoped **Remote Linux / Raspberry Pi** support inspired by QPM: OpenSSH endpoint configuration, project synchronization, remote GCC/G++ build, remote run and `gdbserver` debugging.
- Added a native **C/C++ Remote Linux** tree view plus commands for connection testing, synchronization, remote build/run/debug, SSH terminal, report and configuration.
- Ported the OpenSSH Device Manager so CPM can manage `~/.ssh/config` aliases, inspect hosts/neighbours, generate Ed25519 keys and enroll public keys without storing private-key material in CPM.
- Added a dedicated **Remote Linux** page to Project Build Settings with SSH/SCP/rsync tools, remote directories/toolchain, portable build flags, pkg-config packages, environment variables and optional custom build/run commands.
- Added CPM-generated `.cpm/remote/cpm_remote_build.sh` for direct Linux builds. Project-relative source/include/library paths are mapped to the remote project; non-portable absolute Windows paths are deliberately skipped and reported.
- Remote direct builds produce native Linux executables, `.so` shared libraries or `.a` static libraries and reuse CPM standards, defines, warnings, optimization/debug settings and linkage mode where portable.
- Remote Run follows the existing CPM output mode: integrated SSH terminal for interactive programs, Program Output capture for non-interactive stdout/stderr, or detached `nohup` execution.
- Remote Debug can start `gdbserver` and launches Microsoft C/C++ `cppdbg` with SSH `pipeTransport`, remote GDB and automatic remote-to-local source mapping, avoiding a local cross-architecture GDB requirement.
- Extended Project Health and C/C++ Actions with Remote Linux status and repair/navigation actions.
- Added regression coverage for remote script generation, Windows-path filtering, Linux target naming, SSH/scp workflows, remote cppdbg configuration, settings, Project Health and SSH-device-manager integration.

## 0.2.61
- Added logical file moves in the C/C++ Workspace tree.
- Files can now be moved to another CPM logical folder from the file context menu with `Move File To Folder...`.
- Added drag-and-drop support inside the CPM workspace tree: drag one or more project files onto a logical folder, or onto the project node to move them back to the project root.
- Project file references are updated in the `.prj` file; disk files are not moved by this logical-folder operation.

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

