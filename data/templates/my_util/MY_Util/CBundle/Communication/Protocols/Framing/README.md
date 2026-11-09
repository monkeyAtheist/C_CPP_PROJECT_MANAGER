# CPM binary framing bundle

Dependency-free helpers for byte-stream protocols:
- COBS encode/decode (encoded frame ends with `0x00`);
- SLIP encode/decode;
- 16-bit and 32-bit big-endian length-prefix framing;
- delimiter search.

This bundle is useful on UART, TCP, IPC and Bluetooth streams where message boundaries are not preserved by the transport.
