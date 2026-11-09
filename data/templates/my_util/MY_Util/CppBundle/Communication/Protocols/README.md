# CPM C++ communication protocol bundle

C++17 wrappers for the maintained C protocol modules:
- COBS / SLIP / length-prefix framing;
- SCPI with `std::function` transport callbacks;
- Modbus RTU/TCP frame helpers;
- retry/reconnect with `std::chrono` backoff;
- HTTP/REST client;
- MQTT 3.1.1 client;
- WebSocket RFC 6455 client.

Example SCPI over a `cpm::SerialPort`:

```cpp
cpm::ScpiClient scpi{
    [&](const void* data, std::size_t size) { return serial.writeAll(data, size); },
    [&](void* data, std::size_t size, int timeoutMs) { return serial.read(data, size, std::chrono::milliseconds{timeoutMs}); }
};
std::cout << scpi.idn() << '\n';
```
