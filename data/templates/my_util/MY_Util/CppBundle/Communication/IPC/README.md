# CPM IPC bundle

Cross-platform local IPC using Windows named pipes and POSIX Unix-domain sockets.

Features:
- server/client creation with timeout-aware client connect; POSIX server accept supports a timeout, while the compact synchronous Windows named-pipe accept blocks until a client connects;
- reconnectable server sessions;
- raw send/receive plus send-all and receive-exact;
- message framing with a 32-bit big-endian length prefix (`CpmIpc_SendMessage` / `CpmIpc_ReceiveMessage`).

Use message framing when each logical command/reply must remain distinct even when the transport splits or coalesces byte writes.
