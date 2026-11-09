# CPM Ethernet TCP/UDP bundle

Portable socket wrapper for Windows Winsock and POSIX sockets.

Features:
- TCP connect/listen/accept with timeouts;
- send-all, receive, receive-exact, receive-until and line helpers;
- TCP keep-alive, TCP_NODELAY, buffer sizing and endpoint inspection;
- UDP connected or connectionless operation;
- broadcast and IPv4 multicast join/leave, TTL and loopback;
- hostname resolution and local/peer endpoint helpers.

Call `CpmSocket_Startup()` once before socket use on Windows and `CpmSocket_Cleanup()` at shutdown.
