# Manual test checklist — 0.5.7

1. Install `labwindows-cvi-project-manager-0.5.7.vsix` and run **Developer: Reload Window**.
2. Open the LabWindows/CVI activity-bar container.
3. Confirm that **CVI Actions** displays the always-visible action strip.
4. With no workspace loaded, confirm the `No workspace loaded` state.
5. Open an existing `.cws` workspace and confirm the dashboard displays the active project.
6. Check the target type, build mode, command-line status, working-directory status, environment status, Build Steps, dependencies and file summary.
7. Resize the separator below **CVI Actions** and confirm the dashboard can be reduced or enlarged.
8. Click **Open project build settings…**, modify one build option, save it and confirm the dashboard refreshes.
9. Select another target type and confirm the dashboard updates.
10. Open a project containing a missing reference and confirm the missing-file warning appears.
