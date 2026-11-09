# CPM LIN

Compact LIN 2.x master-side helper built on the CPM UART backend.

Included:
- protected identifier parity generation/validation;
- classic and enhanced checksum (AUTO uses classic for diagnostic IDs 0x3C/0x3D);
- break + sync + PID header generation;
- master publish and request helpers for 1..8 data bytes;
- optional discard of a two-byte header echo used by some adapters.

LIN timing and break generation depend on the serial adapter/driver. Validate the adapter on the target hardware before using this helper for production diagnostics.
