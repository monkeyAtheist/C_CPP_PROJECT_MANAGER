# Validation — C/C++ Project Manager 0.1.0

## Scope

First generic C/C++ conversion from the LabWindows/CVI project-manager extension.

## Implemented checks

- TypeScript compilation: `npm run compile` passed.
- VSIX packaging: `npm run package` passed.
- VSIX generated: `cpp-project-manager-0.1.0.vsix`.
- The generic build service now uses configurable `gcc`, `g++`, `ar` and `gdb` tools instead of CVI `compile.exe`.
- Debug command performs a build before launching VS Code `cppdbg` / GDB.
- Source recognition extended to `.c`, `.cc`, `.cpp`, `.cxx`, `.h`, `.hh`, `.hpp`, `.hxx`, `.a`, `.lib`, `.o`, `.obj`.
- Project creation no longer requires selecting a CVI installation.
- File templates/snippets now include generic C/C++ starters.

## Notes

The internal command namespace and settings prefix remain `labwindowsCvi` to preserve the inherited extension wiring. The visible extension name, README and generic compiler settings have been updated for this first version.
