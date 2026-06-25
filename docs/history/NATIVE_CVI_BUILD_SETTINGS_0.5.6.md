# CVI native build-setting format observed in the supplied project

## Project build steps (`.prj`)

```ini
[Debug Custom Build Actions]
Build Action1 = "Custom build actions"

[Debug Pre-build Actions]
Build Action1 = "Pre build actions"

[Debug Post-build Actions]
Build Action1 = "Post build actions"
```

Equivalent sections are supported for `Release`, `Debug64` and `Release64`.

## Launch options (`.cws`)

```ini
[Default Build Config 0001 Debug]
Command Line Args = "Comment line arguments"
Working Directory = "Working directories"
Environment Options = "Environnement options"
External Process Path = ""
```

`0001` is the workspace project index and `Debug` is the selected build mode.

## Dependencies (`.cws`)

The supplied sample contains only the empty structure:

```ini
[Build Dependencies 0001]
Number of Dependencies = 0
```

A non-empty native dependency sample is still needed before writing these entries directly from the extension.
