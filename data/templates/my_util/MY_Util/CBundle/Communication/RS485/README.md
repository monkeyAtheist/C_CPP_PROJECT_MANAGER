# CPM RS-485

Half-duplex RS-485 helper built on the maintained CPM UART backend.

- manual RTS direction control for adapters that expose DE/RE through RTS;
- optional Linux `TIOCSRS485` kernel mode when supported by the serial driver;
- pre/post transmit delays;
- write/flush/switch-to-receive sequence;
- transceive helper.

The electrical transceiver and termination/biasing remain hardware concerns. Automatic-direction USB/RS-485 adapters can set `manualDirection = 0`.
