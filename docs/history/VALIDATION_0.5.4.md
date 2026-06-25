# LabWindows/CVI Project Manager 0.5.4 — Validation

## Scope

This release refines the workspace explorer and home page without changing the CVI project parser, compiler invocation or embedded JC Lib runtime.

## Explorer rendering

- Restored native VS Code `ThemeIcon` file-type glyphs used by the early explorer implementation.
- Restored the explicit `└─` child marker in file labels.
- Preserved dedicated icon mapping:
  - `.c` → `file-code`
  - `.h` → `symbol-interface`
  - `.uir` → `preview`
  - `.lib` → `library`
  - `.fp` → `symbol-method`
  - missing files → `warning`

## Home page

- Replaced the compact auto-fit card grid with three vertical sections.
- Added a wide workspace and active-project section with readable wrapped paths.
- Added a dedicated no-project state and three primary actions:
  - Open workspace
  - Create workspace and project
  - Select CVI installation
- Grouped the embedded library browser and templates/snippets under a reusable-tools section.
- Moved CVI installation and IntelliSense synchronization to a full-width bottom section.

## UIR editor boundary

`.uir` files continue to open directly through `cvi.exe <panel.uir>`. LabWindows/CVI exposes the User Interface Editor inside the native CVI IDE; no standalone UIR editor executable is provided.

## Automated checks

- TypeScript compilation: OK
- `out/extension.js` syntax: OK
- `out/views/homePanel.js` syntax: OK
- Home page empty state present: OK
- Home page vertical sections present: OK
- Native file icon mapping present: OK
- VSIX packaging: OK
