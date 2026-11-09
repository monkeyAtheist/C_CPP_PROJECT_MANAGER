# CPM maintained C++ communication stack

The C++ stack wraps the maintained C transport/protocol backends instead of carrying a second implementation. Wrappers are C++17-compatible, move-aware and use RAII for transport lifetime.

Available wrappers include:
- `cpm::SerialPort`
- `cpm::Rs485Bus`
- `cpm::LinMaster`
- `cpm::TcpClient`, `cpm::TcpServer`, `cpm::UdpSocket`
- `cpm::IpcChannel`
- `cpm::BluetoothRfcomm`
- `cpm::HidDevice`
- `cpm::CanBus`
- `cpm::I2cDevice`
- `cpm::SpiDevice`
- `cpm::VisaRuntime`, `cpm::VisaSession`
- `cpm::ScpiClient`
- `cpm::MqttClient`
- `cpm::HttpClient`
- `cpm::WebSocket`
- `cpm::retry`
- framing and Modbus helpers

The HTTP/MQTT/WebSocket modules are deliberately plain TCP (`http://`, MQTT 1883, `ws://`) unless the application supplies a real TLS layer.

## 0.2.103 additions

- TLS client transport (OpenSSL-backed; certificate and hostname verification enabled by default)
- Generic USB via dynamically-loaded libusb-1.0
- Native Windows BLE GATT service/characteristic access
- Ready-to-use stacks: SCPI over TCP/VISA, Modbus RTU over RS-485, MQTT automatic reconnect/resubscription
