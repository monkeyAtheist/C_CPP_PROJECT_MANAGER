# LabWindows/CVI Project Manager 0.6.2 — validation

## Scope

- Parse and edit native EXE, DLL and LIB target settings observed in `CVI_PRJ.zip`.
- Preserve timestamped native backups before `.prj` writes.
- Add a guided context-menu command for native CVI DLL import-library generation.

## Automated checks

- TypeScript compilation: OK
- VSIX packaging: OK
- Parse EXE configured sample: OK
- Write and re-read EXE title, output path and forced modules: OK
- Parse DLL configured sample: OK
- Read DLL import-library base name, copy mode, exports, type information and nine forced modules: OK
- Write and re-read DLL import-library base name, export file list and custom directory: OK
- Parse static-library output path: OK
- Native backup creation: OK
- Context command `labwindowsCvi.prepareDllImportLibraryGeneration`: packaged

## Manual checks remaining on Windows

1. Install the VSIX and reload VS Code.
2. Open a copy of the supplied CVI workspace.
3. Open **Project Build Settings...** for each target type.
4. Save one change per target and reopen the project in CVI.
5. Verify the native **Target Settings**, **Version Info**, **Signing Info**, **Add Files to Executable/DLL**, **DLL Export Options** and **Type Information** dialogs.
6. Right-click a header and test **Prepare DLL Import Library Generation in CVI...**.
