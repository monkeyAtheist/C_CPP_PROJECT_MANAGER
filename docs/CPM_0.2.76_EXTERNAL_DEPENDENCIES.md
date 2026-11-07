# CPM 0.2.76 — External dependency managers

## Scope

Port of the generic QPM dependency-management architecture to CPM without importing Qt/CMake-specific build assumptions.

## Added

- `CpmDependencyService` for vcpkg, Conan 2 and pkg-config/pkgconf.
- `CpmDependencyProvider` and the `C/C++ Dependencies` view.
- `CpmDependencyIntegration` stored under `.cpm/dependencies/integration.json`.
- Project Build Settings `Packages` page.
- Build-time integration into GCC/Clang compile and link arguments.
- Single-file compile preparation.
- IntelliSense dependency include paths.
- Project Health dependency status.

## vcpkg

- Manifest generation (`vcpkg.json`).
- Feature syntax (`package[feature1,feature2]`).
- builtin baseline.
- target and host triplets.
- overlay ports / triplets.
- project-local install tree.
- automatic x86/x64 triplet inference from CPM build modes.
- automatic `-static` Windows triplet inference for fully-static linkage.

## Conan 2

- `conanfile.txt` generation.
- requires / tool_requires / options.
- host/build profiles.
- lockfile.
- `--build=missing`.
- PkgConfigDeps, CMakeDeps and CMakeToolchain generators.

## pkg-config / pkgconf

- package list and custom search paths.
- optional `--static`.
- parsing of include/library directories, libraries, compiler flags and linker flags.
- Conan generator paths are appended automatically when available.

## Validation

- TypeScript compilation: PASS.
- New dependency-manager tests: 8/8 PASS.
- Build engine 0.2.74 regression: 10/10 PASS.
- DLL/autocompletion 0.2.72 regression: 11/11 PASS.
- Static linkage 0.2.73 regression: 9/9 PASS.
- Project Health 0.2.75 regression: 9/9 PASS.
- File Symbols / pack editor regressions: PASS.
