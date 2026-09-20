# CPM 0.2.70 — File Symbols and custom library packs

## C/C++ File Symbols

The fallback scanner now distinguishes declarations/definitions from expressions located inside function bodies. Local class instances, ordinary calls, constructor calls and macro-like calls are no longer exposed as file symbols. CPM-specific Windows/CVI calling-convention tokens remain supported.

The File Symbols view now supports copying one signature/declaration, copying all symbols/declarations, exporting Markdown/text/JSON, generating `.h`/`.hpp`, and generating `.c`/`.cpp` stubs. Generated source stubs preserve source includes, strip default arguments and declaration-only `override`/`final`, and use `abort()`/`std::abort()` for unfinished non-void stubs.

## Custom library packs

The C/C++ Libraries title bar exposes separate **Create Library Pack...** and **Import Library Pack...** commands. Both support Workspace or Global storage. The same commands are available in the editor context menu under **CPM → Libraries / packs**. New pack metadata supports C, C++, LabWindows/CVI, Lua and Other.

## Validation

Regression tests cover the false-positive example used in QPM (local `QPointF`, `QStringLiteral`, `QObject::connect`), copy/export/generation command exposure, and separate Create/Import pack actions.
