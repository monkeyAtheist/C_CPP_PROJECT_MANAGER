# CPM Bluetooth Classic / RFCOMM bundle

Windows-first RFCOMM client wrapper using Winsock Bluetooth sockets.

Features:
- connection timeout;
- raw send/receive;
- send-all, receive-exact and line helpers.

BLE/GATT is deliberately not implemented here because Windows GATT access uses WinRT rather than RFCOMM sockets. Use CPM Network & Wireless Diagnostics for BLE discovery/GATT inspection, or add a platform-specific BLE backend to your project.
