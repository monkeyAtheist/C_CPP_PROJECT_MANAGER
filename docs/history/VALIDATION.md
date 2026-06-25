# Validation report — LabWindows/CVI Project Manager 0.5.0

## Scope

This release updates the embedded CVI library explorer to the JC Lib VS Code 0.7.96 runtime and the CVI API pack to version 1.5.0. It also adds the CVI file-template and snippet subsystem used by `Create New File or Starter...`.

## Automated checks executed

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| Generated `out/extension.js` syntax | OK |
| Generated `out/jcLibEmbedded.js` syntax | OK |
| Generated `out/services/cviTemplateService.js` syntax | OK |
| Embedded CVI pack version | `1.5.0` |
| Integrated default pack version | `2.30.0` |
| CVI libraries | `19` |
| CVI API cards | `2024` |
| `CVI Basics` cards | `53` |
| Standalone `CVI Patterns & References` library | removed |
| Required lifecycle cards | `InitCVIRTE`, `InitCVIRTEEx`, `CVIRTEHasBeenDetached`, `CloseCVIRTE` |
| Preserved keyword cards | `CVICALLBACK`, `CVIFUNC` |
| UI attribute metadata | present |
| Callback and event metadata | present |
| Pack migration `1.2.0 -> 1.5.0` | OK |
| Previous writable-pack backup | OK |
| Bundled blank UIR templates | CVI 2012 and CVI 2020 |
| UIR template signature | `RSRC` |
| Blank UIR generation | `.uir + .h` OK |
| UI application starter generation | `.c + .uir + .h` OK |
| Paired C module generation | `.c + .h` OK |
| DLL starter generation | `.c + .h` OK |
| Error-management module generation | `.c + .h` OK |
| Parsed generated project references | `12` |
| Parsed generated UIR references | `2` |
| Manifest commands and keybindings | OK |
| Built-in CVI snippets | `9` |
| Insert-snippet keybinding | `Ctrl+Alt+I` / `Cmd+Alt+I` |
| Find-symbol keybinding | `Ctrl+Alt+P` / `Cmd+Alt+P` |

## Detailed outputs

- `CVI_PACK_STRUCTURE_0.5.0_VALIDATION.json`
- `CVI_PACK_SYNC_0.5.0_VALIDATION.json`
- `CVI_TEMPLATE_RUNTIME_0.5.0_VALIDATION.json`
- `MANIFEST_COMMANDS_0.5.0_VALIDATION.json`

## Generated-file runtime test

A temporary CVI project was generated and populated with the following references:

```text
blank_panel.uir
blank_panel.h
ui_app.c
ui_app.uir
ui_app.h
module.c
module.h
my_dll.c
my_dll.h
cvi_error.c
cvi_error.h
main.c
```

The CVI project parser reloaded all 12 references with the expected classification:

```text
User Interface Resource : 2
Include                 : 5
CSource                 : 5
```

## Manual Windows checks

The Linux validation environment cannot launch a graphical Windows instance of VS Code or LabWindows/CVI. After installation, run `Developer: Reload Window`, open a copy of a CVI workspace and execute the checks in `MANUAL_TEST_CHECKLIST_0.5.0.md`.
