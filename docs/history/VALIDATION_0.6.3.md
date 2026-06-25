# Validation — LabWindows/CVI Project Manager 0.6.3

## Scope

Version 0.6.3 mitigates VS Code Chromium webview Service Worker failures.

## Changes checked

- `CVI Actions` is now a native `TreeDataProvider`, not an auto-loaded `WebviewViewProvider`.
- No webview is initialized automatically when the LabWindows/CVI side bar is restored.
- The full HTML `Project Build Settings` page remains available.
- A native `Project Build Settings (Safe Mode)…` command is available when VS Code webviews are unavailable.
- Safe mode edits target type, output path, runtime fields, launch settings, build actions and LoadExternalModule files through native Quick Pick/Input Box controls.

## Automated checks

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| Generated JavaScript syntax | OK |
| Quick Actions native TreeView | OK |
| Startup WebviewView removed | OK |
| Full build-settings page retained | OK |
| Safe-mode command registered | OK |
| VSIX packaging | OK |
