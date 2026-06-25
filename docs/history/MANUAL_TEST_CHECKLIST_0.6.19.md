# Manual test checklist — 0.6.19

1. Install `labwindows-cvi-project-manager-0.6.19.vsix` and run `Developer: Reload Window`.
2. Open the CVI workspace from VS Code and keep LabWindows/CVI open with the same workspace.
3. Run `LabWindows/CVI: Diagnose Native Command Bridge`.
4. Confirm that the output channel shows:

```text
[CVI] activex Get CVI State -> ...
[CVI]   ActiveX ProgID: CVI.Application · connection=active-object|create-object · method=GetCVIState
```

5. Confirm that the diagnostic reports the project state instead of `DMLERR_NO_CONV_ESTABLISHED`.
6. Place an enabled standard VS Code breakpoint in a project `.c` file.
7. Run `LabWindows/CVI: Run Project in Native CVI Debugger`.
8. Confirm that the breakpoint is synchronized and that CVI stops on it.
9. Test `Pause`, `Continue`, `Stop`, `Read Native CVI State` and `Build Project in Native CVI`.
10. If ActiveX fails, copy the complete `LabWindows/CVI` output channel. The log must include the ActiveX connection attempts and the DDE fallback attempts separately.
