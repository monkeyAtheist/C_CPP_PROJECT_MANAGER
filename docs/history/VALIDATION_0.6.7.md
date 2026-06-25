# Validation — LabWindows/CVI Project Manager 0.6.7

## Scope

- Stack `Target` and `Project dependencies and build order` vertically.
- Disable and dim `LoadExternalModule options` when run-time support is `Instrument Driver Support Only`.
- Preserve existing forced-module entries while the section is unavailable.
- Add the same restriction to safe mode.

## Automated checks

| Check | Result |
|---|---|
| TypeScript compilation | OK |
| Generated JavaScript syntax | OK |
| VSIX packaging | OK |
| `Target` rendered as a full-width section | OK |
| `Project dependencies and build order` rendered as a full-width section | OK |
| LoadExternalModule section exposes a stable container id | OK |
| Instrument-driver-only state visually dims the section | OK |
| Checkbox and add/remove controls disabled in instrument-driver-only state | OK |
| Existing module entries preserved | OK |
| Runtime-support change refreshes the disabled state immediately | OK |
| Safe-mode forced-module editor blocks incompatible edits | OK |

## Manual validation remaining

Open an EXE or DLL project under Windows, switch **Run-time support** between **Full run-time engine** and **Instrument driver only**, and verify that the `LoadExternalModule options` card becomes disabled and enabled again without losing its preview list.
