# LabWindows/CVI Project Manager 0.5.7 — validation

## Scope

This pass replaces the unused lower area of the always-visible **CVI Actions** view with a compact active-project dashboard.

## Dashboard content

The dashboard renders live summaries for:

- workspace and active project;
- target type;
- active build mode;
- command-line arguments;
- working directory;
- environment options;
- native CVI Build Steps;
- project dependencies;
- total and missing project files.

The action strip remains available above the summary. The VS Code view divider remains resizable by design so users can reduce or expand the dashboard height.

## Empty states

Two explicit states were added:

- `No workspace loaded`;
- `No active project`.

## Automated checks

- TypeScript compilation: OK
- Existing native `.prj` / `.cws` build-settings regression: OK
- Dashboard labels and empty states: OK
- Project-settings shortcut: OK
- Missing-file summary: OK
- VSIX packaging: OK
- Publisher: `JerryCrozet-ElectronicEngineer`
- Marketplace icon: present
