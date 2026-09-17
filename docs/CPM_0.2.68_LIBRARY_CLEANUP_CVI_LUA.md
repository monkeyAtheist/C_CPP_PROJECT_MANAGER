# CPM 0.2.68 — Embedded library cleanup and CVI/Lua synchronization

## Scope

This release synchronizes the embedded library layer with the clean JC Lib 0.8.38 source while keeping CPM's curated Marketplace payload.

## Lua catalog

`data/lua_pack.json` is the JC Lib 0.8.38 clean catalog (`1.7.0`). It contains one `Lua` environment with exactly three libraries:

- Lua standard 5.4
- Lua industriel / banc de test
- Stormworks Lua microcontroller

The starter-pack picker exposes only those three libraries and the complete clean Lua pack.

## Retired global-storage cleanup

Before CPM loads user packs, activation scans `<globalStorage>/packs/*.json`.

The one-way migration:

- deletes a whole pack when its pack id, name or filename matches a retired catalog identifier;
- removes retired environments from otherwise valid mixed packs;
- removes retired libraries from otherwise valid environments or legacy top-level library arrays;
- deletes the resulting pack when no library remains;
- preserves unrelated user packs;
- stays resilient when a JSON file is invalid, locked or read-only.

The migration recognizes historical identifiers through character-code markers so current source code and documentation do not reintroduce their retired literal names.

## LabWindows/CVI catalog

`data/cvi_pack.json` is synchronized from JC Lib 0.8.38 (`1.7.0`). It is imported under a dedicated `CVI` environment and contains 19 libraries, including User interface, Advanced Analysis, NI-DAQmx, VISA, GPIB, RS232, TCP/UDP, ActiveX, TDM Streaming and NI System Configuration.

The CVI starter route is configured with canonical hierarchy preservation so invoking it from an existing C library/category cannot flatten the CVI catalog into the generic `C` environment.

## Build hygiene

The TypeScript build now deletes `out/` before recompilation. This prevents JavaScript generated from source files removed in older revisions from leaking into the VSIX.

## Validation

- `npm run compile`: PASS
- strict retired-reference scan over current source, emitted runtime, data, manifests and documentation (dependencies excluded): 0 matches
- Lua catalog retired-reference scan: 0 matches
- CVI catalog retired-reference scan: 0 matches
- global-storage migration simulation: PASS
  - 4 files scanned
  - 2 obsolete pack files deleted
  - 1 mixed pack rewritten
  - 1 obsolete nested library removed
  - unrelated CVI content preserved
- emitted runtime orphan JavaScript after clean build: 0
- all shipped JSON files parse successfully

## VSIX package validation

- VSIX generation through the local VSCE Node CLI: PASS
- package version: `0.2.68`
- packaged files: 190
- compressed VSIX size: approximately 4.28 MB
- `data/cvi_pack.json` present in VSIX: PASS
- `data/lua_pack.json` present in VSIX: PASS
- strict retired-reference scan over extracted VSIX: 0 matches
- JSON parse audit over extracted VSIX: 20 files, PASS
