# Manual test checklist — 0.6.7

1. Install `labwindows-cvi-project-manager-0.6.7.vsix` and run `Developer: Reload Window`.
2. Open a CVI EXE or DLL project and launch `Project Build Settings...`.
3. Collapse and reopen `Target`; verify that the full-width section behaves normally.
4. Collapse and reopen `Project dependencies and build order`; verify that the block is stacked below `Target`, not beside it.
5. In `Target creation options`, select `Full run-time engine`; verify that `LoadExternalModule options` can be edited.
6. Add one `.lib` or `.obj` module and keep it in the preview.
7. Select `Instrument driver only`; verify that the LoadExternalModule card is visually dimmed and that its checkbox, add buttons and remove buttons are disabled.
8. Select `Full run-time engine` again; verify that the preview list is restored and editable.
9. Save, reopen the project in CVI and verify that the native target settings remain readable.
10. Open `LabWindows/CVI: Project Build Settings (Safe Mode)...`; verify that forced-module editing is rejected while instrument-driver-only support is active.
