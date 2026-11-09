# CPM C File & Path bundle

Cross-platform helpers for common file and path operations without external dependencies.

Highlights: read/write complete text or binary files, append text, file size/existence, recursive directory creation, path join/dirname/basename/extension, separator normalization and executable-path discovery.

`CpmFile_ReadAllText()` and `CpmFile_ReadAllBinary()` allocate the returned buffer with `malloc`; release it with `free()`.
