# CPM C Time & Timer bundle

High-resolution monotonic time in ns/us/ms, Unix epoch milliseconds, portable sleep helpers, local/UTC formatting, stopwatch support and a drift-resistant periodic timer.

On Windows, nanosecond sleeps use a waitable timer. The requested precision is not a guarantee of scheduler resolution.
