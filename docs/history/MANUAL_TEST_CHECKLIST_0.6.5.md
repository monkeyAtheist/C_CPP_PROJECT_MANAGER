# Manual test checklist — 0.6.5

1. Install the VSIX and run `Developer: Reload Window`.
2. Open a CVI workspace.
3. Right-click a `.c`, `.h`, `.uir`, `.lib`, `.fp` or other referenced file.
4. Verify that `Copy Path` and `Copy Relative Path` are visible.
5. Select `Copy Path`, paste into a text editor and verify that the absolute Windows path is copied.
6. Select `Copy Relative Path`, paste into a text editor and verify that the copied path is relative to the VS Code workspace folder.
7. Repeat on a file stored outside the workspace root and verify the CVI workspace or project-directory fallback.
