# Manual test checklist — 0.6.9

1. Install `labwindows-cvi-project-manager-0.6.9.vsix` and run `Developer: Reload Window`.
2. Open a DLL project and launch `Project Build Settings...`.
3. In **DLL options**, check **Use default import library base name** and verify that **Import library base name** becomes disabled.
4. Change **Where to copy DLL** between `Do not copy` and `Custom directory`; verify that **Custom copy directory** is enabled only for `Custom directory`.
5. Set **Export mode** to `Symbols marked for export`; verify that the exported-header list is dimmed and cannot be edited.
6. Click **Import library choices...**; toggle **Use IVI subdirectories** and **Use VXIplug&play subdirectories**, validate with **OK**, and verify the summary text.
7. Reopen the dialog, change a value, click **Cancel**, and verify that the previous values are restored.
8. In **Target creation options**, uncheck **Embed manifest** and verify that the manifest path and browse button are disabled.
9. Save the settings, reopen the project in LabWindows/CVI and compare **Target Settings**, **DLL Import Library Choices** and **DLL Export Options**.
