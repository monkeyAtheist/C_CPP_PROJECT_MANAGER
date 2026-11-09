# CPM C communication stack

Maintained low-dependency C communication modules. The stack deliberately separates physical/application transports from protocol codecs so the same higher-level protocol can be reused over several links.

## Transports

- `UART` — Windows/POSIX serial ports, full configuration, DTR/RTS, purge, exact and delimited reads.
- `RS485` — half-duplex RS-485 over UART with manual RTS direction or Linux kernel RS-485 mode.
- `LIN` — LIN 2.x master-side helper over UART: break/sync/PID, checksum, publish/request.
- `IPC` — Windows named pipes / POSIX Unix-domain sockets with optional length-prefixed messages.
- `Ethernet` — TCP client/server and UDP, multicast, broadcast, DNS/endpoints and socket options.
- `WiFi` — application TCP/UDP transport after OS Wi-Fi association.
- `Bluetooth` — Windows Bluetooth Classic RFCOMM client.
- `USBHID` — native Windows USB HID plus optional HIDAPI on Linux/macOS.
- `CAN` — Linux SocketCAN / CAN FD.
- `I2C` — Linux `/dev/i2c-*` with repeated-start register transactions.
- `SPI` — Linux spidev with multi-segment transfers.
- `VISA` — dynamic Windows VISA runtime/resource/session access without vendor SDK headers.

## Protocols

- `Protocols/Framing` — COBS, SLIP, 16/32-bit length-prefix framing.
- `Protocols/SCPI` — transport-independent SCPI/IEEE-488.2 command/query helpers.
- `Protocols/Modbus` — Modbus RTU/TCP request builders, CRC/MBAP validation and register parsing.
- `Protocols/Retry` — retry/reconnect policy with bounded backoff and jitter.
- `Protocols/HTTP` — HTTP/1.1 / REST client over plain TCP.
- `Protocols/MQTT` — MQTT 3.1.1 client with QoS 0/1 over plain TCP.
- `Protocols/WebSocket` — RFC 6455 `ws://` client with handshake verification and framed I/O.

TLS is intentionally not faked: HTTPS, MQTTS and WSS require a genuine TLS transport/library.

## 0.2.103 additions

- TLS client transport (OpenSSL-backed; certificate and hostname verification enabled by default)
- Generic USB via dynamically-loaded libusb-1.0
- Native Windows BLE GATT service/characteristic access
- Ready-to-use stacks: SCPI over TCP/VISA, Modbus RTU over RS-485, MQTT automatic reconnect/resubscription
