# LabWindows/CVI Project Manager 0.6.5 validation

## Scope

Version 0.6.5 adds clipboard commands to the CVI workspace explorer file nodes:

- `Copy Path`
- `Copy Relative Path`

## Behavior

`Copy Path` places the normalized absolute file-system path in the clipboard.

`Copy Relative Path` resolves the base directory in this order:

1. the VS Code workspace folder containing the file;
2. the directory containing the loaded CVI `.cws` or standalone `.prj`;
3. the directory containing the CVI project `.prj`.

The clipboard operation is intentionally silent, matching the native VS Code explorer behavior.

## Automated checks

- TypeScript compilation: OK
- Commands contributed in `package.json`: OK
- Commands registered at runtime: OK
- Context menu entries limited to CVI file nodes: OK
- Commands hidden from the command palette: OK
- Clipboard implementation present in compiled JavaScript: OK
- VSIX packaging: OK
- ZIP integrity: OK
