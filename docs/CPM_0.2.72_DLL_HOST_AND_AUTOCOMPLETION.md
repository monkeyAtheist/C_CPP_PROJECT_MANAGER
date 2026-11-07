# CPM 0.2.72 — DLL host Run/Debug and advanced autocompletion

## Scope

This release ports two mechanisms from the LabWindows/CVI Project Manager reference supplied for the work:

1. a **Program name** host executable for Dynamic Link Library targets, with the same run command-line settings used by executable targets;
2. configurable supplemental C/C++ autocompletion profiles with project completion, standard-library fallback completion and Signature Help.

The implementation keeps the generic GCC/MinGW/Clang/GDB architecture of CPM. It does not introduce a CVI runtime dependency.

## DLL Program name

Dynamic Link Library projects can now use **Project Build Settings → Run & Debug → Program name** to select the `.exe` that loads or exercises the generated DLL.

The run configuration consists of:

- Program name / DLL host executable;
- command-line arguments;
- working directory;
- environment options;
- program-output mode (Integrated Terminal, CPM Program Output, Detached).

For an executable target, Program name remains the generated target and is read-only. For a DLL target it is editable. Static libraries remain non-runnable.

Relative Program name and working-directory values are resolved from the project `.prj` directory. Before launch CPM validates that the host exists, is a regular `.exe`, and that the configured working directory exists.

### Run

`Build and Run` builds the DLL and then launches the host executable. `Run without build` launches the existing host using the same arguments, working directory and environment. Runtime PATH construction contains both the host directory and the built DLL directory in addition to toolchain/SDL runtime directories.

### Debug

GDB/cppdbg now accepts DLL targets. CPM builds the DLL, then launches the configured Program name under `cppdbg`. The host receives the same arguments, working directory and environment options as normal Run. Custom environment variables are propagated to the debugger and the augmented runtime PATH is explicitly passed.

## Advanced autocompletion

A new **Autocompletion** page is available in Project Build Settings, and the same options are exposed through normal VS Code settings.

Profiles:

- **Hybrid** — CPM project symbols + standard-library assist + CPM Signature Help, alongside the installed native provider;
- **Native** — CPM withdraws completion and Signature Help and leaves the native C/C++ provider untouched;
- **Native + CPM Signature Help** — native completion with CPM parameter/signature hints;
- **Standard Library Assist** — project completion stays native while CPM contributes missing-header standard-library fallbacks and Signature Help;
- **Custom** — independent switches for CPM completion, project symbols, standard-library fallback completion and Signature Help.

The command `C/C++ Project Manager: Select Autocompletion Profile` provides a quick profile selector.

Backward compatibility is retained: if an older workspace explicitly configured the legacy completion booleans but has not explicitly selected a profile, CPM resolves the configuration as **Custom** instead of silently overriding those choices.

The standard-library fallback continues to hide a fallback once its header is already included, limiting duplicate suggestions with Microsoft C/C++ IntelliSense. Optional auto-include insertion remains available through `cpm.standardLibraryCompletionAutoInclude`.

## Validation

Validated on the final source tree with:

- `npm run compile` — PASS;
- `scripts/test-cpm-dll-autocomplete-0272.js` — 11/11 PASS;
- `scripts/test-cpm-file-symbols-packs-0270.js` — PASS;
- `scripts/test-cpm-file-symbol-source-0270.js` — PASS;
- VSIX extraction/manifest/runtime inspection — PASS;
- package and package-lock versions synchronized to `0.2.72`.

The dedicated regression test checks profile resolution, active-project completion, Native withdrawal, immediate Signature Help, standard-library fallback completion, Run/Debug settings rendering, relative DLL host resolution, propagation of custom debug environment variables, and command registration.
