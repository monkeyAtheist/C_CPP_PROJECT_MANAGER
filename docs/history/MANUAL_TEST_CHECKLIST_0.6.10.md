# Manual test checklist — 0.6.10

1. Install `labwindows-cvi-project-manager-0.6.10.vsix`.
2. Run `Developer: Reload Window`.
3. Open a DLL project and launch `Project Build Settings...`.
4. Expand **DLL options**.
5. Verify the layout:
   - `Custom copy directory` is directly opposite `Where to copy DLL`;
   - `Import library base name` is directly opposite `Export mode`.
6. Change `Where to copy DLL` away from `Custom directory` and verify the custom-directory input and browse button are disabled.
7. Enable `Use default import library base name` and verify the import-library base-name field is disabled.
8. Save on a copy of the project and reopen Target Settings in CVI.
