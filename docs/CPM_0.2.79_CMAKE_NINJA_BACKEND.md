# CPM 0.2.79 — CMake / Ninja backend

## Scope

This release adds a second project-scoped build backend while preserving the existing Direct GCC/Clang engine as the default. The CMake backend targets existing `CMakeLists.txt` projects and integrates with CPM Build/Rebuild/Clean/Run/Debug.

## Configuration

Stored per project/build configuration in `.vscode/cpm-build.json`:

- `buildBackend`: `direct` or `cmake`
- CMake/Ninja executable and generator
- source/build directories (`${projectName}`, `${buildMode}`, `${config}` templates)
- CMake target name
- generator platform/toolset
- configure-before-build and compile-commands export
- CPM compiler inheritance
- dependency-manager toolchain inheritance
- explicit CMake toolchain file
- cache variables and extra configure/build arguments

## File API

Before configure CPM writes `.cmake/api/v1/query/client-cpm/query.json` requesting codemodel v2. After configure it reads the newest reply index and target JSON files. Target artifacts are resolved by configured target name, otherwise by CPM target type and project name when unambiguous.

## Dependency managers

Toolchain priority is:

1. explicit CMake toolchain file;
2. generated Conan `conan_toolchain.cmake`;
3. vcpkg `scripts/buildsystems/vcpkg.cmake`;
4. normal CMake toolchain discovery.

## Build mapping

- Build: `cmake --build`
- Rebuild: `cmake --build --clean-first`
- Clean: CMake `clean` target
- parallel jobs: CPM project setting -> `--parallel`
- Debug/Release: `CMAKE_BUILD_TYPE` for single-config generators; `--config` for multi-config generators

## Validation

Validated with real CMake 3.31.6 + Ninja 1.12.1 + GCC 14.2.0:

- configure: PASS
- CMake File API query/reply: PASS
- executable target discovery: PASS
- Ninja build: PASS
- artifact resolution: PASS
- built executable launch: PASS
- Project Health checks: PASS
- Build Settings controls: PASS
- previous CPM regression suites: PASS
