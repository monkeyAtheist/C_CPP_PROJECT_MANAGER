# Manual test checklist — LabWindows/CVI Project Manager 0.5.0

Use a copy of a CVI workspace for the first validation.

## Embedded CVI libraries

1. Reload the VS Code window.
2. Expand `CVI Libraries -> CVI -> CVI Basics`.
3. Verify the presence of `Keywords`, `Examples / Workflows`, `Events`, `Event data specifiers` and `CVI Run-Time Engine lifecycle`.
4. Open `InitCVIRTE` and one configurable callback skeleton.
5. Use `Ctrl+Alt+P` to verify `Find Symbol`.

## New file wizard

1. Right-click a CVI project or logical folder and run `Create New File or Starter...`.
2. Create `CVI user-interface resource (.uir + .h)` and verify that both files appear in the CVI workspace tree.
3. Open the generated `.uir` in LabWindows/CVI and verify that the blank panel resource is accepted.
4. Repeat with `CVI UI application starter (.c + .uir + .h)`.
5. Create a `C module (.c + .h)` and verify the generated include guard.
6. Create a `CVI DLL starter (.c + .h)` and inspect the CVIRTE attach / detach lifecycle.
7. Create a `CVI error-management module (.c + .h)` and verify that it contains no application-specific UI dependency.

## Templates and snippets

1. Right-click an existing text source and run `Save File as CVI Creation Template...`.
2. Create a new file and select `Saved user template...`.
3. Select a source-code fragment and run `Save Selection as CVI Snippet...`.
4. Place the cursor in a `.c` file and press `Ctrl+Alt+I`.
5. Insert the saved snippet and one built-in snippet.

## CVI version selection

1. Open Settings and inspect `labwindowsCvi.uirTemplateVersion`.
2. Leave the value set to `auto` for the normal workflow.
3. Test the explicit `cvi2012` or `cvi2020` override only when validating compatibility with another CVI installation.
