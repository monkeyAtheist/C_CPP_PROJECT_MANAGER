# CPM Modbus protocol bundle

Dependency-free Modbus RTU/TCP frame builder and parser.

Included:
- Modbus CRC-16;
- RTU validation and exception detection;
- RTU read functions 01/02/03/04, write single register (06) and write multiple registers (10);
- RTU register-response parsing;
- Modbus TCP MBAP generation, read/write-single-register requests and register-response parsing.

The module intentionally separates **protocol encoding** from the transport. Send RTU frames using the UART bundle and TCP frames using the Ethernet bundle. This keeps timeout/retry policy in your application instead of hiding it inside the codec.
