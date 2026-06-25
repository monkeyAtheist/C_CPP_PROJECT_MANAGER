# Manual test checklist — 0.6.6

1. Install `labwindows-cvi-project-manager-0.6.6.vsix` and reload VS Code.
2. Open `Project Build Settings...` on an EXE project.
3. Fold and unfold Target, dependencies, creation options, LoadExternalModule, version information, signing information, command line and build steps.
4. In LoadExternalModule, confirm that the add buttons are disabled while the checkbox is unchecked.
5. Enable LoadExternalModule, use `Add files to executable...`, choose one `.lib` and one `.obj`, then remove one item from the preview.
6. Use `Add module name...` and add `toolbox.obj`.
7. Save and reopen the project in CVI. Confirm that `Add Files to Executable...` contains the selected entries.
8. Repeat on a DLL project and confirm that the button label becomes `Add files to DLL...`.
9. In a source editor, select `42`, right-click, choose `Convert selected integer to > Hexadecimal`; expect `0x2A`.
10. Select `0x2A`, convert to binary; expect `0b101010`.
11. Select `-0b101010U`, convert to decimal; expect `-42U`.
