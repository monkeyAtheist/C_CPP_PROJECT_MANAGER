# Validation report — LabWindows/CVI Project Manager 0.6.15

## Scope

Version 0.6.15 adds session-level native LabWindows/CVI debug controls through the CVI DDE command server while retaining the conservative `.cws` breakpoint bridge introduced in 0.6.14.

## Implemented commands

| VS Code command | CVI command-server string |
|---|---|
| Build Project in Native CVI | `Build Project` |
| Run Project in Native CVI Debugger | `Run Project` |
| Pause Native CVI Execution | `Suspend Execution` |
| Continue Native CVI Execution | `Continue Execution` |
| Stop Native CVI Execution | `Terminate Execution` |
| Read Native CVI State | `Get CVI State` |

The embedded PowerShell bridge connects to DDE service `cvi`, topic `system`, subscribes to item `status`, sends one command and returns JSON to the extension host.

## Automated checks

| Check | Result |
|---|---|
| Manifest version `0.6.15` | OK |
| TypeScript compilation | OK |
| VSIX packaging | OK |
| ZIP integrity | OK |
| Packaged `native/cvi-dde-command.ps1` | OK |
| Packaged compiled native-command service | OK |
| Eight command contributions | OK |
| Eight activation events | OK |
| Eight extension registrations | OK |
| Workspace and project context-menu exposure | OK |
| Status-bar native debug picker | OK |
| CVI Actions native debug entries | OK |
| Breakpoint synchronization before native run | OK |
| Automatic CVI IDE startup path | OK |
| 0.6.14 breakpoint serialization regression test | OK |
| 0.6.13 workspace scaffold regression test | OK |
| Generated JavaScript syntax checks | OK |

## Runtime boundary

The Windows DDE exchange itself cannot be exercised in the Linux packaging environment. The remaining required validation is a manual Windows test with the installed LabWindows/CVI IDE, following `MANUAL_TEST_CHECKLIST_0.6.15.md`.

The bridge provides session-level control only. Native CVI remains responsible for source-level step operations, watches, variable inspection and call-stack analysis.
