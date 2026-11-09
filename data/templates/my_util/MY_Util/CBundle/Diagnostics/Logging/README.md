# CPM C Logging bundle

Small logger with TRACE/DEBUG/INFO/WARN/ERROR/FATAL levels, console output, optional log file, callback hook and hex dump helper.

This logger is intentionally dependency-free. Calls are not internally serialized; when multiple threads log concurrently, protect calls with the Thread & Synchronization bundle if ordered output matters.
