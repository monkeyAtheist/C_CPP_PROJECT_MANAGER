# CPM C Containers bundle

Two dependency-free generic containers:

- `CpmVector`: growable array of fixed-size elements.
- `CpmRingBuffer`: fixed-capacity FIFO with optional overwrite-oldest behavior.

Elements are copied by value with `memcpy`; ownership of pointers stored inside an element remains the caller's responsibility.
