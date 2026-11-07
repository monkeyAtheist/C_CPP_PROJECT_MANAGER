# CPM 0.2.75 — Project Health and Repair

## Scope

This release ports the generic diagnostic pattern from QPM into CPM while keeping CPM-specific build semantics. The diagnostic layer is read-only; repair actions call the existing CPM services and commands that own project mutation.

## Checks

- active workspace/project and project parseability;
- missing project references in `.cws` files;
- native workspace compatibility issues;
- missing registered files and effective compiled-source count;
- build dependency order, unresolved dependency keys and circular dependencies;
- C/C++ compiler, static archiver and debugger availability;
- obvious requested-architecture/toolchain mismatches;
- configured include and library directories;
- parallel build and GNU response-file configuration;
- per-project dynamic/static-runtime/fully-static linkage state;
- remaining non-system DLL imports on built PE targets;
- DLL host executable, run arguments and working directory;
- built-target existence;
- Microsoft C/C++ managed configuration, stale provider references and workspace-root state;
- configured application icon file existence.

## Repair model

`Repair Project Health...` lists only non-OK findings that expose a repair action. It can route to toolchain selection, Build Settings, IntelliSense synchronization, provider repair, workspace-folder addition, `.cws` compatibility repair and runtime dependency inspection. The health provider itself never rewrites user configuration silently.

## Validation

- TypeScript compilation: PASS
- Project Health tests: 9/9 PASS
- Build engine regression: 10/10 PASS
- DLL host/autocompletion regression: 11/11 PASS
- Static linkage regression: 9/9 PASS
- File Symbols / pack editor regressions: PASS
