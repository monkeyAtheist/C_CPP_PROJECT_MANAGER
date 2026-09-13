# CPM 0.2.66 Application Icon Validation

Scope:

- Build settings UI exposes Application icons in the Project page.
- Native `.prj` parsing persists `Icon File`, `Window Icon File` and `Apply Window Icon Automatically`.
- Windows executable icon embedding generates a `.rc` file and a resource object through `windres` / `llvm-windres`.
- SDL2/SDL3 window icon autoload generates a forced include header plus a generated helper source.
- SDL non-BMP window icons require SDL_image and produce a clear build error when SDL_image is not available.

Static validation performed in the packaged runtime:

- Node syntax check: `out/services/cpmBuildService.js`
- Node syntax check: `out/views/buildSettingsPanel.js`
- Node syntax check: `out/model/cpmParser.js`
- Node syntax check: `out/extension.js`
