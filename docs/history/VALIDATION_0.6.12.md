# LabWindows/CVI Project Manager 0.6.12 — Validation

## Scope

This release adds a dedicated `Create New Project in Workspace...` command while preserving the existing `Add Existing Project to Workspace` action.

## Static checks

| Check | Result |
|---|---:|
| TypeScript compilation | OK |
| Extension command registration | OK |
| Manifest command contribution | OK |
| Workspace context-menu contribution | OK |
| Target choices EXE / DLL / LIB | OK |
| Guard when a standalone `.prj` is loaded | OK |
| Existing native `.cws` backup mechanism preserved | OK |

## Parser scenario

A temporary workspace `WS.cws` was generated with an executable project `App.prj`. A second static-library project was created under `libs/Core.prj`, added to the workspace and selected as the active project.

Expected result:

```text
WS.cws
├── App.prj
└── libs/Core.prj   active
```

Observed result:

```text
Number of Projects = 2
Active Project = 2
Project 0002 = "libs/Core.prj"
```

## Manual Windows check still required

The generated workspace must still be opened once in the native LabWindows/CVI IDE on Windows to confirm the final rendering and CVI-side normalization of optional workspace metadata.
