# CPM Retry / Reconnect policy

Dependency-free retry policy usable around any transport operation. It deliberately does not own sockets or serial ports: provide an operation callback and optionally a predicate deciding which errors are retryable.

Features:
- fixed, linear or exponential backoff;
- bounded delay;
- optional deterministic jitter;
- caller-supplied sleep function;
- attempt count and accumulated delay reporting.

A transport can use this layer for connect/reconnect without duplicating retry logic.
