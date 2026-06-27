# Templates and snippets guide

## Creation wizard

Open a C/C++ project, right-click the project or a logical folder, then run **Create New File or Starter...**.

The wizard can generate one file or a coordinated starter set. Existing files are never overwritten silently. When a generated filename already exists, choose either:

- **Keep existing and add references**;
- **Overwrite generated files**;
- cancel the operation.

## User creation templates

Run **C/C++ Project Manager: Manage Creation Templates...**. A text file can be saved as a reusable template or imported from disk.

Templates support these placeholders:

| Placeholder | Meaning |
|---|---|
| `{{baseName}}` | output filename without extension |
| `{{fileName}}` | output filename |
| `{{headerFile}}` | generated or associated header filename |
| `{{guard}}` | normalized uppercase include guard |
| `{{prefix}}` | normalized uppercase module prefix |
| `{{uirFile}}` | associated UIR filename |
| `{{date}}` | ISO generation date |
| `{{year}}` | generation year |

## Snippet insertion

Run **CPM > Snippets > CPM: Insert snippet** or press `Ctrl+Alt+I` (`Cmd+Alt+I` on macOS). The selected snippet is inserted at the current cursor position through VS Code `SnippetString`, so tab stops such as `${1:panel}` remain interactive.

To add a personal snippet, select code in the editor and run **CPM > Snippets > CPM: Save selection as snippet**.

## Documentation and comment helpers

The editor right-click menu now exposes a single **CPM** submenu. Use **CPM > Documentation / comments** to insert:

- a file description header with company/contact placeholders and a `CHANGES/EVOLUTIONS` table;
- one formatted change-table line at the cursor position;
- reusable comment-section separators, either boxed, line-based or compact;
- special-character text banners with selectable fill pattern, compact/standard size presets and output mode.

The same building blocks are also available as built-in snippets from **CPM > Snippets > CPM: Insert snippet**.

## Error-managed main starter

The creation wizard includes **C main with CPM error handling**. It generates a `main.c` starter with the documentation header, CPM error initialization, `error:` and `cleanup:` labels, and code-section comment headers. The wizard can also create a paired `main.h` and the `cpm_error.c/.h/.ini` support module when it is not already present.

## 0.2.21 starter behavior

Generated entry-point starters no longer insert placeholder unused-parameter casts such as `(void)argc;`, `(void)argv;` or `(void)hInstance;`. Instead, console `main()` starters include a small argument loop using `argc`/`argv`, and the WinMain starter includes an `lpCmdLine` block for command-line text passed to a Windows GUI executable.

The DLL starter references `hinstDLL` and `lpvReserved` directly in the generated `DllMain` body, so the template remains warning-friendly without adding artificial `(void)` lines.

## Module bundles

The `Module bundle...` creation action is grouped by language. C bundles currently generate CPM-native utility files such as `cpm_util.c/.h/.ini` and `cpm_error.c/.h/.ini`. C++ bundles copy the bundled MY_Util modules without repeating the `MY_Util /` prefix in each item label.



## Module bundle grouping

The module-bundle picker is separated into C modules, C++ modules and script modules. `Python execution bridge` copies only the C++ bridge in `external/pythonExec`; `Python worker protocol starter` creates the generic worker files; `Robot demo Python scripts` separately copies the original project-specific Python files.


## 0.2.26 creation workflow

The file creation command is now organized as category pickers rather than one long list. The first picker exposes `C`, `C++`, `Module bundles`, `Scripts and text`, and `Saved templates` when user templates exist.

Module bundles are also organized by folder-like categories: `C`, `C++`, and `Scripts`. Generated bundle default folders now use `Bundle/C`, `Bundle/C++`, and `Bundle/Scripts`. The generated CPM core utility and error-management bundles exist in both C and C++ forms. Generated C rewrites are available for Python execution, Web UI backend, UART, IPC and Ethernet TCP/UDP. C++ MY_Util modules remain available for projects that want the original class-based APIs.


### C communication bundles

`Module bundles > C` now includes generated C communication modules:

- `UART communication`: creates `cpm_uart.c` / `cpm_uart.h`.
- `IPC communication`: creates `cpm_ipc.c` / `cpm_ipc.h`.
- `Ethernet TCP-UDP communication`: creates `cpm_socket.c` / `cpm_socket.h`.
- `Full communication stack`: creates all three communication modules together.

The C APIs are intentionally procedural and independent from the original MY_Util C++ classes. Under Windows, the Ethernet module requires `ws2_32` at link time.

### C Python execution bridge

`Module bundles > C > Python execution bridge` generates:

- `cpm_python_exec.h`
- `cpm_python_exec.c`

The API is pure C and supports one-shot script execution as well as a persistent session with stdin/stdout pipes. It mirrors the useful behavior of the MY_Util C++ bridge without copying the companion Python scripts. Generic scripts are available under `Module bundles > Scripts > Python worker protocol starter`; the old project-specific scripts are available under `Module bundles > Scripts > Robot demo Python scripts`.


