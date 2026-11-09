# CPM C Process bundle

Small helpers for running shell commands, capturing standard output, starting a detached process, reading/writing environment variables and retrieving the current PID.

`CpmProcess_RunCapture()` allocates its output with `malloc`; release it with `free()`.

Commands are intentionally passed through the platform shell. Do not concatenate untrusted input into a command line.
