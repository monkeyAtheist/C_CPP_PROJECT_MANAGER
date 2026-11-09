# CPM C JSON bundle

Dependency-free JSON tokenizer and fixed-buffer writer.

The parser does not allocate memory: the caller provides a token array. Helpers retrieve object members, array elements, strings, integers, doubles and booleans. The writer produces escaped objects/arrays into a caller-provided buffer.

This is intended for configuration, SCPI/network payloads and lightweight embedded/desktop protocols, not as a full schema/DOM library.
