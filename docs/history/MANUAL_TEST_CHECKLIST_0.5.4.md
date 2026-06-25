# Manual test checklist — 0.5.4

1. Install the VSIX and run `Developer: Reload Window`.
2. Open the LabWindows/CVI activity-bar container before loading a workspace.
3. Open the Home page and verify the `No project loaded` state and its three blue primary buttons.
4. Load a `.cws` workspace and verify that full workspace and project paths remain readable.
5. Expand project folders and verify the restored larger native icons and `└─` child markers.
6. Double-click a `.uir` file and verify that CVI opens the panel in its native User Interface Editor.
7. Resize the CVI Workspace and CVI Libraries views vertically.
8. Build and run an existing project to confirm no regression in project management.
