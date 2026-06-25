# Manual test checklist — LabWindows/CVI Project Manager 0.5.6

## Installation

1. Install `labwindows-cvi-project-manager-0.5.6.vsix` over the previous version.
2. Run **Developer: Reload Window**.
3. Open a copy of a CVI `.cws` workspace.

## Persistent action strip

1. Open the LabWindows/CVI activity-bar container.
2. Confirm that **CVI Actions** appears above **CVI Workspace**.
3. Confirm that Home, open, native-CVI open, build, run, debug, build mode, target type, settings and refresh remain visible without hovering the project tree.
4. Resize the three views vertically and confirm that the dividers remain usable.

## Native build-step synchronization

1. Open a project containing native CVI Build Steps.
2. Use **Project Build Settings...**.
3. Confirm that the Debug pre-build, custom-build and post-build values already configured in CVI appear in the editor.
4. Change one value and save.
5. Open the same project in CVI and confirm that **Build → Build Steps...** shows the updated value.
6. Run one build from VS Code and confirm that each native action executes exactly once.

## Native launch-option synchronization

1. In VS Code, open **Project Build Settings...**.
2. Set command-line arguments, working directory and environment options for Debug.
3. Save.
4. Reopen the workspace in CVI.
5. Confirm that **Run → Specify Executable and Command Line...** displays the saved Debug values.
6. Repeat with Release or Debug64 and confirm that the Debug values are not overwritten.

## Dependencies

Native dependency writing is intentionally not enabled yet. To complete that implementation, create a `.cws` sample containing at least two projects, check one dependency in CVI, save the workspace and provide the resulting archive.
