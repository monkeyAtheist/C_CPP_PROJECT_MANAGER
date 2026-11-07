# CPM 0.2.73 — Static linkage and QPM → CPM audit

## Scope

This revision uses QPM 0.34.11 as the reference for two tasks:

1. make CPM's executable/DLL linkage choice explicit and understandable instead of mixing static-link intent with runtime-DLL deployment;
2. audit generic QPM capabilities that are applicable to a non-Qt C/C++ project manager.

Qt-only features (QML, Designer, MOC/UIC/RCC, windeployqt, Qt translations, Qt platform packaging, etc.) are intentionally excluded from the CPM roadmap.

## Implemented in CPM 0.2.73

### Per-project linkage model

`CpmProjectBuildSettings.linkageMode` now has three modes:

| Mode | Link behavior | Runtime behavior |
| --- | --- | --- |
| Dynamic | normal linker/import-library resolution | compiler/third-party DLLs may be copied or resolved through PATH |
| Static compiler runtime | `-static-libgcc`, `-static-libstdc++`; static winpthread when available | removes common MinGW/GCC runtime DLL dependency without forcing third-party libraries static |
| Fully static when available | global `-static` plus static compiler runtime; SDL forced to static archives | aims for no non-system DLL imports; success depends on static archives being available for every third-party dependency |

The choice is exposed in **Project Build Settings > Build > Linkage**, through **Select Linkage Mode**, and in the status bar as `DYN`, `RTS`, or `STA`.

### Post-link PE dependency verification

CPM already contained a PE import-table reader for runtime deployment. 0.2.73 reuses it as a build verification stage. After an EXE/DLL is linked, CPM reports:

- normal Windows/API-set DLL imports;
- remaining external DLL imports;
- whether the static-runtime goal was achieved;
- whether the fully-static non-system dependency goal was achieved.

This is deliberately stricter than treating a successful `-static` invocation as proof of a standalone executable.

### Runtime cleanup when changing linkage

Static linkage disables CPM's compiler-runtime DLL copying. Fully-static linkage also removes SDL runtime DLLs previously deployed by CPM. This prevents stale DLLs from a previous dynamic build from remaining next to the new executable and making the result ambiguous.

### Compatibility

The old workspace-level `cpm.runtimeDependencyMode = static-link` value is retained for migration. Existing projects that relied on it are interpreted as fully-static until they save the explicit project linkage setting. New configuration uses the project linkage field instead.

## QPM 0.34.11 audit

### Already present or already ported to CPM

| QPM concept | CPM status |
| --- | --- |
| thematic project settings UI | already present |
| structured build output/diagnostics | already present |
| program stdout/stderr modes | already present |
| File Symbols export/header/source tools | already present |
| library-pack creation/import | already present |
| application icon settings | already present |
| advanced completion/signature profiles | already present |
| host executable for DLL Run/Debug | already present |
| linkage modes | ported/adapted in 0.2.73 |

### High-priority generic ports

#### 1. GCC/Clang `.d` dependency files — recommended first

QPM generates compiler dependency files and uses them to determine whether a translation unit must be rebuilt after one of its included headers changes. CPM currently relies on a simpler incremental model. Porting this gives exact header invalidation without rebuilding unrelated translation units.

**Value:** very high. **Complexity:** medium. **Recommended:** yes, next build-system pass.

#### 2. Parallel compilation

QPM compiles independent translation units concurrently, with a configurable job count and buffered per-process output so diagnostics do not become interleaved.

**Value:** very high on multi-file projects. **Complexity:** medium. **Recommended:** yes.

#### 3. GNU linker response files

QPM writes linker arguments to an `.rsp` file only when the estimated command line approaches the platform limit, with Windows/MinGW path normalization. This is useful for projects with many objects, libraries or long paths.

**Value:** high for large projects and Windows. **Complexity:** medium-low because the QPM helper is generic. **Recommended:** yes.

#### 4. Robust Windows build cleanup

