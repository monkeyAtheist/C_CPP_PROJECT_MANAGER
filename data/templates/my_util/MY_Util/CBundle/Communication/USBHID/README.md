# CPM USB HID

USB HID enumeration and report I/O.

## Windows
The bundle uses native Windows HID/SetupAPI and requires `hid` and `setupapi` at link time. No third-party runtime is required.

## Linux/macOS
Define `CPM_HID_USE_HIDAPI`, provide `hidapi/hidapi.h`, and link your HIDAPI backend. Without HIDAPI the module still compiles but returns `-10` at runtime.

The first byte of HID reports is normally the report ID (0 when the device does not use numbered reports). Report lengths are device-specific.
