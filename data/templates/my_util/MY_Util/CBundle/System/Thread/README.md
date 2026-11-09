# CPM C Thread & Synchronization bundle

Portable wrapper for threads, mutexes and condition variables.

- Windows backend: `CreateThread`, `CRITICAL_SECTION`, `CONDITION_VARIABLE`.
- POSIX backend: `pthread`.

The thread callback returns an `int`, which is returned by `CpmThread_Join()`.