QPM's clean service handles Windows file-lock races with atomic rename/recreate, retry logic and pending-clean directories. This is especially useful with VS Code watchers, antivirus software and synchronized folders.

**Value:** high. **Complexity:** medium-low. **Recommended:** yes.

#### 5. Project Health / repair actions

QPM has a project-health provider and Markdown reports. A CPM equivalent could diagnose compiler/debugger availability, target/linkage coherence, missing include/library paths, architecture mismatches, output-path problems, static-library availability, stale generated artifacts and IntelliSense mismatch, then offer repair actions.

**Value:** high. **Complexity:** medium. **Recommended:** yes.

### Second-stage ports

#### 6. Standalone `dist/<configuration>` staging

QPM separates build artifacts from the deployable runtime image. CPM could keep objects/generated files under `build/` and create a clean `dist/Debug` / `dist/Release` containing only the executable/DLL and runtime assets selected for deployment. Static builds could use the same staging step and verify external imports.

**Value:** high for delivery and test benches. **Complexity:** medium.

#### 7. Native dependency managers

QPM integrates vcpkg, Conan 2 and pkg-config/pkgconf. CPM currently has library/snippet knowledge but not equivalent project/build-engine dependency-manager integration.

**Value:** very high. **Complexity:** high. **Recommended:** after core build improvements.

#### 8. Remote Linux / Raspberry Pi workflow

QPM contains remote synchronization, remote build, deployment, Run, SSH terminal and gdbserver support. The Qt-specific portions would be removed; the transport/build/debug orchestration is directly relevant to CPM and would complement the SSH Device Manager work for Raspberry Pi development.

**Value:** very high for embedded/Linux use. **Complexity:** high. **Recommended:** yes as a dedicated phase.

#### 9. Precompiled headers and unity builds

QPM's direct backend supports optional PCH generation and unity source generation. Both can substantially reduce build times but should remain opt-in because unity builds can expose symbol collisions and alter translation-unit assumptions.

**Value:** medium-high. **Complexity:** medium-high. **Recommended:** after exact dependency tracking/parallelism.

#### 10. Build-system/backend abstraction

QPM supports direct compiler, qmake and CMake backends. For CPM, the useful adaptation would be **Direct GCC/Clang**, **CMake**, and optionally **Ninja** rather than qmake. This would make CPM useful both for its lightweight `.prj` projects and for industry-standard existing C/C++ projects.

**Value:** strategic/high. **Complexity:** high.

### Quality/tooling candidates

QPM also contains patterns for test execution, sanitizers/quality checks, profiling readiness and reports. For CPM these should be adapted around CTest/custom test executables, AddressSanitizer/UBSan, clang-tidy/cppcheck and profiling tools rather than copied verbatim from Qt.

## Recommended implementation order

1. `.d` dependency files + exact incremental build.
2. Parallel compilation.
3. GNU linker response files.
4. Robust Windows clean/retry strategy.
5. CPM Project Health + automatic repair actions.
6. Clean `dist/<configuration>` staging/deployment.
7. vcpkg / Conan 2 / pkg-config integration.
8. Remote Linux/Raspberry Pi build/deploy/Run/Debug over SSH/gdbserver.
9. PCH + unity build.
10. Direct/CMake/Ninja backend abstraction and broader quality/test tooling.

The first four items are the best next batch because they improve the existing direct GCC/MinGW/Clang engine without changing CPM's project model.

## Validation performed

- TypeScript compilation: PASS.
- Linkage regression script: PASS (9 checks).
- CPM 0.2.72 DLL-host/autocompletion regression: PASS (11 checks).
- CPM 0.2.70 File Symbols / pack regression: PASS.
- Header/source File Symbols generation regression: PASS.
- Dynamic mode verified not to emit static flags.
- Static-runtime mode verified to emit static compiler-runtime flags without a global `-static`.
- Fully-static mode verified to emit global `-static` and static compiler-runtime flags.
- Static cleanup test verified that stale SDL runtime DLLs are removed while an unrelated custom DLL is left untouched.
