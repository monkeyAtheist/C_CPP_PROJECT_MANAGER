# CPM CAN / SocketCAN bundle

Linux SocketCAN helper supporting Classical CAN and CAN FD.

Features:
- open/bind a CAN interface;
- send/receive CAN and CAN-FD frames;
- one or multiple hardware receive filters;
- clear filters, loopback and receive-own-messages control;
- CAN error-mask configuration;
- text formatting for diagnostics.

On non-Linux platforms the API returns an explicit unsupported result; add a vendor backend when using a USB CAN adapter whose SDK is not SocketCAN compatible.
