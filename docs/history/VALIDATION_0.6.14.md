# Validation report — LabWindows/CVI Project Manager 0.6.14

## Scope

Version 0.6.14 introduces the first native breakpoint bridge between VS Code and LabWindows/CVI. The bridge serializes standard enabled VS Code source breakpoints into the loaded native `.cws` workspace before LabWindows/CVI is opened for debugging.

## Implemented commands

- `LabWindows/CVI: Synchronize VS Code Breakpoints to Native Workspace`
- `LabWindows/CVI: Remove Synchronized Breakpoints from Native Workspace`
- `LabWindows/CVI: Diagnose Native Breakpoint Bridge`

The commands are available from the Command Palette and from the context menu of both the CVI workspace root and CVI project nodes.

## Safety model

The extension does not blindly replace all native CVI breakpoints. It tracks only the breakpoint lines that it injected. During resynchronization it removes obsolete extension-owned entries while preserving native CVI breakpoint records that were created manually in LabWindows/CVI. Existing `Tracepoint NNNN` records are left untouched.

All `.cws` modifications continue to use the native-file protection mechanism:

1. parse the native INI structure;
2. validate the presence of `[Workspace Header]`;
3. create a timestamped backup in `.vscode/cvi-native-backups`;
4. write through a temporary file;
5. replace the original workspace only after validation.

## Supported breakpoint subset

The first-stage bridge synchronizes standard enabled source breakpoints from files referenced by the selected CVI project. It conservatively skips disabled, conditional, hit-count and log breakpoints. It also ignores breakpoints outside the selected project.

## Automated checks

| Check | Result |
| --- | --- |
| TypeScript compilation | OK |
| New parser-level synchronization test | OK |
| Command contributions and registrations | OK |
| Workspace and project context menus | OK |
| Automatic synchronization before native CVI debug open | OK |
| Existing native CVI breakpoint preservation | OK |
| Removal of obsolete extension-owned breakpoints | OK |
| Preservation of native `Tracepoint` records | OK |
| Creation of missing native `[File NNNN]` sections | OK |
| Timestamped native `.cws` backup | OK |
| v0.6.13 workspace scaffold regression test | OK |
| Test against the uploaded `CVI_PRJ/Source File.cws` fixture | OK |

## Uploaded workspace fixture result

The user-provided CVI workspace originally contained native breakpoints at source lines 39 and 43 and tracepoints associated with lines 41 and 44. The validation injected a synchronized breakpoint at line 45, confirmed that all pre-existing native records remained present, then removed only the synchronized line 45 entry.

## Remaining manual verification

Install the VSIX under Windows, add a breakpoint in VS Code, invoke the native debug command and verify visually that LabWindows/CVI displays the synchronized breakpoint. The complete VS Code Debug Adapter Protocol integration remains a later stage.
