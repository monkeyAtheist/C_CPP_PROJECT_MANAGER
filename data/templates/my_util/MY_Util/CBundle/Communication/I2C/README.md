# CPM I²C bundle

Linux `/dev/i2c-*` wrapper.

Features:
- open/select slave address;
- raw read/write;
- combined write+read transaction via `I2C_RDWR` (repeated start);
- 8-bit register helpers;
- 16-bit register addressing with selectable byte order.

Other platforms return an explicit unsupported result so project code can keep a portable API surface while providing another backend when required.
