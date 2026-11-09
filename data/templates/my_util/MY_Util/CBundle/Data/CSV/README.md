# CPM C CSV bundle

CSV parsing/writing with configurable delimiter, quoted fields and escaped quotes (`""`).

`CpmCsv_ParseLine()` is intended for one logical CSV row. `CpmCsv_ReadFile()` currently treats a physical line as one row; embedded newlines inside a quoted field are therefore not supported.
