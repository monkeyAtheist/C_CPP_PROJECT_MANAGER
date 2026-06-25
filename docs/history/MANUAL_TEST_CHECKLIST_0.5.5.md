# Manual test checklist — LabWindows/CVI Project Manager 0.5.5

1. Install the VSIX and execute **Developer: Reload Window**.
2. Open a multi-project `.cws` workspace.
3. Right-click the workspace node and verify **Open Workspace in CVI**.
4. Click the compact Build toolbar icon and verify the three choices: **Build**, **Rebuild**, **Clean generated target**.
5. Run **Build** and verify that the **LabWindows/CVI** output channel displays the compiler command and progressive log content.
6. Verify that a timestamped file appears under `.vscode/cvi-build-logs`.
7. Right-click a project and switch target type successively to **Executable**, **Dynamic Link Library**, and **Static Library**. Confirm that CVI opens the project with the same target type.
8. Open **Project Build Settings...** and configure one harmless pre-build command, one harmless custom-build command and one harmless post-build command such as `echo pre`, `echo custom`, `echo post`.
9. Add a project dependency and verify the displayed dependency build order in the output channel.
10. Configure executable command-line arguments, a working directory and environment options. Run an executable project and verify the received arguments.
11. For a DLL project, configure an external host executable and verify the Run behavior.
12. Right-click a `.c` file, execute **Generate Prototypes Header...**, inspect the generated `.h`, and confirm that the header is added to the project tree.
13. Confirm that IntelliSense actions are no longer displayed in the workspace explorer toolbar and remain available in Home → LabWindows/CVI installation.
