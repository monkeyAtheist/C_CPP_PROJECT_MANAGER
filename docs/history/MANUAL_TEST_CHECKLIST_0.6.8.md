# Manual test checklist — 0.6.8

1. Install `labwindows-cvi-project-manager-0.6.8.vsix` and reload VS Code.
2. Open a CVI DLL project and select **Project Build Settings...**.
3. Expand **DLL type information**.
4. Confirm that the section contains two visual sub-blocks.
5. Uncheck **Add type library resource to DLL**:
   - `Include links to help file` must be disabled.
   - `TLB help file` must be disabled.
   - `Function panel file` and its browser button must be disabled.
6. Re-enable **Add type library resource to DLL**.
7. Confirm that the TLB help-file selector offers exactly `HLP` and `CHM`.
8. Uncheck **Include links to help file** and confirm that the `HLP / CHM` selector becomes disabled.
9. Uncheck **Add NI Type Information resource to DLL**:
   - both NI source radio buttons must be disabled;
   - the header-file row must not be visible.
10. Re-enable NI Type Information and select **Data from all source files**:
    - the header-file row must remain hidden.
11. Select **Data from single header file**:
    - the header-file field and browser button must appear.
12. Save, reopen the page, and verify that the selected values persist.
13. Open the project in CVI and compare the native **Type Information** dialog.
