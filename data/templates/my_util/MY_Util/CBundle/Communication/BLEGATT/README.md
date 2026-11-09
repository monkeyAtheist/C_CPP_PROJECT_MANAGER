# CPM BLE GATT bundle

Native Windows BLE GATT device/service/characteristic enumeration plus characteristic read/write. It uses SetupAPI + Windows Bluetooth GATT APIs and therefore requires Windows 8+ SDK headers/libraries (`SetupAPI`, `BluetoothApis`).

The first maintained version intentionally focuses on deterministic discovery/read/write. Long-lived notification subscriptions are not exposed yet. Non-Windows builds compile to explicit unsupported stubs instead of pretending that a platform backend exists.
