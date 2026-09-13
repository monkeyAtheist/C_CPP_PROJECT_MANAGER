# CPM Marketplace publishing notes

CPM 0.2.62 reduces the embedded JC Lib payload to a curated set of packs intended for the C/C++ Project Manager extension.

Kept embedded library packs:

- C
- C++
- C/C++ preprocessor / CPM core
- OpenCV
- Build & Toolchains
- SDL2 / SDL3
- Windows API / Devices
- Scripting / System
- Python
- JavaScript / HTML / CSS
- TypeScript
- Databases
- PHP
- Embedded Systems

Removed from the shipped VSIX payload:

- Legacy default pack
- LabWindows/CVI structured pack and CVI metadata
- Qt structured packs
- Java
- C# / .NET
- Kotlin
- Visual Basic / VBA
- Lua structured pack
- Assembly structured pack

Recommended publication workflow:

```bash
npx vsce package --allow-missing-repository
npx vsce publish --packagePath c-cpp-project-manager-and-build-0.2.62.vsix
```

This avoids rebuilding and re-listing the whole package during the upload step and makes it easier to inspect the VSIX size before publication.

The `Request timeout: /_apis/gallery` error is generally better handled by reducing the VSIX payload and retrying publication than by trying to change an undocumented Marketplace upload timeout.
