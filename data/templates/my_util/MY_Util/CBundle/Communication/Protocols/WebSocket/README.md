# CPM WebSocket

RFC 6455 client for `ws://` endpoints over `cpm_socket`.

- HTTP Upgrade handshake with `Sec-WebSocket-Accept` verification;
- masked client text/binary/control frames;
- receive text/binary/control frames;
- ping/pong and close helpers;
- 7/16/64-bit payload lengths.

The compact API returns individual frames and does not automatically reassemble fragmented application messages. It supports plain `ws://` only; `wss://` requires a real TLS transport.
