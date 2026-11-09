# CPM VISA bundle

Minimal Windows VISA runtime loader with no compile-time dependency on NI-VISA/Keysight headers or import libraries.

It dynamically loads `visa64.dll` / `visa32.dll` and provides resource discovery, session open/close, timeout/termination attributes, read/write/query and status descriptions. Pair it with the SCPI bundle for command handling.

Non-Windows builds compile but return an explicit unsupported status; a vendor-specific `libvisa.so` backend can be added if required.
