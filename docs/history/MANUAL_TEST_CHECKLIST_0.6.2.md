# Manual test checklist — 0.6.2

## Executable target

- Open **Project Build Settings...**.
- Modify output path, application title, icon, runtime values, manifest, UIR embedding, map file, console application, timestamp and LoadExternalModule files.
- Save, reopen in CVI and compare **Build > Target Settings...**.

## DLL target

- Modify output DLL path, import-library base name, copy mode, copy directory, runtime values, manifest, UIR embedding, map file and timestamp.
- Modify LoadExternalModule modules.
- Select exported headers.
- Modify type-information fields.
- Modify version and signing values.
- Save, reopen in CVI and compare the native dialogs.

## Static library target

- Modify the `.lib` output path for each active configuration and reopen the native target settings dialog.

## Import-library helper

- Right-click a `.h` file.
- Select **Prepare DLL Import Library Generation in CVI...**.
- Select a DLL.
- Confirm that the header opens in CVI and that the DLL path is available in the clipboard.
