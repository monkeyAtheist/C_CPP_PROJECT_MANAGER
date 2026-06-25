# Manual test checklist — 0.6.3

1. Install the VSIX and run `Developer: Reload Window`.
2. Open the LabWindows/CVI activity-bar container.
3. Confirm that `CVI Actions` displays native rows and that no Service Worker error appears at startup.
4. Open `Project Build Settings…`.
5. If the VS Code webview cache is still invalid, close the empty panel and use `Project Build Settings (Safe Mode)…`.
6. In safe mode, modify a harmless field such as `Application title`, then verify the change in native CVI on a copy of the project.
7. After clearing the VS Code Service Worker cache and restarting VS Code, reopen the full build-settings page.
