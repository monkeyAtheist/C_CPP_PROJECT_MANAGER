# CPM 0.2.74 — Incremental / Parallel Build Engine

## Scope

This release ports the generic build-engine improvements identified during the QPM → CPM audit of 0.2.73:

1. exact GCC/Clang dependency tracking through `.d` files;
2. bounded parallel compilation;
3. automatic GNU linker response files;
4. robust Windows Clean/Rebuild behavior.

Qt-specific generation, deployment and QML behavior were deliberately not imported.

## Exact dependency tracking

Every C/C++ compile now adds:

```text
-MMD -MP -MF <object>.d -MT <object>
```

`sourceNeedsCompilation()` recompiles when:

- rebuild was explicitly requested;
- the object does not exist;
- the source is newer than the object;
- the `.d` file is missing/unreadable/empty;
- one of the non-system dependencies recorded in the `.d` file is missing;
- one of those dependencies is newer than the object.

The parser handles line continuations, Make escaping, `-MP` phony header rules, relative entries and MinGW escaped drive colons such as `C\:/...`.

## Parallel compilation

`CpmProjectBuildSettings` now stores:

```json
{
  "parallelJobs": 0
}
```

- `0`: automatic logical CPU count;
- `1`: sequential compilation;
- `2..256`: explicit worker limit.

Objects remain in source-plan order for deterministic link input even when compilation completes out of order. When one compile fails, CPM stops scheduling new items and skips linking after already-running workers finish.

## GNU response files

`CpmProjectBuildSettings.useResponseFiles` defaults to `true`.

CPM estimates the serialized GNU argument size and changes from normal linker arguments to:

```text
g++ @<object-dir>/cpm_link.rsp
```

only when the estimated length reaches:

- Windows: 24,000 characters;
- POSIX: 100,000 characters.

Windows paths are converted to GNU-friendly forward slashes before response-file serialization.

## Robust cleanup

`cpmBuildCleanup.ts` implements atomic rename + retry/backoff. Clean/Rebuild removes the entire build-mode directory, not only `obj`, so it also clears:

- object files;
- `.d` dependency metadata;
- `cpm_link.rsp`;
- generated helper sources/headers.

If Windows refuses the rename because a watcher/antivirus/synchronization client still owns a handle, CPM falls back to in-place cleanup and retries `EPERM`, `EACCES`, `EBUSY`, `ENOTEMPTY` and transient `ENOENT` cases.

Generated SDL icon helper files are now rewritten only when their contents change, preventing false incremental invalidation.

## Validation

- TypeScript compile: PASS
- New build-engine tests: 10/10 PASS
- Real GCC `.d` generation and header invalidation: PASS
- MinGW escaped dependency syntax: PASS
- Real GCC link through generated response file: PASS
- Parallel worker limit: PASS
- Atomic clean test: PASS
- CPM 0.2.72 DLL/autocompletion regression: 11/11 PASS
- CPM File Symbols regression suites: PASS
- CPM 0.2.73 linkage regression: 9/9 PASS

## Remaining high-value QPM → CPM ports

The audit priorities after 0.2.74 are now:

1. Project Health / automatic repair diagnostics;
2. vcpkg / Conan 2 / pkg-config dependency integration;
3. Remote Linux / Raspberry Pi build, deploy, run and gdbserver debug over SSH;
4. Precompiled headers and Unity Build;
5. optional CMake/Ninja backend for existing industrial projects.
