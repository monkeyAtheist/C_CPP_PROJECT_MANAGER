# CPM generic USB bundle

Dynamic **libusb-1.0** loader with no compile-time dependency on libusb headers/import libraries. Supports enumeration, VID/PID/serial opening, interface claim/release, control, bulk and interrupt transfers.

Install a libusb-1.0 runtime appropriate for your platform. On Windows, the target USB interface must use a compatible driver such as WinUSB/libusbK. HID-class devices are usually better served by the dedicated CPM USB HID bundle.
