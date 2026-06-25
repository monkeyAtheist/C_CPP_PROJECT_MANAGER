# Manual test checklist — LabWindows/CVI Project Manager 0.6.22

## Installation

1. Install `labwindows-cvi-project-manager-0.6.22.vsix` over the previous version.
2. Run `Developer: Reload Window`.
3. Open a CVI `.cws` workspace containing an executable project.

## CVI Debug view

1. Open the LabWindows/CVI activity-bar container.
2. Verify that a resizable **CVI Debug** view appears below **CVI Actions**.
3. Before launching CVI, verify that the dashboard exposes the active project and shows the native bridge as `Unknown` or `Unavailable`.
4. Click **Refresh native state** while CVI is closed. Verify that the dashboard updates without opening a second CVI instance.
5. Click **Build native project**. Verify that CVI opens the expected workspace and that the dashboard updates the bridge and link state.

## Persistent native debug session

1. Add an enabled standard VS Code breakpoint in a source file belonging to the active project.
2. Click **Run in native debugger**.
3. Verify that CVI starts the debug execution and that the dashboard reports:

```text
Persistent session   Connected
Execution            running · cached
```

4. Pause the execution from the dashboard. Verify `Execution = suspended · cached`.
5. Continue the execution from the dashboard. Verify `Execution = running · cached`.
6. Stop the execution from the dashboard. Verify `Execution = idle · cached`.
7. Verify that the **Last command** and **Last result** rows track each accepted command.

## Status bar

1. Verify that the native-debug status-bar item is clickable.
2. Confirm the expected transitions:

```text
CVI:off -> CVI:idle -> CVI:run -> CVI:pause -> CVI:run -> CVI:idle
```

3. Click the indicator and confirm that the native-debug quick picker still opens.

## Regression

1. Confirm that VS Code breakpoints are still synchronized conservatively into `.cws`.
2. Confirm that CVI-native breakpoints and tracepoints remain preserved.
3. Confirm that workspace build settings and project scaffolding remain functional.
4. Confirm that no webview is created when the **CVI Debug** view is expanded.
