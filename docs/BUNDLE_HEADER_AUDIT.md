# Bundle header documentation audit - 0.2.40

This audit checks that module-bundle headers are useful immediately after insertion into a CPM project. The goal is to avoid hidden behavior being missed by the user, especially for modules such as Python/Lua script execution where arguments and console output are exchanged through generated bridge structures.

## Audit criteria

Each audited header must provide:

- a Doxygen `@file` and `@brief` block;
- a `Main features` section;
- a `Typical applications` section;
- a `Usage notes` section when platform/runtime behavior is non-obvious;
- a minimal `Example of use` based on the public API exposed by that header.

## Audited copied bundle headers

### C communication bundle headers

- `CBundle/Communication/UART/cpm_uart.h`
- `CBundle/Communication/IPC/cpm_ipc.h`
- `CBundle/Communication/Ethernet/cpm_socket.h`
- `CBundle/Communication/WiFi/cpm_wifi.h`
- `CBundle/Communication/Bluetooth/cpm_bluetooth.h`
- `CBundle/Communication/CAN/cpm_can.h`
- `CBundle/Communication/I2C/cpm_i2c.h`
- `CBundle/Communication/SPI/cpm_spi.h`

### C++ MY_Util bundle headers

- `Communication/uart/uart.h`
- `Communication/IPC/IPC.h`
- `Communication/ethernet/ethernet.h`
- `Communication/wifi/wifi.h`
- `Communication/bluetooth/bluetooth.h`
- `Communication/can/can.h`
- `Communication/I2C/I2C.h`
- `Communication/SPI/SPI.h`
- `Communication/comms/comms_manager.h`
- `Communication/comms_listen/CommsListenService.h`
- `external/pythonExec/pythonExec.h`
- `webui/webui.h`
- `ErrorManagement/errorManagement.h`
- `myUtil.h`

## Audited generated template headers

- `C_CORE_UTIL_HEADER_TEMPLATE`
- `CPP_CORE_UTIL_HEADER_TEMPLATE`
- `ERROR_HEADER_TEMPLATE`
- `CPP_ERROR_HEADER_TEMPLATE`
- `C_PYTHON_EXEC_HEADER_TEMPLATE`
- `C_LUA_EXEC_HEADER_TEMPLATE`
- `C_WEBUI_HEADER_TEMPLATE`

## Corrections made during audit

Some existing examples were too generic or used outdated names. They were corrected to match the current public API, notably the C socket, C Wi-Fi, C I2C, C SPI, C++ UART, C++ I2C, generated C/C++ utility, generated C/C++ error and generated C Web UI examples.

## Follow-up rule

When adding a new bundle, update the header first, then the README if the bundle has important platform constraints. The header is the primary reference because it is copied into the user's project with the source files.
