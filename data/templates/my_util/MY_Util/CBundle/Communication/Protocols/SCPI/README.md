# CPM SCPI bundle

Transport-independent SCPI/IEEE-488.2 helper.

The bundle accepts two callbacks (`write` and `read`) so the same SCPI client works over UART, TCP sockets, IPC, Bluetooth RFCOMM or a custom VISA backend.

Features:
- configurable TX/RX terminators and timeout;
- command and query helpers;
- typed `int`, `double` and boolean queries;
- definite-length SCPI binary block reads;
- presets for `*IDN?`, `*CLS`, `*RST`, `*OPC?` and `SYST:ERR?`.

Example adapters:

```c
static int uart_write(void *ctx, const void *data, size_t size) {
    return CpmUart_WriteAll((CpmUart *)ctx, data, size);
}
static int uart_read(void *ctx, void *data, size_t size, int timeoutMs) {
    return CpmUart_Read((CpmUart *)ctx, data, size, timeoutMs);
}
```
