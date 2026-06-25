# LabWindows/CVI Project Manager 0.5.9 — Manual test checklist

1. Install `labwindows-cvi-project-manager-0.5.9.vsix` over the previous version.
2. Execute `Developer: Reload Window`.
3. Open a CVI workspace.
4. Verify that `CVI Workspace` appears before `CVI Actions`.
5. Collapse `CVI Actions` and confirm that the command toolbar remains visible on the `CVI Workspace` title row.
6. Confirm that the duplicated `Open Workspace in CVI` toolbar icon is absent while the workspace inline icon remains available.
7. Click the direct Run icon and confirm that the project builds before the executable starts.
8. Click the Run Options icon and test:
   - Build and run;
   - Run without build;
   - Build debug and open the native CVI debugger.
9. Change the build mode and verify the toolbar label changes among `D32`, `R32`, `D64`, `R64`.
10. Change the target type and verify the toolbar label changes among `EXE`, `DLL`, `LIB`.
11. Reduce the sidebar width and confirm that overflowed commands remain accessible through the `...` menu.