### 0.2.28 Web UI bundle split

The Web UI backend and frontend assets are now separate bundle choices. C projects can generate `cpm_webui.c` / `cpm_webui.h`; C++ projects can copy only `webui.cpp` / `webui.h`; HTML, JavaScript, CSS and images are available from `Module bundles > Scripts > Minimal Web UI frontend`.

### 0.2.30 bundle clarification

Script bundles are now split between generic starters and project-specific demos. The Python worker protocol starter creates only a minimal `catj_py_helper.py`, `logger.py`, `example_worker.py` and README. The older Raspberry Pi / robot-oriented Python files are available separately as `Robot demo Python scripts`.

The Web UI assets are split the same way: `Minimal Web UI frontend` generates a small generic HTML/JS/CSS frontend for `/api/state` and `/api/action`, while `Embedded demo Web UI frontend` keeps the original GPIO/camera/bus demo assets.

C bundles now include README/API notes where useful. When a socket or Web UI backend bundle is added on Windows, CPM adds `ws2_32` to the workspace linker libraries if it is not already present.

### 0.2.31 C I2C/SPI communication bundles

`Module bundles > C` now offers `I2C communication` and `SPI communication` alongside UART, IPC and Ethernet. The full C communication stack now creates all five low-level communication modules. The C++ bundle list also exposes the original MY_Util I2C and SPI classes as individual selectable bundles.



## 0.2.32 bundle note

The C communication bundle set now includes Wi-Fi and Bluetooth RFCOMM modules in addition to UART, IPC, Ethernet, I2C and SPI. The Wi-Fi module handles application TCP/UDP traffic once the operating system is connected to Wi-Fi; it does not manage SSID association. The Bluetooth C module targets Windows RFCOMM by default and reports unsupported on other platforms unless extended with a platform backend.

### 0.2.33 CAN communication bundles

New bundle entries:

- `Module bundles > C > CAN communication`
- `Module bundles > C++ > CAN communication`

The C bundle creates `cpm_can.c`, `cpm_can.h` and `README.md` under `Bundle/C/Communication/CAN` by default. The API provides `CpmCan_Open`, `CpmCan_Send`, `CpmCan_Receive`, receive timeout configuration, loopback control, own-message reception, filter configuration and diagnostic formatting.

The C++ bundle creates `Communication/can/can.cpp` and `can.h` under the selected C++ bundle folder. The default implementation is a SocketCAN wrapper.

### 0.2.38 bundle Doxygen examples

Bundle generation now writes usage examples into the generated headers as Doxygen `@par Example of use` blocks. For the C Python bridge, `cpm_python_exec.h` includes a complete `CpmPythonConfig`, `CpmPythonResult`, `CpmPython_RunScript` and `CpmPython_ResultFree` example. The C sources generated or copied by the bundle system also receive Doxygen-style comments on implementation helpers and API functions, so the generated files can be read or processed by Doxygen without adding documentation manually first.

### Special-character text comments

The C `Python execution bridge` bundle generates `cpm_python_exec.c` / `cpm_python_exec.h` and keeps the Windows wait/timeout code compatible with older MinGW/MinGW32 headers.

`Insert special-character text` renders characters using a selectable fill pattern such as `//`, `\\`, `||`, `**`, `##`, `==`, `--`, `++` or a custom 1 to 8 character token. The size picker provides five presets: Micro, Small, Narrow, Standard and Large. Micro/Small use a compact 3x5 font, Narrow/Standard use a standard 5x7 font, and Large corresponds to the previous size 2. The command can insert the result as C/C++ line comments, as a C block comment, or as raw generated characters.

### Header change entries

`Insert header change line` keeps the CHANGES/EVOLUTIONS table width stable. Descriptions longer than the Description column are wrapped onto continuation rows, and a separator row is inserted under the generated entry.



## 0.2.39 Lua execution bridge

New module bundles:

- `Module bundles > C > Lua execution bridge`: generates `cpm_lua_exec.c`, `cpm_lua_exec.h` and README notes.
- `Module bundles > C++ > Lua execution bridge`: generates the same C ABI bridge in a C++ bundle folder.
- `Module bundles > Scripts > Lua worker protocol starter`: generates `example_worker.lua` and a short protocol README.

The Lua header documents the main API directly in Doxygen form: one-shot execution with `CpmLua_RunScript`, stdout/stderr capture through `CpmLuaResult.output`, command-line arguments through Lua `arg[]`, and interactive line/JSON-style text exchanges through `CpmLuaSession_*`.

### 0.2.40 bundle header documentation audit

The bundle headers now include a stronger self-contained documentation block. Each audited header starts with Doxygen sections for main features, typical applications, usage notes and a short example using the public API. This was applied to the generated C bundles, the generated C++ bundles and the copied MY_Util communication/external/Web UI bundles.

This avoids missing important runtime behavior such as script argument passing or stdout capture: the Python and Lua execution bridge headers now explicitly document both argument access on the script side and output capture in the C/C++ result structures.
