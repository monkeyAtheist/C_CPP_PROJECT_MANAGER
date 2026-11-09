# CPM General C Utility Stack

This bundle groups the maintained, dependency-light C utility modules supplied by CPM.

- `Configuration/INI` — section-aware INI reader/writer with typed values.
- `System/FilePath` — file I/O, directories and path helpers.
- `System/String` — bounded strings and a dynamic string builder.
- `System/Time` — ns/us/ms clocks, sleeps, stopwatch and periodic timer.
- `System/Thread` — Windows/POSIX threads, mutexes and condition variables.
- `System/Process` — shell/process capture and environment helpers.
- `Data/JSON` — zero-allocation tokenizer plus fixed-buffer writer.
- `Data/CSV` — CSV row parsing/writing.
- `Data/Buffer` — byte buffers, endian conversion and HEX helpers.
- `Data/Containers` — generic vector and ring buffer.
- `Diagnostics/Checksum` — CRC/checksum algorithms.
- `Diagnostics/Logging` — leveled console/file logging.

Each module is intentionally usable on its own. Include only the modules your project needs.

## Platform notes

- `Thread` uses Win32 primitives on Windows and pthreads on POSIX systems.
- `Time` uses `QueryPerformanceCounter`/waitable timers on Windows and `clock_gettime`/`nanosleep` on POSIX.
- `Process_Run*` executes commands through the platform shell; do not concatenate untrusted input.
- The modules avoid third-party dependencies.
